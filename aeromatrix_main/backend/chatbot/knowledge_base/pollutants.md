# Pollutants and units

The six pollutants used by the map engine and by the live Open-Meteo data are PM2.5, PM10, NO2, SO2, CO and O3. PM2.5, PM10, NO2, SO2 and O3 are in micrograms per cubic metre (ug/m3). CO is in milligrams per cubic metre (mg/m3). The Open-Meteo provider reports carbon monoxide in ug/m3 and the app converts it to mg/m3.

The trained model service also reports NO, NOx, NH3, benzene, toluene and xylene. NOx is in ppb and must never be added to the NO or NO2 mass values.

## CPCB AQI

The app computes the CPCB National AQI with the published breakpoints. PM2.5, PM10, NO2 and SO2 use a 24 hour mean; CO and O3 use a trailing 8 hour mean that needs all 8 hours. Each pollutant needs at least 16 valid hours in the trailing 24 hours, and at least three pollutants including PM2.5 or PM10 are needed for an AQI. Open-ended severe concentrations give a lower bound (at least 401), never an invented value. Ozone above 208 ug/m3 withholds the AQI.

AQI categories: Good up to 50, Satisfactory up to 100, Moderate up to 200, Poor up to 300, Very Poor up to 400, Severe above 400.

An AQI computed from model data is always an estimate and never an official station AQI.
