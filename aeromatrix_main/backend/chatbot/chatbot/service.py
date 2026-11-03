"""Orchestration: route the message, read real numbers through the allowlisted adapters, explain with notes.

Numeric answers are formatted straight from API responses. The LLM (when configured) only explains project concepts,
answers general questions and translates; without an LLM key data answers and project notes still work.
"""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from typing import Any

from .adapters import AdapterOffline, ForbiddenCall, ModelApi, OpenMeteo
from .formatters import Answer, forecast_answer, live_answer, metrics_answer, observation_answer, offline_answer
from .intent_router import Aliases, Route, route as route_message
from .llm import LLM, LLMUnavailable, SYSTEM_EXPLAIN, SYSTEM_GENERAL, SYSTEM_TRANSLATE
from rag.retriever import Retriever

ALLOWED_ACTION_TYPES = {
    "navigate_to_section", "select_region", "focus_map_location", "set_pollutant", "show_heatmap", "set_forecast_time",
    "compare_regions", "open_scenario", "run_scenario", "reset_scenario", "update_scenario_parameter", "show_scenario",
    "show_industries", "highlight_chart_data",
}
LANGUAGE_NAME = {"hi": "Hindi", "mr": "Marathi"}


@dataclass
class ChatResult:
    text: str
    status: str
    intent: str
    language: str
    sources: list[str] = field(default_factory=list)
    data: dict[str, Any] = field(default_factory=dict)
    actions: list[dict[str, Any]] = field(default_factory=list)
    used_llm: bool = False
    followup: bool = False

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


