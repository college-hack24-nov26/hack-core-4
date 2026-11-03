"""AeroSage FastAPI app (port 8010): /health /capabilities /knowledge/status, POST /chat /chat/stream /session/reset."""
from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from typing import Any

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from . import __version__
from .adapters import AdapterOffline, HttpModelApi, HttpOpenMeteo, ModelApi, OpenMeteo
from .config import Settings, load_settings
from .intent_router import SECTIONS, Route
from .llm import GeminiLLM, LLM
from .service import ALLOWED_ACTION_TYPES, AeroSage
from .session_store import SessionStore
from rag.retriever import Retriever


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    session_id: str | None = None
    # Everything here is UNVERIFIED selector data from the browser: it only fills defaults after validation.
    context: dict[str, Any] | None = None


class ResetRequest(BaseModel):
    session_id: str


@dataclass
class Deps:
    settings: Settings
    model_api: ModelApi
    open_meteo: OpenMeteo | None
    llm: LLM | None
    retriever: Retriever
    store: SessionStore


def default_deps(settings: Settings | None = None) -> Deps:
    s = settings or load_settings()
    return Deps(
        settings=s,
        model_api=HttpModelApi(s.model_api_url),
        open_meteo=HttpOpenMeteo(),
        llm=GeminiLLM(s.gemini_api_key, s.gemini_model) if s.llm_configured else None,
        retriever=Retriever(s.index_path),
        store=SessionStore(s.conversations_db, s.session_ttl_hours, s.max_turns),
    )


def _route_to_json(r: Route) -> str:
    return json.dumps({"intent": r.intent, "pollutant": r.pollutant, "stations": r.stations, "places": r.places})


def _route_from_json(blob: str | None) -> Route | None:
    if not blob:
        return None
    d = json.loads(blob)
    return Route(intent=d.get("intent", "general"), pollutant=d.get("pollutant"), stations=d.get("stations", []), places=d.get("places", []))


def create_app(deps: Deps | None = None) -> FastAPI:
    d = deps or default_deps()
    app = FastAPI(title="AeroSage", version=__version__)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(d.settings.allowed_origins),
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", "X-Session-Token"],
        expose_headers=["X-Session-Id", "X-Session-Token"],
    )
    bot = AeroSage(d.model_api, d.open_meteo, d.llm, d.retriever, d.settings.aliases_path)

    def session_for(session_id: str | None, token: str | None) -> tuple[str, str | None]:
        """An existing session needs its secret token; no id starts a new session (the token is returned once)."""
        if session_id:
            if not d.store.verify(session_id, token):
                raise HTTPException(status_code=401, detail="Invalid or expired session token.")
            return session_id, None
        return d.store.create()

    async def run_chat(req: ChatRequest, token: str | None) -> dict[str, Any]:
        sid, new_token = session_for(req.session_id, token)
        last = _route_from_json(d.store.last_route(sid))
        history = d.store.history(sid)
        result, route = await bot.handle(req.message, last, history, req.context)
        d.store.add(sid, "user", req.message)
        d.store.add(sid, "assistant", result.text)
        d.store.set_last_route(sid, _route_to_json(route))
        out = {"session_id": sid, "reply": result.as_dict()}
        if new_token:
            out["session_token"] = new_token
        return out

    @app.get("/health")
    async def health() -> dict[str, Any]:
        model = "online"
        try:
            await d.model_api.get("/health")
        except AdapterOffline:
            model = "offline"
        return {
            "status": "ok",
            "service": "aerosage",
            "version": __version__,
            "llm_configured": d.llm is not None,
            "model_api": model,
            "knowledge": d.retriever.status(),
        }

    @app.get("/capabilities")
    async def capabilities() -> dict[str, Any]:
        return {
            "intents": ["observation", "forecast", "comparison", "reliability", "simulation", "navigation", "project", "general"],
            "actions": sorted(ALLOWED_ACTION_TYPES),
            "sections": list(SECTIONS),
            "languages": ["en", "hi", "mr"],
            "numbers": "Numeric answers come straight from the model API and Open-Meteo; the language model never produces them.",
            "read_only": True,
        }

    @app.get("/knowledge/status")
    async def knowledge_status() -> dict[str, Any]:
        return d.retriever.status()

    @app.post("/chat")
    async def chat(req: ChatRequest, x_session_token: str | None = Header(default=None)) -> dict[str, Any]:
        return await run_chat(req, x_session_token)

    @app.post("/chat/stream")
    async def chat_stream(req: ChatRequest, x_session_token: str | None = Header(default=None)) -> StreamingResponse:
        # Authenticate before streaming so a bad token is a clean 401.
        if req.session_id and not d.store.verify(req.session_id, x_session_token):
            raise HTTPException(status_code=401, detail="Invalid or expired session token.")
        payload = await run_chat(req, x_session_token)

        async def events():
            meta = {k: v for k, v in payload.items() if k != "reply"}
            yield f"event: meta\ndata: {json.dumps(meta)}\n\n"
            words = payload["reply"]["text"].split(" ")
            for i in range(0, len(words), 4):
                yield f"event: token\ndata: {json.dumps({'text': ' '.join(words[i:i + 4]) + (' ' if i + 4 < len(words) else '')})}\n\n"
                await asyncio.sleep(0)
            yield f"event: done\ndata: {json.dumps(payload)}\n\n"

        return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})

    @app.post("/session/reset")
    async def session_reset(req: ResetRequest, x_session_token: str | None = Header(default=None)) -> dict[str, str]:
        if not d.store.verify(req.session_id, x_session_token):
            raise HTTPException(status_code=401, detail="Invalid or expired session token.")
        d.store.reset(req.session_id)
        return {"status": "reset", "session_id": req.session_id}

    return app


app = create_app()
