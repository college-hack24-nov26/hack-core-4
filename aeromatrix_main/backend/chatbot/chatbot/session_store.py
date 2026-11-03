"""Conversation history in SQLite (runtime/conversations.sqlite3): bounded to 12 turns, expires after 24 hours.

Each session has an independent secret token; only its SHA-256 hash is stored.
"""
from __future__ import annotations

import hashlib
import hmac
import secrets
import sqlite3
import time
import uuid
from pathlib import Path
from typing import Callable

SCHEMA = """
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, created_at REAL NOT NULL, updated_at REAL NOT NULL, last_route TEXT
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, ts REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, id);
"""


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


class SessionStore:
    def __init__(self, path: Path | str, ttl_hours: int = 24, max_turns: int = 12, now: Callable[[], float] = time.time) -> None:
        self.path = str(path)
        if self.path != ":memory:":
            Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        self.ttl = ttl_hours * 3600
        self.max_messages = max_turns * 2
        self._now = now
        self._db = sqlite3.connect(self.path, check_same_thread=False)
        self._db.executescript(SCHEMA)

    def create(self) -> tuple[str, str]:
        """New session: returns (id, secret token). The token is shown once and never stored in clear."""
        sid = uuid.uuid4().hex
        token = secrets.token_urlsafe(32)
        t = self._now()
        self._db.execute("INSERT INTO sessions(id, token_hash, created_at, updated_at) VALUES (?,?,?,?)", (sid, _hash(token), t, t))
        self._db.commit()
        return sid, token

    def verify(self, sid: str, token: str | None) -> bool:
        if not token:
            return False
        self.purge_expired()
        row = self._db.execute("SELECT token_hash FROM sessions WHERE id=?", (sid,)).fetchone()
        return bool(row) and hmac.compare_digest(row[0], _hash(token))

    def add(self, sid: str, role: str, content: str) -> None:
        t = self._now()
        self._db.execute("INSERT INTO messages(session_id, role, content, ts) VALUES (?,?,?,?)", (sid, role, content, t))
        # bounded: keep only the newest max_messages
        self._db.execute(
            "DELETE FROM messages WHERE session_id=? AND id NOT IN (SELECT id FROM messages WHERE session_id=? ORDER BY id DESC LIMIT ?)",
            (sid, sid, self.max_messages),
        )
        self._db.execute("UPDATE sessions SET updated_at=? WHERE id=?", (t, sid))
        self._db.commit()

    def history(self, sid: str) -> list[dict[str, str]]:
        rows = self._db.execute("SELECT role, content FROM messages WHERE session_id=? ORDER BY id", (sid,)).fetchall()
        return [{"role": r, "content": c} for r, c in rows]

    def set_last_route(self, sid: str, blob: str) -> None:
        self._db.execute("UPDATE sessions SET last_route=? WHERE id=?", (blob, sid))
        self._db.commit()

    def last_route(self, sid: str) -> str | None:
        row = self._db.execute("SELECT last_route FROM sessions WHERE id=?", (sid,)).fetchone()
        return row[0] if row else None

    def reset(self, sid: str) -> None:
        self._db.execute("DELETE FROM messages WHERE session_id=?", (sid,))
        self._db.execute("UPDATE sessions SET last_route=NULL WHERE id=?", (sid,))
        self._db.commit()

    def purge_expired(self) -> int:
        cutoff = self._now() - self.ttl
        ids = [r[0] for r in self._db.execute("SELECT id FROM sessions WHERE updated_at < ?", (cutoff,)).fetchall()]
        for sid in ids:
            self._db.execute("DELETE FROM messages WHERE session_id=?", (sid,))
            self._db.execute("DELETE FROM sessions WHERE id=?", (sid,))
        if ids:
            self._db.commit()
        return len(ids)

    def exists(self, sid: str) -> bool:
        return self._db.execute("SELECT 1 FROM sessions WHERE id=?", (sid,)).fetchone() is not None

    def close(self) -> None:
        self._db.close()
