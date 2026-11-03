# Models

## Trained station-forecast models

The trained model service forecasts each station 24 hours ahead for each pollutant. A forecast carries a lower and upper interval, test metrics, the model kind, when it was issued and when it is valid, and a flag saying whether it is historical.

SO2 uses a statistical baseline (persistence), not a machine-learning model, and the response says so in its model kind.

The bundled station readings are historical (about January 2026 or older). Because of that, a current forecast is UNAVAILABLE unless the request allows historical data; the app offers an Include historical forecast switch for this.

The trained models forecast pollution. They do not model interventions.

## The prototype rule model

The map engine is a transparent, rule-based model: traffic, industry plumes, street canyons, green cover and weather. It is uncalibrated and illustrative, and its values are DEMO or MODELED_SCENARIO. It can be calibrated to imported station observations; that adjusts the prototype model but is not a validated forecast.

## Region scenarios

For a monitoring region the scenario is the trained model baseline multiplied by the prototype engine's relative change for the same pollutant in the zone containing the region. It is always hypothetical.
