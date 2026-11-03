from __future__ import annotations

import json
import re
from pathlib import Path

from fastapi.testclient import TestClient

from chatbot.main import create_app
from tests.conftest import EXAMPLES, FakeLLM, FakeModelApi, FakeOpenMeteo, chat, make_deps


def session_of(first: dict) -> dict:
    return {"id": first["session_id"], "token": first["session_token"]}


def test_station_aqi_question_answers_with_numbers_straight_from_the_api(client):
    c, deps = client
    out = chat(c, "What is the PM2.5 at Hadapsar?")
    r = out["reply"]
    pm = EXAMPLES["measured_Hadapsar"]["pollutants"]["pm25"]["value"]
    assert r["status"] == "ok" and r["intent"] == "observation"
    assert f"PM2.5: {pm:.1f} ug/m3" in r["text"]
    assert f"AQI {EXAMPLES['measured_Hadapsar']['aqi']['value']}" in r["text"]
    assert r["used_llm"] is False  # no key needed for data answers
    assert r["sources"] == ["model_api:/pollution?region=Hadapsar"]
    assert {"type": "select_region", "region": "Hadapsar"} in r["actions"]
    assert ("/pollution", {"region": "Hadapsar"}) in deps.model_api.calls
    assert out["session_token"] and out["session_id"]


def test_unavailable_stays_unavailable(client):
    c, _ = client
    r = chat(c, "What is the AQI at Alandi?")["reply"]
    assert r["status"] == "unavailable" and "No snapshot for Alandi" in r["text"]
    assert not re.search(r"\bAQI \d", r["text"])


def test_offline_api_says_so_and_invents_nothing(tmp_path, kb_index):
    deps = make_deps(tmp_path, kb_index, model=FakeModelApi(offline=True))
    c = TestClient(create_app(deps))
    r = chat(c, "What is the AQI at Hadapsar?")["reply"]
    assert r["status"] == "offline"
    assert "not reachable" in r["text"] and "won't guess" in r["text"]
    assert not re.search(r"\d+\.\d+ ?(ug|mg)|AQI \d", r["text"])  # the URL's 127.0 is not a reading
    # project notes still work without the API
    assert chat(c, "What is AeroMatrix?")["reply"]["status"] == "ok"


def test_forecast_is_unavailable_by_default_and_available_with_historical_wording(client):
    c, deps = client
    first = chat(c, "forecast for Hadapsar PM2.5")
    assert first["reply"]["status"] == "unavailable" and "historical forecast" in first["reply"]["text"]
    second = chat(c, "forecast for Hadapsar PM2.5 from the historical snapshot")["reply"]
    p = EXAMPLES["Hadapsar"]["pollutants"]["pm25"]
    assert second["status"] == "ok" and f"{p['value']:.1f}" in second["text"] and "(historical forecast)" in second["text"]
    assert any(path == "/forecast" and q.get("allow_historical") is True for path, q in deps.model_api.calls)


def test_follow_up_uses_the_session_context(client):
    c, _ = client
    first = chat(c, "What is the PM2.5 at Hadapsar?")
    s = session_of(first)
    nxt = chat(c, "and PM10?", s)["reply"]
    pm10 = EXAMPLES["measured_Hadapsar"]["pollutants"]["pm10"]["value"]
    assert nxt["followup"] and f"PM10: {pm10:.1f} ug/m3" in nxt["text"]


def test_asks_which_station_instead_of_guessing(client):
    c, _ = client
    r = chat(c, "what is the aqi now")["reply"]
    assert r["status"] == "unavailable" and "Which station" in r["text"]


def test_kothrud_is_history_only_and_not_karve_road(client):
    c, _ = client
    r = chat(c, "What is the AQI in Kothrud?")["reply"]
    assert "AQI history is unavailable" in r["text"] or "only historical AQI" in r["text"]
    assert "Karve Road" not in r["text"] or "not mapped to Karve Road" in r["text"]


def test_project_questions_use_the_notes_without_an_llm(client):
    c, _ = client
    r = chat(c, "Which stations does the model cover?")["reply"]
    assert r["status"] == "ok" and r["intent"] == "project" and r["used_llm"] is False
    assert r["sources"] and all(s.startswith("kb:") for s in r["sources"])
    body = r["text"].lower()
    assert "pune" in body or "model" in body  # text is the retrieved note itself


def test_the_llm_only_explains_and_translates_never_data(tmp_path, kb_index):
    llm = FakeLLM()
    deps = make_deps(tmp_path, kb_index, llm=llm)
    c = TestClient(create_app(deps))
    project = chat(c, "Explain how the datasets are used")["reply"]
    assert project["text"] == "FAKE-LLM-ANSWER" and project["used_llm"]
    assert "Notes:" in llm.calls[-1][1]  # grounded in retrieved notes
    n = len(llm.calls)
    data = chat(c, "What is the PM2.5 at Hadapsar?")["reply"]
    assert data["used_llm"] is False and len(llm.calls) == n  # numbers never go through the LLM
    hi = chat(c, "हडपसर में PM2.5 कितना है")["reply"]
    assert hi["language"] == "hi" and hi["text"].startswith("[translated]")
    pm = EXAMPLES["measured_Hadapsar"]["pollutants"]["pm25"]["value"]
    assert f"{pm:.1f}" in hi["text"]  # the translated answer still carries the API's number


