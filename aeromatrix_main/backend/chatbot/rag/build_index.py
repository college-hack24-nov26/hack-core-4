"""Build the SQLite FTS5 index from backend/chatbot/knowledge_base/*.md.

Run once at setup time:  python -m rag.build_index
The index lives in rag/knowledge_index/ and is git-ignored. Nothing here is generated from outside the notes.
"""
from __future__ import annotations

import re
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_KB = ROOT / "knowledge_base"
DEFAULT_INDEX = ROOT / "rag" / "knowledge_index" / "kb.sqlite3"


def chunk_markdown(text: str, source: str) -> list[tuple[str, str, str]]:
    """Split a note into (source, heading, body) chunks at its headings."""
    chunks: list[tuple[str, str, str]] = []
    title = source
    heading = source
    buf: list[str] = []

    def flush() -> None:
        body = "\n".join(buf).strip()
        if body:
            chunks.append((source, heading if heading == title else f"{title}: {heading}", body))
        buf.clear()

    for line in text.splitlines():
        m = re.match(r"^(#{1,3})\s+(.*)$", line)
        if m:
            flush()
            if len(m.group(1)) == 1:
                title = m.group(2).strip()
                heading = title
            else:
                heading = m.group(2).strip()
        else:
            buf.append(line)
    flush()
    return chunks


def build_index(kb_dir: Path = DEFAULT_KB, index_path: Path = DEFAULT_INDEX) -> int:
    index_path.parent.mkdir(parents=True, exist_ok=True)
    if index_path.exists():
        index_path.unlink()
    db = sqlite3.connect(index_path)
    db.execute("CREATE VIRTUAL TABLE chunks USING fts5(source UNINDEXED, heading, body, tokenize='porter unicode61')")
    db.execute("CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT)")
    count = 0
    files = sorted(kb_dir.glob("*.md"))
    for f in files:
        for source, heading, body in chunk_markdown(f.read_text(encoding="utf-8-sig"), f.name):
            db.execute("INSERT INTO chunks(source, heading, body) VALUES (?,?,?)", (source, heading, body))
            count += 1
    db.execute("INSERT INTO meta VALUES ('built_at', ?)", (datetime.now(timezone.utc).isoformat(),))
    db.execute("INSERT INTO meta VALUES ('documents', ?)", (str(len(files)),))
    db.execute("INSERT INTO meta VALUES ('chunks', ?)", (str(count),))
    db.commit()
    db.close()
    return count


if __name__ == "__main__":
    n = build_index()
    print(f"Indexed {n} chunks into {DEFAULT_INDEX}")
    sys.exit(0 if n > 0 else 1)
