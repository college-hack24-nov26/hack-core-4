# Sensor Intelligence on a Hugging Face Space (Docker)

The service lives in `backend/task2_model/` (`aeromatrix_service.py`, FastAPI), delivered by the training machine. These are
deployment notes only.

Outline of a Docker Space:

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY backend/task2_model/ /app/
RUN pip install --no-cache-dir -r requirements.txt
ENV TASK2_PORT=7860
EXPOSE 7860
CMD ["python", "-m", "uvicorn", "aeromatrix_service:app", "--host", "0.0.0.0", "--port", "7860"]
```

Notes

- The web app calls it through `/task2/...` only: `health`, `stations`, `models`, `cases`, `replay` (POST), `evaluation`,
  `demos` and `plan` (POST). `/task2/predict` must not be reachable from the browser; keep it on localhost or behind the Space's
  private network.
- Locally the Vite dev server proxies `/task2/...` to `TASK2_API_TARGET` (default `http://127.0.0.1:8030`). For a hosted deploy
  add a rewrite of `/task2/(.*)` to the Space URL (see `deploy/VERCEL.md`).
- Without the service the Sensors screen shows an offline state and everything else keeps working.
