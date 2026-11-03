# The model API

The trained model service is a FastAPI service on port 8000. Routes: health, regions, pollution (the latest measured snapshot per pollutant, with AQI), forecast (a +24 hour point per pollutant with interval, test metrics, model kind and a historical flag), model metrics, boundaries, location, industry, district emissions and AQI history.

A response with HTTP status 200 and the status UNAVAILABLE is a normal state and carries a reason. Forecasts are PREDICTED, PARTIAL or UNAVAILABLE. Snapshots are MEASURED. Bundled readings are historical, so stale forecasts are UNAVAILABLE unless historical data is allowed.

The service is external: it may not be running. When it is offline the app and AeroSage say so and do not invent numbers.
