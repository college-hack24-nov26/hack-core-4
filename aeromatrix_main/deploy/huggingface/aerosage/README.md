# AeroSage on a Hugging Face Space (Docker)

Create a Docker Space and put a `Dockerfile` like this at its root, with the contents of `backend/chatbot/` copied to the Space.

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY . /app
RUN pip install --no-cache-dir -r requirements.txt && python -m rag.build_index
ENV CHATBOT_PORT=7860
EXPOSE 7860
CMD ["python", "-m", "uvicorn", "chatbot.main:app", "--host", "0.0.0.0", "--port", "7860"]
```

Space settings:

| Name | Kind | Value |
| --- | --- | --- |
| `AEROMATRIX_API_URL` | variable | public URL of the model API Space |
| `CHATBOT_ALLOWED_ORIGINS` | variable | the web app's origin, for example `https://your-app.vercel.app` |
| `GEMINI_API_KEY` | secret | optional; without it station numbers and project notes still work |

Notes

- AeroSage only makes read-only GET calls to the model API and Open-Meteo. It never writes anywhere but its own session database.
- `runtime/` holds the conversation database and is ephemeral on a Space; sessions simply start fresh after a restart.
- Check `GET /health` after deploying: it reports whether the model API is reachable and whether the language model is configured.
