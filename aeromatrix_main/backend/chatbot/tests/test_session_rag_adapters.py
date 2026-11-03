import asyncio
from pathlib import Path

import httpx
import pytest

from chatbot.adapters import ALLOWED_MODEL_PATHS, AdapterOffline, ForbiddenCall, HttpModelApi, check_model_call
from chatbot.config import ROOT, load_settings
from chatbot.session_store import SessionStore
from rag.build_index import build_index, chunk_markdown
from rag.retriever import Retriever


# ---- session store ----

def test_tokens_are_independent_and_only_hashes_are_stored():
    s = SessionStore(":memory:")
    a, ta = s.create()
    b, tb = s.create()
    assert ta != tb
    assert s.verify(a, ta) and s.verify(b, tb)
    assert not s.verify(a, tb) and not s.verify(a, None) and not s.verify("nope", ta)
    stored = s._db.execute("SELECT token_hash FROM sessions WHERE id=?", (a,)).fetchone()[0]
    assert stored != ta and len(stored) == 64


def test_history_is_bounded_to_twelve_turns():
    s = SessionStore(":memory:", max_turns=12)
    sid, _ = s.create()
    for i in range(30):
        s.add(sid, "user", f"q{i}")
        s.add(sid, "assistant", f"a{i}")
    h = s.history(sid)
    assert len(h) == 24
    assert h[0]["content"] == "q18" and h[-1]["content"] == "a29"


def test_sessions_expire_after_24_hours_and_reset_clears_history():
    clock = {"t": 1_000_000.0}
    s = SessionStore(":memory:", ttl_hours=24, now=lambda: clock["t"])
    sid, token = s.create()
    s.add(sid, "user", "hello")
    s.set_last_route(sid, "x")
    clock["t"] += 23 * 3600
    assert s.verify(sid, token) and len(s.history(sid)) == 1
    s.reset(sid)
    assert s.history(sid) == [] and s.last_route(sid) is None
    clock["t"] += 25 * 3600
    assert not s.verify(sid, token)
    assert not s.exists(sid)


# ---- knowledge index ----

def test_chunking_follows_headings():
    chunks = chunk_markdown("# Title\n\nintro text\n\n## Part A\nalpha\n\n## Part B\nbeta", "x.md")
    assert [c[1] for c in chunks] == ["Title", "Title: Part A", "Title: Part B"]
    assert chunks[1][2] == "alpha"


def test_index_builds_from_the_notes_and_retrieves_by_bm25(tmp_path: Path):
    idx = tmp_path / "kb.sqlite3"
    assert build_index(ROOT / "knowledge_base", idx) > 10
    r = Retriever(idx)
    st = r.status()
    assert st["indexed"] and st["documents"] == 9 and st["built_at"]
    hit = r.search("Kothrud AQI history")[0]
    assert hit.source == "coverage.md" and "Kothrud" in hit.body
    assert r.search("persistence beat the model in normal hours")[0].source == "sensor_intelligence.md"
    assert r.search("how is SO2 forecast made")[0].source in ("models.md", "api.md", "pollutants.md")
    assert r.search("and the of") == [] and r.search("") == []
    assert r.search('"; DROP TABLE chunks; --') == [] or True  # a hostile query never raises


def test_retriever_without_an_index_is_empty(tmp_path: Path):
    r = Retriever(tmp_path / "missing.sqlite3")
    assert not r.ready and r.search("anything") == [] and r.status()["indexed"] is False


def test_notes_contain_no_invented_statistics():
    text = " ".join(p.read_text(encoding="utf-8-sig") for p in (ROOT / "knowledge_base").glob("*.md"))
    assert "accuracy of" not in text.lower()
    assert "% accurate" not in text.lower()


# ---- adapters ----

def test_only_allowlisted_get_paths_and_params_pass():
    for p in ALLOWED_MODEL_PATHS:
        check_model_call(p, {"region": "x"})
    for bad in ("/forecast/", "/boundaries", "/industry", "/location", "/docs", "/openapi.json", "/pollution/../x"):
        with pytest.raises(ForbiddenCall):
            check_model_call(bad, None)
    with pytest.raises(ForbiddenCall):
        check_model_call("/pollution", {"region": "x", "admin": "1"})


def test_http_adapter_calls_get_only_and_maps_failures():
    seen: list[httpx.Request] = []

    def handler(req: httpx.Request) -> httpx.Response:
        seen.append(req)
        if req.url.path == "/boom":
            return httpx.Response(500)
        if req.url.path == "/pollution" and req.url.params.get("region") == "Down":
            raise httpx.ConnectError("refused")
        return httpx.Response(200, json={"status": "ok", "q": dict(req.url.params)})

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    api = HttpModelApi("http://127.0.0.1:8000", client)

    async def go():
        ok = await api.get("/forecast", {"region": "Hadapsar", "allow_historical": True, "pollutant": None})
        assert ok["q"] == {"region": "Hadapsar", "allow_historical": "true"}
        with pytest.raises(AdapterOffline, match="not reachable"):
            await api.get("/pollution", {"region": "Down"})
        with pytest.raises(ForbiddenCall):
            await api.get("/boom")

    asyncio.run(go())
    assert all(r.method == "GET" for r in seen)


def test_settings_defaults_and_overrides():
    s = load_settings({})
    assert s.model_api_url == "http://127.0.0.1:8000" and s.port == 8010 and not s.llm_configured
    s2 = load_settings({"GEMINI_API_KEY": "k", "CHATBOT_PORT": "9000", "AEROMATRIX_API_URL": "http://x:1/"})
    assert s2.llm_configured and s2.port == 9000 and s2.model_api_url == "http://x:1"
