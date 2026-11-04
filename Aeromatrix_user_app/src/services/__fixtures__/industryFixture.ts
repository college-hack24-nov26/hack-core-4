/** A tiny hand-made fixture (never placed in public/data). */
const sq = (w: number, s: number, e: number, n: number) => [[[w, s], [e, s], [e, n], [w, n], [w, s]]];
export const FIXTURE = {
  version: 1,
  builtAt: '2026-01-01T00:00:00Z',
  provenance: { midc: 'test' },
  warnings: ['a warning'],
  areas: [
    {
      code: 501,
      name: 'Test Estate',
      category: null,
      fieldType: 'Brown Field',
      district: 'Pune',
      areaHa: 100,
      mappedAreaHa: 104,
      plots: { total: 10 },
      centroid: [73.9, 18.6],
      bbox: { west: 73.89, south: 18.59, east: 73.91, north: 18.61 },
      analysisArea: 'inside',
      era5: true,
      geometry: { type: 'Polygon', coordinates: sq(73.89, 18.59, 73.91, 18.61) },
    },
    {
      code: 502,
      name: 'Multi Estate',
      analysisArea: 'partial',
      era5: false,
      geometry: { type: 'MultiPolygon', coordinates: [sq(73.8, 18.5, 73.81, 18.51), sq(73.82, 18.5, 73.83, 18.51)] },
    },
    { name: 'no code' },
  ],
  sites: [
    { id: 'node/1', name: 'Inside works', kind: 'works', operator: null, location: [73.9, 18.6], midcCode: 501, inAnalysisArea: true },
    { id: 'node/2', name: 'Near works', kind: 'factory', operator: 'X', location: [73.9, 18.6135], midcCode: null, inAnalysisArea: true },
    { id: 'node/3', name: 'Far works', kind: 'depot', operator: null, location: [73.95, 18.62], midcCode: null, inAnalysisArea: true },
    { id: 'bad', name: 'No location' },
  ],
  emissionFactors: [{ fuel: 'wood', denominator: 'kg/tonnes', kgPerUnit: { pm25: 15.7, pm10: 17.3, so2: 0.2, nox: 1.3, co: 126, nmvoc: null } }, { fuel: 'broken' }],
  districtEmissions: [{ code: 'TRAN', sector: 'Transport', tonnesPerYear: { pm25: 6616, so2: 87 } }],
  weatherCases: [
    { areaCode: 501, areaName: 'Test Estate', era5Grid: [73.75, 18.75], season: 'winter', label: 'Winter', hours: 100, weather: { temperature: 21.9, humidity: 59, windSpeed: 2.1, windDirection: 61, rainfall: 0, pressure: 1015 } },
  ],
};

