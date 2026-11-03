# Model API on a Hugging Face Space (Docker)

The trained model service lives in `backend/trained_model/`, which is delivered by the training machine and is not part of this
repository's own code. These are deployment notes only; follow the package's own start instructions where they differ.

Outline of a Docker Space:

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY backend/trained_model/ /app/
RUN pip install --no-cache-dir -r requirements.txt
# Listen on all interfaces on the port the Space expects. Use the package's own host/port settings.
ENV AEROMATRIX_PORT=7860
EXPOSE 7860
CMD ["python", "bootstrap.py", "start"]
```

After deploying

- `GET /health` should answer, and `GET /regions` should list the monitoring stations.
- Set `VITE_AEROMATRIX_API_URL` on the web app and `AEROMATRIX_API_URL` on AeroSage to the Space's public URL.
- Allow the web app's origin for cross-origin calls, using whatever setting the package provides.
- The API is read-only from the app's point of view. The app never retrains the model.
