"""The LLM (Gemini REST) only explains project concepts, answers general questions and translates.

It is never asked for, and never trusted with, air-quality numbers: those are formatted from API responses
(see formatters.py).
"""
from __future__ import annotations

from typing import Protocol

import httpx

SYSTEM_EXPLAIN = (
    "You are AeroSage, the assistant of AeroMatrix, an air-quality digital twin of Pune and Pimpri-Chinchwad. "
    "Answer ONLY from the provided notes when they cover the question; otherwise say you do not know. "
    "Never state air-quality measurements, forecasts or statistics: live numbers are supplied separately by the app. "
    "Be concise and plain."
)
SYSTEM_GENERAL = (
    "You are AeroSage, the assistant of AeroMatrix. Answer briefly. Never give air-quality numbers for Pune: "
    "tell the user to ask for a station reading instead."
)
SYSTEM_TRANSLATE = (
    "Translate the text into the requested language. Keep every number, unit, station name, date and the words "
    "AQI, PM2.5, PM10, NO2, SO2, CO and O3 exactly as written. Do not add or remove information."
)


class LLMUnavailable(Exception):
    pass


class LLM(Protocol):
    async def complete(self, system: str, user: str, history: list[dict[str, str]] | None = None) -> str: ...


class GeminiLLM:
    """Google Gemini through its REST API (generateContent)."""

    def __init__(self, api_key: str, model: str = "gemini-2.0-flash", client: httpx.AsyncClient | None = None, timeout: float = 25.0) -> None:
        self.api_key = api_key
        self.model = model
        self._client = client
        self._timeout = timeout

    async def complete(self, system: str, user: str, history: list[dict[str, str]] | None = None) -> str:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent"
        contents = [{"role": "model" if m["role"] == "assistant" else "user", "parts": [{"text": m["content"]}]} for m in (history or [])]
        contents.append({"role": "user", "parts": [{"text": user}]})
        body = {"systemInstruction": {"parts": [{"text": system}]}, "contents": contents, "generationConfig": {"temperature": 0.2, "maxOutputTokens": 700}}
        own = self._client is None
        client = self._client or httpx.AsyncClient(timeout=self._timeout)
        try:
            res = await client.post(url, params={"key": self.api_key}, json=body)
        except (httpx.HTTPError, OSError) as exc:
            raise LLMUnavailable("The language model could not be reached.") from exc
        finally:
            if own:
                await client.aclose()
        if res.status_code >= 400:
            raise LLMUnavailable(f"The language model answered HTTP {res.status_code}.")
        try:
            return res.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
        except (KeyError, IndexError, ValueError) as exc:
            raise LLMUnavailable("The language model returned an unreadable answer.") from exc
