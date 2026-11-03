# Deploying the web app on Vercel

The web app is a static Vite build. The model API, AeroSage and Sensor Intelligence are Python services and do **not** run on
Vercel; host them separately (see `deploy/huggingface/`) and point the app at them with environment variables.

## Web app

1. Import the repository in Vercel and set **Root Directory** to `aeromatrix_main`.
2. Framework preset: Vite. `vercel.json` already sets the build command (`npm run build`, which copies the Cesium assets first),
   the output directory (`dist`) and a single-page-app rewrite so deep links such as `/#sensors` work.
3. `.vercelignore` keeps `backend/` and `landing/` out of the upload.
4. Environment variables (Project Settings > Environment Variables). All are optional; without them the matching feature shows
   an honest "offline" state:

| Variable | Value |
| --- | --- |
| `VITE_AEROMATRIX_API_URL` | public URL of the model API |
| `VITE_CHATBOT_API_URL` | public URL of AeroSage |
| `VITE_LANDING_URL` | public URL of the landing site |
| `VITE_CESIUM_ION_TOKEN` | optional, enables the photorealistic city |

`VITE_` variables are baked into the build, so redeploy after changing them.

## Sensor Intelligence

The app reaches Sensor Intelligence through a dev/preview proxy at `/task2/...`. A static Vercel deploy has no proxy, so either add a
rewrite from `/task2/(.*)` to your hosted Sensor Intelligence URL in `vercel.json`, or leave it out and the Sensors screen will
show its offline state. Never expose `/task2/predict`.

## Landing site

`landing/` is a TanStack Start app (its own `package.json`). Deploy it as a second Vercel project with Root Directory
`aeromatrix_main/landing` and set `VITE_APP_URL` to the public address of the web app.

## Cross-origin settings

Each hosted service must allow the web app's origin. For AeroSage set `CHATBOT_ALLOWED_ORIGINS` to the Vercel URL (comma
separated for more than one).
