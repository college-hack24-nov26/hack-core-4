# Datasets and sources

- Station observations: CPCB and IITM station data supplied as OpenCity/CPCB CSV files. The bundled readings are historical.
- Station coordinates: a verified list for 17 stations in Pune and Pimpri-Chinchwad, each row naming its sources (the CPCB CAAQMS list, an NGT affidavit annexure and the CPCB directory via aqicn). Stations with only one source are flagged. Stations without a coordinate are listed as not placed and never drawn.
- Live air quality: Open-Meteo, CAMS global domain, about 40 km resolution. It is model data, not a measurement.
- Weather: Open-Meteo forecast API, and ERA5 reanalysis for seasonal weather and for the models.
- City geometry: OpenStreetMap contributors (ODbL 1.0). Only the geometry is real; traffic volumes and emission intensities are demo assumptions.
- Industry data: MIDC industrial estate boundaries and plot status, a partial OpenStreetMap snapshot of industry points, ARAI/TERI fuel emission factors and a 2021 district emission inventory. It is not a company or emissions registry.
