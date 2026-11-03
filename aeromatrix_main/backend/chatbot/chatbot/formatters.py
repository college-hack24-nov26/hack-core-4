"""Numeric answers formatted DIRECTLY from API responses. The LLM never produces these numbers.

A value is only ever copied from the response and rounded for display; when the API says UNAVAILABLE (or is offline)
the answer says that and shows no number.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

IST = timezone(timedelta(hours=5, minutes=30))
LABEL = {
    "pm25": "PM2.5", "pm10": "PM10", "no2": "NO2", "no": "NO", "nox": "NOx", "so2": "SO2",
    "co": "CO", "o3": "O3", "nh3": "NH3", "benzene": "Benzene", "toluene": "Toluene", "xylene": "Xylene",
}
MAIN = ("pm25", "pm10", "no2", "so2", "co", "o3")


@dataclass
class Answer:
    text: str
    status: str = "ok"  # ok | unavailable | offline
    data: dict[str, Any] = field(default_factory=dict)
    sources: list[str] = field(default_factory=list)


def fmt_ist(value: str | None) -> str:
    if not value:
        return "an unknown time"
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return value
    return dt.astimezone(IST).strftime("%d %b %Y, %H:%M IST")


def num(value: float, key: str = "") -> str:
    return f"{value:.2f}" if key == "co" else f"{value:.1f}"


def offline_answer(what: str, reason: str) -> Answer:
    return Answer(
        text=f"I can't read {what} right now: {reason} I won't guess a number.",
        status="offline",
    )


def _is_unavailable(obj: Any) -> bool:
    return isinstance(obj, dict) and obj.get("status") == "UNAVAILABLE"


def observation_answer(name: str, measured: Any, pollutant: str | None = None, source: str = "") -> Answer:
    """Latest MEASURED snapshot for one station (historical in the bundled data)."""
    srcs = [source] if source else []
    if _is_unavailable(measured):
        return Answer(f"The model API says the snapshot for {name} is unavailable: {measured.get('reason', 'no reason given')}.", "unavailable", sources=srcs)
    if not isinstance(measured, dict) or measured.get("status") != "MEASURED":
        return Answer(f"The model API returned an answer for {name} that I could not read, so I won't quote numbers.", "unavailable", sources=srcs)

    pollutants = measured.get("pollutants", {})
    historical = bool(measured.get("historical"))
    lines = [f"{name}: latest measured snapshot" + (f" (historical, hour starting {fmt_ist(measured.get('snapshot_end'))})." if historical else f" ({fmt_ist(measured.get('snapshot_end'))}).")]
    data: dict[str, Any] = {}

    aqi = measured.get("aqi") or {}
    if aqi.get("status") in ("AVAILABLE", "LOWER_BOUND") and aqi.get("value") is not None:
        prefix = ">= " if aqi.get("status") == "LOWER_BOUND" else ""
        lines.append(f"AQI {prefix}{aqi['value']} ({aqi.get('category')}), dominant pollutant {LABEL.get(aqi.get('dominant_pollutant'), aqi.get('dominant_pollutant'))}.")
        data["aqi"] = aqi["value"]
    else:
        lines.append(f"AQI unavailable: {aqi.get('reason') or 'not enough valid hours or pollutants'}.")

    wanted = [pollutant] if pollutant and pollutant != "aqi" else [p for p in MAIN if p in pollutants]
    for p in wanted:
        entry = pollutants.get(p)
        if isinstance(entry, dict) and entry.get("status") == "MEASURED":
            lines.append(f"{LABEL.get(p, p)}: {num(entry['value'], p)} {entry.get('unit', '')} (hour starting {fmt_ist(entry.get('time'))}).")
            data[p] = entry["value"]
        elif _is_unavailable(entry):
            lines.append(f"{LABEL.get(p, p)} is unavailable: {entry.get('reason', 'no reason given')}.")
        else:
            lines.append(f"{LABEL.get(p, p)}: this station has no reading for it in the snapshot.")
    if historical:
        lines.append("These bundled readings are historical, not live.")
    return Answer("\n".join(lines), "ok", data, srcs)


def forecast_answer(name: str, forecast: Any, pollutant: str | None = None, allow_historical: bool = False, source: str = "") -> Answer:
    """+24 h forecast of the trained model for one station."""
    srcs = [source] if source else []
    if _is_unavailable(forecast):
        hint = "" if allow_historical else " The bundled readings are historical, so a current forecast is unavailable; ask me to include the historical forecast to see the +24 h value from that snapshot."
        return Answer(f"The model API says there is no forecast for {name}: {forecast.get('reason', 'no reason given')}.{hint}", "unavailable", sources=srcs)
    if not isinstance(forecast, dict) or "pollutants" not in forecast:
        return Answer(f"The model API returned a forecast for {name} that I could not read, so I won't quote numbers.", "unavailable", sources=srcs)

    items = forecast["pollutants"]
    wanted = [pollutant] if pollutant and pollutant != "aqi" else [p for p in MAIN if p in items]
    lines = [f"{name}: +24 h forecast from the trained model (status {forecast.get('status')})."]
    data: dict[str, Any] = {}
    for p in wanted:
        entry = items.get(p)
        if isinstance(entry, dict) and entry.get("status") == "PREDICTED":
            kind = (entry.get("model") or {}).get("kind")
            model = "statistical baseline" if kind == "statistical_baseline" else "fitted ML model"
            hist = " (historical forecast)" if entry.get("historical") else ""
            lines.append(
                f"{LABEL.get(p, p)}: {num(entry['value'], p)} {entry.get('unit', '')}, interval {num(entry['lower'], p)} to {num(entry['upper'], p)}, valid {fmt_ist(entry.get('valid_at'))}{hist}; {model}."
            )
            for w in entry.get("reliability_warnings", []):
                lines.append(f"  Warning: {w.replace('_', ' ').lower()}.")
            data[p] = entry["value"]
        elif _is_unavailable(entry):
            lines.append(f"{LABEL.get(p, p)} forecast is unavailable: {entry.get('reason', 'no reason given')}.")
        else:
            lines.append(f"{LABEL.get(p, p)}: no forecast entry was returned.")
    lines.append(str(forecast.get("scenario_note", "")).strip() or "These forecasts do not model interventions.")
    return Answer("\n".join(l for l in lines if l), "ok", data, srcs)


def _walk_metrics(prefix: str, node: Any, out: list[tuple[str, dict[str, float]]], depth: int = 0) -> None:
    if not isinstance(node, dict) or depth > 3:
        return
    got = {k: v for k, v in node.items() if k in ("mae", "rmse", "r2", "n") and isinstance(v, (int, float))}
    if got:
        out.append((prefix or "model", got))
        return
    for k, v in node.items():
        _walk_metrics(f"{prefix} / {k}" if prefix else str(k), v, out, depth + 1)


def metrics_answer(metrics: Any, pollutant: str | None = None, source: str = "") -> Answer:
    """Held-out test metrics straight from /model/metrics."""
    rows: list[tuple[str, dict[str, float]]] = []
    _walk_metrics("", metrics, rows)
    if pollutant:
        rows = [r for r in rows if pollutant in r[0].lower()] or rows
    if not rows:
        return Answer("The model API returned no per-model test metrics in a format I can read, so I won't quote any.", "unavailable", sources=[source] if source else [])
    lines = ["Held-out test metrics reported by the model API:"]
    data: dict[str, Any] = {}
    for name, m in rows[:8]:
        parts = [f"{k.upper()} {m[k]:.2f}" if k != "n" else f"n {int(m[k]):,}" for k in ("mae", "rmse", "r2", "n") if k in m]
        lines.append(f"{name}: " + ", ".join(parts))
        data[name] = m
    lines.append("These describe how well each model fitted its test period; they are not a promise about tomorrow.")
    return Answer("\n".join(lines), "ok", data, [source] if source else [])


def live_answer(place: str, payload: Any, pollutant: str | None = None) -> Answer:
    """Current Open-Meteo CAMS model values at a coordinate (MODEL_DATA)."""
    current = (payload or {}).get("current") if isinstance(payload, dict) else None
    if not current:
        return Answer(f"Open-Meteo returned no current air-quality values for {place}.", "unavailable")
    names = {"pm25": "pm2_5", "pm10": "pm10", "no2": "nitrogen_dioxide", "so2": "sulphur_dioxide", "co": "carbon_monoxide", "o3": "ozone"}
    wanted = [pollutant] if pollutant in names else list(names)
    lines = [f"{place}: current values from the Open-Meteo CAMS model (about 40 km resolution; model data, not a station measurement):"]
    data: dict[str, Any] = {}
    for p in wanted:
        v = current.get(names[p])
        if v is None:
            lines.append(f"{LABEL[p]} is missing from the model response.")
            continue
        if p == "co":  # provider reports ug/m3; the app shows mg/m3
            v = v * 0.001
        lines.append(f"{LABEL[p]}: {num(v, p)} {'mg/m3' if p == 'co' else 'ug/m3'}")
        data[p] = v
    return Answer("\n".join(lines), "ok", data, ["open-meteo"])
