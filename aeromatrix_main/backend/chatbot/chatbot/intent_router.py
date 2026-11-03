"""Rule-based intent routing: pollutant and station aliases (English, Hindi, Marathi), follow-ups and actions.

Everything in `context` that the browser sends is UNVERIFIED selector data: it can fill a default station or pollutant,
but only after it has been checked against the alias list, and it is never used as a source of numbers.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

SECTIONS = ("map", "analytics", "simulator", "data", "air", "zones", "actions", "sites", "sensors")
SECTION_WORDS = {
    "map": ["map", "नक्शा", "नकाशा"],
    "analytics": ["analytics"],
    "simulator": ["simulator", "what-if", "what if", "सिम्युलेटर"],
    "data": ["data panel", "import data", "csv"],
    "air": ["air quality panel", "air quality tab"],
    "zones": ["zones", "zone list"],
    "actions": ["actions", "reduction actions"],
    "sites": ["sites", "site comparison"],
    "sensors": ["sensors", "sensor intelligence", "missing sensor"],
}

INTENT_WORDS = {
    "forecast": ["forecast", "tomorrow", "next 24", "next day", "predict", "will be", "expected", "पूर्वानुमान", "अंदाज", "कल"],
    "reliability": ["accurate", "accuracy", "reliable", "reliability", "trust", "error", "metric", "r2", "mae", "rmse", "how good", "validation", "भरोसा", "विश्वसनीय"],
    "simulation": ["what if", "what-if", "reduce", "cut ", "increase", "scenario", "simulate", "simulator", "traffic", "कम करें", "कमी"],
    "observation": ["aqi", "pm2.5", "pm10", "reading", "level", "now", "current", "latest", "how is", "air quality", "pollution", "measured", "प्रदूषण", "हवा", "वायु", "गुणवत्ता", "प्रदूषण"],
    "project": ["what is aeromatrix", "aeromatrix", "how does", "dataset", "data source", "which model", "coverage", "which stations", "explain", "what can you", "who", "help", "about", "kya hai", "म्हणजे"],
}

HISTORICAL_WORDS = ["historical", "old data", "past", "bundled", "january 2026", "snapshot"]
FOLLOWUP_WORDS = ["what about", "how about", "and ", "same for", "there", "also", "और", "आणि", "तिथे"]
MARATHI_MARKERS = ["आहे", "काय", "मला", "माझ", "आणि", "होईल", "किती"]
HINDI_MARKERS = ["है", "क्या", "में", "मुझे", "और", "कितना", "होगा"]
DEVANAGARI = re.compile(r"[ऀ-ॿ]")


@dataclass
class Aliases:
    stations: dict[str, str] = field(default_factory=dict)  # lowercase alias -> station name
    places: dict[str, dict[str, Any]] = field(default_factory=dict)  # lowercase alias -> {name, note?, station?}
    pollutants: dict[str, str] = field(default_factory=dict)  # lowercase alias -> pollutant key

    @classmethod
    def load(cls, path: Path, regions: list[dict[str, Any]] | None = None) -> "Aliases":
        raw = json.loads(path.read_text(encoding="utf-8"))
        a = cls()
        for s in raw.get("stations", []):
            for al in s["aliases"] + [s["name"].lower()]:
                a.stations[al.lower()] = s["name"]
        for p in raw.get("places", []):
            for al in p["aliases"]:
                a.places[al.lower()] = p
        for key, words in raw.get("pollutants", {}).items():
            for w in words + [key]:
                a.pollutants[w.lower()] = key
        # Station names the model API reports (GET /regions) are added at runtime.
        for r in regions or []:
            name = r.get("name")
            if not name:
                continue
            a.stations.setdefault(name.lower(), name)
            for al in r.get("aliases", []) or []:
                a.stations.setdefault(str(al).lower(), name)
        return a


@dataclass
class Route:
    intent: str = "general"
    pollutant: str | None = None
    stations: list[str] = field(default_factory=list)
    places: list[str] = field(default_factory=list)
    language: str = "en"
    followup: bool = False
    historical: bool = False
    percent: int | None = None
    section: str | None = None
    actions: list[dict[str, Any]] = field(default_factory=list)
    needs_station: bool = False


def detect_language(text: str) -> str:
    if not DEVANAGARI.search(text):
        return "en"
    if any(m in text for m in MARATHI_MARKERS) and not any(m in text for m in ("है ", "क्या", "मुझे")):
        return "mr"
    return "hi"


def _find(text: str, table: dict[str, Any]) -> list[str]:
    """Longest-alias-first matching; ASCII aliases need word boundaries, Devanagari aliases match as substrings."""
    found: list[str] = []
    used: list[tuple[int, int]] = []
    for alias in sorted(table, key=len, reverse=True):
        if DEVANAGARI.search(alias):
            idx = text.find(alias)
            spans = [(idx, idx + len(alias))] if idx >= 0 else []
        else:
            spans = [(m.start(), m.end()) for m in re.finditer(rf"(?<![a-z0-9]){re.escape(alias)}(?![a-z0-9])", text)]
        for s, e in spans:
            if any(not (e <= us or s >= ue) for us, ue in used):
                continue
            used.append((s, e))
            found.append(alias)
    return found


def _pollutant_of(text: str, aliases: Aliases) -> str | None:
    hits = _find(text, aliases.pollutants)
    return aliases.pollutants[hits[0]] if hits else None


def _percent(text: str) -> int | None:
    m = re.search(r"(\d{1,3})\s*(?:%|percent|per cent|प्रतिशत)", text)
    if m:
        return max(0, min(100, int(m.group(1))))
    return None


def _section_of(text: str) -> str | None:
    for section, words in SECTION_WORDS.items():
        if any(w in text for w in words):
            return section
    return None


def route(message: str, aliases: Aliases, last: Route | None = None, context: dict[str, Any] | None = None) -> Route:
    """Classify a message. `last` is the previous route of the session (for follow-ups)."""
    text = message.strip().lower()
    r = Route(language=detect_language(message))

    r.pollutant = _pollutant_of(text, aliases)
    station_hits = _find(text, aliases.stations)
    names: list[str] = []
    for hit in station_hits:
        n = aliases.stations[hit]
        if n not in names:
            names.append(n)
    # Places (Kothrud, Baner, Shivajinagar): Shivajinagar resolves to its station, the others stay places.
    for hit in _find(text, aliases.places):
        p = aliases.places[hit]
        if p.get("station"):
            if p["station"] not in names:
                names.append(p["station"])
        elif p["name"] not in r.places:
            r.places.append(p["name"])
    r.stations = names
    r.historical = any(w in text for w in HISTORICAL_WORDS)
    r.percent = _percent(text)
    r.section = _section_of(text)

    scores = {k: sum(1 for w in words if w in text) for k, words in INTENT_WORDS.items()}
    best = max(scores, key=lambda k: scores[k])
    r.intent = best if scores[best] > 0 else ("observation" if (r.stations or r.places or r.pollutant) else "general")
    if "compare" in text or "तुलना" in text:
        r.intent = "comparison"
    nav_words = ["open", "show me", "go to", "take me", "navigate", "switch to", "उघडा", "खोलो", "दिखाओ"]
    if r.section and any(w in text for w in nav_words) and r.intent not in ("simulation",):
        r.intent = "navigation"

    # Follow-up: a short message with no station and no pollutant inherits the previous context.
    short = len(text.split()) <= 7
    if last and not r.stations and not r.places and (r.pollutant is None or short):
        if short and (any(w in text for w in FOLLOWUP_WORDS) or r.pollutant is not None or scores[best] == 0):
            r.followup = True
            r.stations = list(last.stations)
            r.places = list(last.places)
            r.pollutant = r.pollutant or last.pollutant
            if scores[best] == 0 or r.intent == "observation":
                r.intent = last.intent if last.intent in ("observation", "forecast", "reliability") else r.intent

    # Unverified UI context: a default station/pollutant only when it is a known name.
    ctx = context or {}
    if not r.stations and not r.places and r.intent in ("observation", "forecast"):
        sel = str(ctx.get("selected_region") or ctx.get("station") or "").lower()
        if sel and sel in aliases.stations:
            r.stations = [aliases.stations[sel]]
    if r.pollutant is None and str(ctx.get("pollutant", "")).lower() in aliases.pollutants.values():
        if r.intent in ("observation", "forecast", "reliability"):
            r.pollutant = str(ctx["pollutant"]).lower()

    r.needs_station = r.intent in ("observation", "forecast") and not r.stations and not r.places
    r.actions = extract_actions(text, r)
    return r


def extract_actions(text: str, r: Route) -> list[dict[str, Any]]:
    """Allowlisted UI actions implied by the message. The app validates and verifies each one before claiming anything."""
    acts: list[dict[str, Any]] = []
    if r.intent == "navigation" and r.section:
        acts.append({"type": "navigate_to_section", "section": r.section})
    if r.intent in ("observation", "forecast") and r.stations:
        acts.append({"type": "select_region", "region": r.stations[0]})
    if r.intent == "comparison" and len(r.stations) >= 2:
        acts.append({"type": "compare_regions", "regions": r.stations[:2]})
    if r.pollutant and r.pollutant != "aqi" and r.intent in ("observation", "forecast", "navigation"):
        acts.append({"type": "set_pollutant", "pollutant": r.pollutant})
    if r.intent == "simulation":
        acts.append({"type": "navigate_to_section", "section": "simulator"})
        if r.percent is not None and ("traffic" in text or "vehicle" in text):
            acts.append({"type": "update_scenario_parameter", "parameter": "traffic_reduction_pct", "value": r.percent})
            acts.append({"type": "run_scenario"})
            acts.append({"type": "show_scenario", "mode": "delta"})
        elif "reset" in text:
            acts.append({"type": "reset_scenario"})
    if "industr" in text and r.intent in ("navigation", "general", "project"):
        acts.append({"type": "show_industries"})
    if r.intent == "forecast":
        acts.append({"type": "show_heatmap", "mode": "forecast"})
    return acts