class AeroSage:
    def __init__(self, model_api: ModelApi, open_meteo: OpenMeteo | None, llm: LLM | None, retriever: Retriever, aliases_path: Any) -> None:
        self.model_api = model_api
        self.open_meteo = open_meteo
        self.llm = llm
        self.retriever = retriever
        self.aliases_path = aliases_path
        self._regions: list[dict[str, Any]] = []

    async def aliases(self) -> Aliases:
        """Static names merged with the station list of GET /regions when the model API is online."""
        try:
            regions = await self.model_api.get("/regions")
            stations = regions.get("station_locations", []) if isinstance(regions, dict) else regions
            self._regions = [s for s in stations if isinstance(s, dict)]
        except (AdapterOffline, ForbiddenCall):
            pass
        return Aliases.load(self.aliases_path, self._regions)

    # ---- helpers ----

    async def _model_get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        return await self.model_api.get(path, params)

    @staticmethod
    def _valid_actions(actions: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return [a for a in actions if a.get("type") in ALLOWED_ACTION_TYPES]

    async def _translate(self, text: str, language: str) -> tuple[str, bool]:
        if language == "en" or not self.llm:
            return text, False
        try:
            out = await self.llm.complete(SYSTEM_TRANSLATE, f"Language: {LANGUAGE_NAME.get(language, 'Hindi')}\n\n{text}")
            return (out or text), True
        except LLMUnavailable:
            return text, False

    # ---- answers by intent ----

    async def _station_answer(self, r: Route, history_context: str = "") -> Answer:
        names = r.stations[:1] or []
        if not names and r.places:
            place = r.places[0]
            if place == "Kothrud":
                try:
                    h = await self._model_get("/aqi/history", {"region": "Kothrud"})
                except (AdapterOffline, ForbiddenCall) as exc:
                    return offline_answer("Kothrud's AQI history", str(exc))
                if isinstance(h, dict) and h.get("status") == "UNAVAILABLE":
                    return Answer(f"The model API says Kothrud's AQI history is unavailable: {h.get('reason', 'no reason given')}.", "unavailable", sources=["model_api:/aqi/history?region=Kothrud"])
                return Answer(
                    "Kothrud has only historical AQI (it is not one of the 12 monitoring stations and is not mapped to Karve Road). "
                    f"The model API returned an AQI history record: {json.dumps(h, ensure_ascii=False)[:600]}",
                    "ok", sources=["model_api:/aqi/history?region=Kothrud"],
                )
            return Answer(f"{place} is a locality, not one of the 12 monitoring stations, so I have no station reading for it. Ask for a station such as Hadapsar or Karve Road.", "unavailable")
        if not names:
            return Answer("Which station? I can read Karve Road, Mhada Colony, Alandi, Bhosari, Hadapsar, Transport Nagar-Nigdi, Revenue Colony-Shivajinagar, Katraj Dairy, Savitribai Phule Pune University, Bhumkar Nagar, Panchawati Pashan or Dhankawadi.", "unavailable")
        name = names[0]
        key = name
        if r.intent == "forecast":
            try:
                f = await self._model_get("/forecast", {"region": key, "pollutant": r.pollutant if r.pollutant not in (None, "aqi") else None, "allow_historical": r.historical})
            except (AdapterOffline, ForbiddenCall) as exc:
                return offline_answer(f"the forecast for {name}", str(exc))
            return forecast_answer(name, f, r.pollutant, r.historical, f"model_api:/forecast?region={key}")
        try:
            m = await self._model_get("/pollution", {"region": key})
        except (AdapterOffline, ForbiddenCall) as exc:
            return offline_answer(f"station data for {name}", str(exc))
        return observation_answer(name, m, r.pollutant, f"model_api:/pollution?region={key}")

    async def _compare(self, r: Route) -> Answer:
        if len(r.stations) < 2:
            return Answer("Tell me two stations to compare, for example Hadapsar and Karve Road.", "unavailable")
        parts: list[Answer] = []
        for n in r.stations[:2]:
            sub = Route(intent="observation", pollutant=r.pollutant, stations=[n], historical=r.historical)
            parts.append(await self._station_answer(sub))
        status = "ok" if all(p.status == "ok" for p in parts) else parts[0].status if parts[0].status != "ok" else parts[1].status
        return Answer("\n\n".join(p.text for p in parts), status, {k: v for p in parts for k, v in p.data.items()}, [s for p in parts for s in p.sources])

    async def _reliability(self, r: Route) -> Answer:
        try:
            m = await self._model_get("/model/metrics", {"pollutant": r.pollutant if r.pollutant not in (None, "aqi") else None})
        except (AdapterOffline, ForbiddenCall) as exc:
            notes = self.retriever.search("trained models forecast reliability test metrics", 1)
            extra = f"\n\nFrom the project notes: {notes[0].body[:500]}" if notes else ""
            return Answer(offline_answer("the model metrics", str(exc)).text + extra, "offline", sources=[n.source for n in notes])
        return metrics_answer(m, r.pollutant if r.pollutant not in (None, "aqi") else None, "model_api:/model/metrics")

    async def _project(self, message: str, language: str, history: list[dict[str, str]]) -> Answer:
        hits = self.retriever.search(message, 3)
        if not hits:
            return Answer("I don't have a verified note about that. I can explain AeroMatrix, its pollutants, models, datasets and coverage, or read a station's numbers.", "unavailable")
        sources = [f"kb:{h.source}" for h in hits]
        notes = "\n\n".join(f"[{h.heading}]\n{h.body}" for h in hits)
        if self.llm:
            try:
                out = await self.llm.complete(SYSTEM_EXPLAIN, f"Notes:\n{notes}\n\nQuestion: {message}", history)
                return Answer(out, "ok", sources=sources, data={"_llm": True})
            except LLMUnavailable:
                pass
        # No LLM (or it failed): the verified notes themselves.
        return Answer("\n\n".join(f"{h.heading}\n{h.body}" for h in hits[:2]), "ok", sources=sources)

    async def _live(self, r: Route, lat: float, lon: float, label: str) -> Answer | None:
        if not self.open_meteo:
            return None
        try:
            payload = await self.open_meteo.air_quality(lat, lon)
        except AdapterOffline as exc:
            return offline_answer("live model data", str(exc))
        return live_answer(label, payload, r.pollutant)

    # ---- entry point ----

    async def handle(self, message: str, last: Route | None, history: list[dict[str, str]], context: dict[str, Any] | None = None) -> tuple[ChatResult, Route]:
        aliases = await self.aliases()
        r = route_message(message, aliases, last, context)
        used_llm = False

        loc = (context or {}).get("map_location")
        live: Answer | None = None
        if r.intent == "observation" and r.needs_station and isinstance(loc, dict):
            try:
                lat, lon = float(loc["lat"]), float(loc["lon"])
            except (KeyError, TypeError, ValueError):
                lat = lon = None
            if lat is not None and lon is not None and -90 <= lat <= 90 and -180 <= lon <= 180:
                live = await self._live(r, lat, lon, "The selected map location")

        if live is not None:
            ans = live
        elif r.intent in ("observation", "forecast") and r.needs_station:
            ans = Answer("Which station do you mean? Name one of the 12 monitoring stations (for example Hadapsar or Karve Road).", "unavailable")
        elif r.intent == "comparison":
            ans = await self._compare(r)
        elif r.intent in ("observation", "forecast"):
            ans = await self._station_answer(r)
        elif r.intent == "reliability":
            ans = await self._reliability(r)
        elif r.intent == "simulation":
            pct = f" by {r.percent}%" if r.percent is not None else ""
            ans = Answer(
                f"I'll set that up in the What-If simulator{pct}. Results are MODELED_SCENARIO estimates from the uncalibrated prototype model, not forecasts, and I will only say a change was made after the app confirms it.",
                "ok",
            )
        elif r.intent == "navigation":
            ans = Answer(f"Opening the {r.section} section.", "ok")
        elif r.intent == "project":
            ans = await self._project(message, r.language, history)
            used_llm = bool(ans.data.pop("_llm", False))
        else:
            ans = await self._general(message, history)
            used_llm = ans.status == "ok" and bool(self.llm)

        text, translated = await self._translate(ans.text, r.language)
        if r.language != "en" and not translated:
            text += "\n\n(I answered in English: translation needs the language model, which is not configured.)"
        result = ChatResult(
            text=text,
            status=ans.status,
            intent=r.intent,
            language=r.language,
            sources=ans.sources,
            data=ans.data,
            actions=self._valid_actions(r.actions) if ans.status != "offline" or r.intent in ("navigation", "simulation") else [],
            used_llm=used_llm or translated,
            followup=r.followup,
        )
        return result, r

    async def _general(self, message: str, history: list[dict[str, str]]) -> Answer:
        hits = self.retriever.search(message, 2)
        if self.llm:
            try:
                return Answer(await self.llm.complete(SYSTEM_GENERAL, message, history), "ok")
            except LLMUnavailable:
                pass
        if hits:
            return Answer("\n\n".join(f"{h.heading}\n{h.body}" for h in hits), "ok", sources=[f"kb:{h.source}" for h in hits])
        return Answer(
            "I can read station AQI and pollutant values, explain AeroMatrix and its models, and open parts of the app. General questions need the language model, which is not configured here.",
            "unavailable",
        )
