/**
 * DEMO data provider: the ONLY source of demo values in V1.
 * Everything here is deterministic (seeded) and approximate. It is labelled DEMO everywhere.
 */
import type {
  BaseState,
  GridCell,
  LandUse,
  LonLat,
  Pollutant,
  TimeSeriesPoint,
  Weather,
} from '../../types';
import type { DataProvider } from '../../services/dataProvider';
import {
  PUNE,
  PUNE_GREEN_AREAS,
  PUNE_INDUSTRIAL_AREAS,
  PUNE_INDUSTRIES,
  PUNE_ROADS,
  URBAN_CENTRES,
} from '../geojson/puneDemoGeometry';
import { cellAreaKm2, distanceToPathKm, haversineKm, pointInPolygon } from '../../utils/geo';
import { hashSeed, mulberry32 } from '../../utils/prng';
import { clamp } from '../../utils/format';

export const DEMO_WEATHER: Weather = {
  temperature: 27,
  windSpeed: 2.4,
  windDirection: 290,
  humidity: 58,
  rainfall: 0,
  pressure: 1009,
};

export const GRID_SIZES = [5, 10, 20] as const;

function polygonCoverage(
  polys: LonLat[][],
  bounds: { west: number; south: number; east: number; north: number },
  n = 7,
): number {
  let hit = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const p: LonLat = [
        bounds.west + ((i + 0.5) / n) * (bounds.east - bounds.west),
        bounds.south + ((j + 0.5) / n) * (bounds.north - bounds.south),
      ];
      if (polys.some((poly) => pointInPolygon(p, poly))) hit++;
    }
  }
  return hit / (n * n);
}

function buildCells(gridSize: number): GridCell[] {
  const { bbox } = PUNE;
  const dLon = (bbox.east - bbox.west) / gridSize;
  const dLat = (bbox.north - bbox.south) / gridSize;
  const greenPolys = PUNE_GREEN_AREAS.map((g) => g.polygon);
  const indPolys = PUNE_INDUSTRIAL_AREAS.map((g) => g.polygon);
  const cells: GridCell[] = [];

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const id = `g${gridSize}-r${row}c${col}`;
      const rng = mulberry32(hashSeed(id));
      const noise = () => rng() - 0.5;
      const bounds = {
        west: bbox.west + col * dLon,
        east: bbox.west + (col + 1) * dLon,
        north: bbox.north - row * dLat,
        south: bbox.north - (row + 1) * dLat,
      };
      const center: LonLat = [(bounds.west + bounds.east) / 2, (bounds.south + bounds.north) / 2];

      // Traffic: 3x3 sample points, nearest distance per road.
      const samples: LonLat[] = [];
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          samples.push([
            bounds.west + ((i + 0.5) / 3) * dLon,
            bounds.south + ((j + 0.5) / 3) * dLat,
          ]);
        }
      }
      const trafficByRoad: Record<string, number> = {};
      for (const road of PUNE_ROADS) {
        let dMin = Infinity;
        for (const path of road.paths) {
          for (const s of samples) dMin = Math.min(dMin, distanceToPathKm(s, path));
        }
        const v = road.volume * 0.6 * Math.exp(-dMin / 0.9);
        if (v >= 1) trafficByRoad[road.id] = Math.round(v * 10) / 10;
      }

      let urban = 0;
      for (const uc of URBAN_CENTRES) {
        urban += uc.weight * Math.exp(-haversineKm(center, uc.center) / 3.2);
      }
      urban = clamp(urban, 0, 1);

      const greenFrac = polygonCoverage(greenPolys, bounds);
      const indFrac = polygonCoverage(indPolys, bounds);
      const greenCover = clamp(greenFrac * 100 * 0.92 + 4 + (1 - urban) * 8 + noise() * 4, 0, 95);
      const buildingDensity = clamp(
        0.08 + 0.8 * urban * (1 - greenCover / 150) + noise() * 0.06,
        0.03,
        0.95,
      );
      const avgBuildingHeight = clamp(5 + 22 * urban + noise() * 3, 3, 40);
      const localTraffic = clamp(6 + 22 * urban + noise() * 6, 0, 100);
      const popDensity = 600 + 21000 * Math.pow(urban, 1.3) * (1 - greenCover / 120);
      const population = Math.round((popDensity * cellAreaKm2(bounds) * (1 + noise() * 0.1)) / 10) * 10;

      let landUse: LandUse;
      if (indFrac > 0.25) landUse = 'Industrial';
      else if (greenCover > 45) landUse = 'Green / hills';
      else if (urban > 0.65) landUse = 'Urban core';
      else if (urban > 0.35) landUse = 'Residential';
      else landUse = 'Mixed';

      cells.push({
        id,
        index: row * gridSize + col,
        row,
        col,
        bounds,
        center,
        trafficByRoad,
        localTraffic: Math.round(localTraffic * 10) / 10,
        greenCover: Math.round(greenCover * 10) / 10,
        buildingDensity: Math.round(buildingDensity * 1000) / 1000,
        avgBuildingHeight: Math.round(avgBuildingHeight * 10) / 10,
        population: Math.max(0, population),
        landUse,
      });
    }
  }
  return cells;
}

class DemoDataProvider implements DataProvider {
  id = 'demo';
  label = 'Demo city model (DEMO)';

  async getBaseState(gridSize: number): Promise<BaseState> {
    return {
      city: PUNE,
      gridSize,
      cells: buildCells(gridSize),
      roads: PUNE_ROADS,
      industries: PUNE_INDUSTRIES,
      greenAreas: PUNE_GREEN_AREAS,
      industrialAreas: PUNE_INDUSTRIAL_AREAS,
      geometrySource: 'demo',
      weather: { ...DEMO_WEATHER },
      status: 'DEMO',
    };
  }

  async getTimeSeries(
    cellId: string,
    pollutant: Pollutant,
    baseValue: number,
    hours: number,
  ): Promise<TimeSeriesPoint[]> {
    const rng = mulberry32(hashSeed(`${cellId}:${pollutant}`));
    const out: TimeSeriesPoint[] = [];
    for (let h = 0; h < hours; h++) {
      // Diurnal shape: morning and evening peaks. DEMO, not an observation.
      const hour = h % 24;
      const shape =
        1 +
        0.22 * Math.exp(-((hour - 8.5) ** 2) / 6) +
        0.28 * Math.exp(-((hour - 19.5) ** 2) / 8) -
        0.18 * Math.exp(-((hour - 14) ** 2) / 10);
      out.push({ t: `${String(hour).padStart(2, '0')}:00`, value: baseValue * shape * (1 + (rng() - 0.5) * 0.06) });
    }
    return out;
  }
}

export const demoDataProvider: DataProvider = new DemoDataProvider();
