"""Shared fakes. No network, no API key: the model API, Open-Meteo and the LLM are in-process fakes."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from chatbot.adapters import AdapterOffline, check_model_call
from chatbot.main import Deps, create_app
from chatbot.config import Settings, ROOT
from chatbot.session_store import SessionStore
from rag.build_index import build_index
from rag.retriever import Retriever

REPO = Path(__file__).resolve().parents[4]
EXAMPLES = json.loads((REPO / "docs" / "contracts" / "trained_model_RESPONSE_EXAMPLES.json").read_text(encoding="utf-8"))


class FakeModelApi:
    """Replays the recorded contract examples. Enforces the same allowlist as the real adapter."""

    def __init__(self, offline: bool = False) -> None:
        self.offline = offline
        self.calls: list[tuple[str, dict[str, Any]]] = []

    async def get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        check_model_call(path, params)
        self.calls.append((path, dict(params or {})))
        if self.offline:
            raise AdapterOffline("The model API at http://127.0.0.1:8000 is not reachable (ConnectError).")
        p = params or {}
        if path == "/health":
            return {"status": "ok"}
        if path == "/regions":
            return {"station_locations": [EXAMPLES["Hadapsar"]["region"], EXAMPLES["Alandi"]["region"], EXAMPLES["Shivajinagar"]["region"]], "wards": []}
        if path == "/pollution":
            if p.get("region") == "Hadapsar":
                return EXAMPLES["measured_Hadapsar"]
            return {"status": "UNAVAILABLE", "reason": f"No snapshot for {p.get('region')} in this fake"}
        if path == "/forecast":
            if not p.get("allow_historical"):
                return {"status": "UNAVAILABLE", "reason": "Latest observation is historical; a current forecast is unavailable."}
            return EXAMPLES["Hadapsar"] if p.get("region") == "Hadapsar" else EXAMPLES["Alandi"]
        if path == "/model/metrics":
            return {"pm25": {"mae": 13.04, "rmse": 23.44, "r2": 0.7125, "n": 21291}, "pm10": {"mae": 27.3, "rmse": 46.1, "r2": 0.6957, "n": 21055}}
        if path == "/aqi/history":
            return {"status": "UNAVAILABLE", "reason": "No AQI history in this fake"}
        raise AssertionError(path)


class FakeOpenMeteo:
    def __init__(self) -> None:
        self.calls: list[tuple[float, float]] = []

    async def air_quality(self, lat: float, lon: float) -> Any:
        self.calls.append((lat, lon))
        return {"current": {"pm2_5": 39.2, "pm10": 45.4, "nitrogen_dioxide": 33.8, "sulphur_dioxide": 11.7, "carbon_monoxide": 661, "ozone": 54}}


class FakeLLM:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str]] = []

    async def complete(self, system: str, user: str, history: list[dict[str, str]] | None = None) -> str:
        self.calls.append((system, user))
        if system.startswith("Translate") or "Translate the text" in system:
            return "[translated] " + user.split("\n\n", 1)[-1]
        return "FAKE-LLM-ANSWER"


@pytest.fixture(scope="session")
def kb_index(tmp_path_factory: pytest.TempPathFactory) -> Path:
    path = tmp_path_factory.mktemp("kb") / "kb.sqlite3"
    assert build_index(ROOT / "knowledge_base", path) > 0
    return path


def make_deps(tmp_path: Path, kb_index: Path, *, model: Any = None, llm: Any = None, om: Any = None) -> Deps:
    settings = Settings(runtime_dir=tmp_path, index_path=kb_index)
    return Deps(
        settings=settings,
        model_api=model or FakeModelApi(),
        open_meteo=om if om is not None else FakeOpenMeteo(),
        llm=llm,
        retriever=Retriever(kb_index),
        store=SessionStore(":memory:", 24, 12),
    )


@pytest.fixture
def client(tmp_path: Path, kb_index: Path):
    from fastapi.testclient import TestClient

    deps = make_deps(tmp_path, kb_index)
    return TestClient(create_app(deps)), deps


def chat(client, message: str, session: dict | None = None, **extra) -> dict[str, Any]:
    headers = {"X-Session-Token": session["token"]} if session else {}
    body = {"message": message, **extra}
    if session:
        body["session_id"] = session["id"]
    res = client.post("/chat", json=body, headers=headers)
    assert res.status_code == 200, res.text
    return res.json()