def test_hindi_without_an_llm_answers_in_english_and_says_so(client):
    c, _ = client
    r = chat(c, "हडपसर में PM2.5 कितना है")["reply"]
    assert r["language"] == "hi" and "answered in English" in r["text"]
    assert f"{EXAMPLES['measured_Hadapsar']['pollutants']['pm25']['value']:.1f}" in r["text"]


def test_general_question_without_a_key_is_honest(client):
    c, _ = client
    r = chat(c, "tell me a joke")["reply"]
    assert r["status"] == "unavailable" and "language model" in r["text"]


def test_simulation_returns_validated_actions_and_a_caveat(client):
    c, _ = client
    r = chat(c, "What if I reduce traffic by 20%?")["reply"]
    assert r["intent"] == "simulation" and "MODELED_SCENARIO" in r["text"]
    assert [a["type"] for a in r["actions"]] == ["navigate_to_section", "update_scenario_parameter", "run_scenario", "show_scenario"]
    assert r["actions"][1]["value"] == 20
    assert not re.search(r"\d+\.\d", r["text"])  # no invented outcome


def test_reliability_reads_metrics_from_the_api(client):
    c, _ = client
    r = chat(c, "How accurate is the PM2.5 model?")["reply"]
    assert "MAE 13.04" in r["text"] and "R2 0.71" in r["text"]


def test_compare_two_stations(client):
    c, _ = client
    r = chat(c, "compare Hadapsar and Alandi")["reply"]
    assert r["intent"] == "comparison" and "Hadapsar" in r["text"] and "Alandi" in r["text"]


def test_session_tokens_are_enforced_and_reset_works(client):
    c, _ = client
    first = chat(c, "What is the PM2.5 at Hadapsar?")
    s = session_of(first)
    assert c.post("/chat", json={"message": "hi", "session_id": s["id"]}).status_code == 401
    assert c.post("/chat", json={"message": "hi", "session_id": s["id"]}, headers={"X-Session-Token": "wrong"}).status_code == 401
    assert c.post("/session/reset", json={"session_id": s["id"]}).status_code == 401
    ok = c.post("/session/reset", json={"session_id": s["id"]}, headers={"X-Session-Token": s["token"]})
    assert ok.status_code == 200 and ok.json()["status"] == "reset"
    # after reset a short follow-up has no context to inherit
    again = chat(c, "and PM10?", s)["reply"]
    assert not again["followup"]


def test_stream_emits_meta_tokens_and_done(client):
    c, _ = client
    with c.stream("POST", "/chat/stream", json={"message": "What is the PM2.5 at Hadapsar?"}) as res:
        body = "".join(res.iter_text())
    events = re.findall(r"event: (\w+)\ndata: (.*)\n", body)
    names = [e[0] for e in events]
    assert names[0] == "meta" and names[-1] == "done" and names.count("token") >= 2
    done = json.loads(events[-1][1])
    streamed = "".join(json.loads(d)["text"] for n, d in events if n == "token")
    assert streamed.strip() == done["reply"]["text"].strip()
    assert "session_token" in json.loads(events[0][1])


def test_health_capabilities_and_knowledge_status(client):
    c, _ = client
    h = c.get("/health").json()
    assert h["status"] == "ok" and h["service"] == "aerosage" and h["llm_configured"] is False and h["model_api"] == "online"
    cap = c.get("/capabilities").json()
    assert "navigate_to_section" in cap["actions"] and cap["read_only"] is True and "hi" in cap["languages"]
    assert c.get("/knowledge/status").json()["indexed"] is True


def test_health_reports_an_offline_model_api(tmp_path, kb_index):
    c = TestClient(create_app(make_deps(tmp_path, kb_index, model=FakeModelApi(offline=True))))
    assert c.get("/health").json()["model_api"] == "offline"


def test_every_returned_action_is_on_the_allowlist(client):
    from chatbot.service import ALLOWED_ACTION_TYPES

    c, _ = client
    for msg in ["open the simulator", "compare Hadapsar and Alandi", "forecast for Hadapsar pm10", "what if I cut traffic by 10%", "show industries"]:
        for a in chat(c, msg)["reply"]["actions"]:
            assert a["type"] in ALLOWED_ACTION_TYPES, msg


def test_input_validation(client):
    c, _ = client
    assert c.post("/chat", json={"message": ""}).status_code == 422
    assert c.post("/chat", json={"message": "x" * 2001}).status_code == 422
    assert c.post("/chat", json={}).status_code == 422


def test_open_meteo_is_used_only_for_a_real_map_location(tmp_path, kb_index):
    om = FakeOpenMeteo()
    c = TestClient(create_app(make_deps(tmp_path, kb_index, om=om)))
    r = chat(c, "what is the pm2.5 here now", context={"map_location": {"lat": 18.5, "lon": 73.9}})["reply"]
    assert om.calls == [(18.5, 73.9)] and "model data, not a station measurement" in r["text"] and "39.2" in r["text"]
    om.calls.clear()
    chat(c, "what is the pm2.5 here now")  # no location: no call
    assert om.calls == []
