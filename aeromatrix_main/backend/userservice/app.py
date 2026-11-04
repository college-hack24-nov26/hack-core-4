"""
AeroMatrix user service: the one backend the user app and the authorities' app share.

* Users file complaints about a monitoring station (text and files). The authorities' app lists them, opens them and
  changes their status; the user app reads the status back with the complaint reference.
* Users add their AeroMatrix prototype device. The device (or its gateway) pushes readings; the user app syncs the latest.

Run:  python -m uvicorn app:app --host 127.0.0.1 --port 8040      (from this folder)

Storage is one SQLite file and an uploads folder under ./data (override with AEROMATRIX_USERSERVICE_DATA).

Access:
* Anyone can file a complaint and read the STATUS of a complaint they hold the reference for.
* Listing complaints, reading their text and files, and changing status need the authorities' key
  (header X-Authority-Key, or ?key= for file links). Set AEROMATRIX_AUTHORITY_KEY; when it is not set the service runs in
  development mode with the key "dev-authority-key". This is a shared key, not a login system: put real authentication in
  front of it before it is used for real complaints.
* Device readings are accepted for registered device ids only. Devices carry no secret yet, so a known id could be spoofed.
"""

from __future__ import annotations

import os
import re
import secrets
import sqlite3
import time
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator, Optional

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

DATA_DIR = Path(os.getenv("AEROMATRIX_USERSERVICE_DATA", str(Path(__file__).parent / "data")))
UPLOAD_DIR = DATA_DIR / "uploads"
DB_PATH = DATA_DIR / "userservice.sqlite3"

AUTHORITY_KEY = os.getenv("AEROMATRIX_AUTHORITY_KEY") or "dev-authority-key"
DEV_MODE = not os.getenv("AEROMATRIX_AUTHORITY_KEY")

