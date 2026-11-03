export type LonLat = [number, number];

export type DataStatus = 'OBSERVED' | 'MODEL_DATA' | 'MODEL_PREDICTION' | 'MODELED_SCENARIO' | 'DEMO';

export type Pollutant = 'pm25' | 'pm10' | 'no2' | 'so2' | 'co' | 'o3';

export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'VERY_HIGH';

export interface BBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface CityConfig {
  id: string;
  name: string;
  bbox: BBox;
  center: LonLat;
}

export type LandUse = 'Urban core' | 'Residential' | 'Industrial' | 'Green / hills' | 'Mixed';

export interface GridCell {
  id: string;
  index: number;
  /** 0 = north */
  row: number;
  /** 0 = west */
  col: number;
  bounds: BBox;
  center: LonLat;
  /** roadId -> 0-100 */
  trafficByRoad: Record<string, number>;
  /** 0-100 */
  localTraffic: number;
  /** percent */
  greenCover: number;
  /** 0-1 */
  buildingDensity: number;
  /** metres */
  avgBuildingHeight: number;
  population: number;
  landUse: LandUse;
}

export interface Road {
  id: string;
  name: string;
  /** 0-100 */
  volume: number;
  paths: LonLat[][];
  roadClass?: string;
  lengthKm?: number;
}

export interface GreenArea {
  id: string;
  name: string;
  polygon: LonLat[];
}

export type IndustryCategory = 'Manufacturing' | 'Chemical' | 'Power' | 'Metal' | 'Processing';

export interface Industry {
  id: string;
  name: string;
  category: IndustryCategory;
  location: LonLat;
  /** 0-100 */
  emissionIntensity: number;
  /** 0-1 */
  controlEfficiency: number;
  mainPollutants: Pollutant[];
  emissionProfile: string;
  status: string;
  scenarioAdded?: boolean;
}

export interface IndustrialArea {
  id: string;
  name: string;
  polygon: LonLat[];
}

export interface CityGeometry {
  source: 'demo' | 'osm';
  roads: Road[];
  greenAreas: GreenArea[];
  industrialAreas: IndustrialArea[];
  industries: Industry[];
}

export interface Weather {
  /** degrees C */
  temperature: number;
  /** m/s */
  windSpeed: number;
  /** degrees, wind blows FROM */
  windDirection: number;
  /** percent */
  humidity: number;
  /** mm/day */
  rainfall: number;
  /** hPa */
  pressure: number;
}

export interface SourceContribution {
  traffic: number;
  industry: number;
  background: number;
  other: number;
}

export interface CellState {
  cellId: string;
  pm25: number;
  pm10: number;
  no2: number;
  so2: number;
  co: number;
  o3: number;
  trafficIntensity: number;
  industrialInfluence: number;
  greenCover: number;
  buildingDensity: number;
  temperature: number;
  windInfluence: number;
  risk: RiskLevel;
  /** absolute ug/m3, sums to pm25 */
  contributionAbs: SourceContribution;
}

export interface Calibration {
  localScale: number;
  backgroundScale: number;
}

export interface BaseState {
  city: CityConfig;
  gridSize: number;
  cells: GridCell[];
  roads: Road[];
  industries: Industry[];
  greenAreas: GreenArea[];
  industrialAreas: IndustrialArea[];
  geometrySource: 'demo' | 'osm';
  weather: Weather;
  status: DataStatus;
  calibration?: Calibration;
}

export interface RoadClosure {
  roadId: string;
  divertToRoadId: string | null;
  /** 0-1 */
  diversionShare: number;
}

export interface ScenarioParams {
  name: string;
  targetCells: string[];
  trafficMultiplier: number;
  areaTrafficMultiplier: number;
  vehicleEmissionControl: number;
  publicTransportShift: number;
  roadClosures: RoadClosure[];
  addedIndustries: Industry[];
  removedIndustryIds: string[];
  industryIntensityOverrides: Record<string, number>;
  industrialControl: number;
  greenCoverDelta: number;
  /** extra green-cover points for individual zones (used by Plan-It for targeted planting) */
  greenCoverByCell?: Record<string, number>;
  greenBuffer: boolean;
  buildingDensityDelta: number;
  buildingHeightMultiplier: number;
  weather: Weather;
}

export type DeltaMap = Record<string, Record<Pollutant, number>>;

export interface ScenarioSummary {
  meanBaseline: number;
  meanScenario: number;
  meanDelta: number;
  meanDeltaPct: number;
  maxIncrease: number;
  maxDecrease: number;
  affectedCount: number;
  exposedPopulation: number;
  highRiskBaseline: number;
  highRiskScenario: number;
}

export interface ScenarioResult {
  id: string;
  params: ScenarioParams;
  baseline: CellState[];
  scenario: CellState[];
  delta: DeltaMap;
  affectedZones: string[];
  sourceContribution: { baseline: SourceContribution; scenario: SourceContribution };
  summary: ScenarioSummary;
  metadata: {
    status: 'MODELED_SCENARIO';
    engine: string;
    engineVersion: string;
    createdAt: string;
    disclaimer: string;
  };
}

export type Section =
  | 'overview'
  | 'air'
  | 'zones'
  | 'traffic'
  | 'industries'
  | 'green'
  | 'simulator'
  | 'scenarios'
  | 'actions'
  | 'locations'
  | 'sensors'
  | 'analytics'
  | 'data';

export interface TimeSeriesPoint {
  t: string;
  value: number;
}

// ---- V2 additions ----

export type LayerId =
  | 'heatmap'
  | 'grid'
  | 'roads'
  | 'traffic'
  | 'industries'
  | 'green'
  | 'buildings'
  | 'terrain'
  | 'satellite'
  | 'risk'
  | 'labels'
  | 'elevationTint'
  | 'shadows'
  | 'photoreal'
  | 'places'
  | 'stations'
  | 'midcAreas'
  | 'industrySites';

/** baseline = DEMO rule model; scenario / delta = MODELED_SCENARIO; current = Open-Meteo MODEL_DATA; observed = imported OBSERVED data; forecast = trained-model MODEL_PREDICTION. */
export type DisplayMode = 'baseline' | 'scenario' | 'delta' | 'current' | 'observed' | 'forecast';

export type InteractionMode = 'select' | 'add-industry' | 'select-area' | 'pick-candidate';

export interface PendingIndustry {
  location: LonLat | null;
  category: IndustryCategory;
  /** 0-100 */
  intensity: number;
}

export interface CandidateLocation {
  /** 'A', 'B', 'C', ... */
  id: string;
  location: LonLat;
}

export interface SiteProject {
  category: IndustryCategory;
  intensity: number;
  greenBuffer: boolean;
}

export interface SavedScenario {
  id: string;
  name: string;
  createdAt: string;
  params: ScenarioParams;
  geometrySource: 'demo' | 'osm';
  gridSize: number;
  meanDelta: number;
  meanDeltaPct: number;
}

export type GeometryStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface GeometryInfo {
  status: GeometryStatus;
  source: 'demo' | 'osm';
  /** where OSM data came from */
  origin: 'snapshot' | 'live' | 'demo';
  message: string | null;
  notice: string | null;
  attribution: string | null;
  generated: string | null;
  counts: { roads: number; roadKm: number; green: number; industrialZones: number; industries: number };
}
