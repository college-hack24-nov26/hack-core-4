"""Settings, read from the environment and an optional .env file (no extra dependency)."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _read_dotenv(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    if not path.is_file():
        return out
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        out[key.strip()] = value.strip().strip('"').strip("'")
    return out


@dataclass(frozen=True)
class Settings:
    model_api_url: str = "http://127.0.0.1:8000"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.0-flash"
    port: int = 8010
    runtime_dir: Path = ROOT / "runtime"
    index_path: Path = ROOT / "rag" / "knowledge_index" / "kb.sqlite3"
    knowledge_dir: Path = ROOT / "knowledge_base"
    aliases_path: Path = ROOT / "metadata" / "station_aliases.json"
    allowed_origins: tuple[str, ...] = (
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    )
    session_ttl_hours: int = 24
    max_turns: int = 12

    @property
    def conversations_db(self) -> Path:
        return self.runtime_dir / "conversations.sqlite3"

    @property
    def llm_configured(self) -> bool:
        return bool(self.gemini_api_key)


def load_settings(env: dict[str, str] | None = None) -> Settings:
    merged = {**_read_dotenv(ROOT / ".env"), **(dict(os.environ) if env is None else env)}
    origins = merged.get("CHATBOT_ALLOWED_ORIGINS", "")
    return Settings(
        model_api_url=merged.get("AEROMATRIX_API_URL", "http://127.0.0.1:8000").rstrip("/"),
        gemini_api_key=merged.get("GEMINI_API_KEY", ""),
        gemini_model=merged.get("GEMINI_MODEL", "gemini-2.0-flash"),
        port=int(merged.get("CHATBOT_PORT", "8010")),
        allowed_origins=tuple(o.strip() for o in origins.split(",") if o.strip()) or Settings.allowed_origins,
    )
