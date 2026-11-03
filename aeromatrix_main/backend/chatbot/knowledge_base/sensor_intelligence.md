# Sensor Intelligence

Sensor Intelligence is a second trained package that predicts the next hour of PM2.5 and PM10 for a station whose sensor is off, or for a station that is unseen. It runs as a service on port 8030 and is external.

Everything it shows is a historical replay of a held-out February to September 2025 test period, never live. Sensors are switched off on purpose to test the method.

Rules: spatial machine-learning and inverse-distance weighting use donor stations whose readings are at most 2 hours old; persistence uses the target station's own history up to 6 hours old; at least two donor stations are needed, and there are geographic gates. For an unseen station the matching excluded-station model is used, never the network model.

The estimated PM-based AQI uses CPCB breakpoints on 24 hour means of recorded hours plus the forecast and needs 16 valid hours per pollutant, otherwise it is unavailable. It is never an official CPCB AQI, which needs at least three pollutants.

In normal hours a simple persistence baseline beat the machine-learning model in evaluation, so the app shows the baseline next to the model.
