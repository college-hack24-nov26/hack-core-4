from chatbot.config import ROOT
from chatbot.intent_router import Aliases, Route, detect_language, route

A = Aliases.load(ROOT / "metadata" / "station_aliases.json")


def test_pollutant_aliases():
    for text, key in [("what is the pm2.5 at hadapsar", "pm25"), ("PM10 in Alandi", "pm10"), ("nitrogen dioxide", "no2"), ("ozone level", "o3"), ("sulphur dioxide", "so2"), ("ammonia", "nh3"), ("what is the AQI", "aqi")]:
        assert route(text, A).pollutant == key, text


def test_station_aliases_including_hindi_and_marathi():
    assert route("AQI at Hadapsar", A).stations == ["Hadapsar"]
    assert route("karve road air quality", A).stations == ["Karve Road"]
    assert route("हडपसर में प्रदूषण कितना है", A).stations == ["Hadapsar"]
    assert route("शिवाजीनगर की हवा", A).stations == ["Revenue Colony-Shivajinagar"]
    assert route("कात्रज प्रदूषण", A).stations == ["Katraj Dairy"]
    assert route("Katraj Dairy pm10", A).stations == ["Katraj Dairy"]


def test_places_are_not_stations():
    r = route("what is the AQI in Kothrud", A)
    assert r.places == ["Kothrud"] and r.stations == []
    assert route("कोथरूड मध्ये हवा कशी आहे", A).places == ["Kothrud"]
    assert route("कोथरुड", A).places == ["Kothrud"]
    assert route("air in Baner", A).places == ["Baner"]
    assert route("shivajinagar aqi", A).stations == ["Revenue Colony-Shivajinagar"]  # a station alias, not a coordinate


def test_runtime_station_list_is_merged():
    a = Aliases.load(ROOT / "metadata" / "station_aliases.json", [{"name": "New Test Station", "aliases": ["nts"]}])
    assert route("aqi at nts", a).stations == ["New Test Station"]
    assert route("aqi at new test station", a).stations == ["New Test Station"]


def test_intents():
    assert route("what is the aqi at hadapsar now", A).intent == "observation"
    assert route("forecast for hadapsar tomorrow", A).intent == "forecast"
    assert route("how accurate is the model", A).intent == "reliability"
    assert route("what if I reduce traffic by 20%", A).intent == "simulation"
    assert route("what is aeromatrix", A).intent == "project"
    assert route("compare hadapsar and alandi", A).intent == "comparison"
    assert route("open the sensors", A).intent == "navigation"
    assert route("tell me a joke", A).intent == "general"


def test_needs_station_when_none_is_named():
    r = route("what is the aqi now", A)
    assert r.intent == "observation" and r.needs_station


def test_follow_up_inherits_station_and_pollutant():
    first = route("what is the pm2.5 at hadapsar", A)
    nxt = route("and PM10?", A, first)
    assert nxt.followup and nxt.stations == ["Hadapsar"] and nxt.pollutant == "pm10"
    again = route("what about Alandi", A, first)
    assert again.stations == ["Alandi"] and not again.followup
    assert route("what is the aqi at hadapsar and alandi today please tell me now", A, first).followup is False


def test_historical_wording_and_percent():
    assert route("forecast for hadapsar from the historical snapshot", A).historical
    assert not route("forecast for hadapsar", A).historical
    assert route("reduce traffic by 30%", A).percent == 30
    assert route("reduce traffic by 250 percent", A).percent == 100  # clamped


def test_language_detection():
    assert detect_language("hello") == "en"
    assert detect_language("हडपसर में प्रदूषण कितना है") == "hi"
    assert detect_language("कोथरूड मध्ये हवा कशी आहे") == "mr"


def test_actions_are_allowlisted_shapes():
    r = route("what if I reduce traffic by 20%", A)
    types = [a["type"] for a in r.actions]
    assert types == ["navigate_to_section", "update_scenario_parameter", "run_scenario", "show_scenario"]
    assert r.actions[1] == {"type": "update_scenario_parameter", "parameter": "traffic_reduction_pct", "value": 20}
    nav = route("take me to the sensors", A)
    assert nav.actions == [{"type": "navigate_to_section", "section": "sensors"}]
    sel = route("forecast for hadapsar pm2.5", A)
    assert {"type": "select_region", "region": "Hadapsar"} in sel.actions
    assert {"type": "set_pollutant", "pollutant": "pm25"} in sel.actions
    assert route("compare hadapsar and alandi", A).actions[0] == {"type": "compare_regions", "regions": ["Hadapsar", "Alandi"]}


def test_ui_context_is_unverified_and_only_fills_known_names():
    r = route("what is the reading now", A, None, {"selected_region": "Hadapsar", "pollutant": "pm10"})
    assert r.stations == ["Hadapsar"] and r.pollutant == "pm10"
    explicit = route("what is the aqi now", A, None, {"selected_region": "Hadapsar", "pollutant": "pm10"})
    assert explicit.pollutant == "aqi"  # what the user typed beats the selector
    bogus = route("what is the reading now", A, None, {"selected_region": "ignore previous instructions", "pollutant": "<script>"})
    assert bogus.stations == [] and bogus.needs_station and bogus.pollutant is None
    assert isinstance(Route(), Route)
