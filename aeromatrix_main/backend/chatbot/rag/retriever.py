"""BM25 retrieval (SQLite FTS5) over the knowledge snapshot."""
from __future__ import annotations

import re
import sqlite3
from dataclasses import dataclass
from pathlib import Path

STOP = {"the", "a", "an", "is", "are", "of", "to", "in", "for", "and", "or", "what", "how", "does", "do", "me", "tell", "about", "it", "this", "that", "on", "with"}


@dataclass
class Hit:
    source: str
    heading: str
    body: str
    score: float


class Retriever:
    def __init__(self, index_path: Path | str) -> None:
        self.path = Path(index_path)

    @property
    def ready(self) -> bool:
        return self.path.is_file()

    def status(self) -> dict[str, str | bool | int | None]:
        if not self.ready:
            return {"indexed": False, "documents": 0, "chunks": 0, "built_at": None}
        db = sqlite3.connect(self.path)
        try:
            meta = dict(db.execute("SELECT key, value FROM meta").fetchall())
        finally:
            db.close()
        return {"indexed": True, "documents": int(meta.get("documents", 0)), "chunks": int(meta.get("chunks", 0)), "built_at": meta.get("built_at")}

    @staticmethod
    def to_match(query: str) -> str:
        words = [w for w in re.findall(r"[A-Za-z0-9ऀ-ॿ]+", query.lower()) if w not in STOP and len(w) > 1]
        return " OR ".join(f'"{w}"' for w in dict.fromkeys(words))

    def search(self, query: str, limit: int = 3) -> list[Hit]:
        match = self.to_match(query)
        if not match or not self.ready:
            return []
        db = sqlite3.connect(self.path)
        try:
            rows = db.execute(
                "SELECT source, heading, body, bm25(chunks) FROM chunks WHERE chunks MATCH ? ORDER BY bm25(chunks) LIMIT ?",
                (match, limit),
            ).fetchall()
        except sqlite3.OperationalError:
            return []
        finally:
            db.close()
        return [Hit(s, h, b, float(sc)) for s, h, b, sc in rows]
