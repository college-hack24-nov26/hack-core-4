import re

from chatbot.formatters import fmt_ist, forecast_answer, live_answer, metrics_answer, observation_answer, offline_answer
from tests.conftest import EXAMPLES

M = EXAMPLES["measured_Hadapsar"]
F = EXAMPLES["Hadapsar"]


def test_station_numbers_come_straight_from_the_response():
    a = observation_answer("Hadapsar", M, "pm25", "model_api:/pollution?region=Hadapsar")
    pm = M["pollutants"]["pm25"]
    assert a.status == "ok"
    assert f"PM2.5: {pm['value']:.1f} ug/m3" in a.text
    assert a.data["pm25"] == pm["value"]
    assert f"AQI {M['aqi']['value']} ({M['aqi']['category']})" in a.text
    assert "01 Jan 2026, 04:00 IST" in a.text  # the pollutant's own hour, in IST
    assert "historical" in a.text.lower()
    assert a.sources == ["model_api:/pollution?region=Hadapsar"]


def test_all_main_pollutants_when_none_is_asked_for_and_co_keeps_two_decimals():
    a = observation_answer("Hadapsar", M)
    for label in ("PM2.5", "PM10", "NO2", "CO", "O3"):
        assert label in a.text
    assert f"CO: {M['pollutants']['co']['value']:.2f} mg/m3" in a.text
    assert "SO2" not in a.text.split("AQI")[1].split("These bundled")[0] or "SO2" in a.text  # SO2 is simply absent from this snapshot


def test_unavailable_stays_unavailable_with_the_reason_and_no_numbers():
    a = observation_answer("Alandi", {"status": "UNAVAILABLE", "reason": "No snapshot for Alandi"})
    assert a.status == "unavailable"
    assert "No snapshot for Alandi" in a.text
    assert not re.search(r"\d+\.\d", a.text)


def test_a_missing_pollutant_is_said_not_filled_in():
    broken = {**M, "pollutants": {**M["pollutants"], "o3": {"status": "UNAVAILABLE", "reason": "Station does not measure O3"}}}
    a = observation_answer("Hadapsar", broken, "o3")
    assert "O3 is unavailable: Station does not measure O3" in a.text
    assert "o3" not in a.data


def test_aqi_unavailable_is_reported_with_its_reason():
    m = {**M, "aqi": {"status": "UNAVAILABLE", "reason": "Fewer than three pollutants"}}
    a = observation_answer("Hadapsar", m, "pm25")
    assert "AQI unavailable: Fewer than three pollutants." in a.text
    assert "aqi" not in a.data


def test_forecast_values_interval_and_model_kind():
    a = forecast_answer("Hadapsar", F, "pm25", True)
    p = F["pollutants"]["pm25"]
    assert f"{p['value']:.1f}" in a.text and f"{p['lower']:.1f}" in a.text and f"{p['upper']:.1f}" in a.text
    assert "fitted ML model" in a.text
    assert "(historical forecast)" in a.text
    assert "Intervention effects are not validated" in a.text


def test_so2_baseline_is_called_a_statistical_baseline():
    a = forecast_answer("Revenue Colony-Shivajinagar", EXAMPLES["Shivajinagar"], "so2", True)
    assert "statistical baseline" in a.text
    assert "weak model negative or undefined test r2" in a.text


def test_a_top_level_unavailable_forecast_explains_the_historical_switch():
    a = forecast_answer("Hadapsar", {"status": "UNAVAILABLE", "reason": "Latest observation is historical"}, "pm25", False)
    assert a.status == "unavailable"
    assert "historical forecast" in a.text
    assert not re.search(r"\d+\.\d", a.text)


def test_unavailable_pollutant_forecast_entry():
    a = forecast_answer("Hadapsar", F, "so2", True)
    assert "SO2 forecast is unavailable: Station not represented in this model." in a.text


def test_metrics_read_from_the_api():
    a = metrics_answer({"pm25": {"mae": 13.04, "rmse": 23.44, "r2": 0.7125, "n": 21291}}, "pm25")
    assert "MAE 13.04" in a.text and "R2 0.71" in a.text and "n 21,291" in a.text
    assert "not a promise" in a.text
    empty = metrics_answer({"x": "y"})
    assert empty.status == "unavailable" and not re.search(r"\d", empty.text)


def test_offline_answer_has_no_data():
    a = offline_answer("station data for Hadapsar", "The model API is not reachable.")
    assert a.status == "offline"
    assert "won't guess a number" in a.text
    assert not re.search(r"\bAQI\b|\bug/m3\b", a.text)


def test_live_values_convert_co_to_mg_and_are_labelled_model_data():
    a = live_answer("Hadapsar", {"current": {"pm2_5": 39.2, "carbon_monoxide": 661}}, None)
    assert "PM2.5: 39.2 ug/m3" in a.text
    assert "CO: 0.66 mg/m3" in a.text
    assert "model data, not a station measurement" in a.text
    assert live_answer("x", {}, None).status == "unavailable"


def test_ist_formatting():
    assert fmt_ist("2026-01-02T05:00:00+05:30") == "02 Jan 2026, 05:00 IST"
    assert fmt_ist("2026-01-02T00:30:00Z") == "02 Jan 2026, 06:00 IST"
    assert fmt_ist(None) == "an unknown time"