MIN_TEXT, MAX_TEXT = 10, 2000
MAX_FILES = 5
MAX_FILE_BYTES = 10 * 1024 * 1024
ALLOWED_EXT = {"pdf", "doc", "docx", "txt", "xls", "xlsx", "csv", "jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "bmp"}
STATUSES = ("new", "reviewing", "action_taken", "resolved", "closed")
DEVICE_ID = re.compile(r"^[A-Z0-9][A-Z0-9-]{5,23}$")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@contextmanager
def db() -> Iterator[sqlite3.Connection]:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    con.executescript(
        """
        CREATE TABLE IF NOT EXISTS complaints (
          reference TEXT PRIMARY KEY,
          station_id TEXT NOT NULL,
          station_name TEXT NOT NULL,
          text TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'new',
          note TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS complaint_files (
          id TEXT PRIMARY KEY,
          reference TEXT NOT NULL REFERENCES complaints(reference) ON DELETE CASCADE,
          name TEXT NOT NULL,
          content_type TEXT,
          size INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS devices (
          device_id TEXT PRIMARY KEY,
          label TEXT NOT NULL,
          registered_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS device_readings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          device_id TEXT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
          at TEXT NOT NULL,
          pm25 REAL, pm10 REAL, temperature REAL, humidity REAL
        );
        CREATE INDEX IF NOT EXISTS idx_readings_device ON device_readings(device_id, at DESC);
        """
    )
    try:
        yield con
        con.commit()
    finally:
        con.close()


app = FastAPI(title="AeroMatrix user service", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


def require_authority(x_authority_key: Optional[str] = Header(default=None), key: Optional[str] = Query(default=None)) -> None:
    supplied = x_authority_key or key or ""
    if not secrets.compare_digest(supplied, AUTHORITY_KEY):
        raise HTTPException(status_code=401, detail="The authorities' key is missing or wrong.")


def new_reference() -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "AMX-C-" + "".join(secrets.choice(alphabet) for _ in range(8))


def safe_name(name: str) -> str:
    base = Path(name.replace("\\", "/")).name.strip() or "file"
    return base[:120]


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "dev_mode": DEV_MODE, "time": now_iso()}


# ---------------------------------------------------------------- complaints


@app.post("/complaints", status_code=201)
async def create_complaint(
    station_id: str = Form(..., max_length=200),
    station_name: str = Form(..., max_length=200),
    text: str = Form(...),
    files: list[UploadFile] = File(default=[]),
) -> dict:
    text = text.strip()
    if len(text) < MIN_TEXT:
        raise HTTPException(status_code=422, detail=f"Please describe the issue in at least {MIN_TEXT} characters.")
    if len(text) > MAX_TEXT:
        raise HTTPException(status_code=422, detail=f"Please keep the description under {MAX_TEXT} characters.")
    files = [f for f in files if f.filename]
    if len(files) > MAX_FILES:
        raise HTTPException(status_code=422, detail=f"You can attach up to {MAX_FILES} files.")

    saved: list[tuple[str, str, Optional[str], int]] = []
    reference = new_reference()
    folder = UPLOAD_DIR / reference
    try:
        for f in files:
            name = safe_name(f.filename or "file")
            ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
            is_image = (f.content_type or "").startswith("image/")
            if ext not in ALLOWED_EXT and not is_image:
                raise HTTPException(status_code=422, detail=f'"{name}" is not a supported file type.')
            data = await f.read(MAX_FILE_BYTES + 1)
            if len(data) > MAX_FILE_BYTES:
                raise HTTPException(status_code=422, detail=f'"{name}" is larger than {MAX_FILE_BYTES // 1024 // 1024} MB.')
            file_id = uuid.uuid4().hex
            folder.mkdir(parents=True, exist_ok=True)
            (folder / file_id).write_bytes(data)
            saved.append((file_id, name, f.content_type, len(data)))
        stamp = now_iso()
        with db() as con:
            con.execute(
                "INSERT INTO complaints(reference, station_id, station_name, text, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
                (reference, station_id, station_name, text, "new", stamp, stamp),
            )
            for file_id, name, ctype, size in saved:
                con.execute("INSERT INTO complaint_files(id, reference, name, content_type, size) VALUES (?,?,?,?,?)", (file_id, reference, name, ctype, size))
    except HTTPException:
        for file_id, *_ in saved:
            (folder / file_id).unlink(missing_ok=True)
        raise
    return {"reference": reference, "status": "new", "created_at": stamp, "files": len(saved)}


def complaint_row(con: sqlite3.Connection, reference: str) -> sqlite3.Row:
    row = con.execute("SELECT * FROM complaints WHERE reference = ?", (reference,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="No complaint has this reference.")
    return row


@app.get("/complaints/{reference}")
def complaint_status(reference: str) -> dict:
    """What the person who filed it may see: the status only."""
    with db() as con:
        row = complaint_row(con, reference)
        return {"reference": row["reference"], "status": row["status"], "updated_at": row["updated_at"]}


@app.get("/complaints", dependencies=[Depends(require_authority)])
def list_complaints(status: Optional[str] = None, limit: int = Query(default=100, ge=1, le=500)) -> dict:
    if status is not None and status not in STATUSES:
        raise HTTPException(status_code=422, detail="Unknown status.")
    with db() as con:
        if status:
            rows = con.execute("SELECT * FROM complaints WHERE status = ? ORDER BY created_at DESC LIMIT ?", (status, limit)).fetchall()
        else:
            rows = con.execute("SELECT * FROM complaints ORDER BY created_at DESC LIMIT ?", (limit,)).fetchall()
        counts = {r["status"]: r["n"] for r in con.execute("SELECT status, COUNT(*) AS n FROM complaints GROUP BY status")}
        out = []
        for r in rows:
            files = con.execute("SELECT id, name, content_type, size FROM complaint_files WHERE reference = ?", (r["reference"],)).fetchall()
            out.append({**dict(r), "files": [dict(f) for f in files]})
    return {"complaints": out, "counts": counts}


class StatusUpdate(BaseModel):
    status: str
    note: Optional[str] = Field(default=None, max_length=1000)


@app.patch("/complaints/{reference}", dependencies=[Depends(require_authority)])
def update_complaint(reference: str, body: StatusUpdate) -> dict:
    if body.status not in STATUSES:
        raise HTTPException(status_code=422, detail=f"Status must be one of: {', '.join(STATUSES)}.")
    with db() as con:
        complaint_row(con, reference)
        con.execute("UPDATE complaints SET status = ?, note = COALESCE(?, note), updated_at = ? WHERE reference = ?", (body.status, body.note, now_iso(), reference))
        row = complaint_row(con, reference)
        return {"reference": row["reference"], "status": row["status"], "note": row["note"], "updated_at": row["updated_at"]}


@app.get("/complaints/{reference}/files/{file_id}", dependencies=[Depends(require_authority)])
def complaint_file(reference: str, file_id: str) -> FileResponse:
    with db() as con:
        row = con.execute("SELECT * FROM complaint_files WHERE id = ? AND reference = ?", (file_id, reference)).fetchone()
    path = UPLOAD_DIR / reference / file_id
    if row is None or not path.is_file():
        raise HTTPException(status_code=404, detail="File not found.")
    return FileResponse(path, media_type=row["content_type"] or "application/octet-stream", filename=row["name"])


# ---------------------------------------------------------------- devices


class DeviceIn(BaseModel):
    device_id: str
    label: str = Field(default="My AeroMatrix", max_length=40)


@app.post("/devices", status_code=201)
def register_device(body: DeviceIn) -> dict:
    device_id = body.device_id.strip().upper()
    if not DEVICE_ID.match(device_id):
        raise HTTPException(status_code=422, detail="The device ID should be letters, digits and dashes, 6 to 24 characters.")
    with db() as con:
        con.execute("INSERT INTO devices(device_id, label, registered_at) VALUES (?,?,?) ON CONFLICT(device_id) DO UPDATE SET label = excluded.label", (device_id, body.label.strip() or "My AeroMatrix", now_iso()))
    return {"device_id": device_id, "status": "registered"}


class ReadingIn(BaseModel):
    pm25: Optional[float] = Field(default=None, ge=0, le=2000)
    pm10: Optional[float] = Field(default=None, ge=0, le=3000)
    temperature: Optional[float] = Field(default=None, ge=-60, le=80)
    humidity: Optional[float] = Field(default=None, ge=0, le=100)
    at: Optional[str] = None


@app.post("/devices/{device_id}/readings", status_code=201)
def push_reading(device_id: str, body: ReadingIn) -> dict:
    device_id = device_id.strip().upper()
    stamp = now_iso()
    if body.at:
        try:
            stamp = datetime.fromisoformat(body.at.replace("Z", "+00:00")).astimezone(timezone.utc).isoformat(timespec="seconds")
        except ValueError:
            raise HTTPException(status_code=422, detail="'at' must be an ISO time.")
    with db() as con:
        if con.execute("SELECT 1 FROM devices WHERE device_id = ?", (device_id,)).fetchone() is None:
            raise HTTPException(status_code=404, detail="This device is not registered.")
        con.execute("INSERT INTO device_readings(device_id, at, pm25, pm10, temperature, humidity) VALUES (?,?,?,?,?,?)", (device_id, stamp, body.pm25, body.pm10, body.temperature, body.humidity))
    return {"device_id": device_id, "at": stamp}


@app.get("/devices/{device_id}/latest")
def latest_reading(device_id: str) -> dict:
    device_id = device_id.strip().upper()
    with db() as con:
        dev = con.execute("SELECT * FROM devices WHERE device_id = ?", (device_id,)).fetchone()
        if dev is None:
            raise HTTPException(status_code=404, detail="This device is not registered.")
        r = con.execute("SELECT at, pm25, pm10, temperature, humidity FROM device_readings WHERE device_id = ? ORDER BY at DESC, id DESC LIMIT 1", (device_id,)).fetchone()
    return {"device_id": device_id, "label": dev["label"], "reading": dict(r) if r else None, "server_time": int(time.time())}
