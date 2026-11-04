# AeroMatrix For Users

The user-facing app of the AeroMatrix ecosystem: live air quality for Pune and Pimpri-Chinchwad, every monitoring station, your own AeroMatrix device, a Shop, and a way to raise a complaint about a station. It keeps the frosted-glass (Liquid Glass) look of the authorities' app, in its own project.

It is separate from **`Aeromatrix_gov_app`** (the Commissioner's app). Simulation (What if) and Reports are only in that app; nothing of them is here.

| Screen | What it does |
| --- | --- |
| **Home** | Air quality of the place you pick (AQI, a face that follows it, hotspots, forecast, conditions, trend), **My Device** (add and sync your prototype) and station health |
| **Map** | Satellite map with every located station as an AQI marker, place search, "Me" |
| **Stations** | All stations, searchable. Open one for its AQI, pollutants, weekly trend and details, and **Register Complaint** |
| **Shop** | **AQI Monitoring Prototype, ₹2,000**, and products marked Coming Soon |
| **Settings** | Interface design: Classic, Glass or Glass Advanced |

## Run it

```bash
npm install
npm run dev -- --port 5176     # http://localhost:5176
npm run typecheck
npm test
npm run build
```

Or double-click `RUN_USER_APP.bat`: it starts the user service (below) when Python is available, then the app.

## The user service (complaints and devices)

Complaints and device sync need the shared backend in `aeromatrix_main/backend/userservice` (port 8040; see its README). The authorities' app reads the same service, so a complaint filed here shows up in its **More → Complaints** page, where the Commissioner opens the files and sets a status the user can see.

* Development: the app looks for the service on `http://localhost:8040`.
* A deployed build has no default. Set `VITE_USER_API_URL` (in both apps) to a hosted address. Until then, complaints are **saved on the phone and marked "not sent"**, and device sync says the service is not connected. Nothing is faked.

## Settings you may want to change

| Variable | Purpose |
| --- | --- |
| `VITE_USER_API_URL` | Address of the user service |
| `VITE_PROTOTYPE_PURCHASE_URL` | Where **Buy now** opens in the Shop (until it is set, Buy shows a short note) |
| `src/app/lib/shop.ts` | Product names, prices and wording; the Coming Soon products are placeholders to edit |

## Notes

* Station data, live air quality and the AQI method are the same shared code as the authorities' app (US AQI, estimated from Open-Meteo CAMS where a station has no reading, and marked as estimates).
* The device sync protocol is not fixed yet: a device (or its gateway) pushes readings to `POST /devices/{id}/readings` on the service, and the app reads `GET /devices/{id}/latest`.
