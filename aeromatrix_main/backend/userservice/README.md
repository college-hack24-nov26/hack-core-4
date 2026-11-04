# AeroMatrix user service

The one backend that the **user app** (`Aeromatrix_user_app`) and the **authorities' app** (`Aeromatrix_gov_app`) share.

| What | User app | Authorities' app |
| --- | --- | --- |
| Complaints about a station (text + files) | files them, reads the status with its reference | lists them, opens the files, sets the status |
| Prototype devices | adds one, syncs its latest reading | not used |

## Run

```bash
cd aeromatrix_main/backend/userservice
pip install fastapi uvicorn python-multipart httpx
python -m uvicorn app:app --host 127.0.0.1 --port 8040
```

Or double-click `START_USERSERVICE.bat`. The user app finds it on port 8040 in development. Data is kept in `data/`
(a SQLite file and the uploaded files; git ignores it).

Tests: `python -m unittest test_userservice -v`.

## Endpoints

| Method and path | Who | |
| --- | --- | --- |
| `POST /complaints` (multipart: `station_id`, `station_name`, `text`, `files[]`) | anyone | returns the complaint `reference` |
| `GET /complaints/{reference}` | anyone with the reference | status only |
| `GET /complaints?status=` | authorities | full records, file lists and counts |
| `PATCH /complaints/{reference}` `{status, note}` | authorities | `new`, `reviewing`, `action_taken`, `resolved`, `closed` |
| `GET /complaints/{reference}/files/{id}` | authorities | the uploaded file |
| `POST /devices` `{device_id, label}` | user app | registers a device id |
| `POST /devices/{id}/readings` | the device or its gateway | `pm25`, `pm10`, `temperature`, `humidity`, optional `at` |
| `GET /devices/{id}/latest` | user app | newest reading, or `null` if none yet |

Files: PDFs, images and common documents, up to 5 per complaint and 10 MB each.

## Access, honestly

* "Authorities" means the shared key in `X-Authority-Key` (or `?key=` for file links). Set `AEROMATRIX_AUTHORITY_KEY`;
  without it the service runs in development mode with the key `dev-authority-key`. The authorities' app sends the key it
  is built with (`VITE_AUTHORITY_KEY`), and a key inside a static app can be read by anyone who has the app. Put real
  authentication in front of this service before it carries real complaints.
* Devices carry no secret yet, so a known device id could be spoofed.
* The apps are deployed as static sites. To use this service from a deployed app it has to be hosted somewhere reachable
  over HTTPS, and `VITE_USER_API_URL` set in both apps. Until then a deployed user app keeps complaints on the phone and
  says they have not been sent.
