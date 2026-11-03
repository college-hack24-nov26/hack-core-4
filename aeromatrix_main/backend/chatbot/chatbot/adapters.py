"""Allowlisted READ-ONLY adapters. AeroSage reads numbers only through these; it never writes anywhere.

The shapes of the model API answers come from docs/contracts/trained_model_API_CONTRACT.json.
"""
from __future__ import annotations

from typing import Any, Protocol
from urllib.parse import urlparse

import httpx

# GET-only paths of the trained model API that AeroSage may call.
ALLOWED_MODEL_PATHS = frozenset({"/health", "/regions", "/pollution", "/forecast", "/model/metrics", "/aqi/history"})
ALLOWED_QUERY_KEYS = frozenset({"region", "pollutant", "allow_historical"})
ALLOWED_OPEN_METEO_HOSTS = frozenset({"air-quality-api.open-meteo.com", "api.open-meteo.com"})


class ForbiddenCall(Exception):
    """A call outside the allowlist was attempted."""


class AdapterOffline(Exception):
    """The upstream service cannot be reached. The message is safe to show to the user."""


class ModelApi(Protocol):
    async def get(self, path: str, params: dict[str, Any] | None = None) -> Any: ...


class OpenMeteo(Protocol):
    async def air_quality(self, lat: float, lon: float) -> Any: ...


def check_model_call(path: str, params: dict[str, Any] | None) -> None:
    if path not in ALLOWED_MODEL_PATHS:
        raise ForbiddenCall(f"{path} is not an allowlisted model API path")
    for key in params or {}:
        if key not in ALLOWED_QUERY_KEYS:
            raise ForbiddenCall(f"query parameter {key} is not allowlisted")


class HttpModelApi:
    """GET calls to the trained model API (default http://127.0.0.1:8000)."""

    def __init__(self, base_url: str, client: httpx.AsyncClient | None = None, timeout: float = 8.0) -> None:
        self.base_url = base_url.rstrip("/")
        self._client = client
        self._timeout = timeout

    async def get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        check_model_call(path, params)
        clean = {k: (str(v).lower() if isinstance(v, bool) else v) for k, v in (params or {}).items() if v is not None}
        own = self._client is None
        client = self._client or httpx.AsyncClient(timeout=self._timeout)
        try:
            res = await client.get(self.base_url + path, params=clean)
        except (httpx.ConnectError, httpx.TimeoutException, httpx.NetworkError) as exc:
            raise AdapterOffline(f"The model API at {self.base_url} is not reachable ({type(exc).__name__}).") from exc
        finally:
            if own:
                await client.aclose()
        if res.status_code >= 400:
            raise AdapterOffline(f"The model API answered HTTP {res.status_code} for {path}.")
        try:
            return res.json()
        except ValueError as exc:
            raise AdapterOffline(f"The model API returned something that is not JSON for {path}.") from exc


class HttpOpenMeteo:
    """Current CAMS air-quality model data for one coordinate (MODEL_DATA, about 40 km resolution)."""

    URL = "https://air-quality-api.open-meteo.com/v1/air-quality"

    def __init__(self, client: httpx.AsyncClient | None = None, timeout: float = 10.0) -> None:
        self._client = client
        self._timeout = timeout

    async def air_quality(self, lat: float, lon: float) -> Any:
        if urlparse(self.URL).hostname not in ALLOWED_OPEN_METEO_HOSTS:
            raise ForbiddenCall("host is not allowlisted")
        params = {
            "latitude": f"{lat:.4f}",
            "longitude": f"{lon:.4f}",
            "current": "pm2_5,pm10,nitrogen_dioxide,sulphur_dioxide,carbon_monoxide,ozone",
            "domains": "cams_global",
            "timezone": "GMT",
        }
        own = self._client is None
        client = self._client or httpx.AsyncClient(timeout=self._timeout)
        try:
            res = await client.get(self.URL, params=params)
        except (httpx.ConnectError, httpx.TimeoutException, httpx.NetworkError) as exc:
            raise AdapterOffline("Open-Meteo is not reachable right now.") from exc
        finally:
            if own:
                await client.aclose()
        if res.status_code >= 400:
            raise AdapterOffline(f"Open-Meteo answered HTTP {res.status_code}.")
        return res.json()
