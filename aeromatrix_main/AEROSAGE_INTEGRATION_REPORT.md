# AeroSage integration report

What was integrated for the platform release, and what was and was not verified.

## Integrated

- **AeroSage backend** (`backend/chatbot/`, port 8010): rule-based intent routing in English, Hindi and Marathi; station answers built in code from the model API's responses; project answers from nine verified notes via SQLite FTS5 (BM25); optional Gemini for explanation, general questions and translation; session tokens stored as SHA-256 hashes, 24-hour expiry, 12-turn history; server-sent-event streaming.
- **AeroSage in the web app** (`src/aerosage/`): launcher button and chat panel (docked at 1024 px and wider, bottom sheet below), safe text renderer (no HTML), validated action allowlist, a confirmation step for anything that changes the user's scenario (the change and everything after it waits, so a run never precedes the change it depends on), read-back verification of each action against the store, optional voice input and read-aloud, an original avatar (`assets/LICENSE_ASSETS.md`).
- **Read-only boundary:** the backend can only issue GET requests to an allowlist of model-API paths and Open-Meteo hosts; anything else raises before a request is made.
- **Plan-It, Sensor Intelligence, landing site, launcher and deploy notes** as described in `README.md`.

## Verified

| Check | Result |
| --- | --- |
| `npm run typecheck` (web app) | passes |
| `npm test` (web app) | 30 files, 305 tests pass |
| `npm run build` (web app) | passes |
| AeroSage pytest (`TEST_CHATBOT.bat`) | 55 tests pass, using fakes for the model API, Open-Meteo and the language model; no network or key |
| Station numbers | tests compare answers with the recorded `docs/contracts/trained_model_RESPONSE_EXAMPLES.json` values |
| Landing `npm run typecheck` and `npm run build` | pass, without any of the seven optional images |
| Browser: AeroSage | connects, answers, shows "Service offline" honestly when the model API is down, asks before changing the scenario |
| Browser: Plan-It | three ranked plans, sourced and estimated prices, Preview on map and PDF controls present |
| Browser: Sensors | offline state with start instructions when port 8030 is empty |
| Browser: landing | renders, no horizontal overflow at desktop and phone widths, deep links such as `/#simulate` land on the section, links point at the web app |
| Launcher | dry run with the browser-open and dev-server lines stubbed: skipped the packages that are not installed with a message, started AeroSage through `START_CHATBOT.bat` (health check passed), left listening ports alone |
| `backend/trained_model`, `backend/task2_model` | do not exist; nothing was created there |

## Not verified

- **Real model API and Sensor Intelligence:** their packages are not in this repository, so only the offline states and the contract-based tests ran. The first live run is the real test.
- **Gemini path:** no key was available; the explain and translate code ran only against a fake.
- **Voice input and read-aloud:** the helpers are unit-tested for the no-support case; no microphone was available.
- **Launcher steps 1 and 3 with real packages**, and a clean first-run install (about 1 GB, 15-30 minutes).
- **Vercel and Hugging Face deploys:** the notes and `vercel.json` were written but nothing was deployed.
- **Landing images:** the seven optional JPGs are not in the repository; the drawn fallbacks are what renders.
