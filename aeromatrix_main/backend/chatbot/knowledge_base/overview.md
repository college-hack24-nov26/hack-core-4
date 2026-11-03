# AeroMatrix overview

AeroMatrix is an urban air-quality digital twin of Pune and Pimpri-Chinchwad (India). It shows the city zone by zone on a 3D map and lets people read, simulate and plan.

It was built in versions. The foundation gives the app shell, a design system, a demo city model, a rule-based pollution engine and a 3D map with a heatmap and grid. The simulation version adds a What-If simulator, saved scenarios, six reduction actions, candidate-site comparison, real OpenStreetMap geometry and more map layers. The real-data version connects the trained station-forecast service, verified station coordinates, live Open-Meteo model data, CSV import and industry data. The platform version adds Plan-It, Sensor Intelligence, AeroSage and the landing page.

## Honest labels

Every value carries a provenance status and the app never mixes them silently:
- DEMO: a deterministic, seeded demo value from the prototype rule model. Not a measurement.
- OBSERVED: a measured station reading or a CSV the user imported.
- MODEL_DATA: Open-Meteo CAMS air-quality model data at about 40 km resolution.
- MODEL_PREDICTION: a forecast from the trained model service.
- MODELED_SCENARIO: a what-if result from the uncalibrated prototype rule model. Hypothetical.

When a feed is missing the app says so and shows the reason. It never invents data and never fills a station with a neighbour's value or a city average.

## The analysis area

The map covers the box from 73.74 to 73.98 degrees east and 18.44 to 18.64 degrees north, split into a grid of 5x5, 10x10 or 20x20 zones.
