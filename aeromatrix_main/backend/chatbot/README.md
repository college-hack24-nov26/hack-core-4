# AeroSage backend

The assistant behind the chat button in the web app. FastAPI, port 8010, Python 3.12.

## Run

```bat
SETUP_CHATBOT.bat      rem once: virtual environment, packages, knowledge index
START_CHATBOT.bat      rem http://127.0.0.1:8010
TEST_CHATBOT.bat       rem the pytest suite
```

`RUN_AEROMATRIX.bat` in the parent folder does both for you. Copy `.env.example` to `.env` for optional settings.

## What it does

| Question | Answered by | Language model needed |
| --- | --- | --- |
| Station reading, AQI, a pollutant | the model API (`GET /pollution`), formatted by `formatters.py` | no |
| Historical forecast, reliability | the model API (`/forecast`, `/model/metrics`) | no |
| Live values for a map location | Open-Meteo, labelled model data | no |
| What AeroMatrix is, datasets, models | the notes in `knowledge_base/` found with SQLite FTS5 (BM25) | optional (it phrases the answer) |
| General questions, translation | Gemini | yes |
| Open a panel, select a station, run a what-if | validated UI actions returned with the reply | no |

Numbers always come from the services. The language model never produces a number: station answers are built in code, and
Hindi or Marathi replies are translated afterwards from that text. With no `GEMINI_API_KEY` everything above the line "General
questions" still works, and replies in other languages are given in English with a note saying so.

When the model API is not running the reply says it is not reachable and gives no value. An unavailable value stays unavailable.

## Safety

- Read-only: the only outbound calls are GET requests to an allowlist of model-API paths and Open-Meteo hosts (`adapters.py`). Anything else raises before a request is made.
- Actions are an allowlist (`ALLOWED_ACTION_TYPES`); the app validates each again and verifies the result before it claims anything changed.
- Browser context (selected station, pollutant) is unverified: it only fills a default when it is a known name.
- Sessions use random tokens, stored only as SHA-256 hashes, expire after 24 hours and keep the last 12 turns.

## Endpoints

`GET /health`, `GET /capabilities`, `GET /knowledge/status`, `POST /chat`, `POST /chat/stream` (server-sent events: `meta`, `token`, `done`), `POST /session/reset`.

## Layout

- `chatbot/` service, router, formatters, adapters, session store, LLM wrapper, FastAPI app
- `rag/` index builder and retriever
- `knowledge_base/` the notes AeroSage may explain from (edit them, then `python -m rag.build_index`)
- `metadata/station_aliases.json` station and place names in English, Hindi and Marathi (names only, no coordinates)
- `tests/` fakes for the model API, Open-Meteo and the language model; no network or key is used
