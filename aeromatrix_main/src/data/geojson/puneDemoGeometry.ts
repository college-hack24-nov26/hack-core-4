/**
 * Pune DEMO geometry.
 *
 * IMPORTANT: every feature in this file is a hand-digitised, APPROXIMATE demo feature. These are
 * NOT survey data and NOT OpenStreetMap extracts. Road polylines, green areas, industrial areas and
 * industries only exist to give the prototype engine believable spatial structure. Do not use them
 * for any real-world decision.
 */
import type { CityConfig, GreenArea, IndustrialArea, Industry, LonLat, Road } from '../../types';

export const PUNE: CityConfig = {
  id: 'pune',
  name: 'Pune & Pimpri-Chinchwad',
  bbox: { west: 73.74, south: 18.44, east: 73.98, north: 18.64 },
  center: [73.855, 18.53],
};

export const PUNE_ROADS: Road[] = [
  {
    id: 'road-old-mumbai-pune',
    name: 'Old Mumbai-Pune Highway',
    volume: 88,
    roadClass: 'Highway',
    paths: [
      [
        [73.853, 18.531],
        [73.84, 18.56],
        [73.83, 18.58],
        [73.815, 18.6],
        [73.803, 18.625],
        [73.792, 18.64],
      ],
    ],
  },
  {
    id: 'road-pune-nagar',
    name: 'Pune-Nagar Road',
    volume: 92,
    roadClass: 'Highway',
    paths: [
      [
        [73.874, 18.53],
        [73.9, 18.545],
        [73.92, 18.56],
        [73.945, 18.58],
        [73.975, 18.6],
      ],
    ],
  },
  {
    id: 'road-pune-solapur',
    name: 'Pune-Solapur Road',
    volume: 85,
    roadClass: 'Highway',
    paths: [
      [
        [73.874, 18.52],
        [73.9, 18.506],
        [73.926, 18.499],
        [73.955, 18.482],
        [73.979, 18.466],
      ],
    ],
  },
  {
    id: 'road-pune-satara',
    name: 'Pune-Satara Road',
    volume: 80,
    roadClass: 'Highway',
    paths: [
      [
        [73.858, 18.5],
        [73.857, 18.48],
        [73.858, 18.456],
        [73.861, 18.441],
      ],
    ],
  },
  {
    id: 'road-western-bypass',
    name: 'Western Bypass NH48',
    volume: 95,
    roadClass: 'Expressway',
    paths: [
      [
        [73.76, 18.639],
        [73.77, 18.6],
        [73.788, 18.57],
        [73.79, 18.54],
        [73.797, 18.51],
        [73.812, 18.48],
        [73.836, 18.455],
        [73.858, 18.441],
      ],
    ],
  },
  {
    id: 'road-karve',
    name: 'Karve Road',
    volume: 70,
    roadClass: 'Arterial',
    paths: [
      [
        [73.8, 18.5],
        [73.82, 18.503],
        [73.838, 18.507],
        [73.855, 18.512],
      ],
    ],
  },
  {
    id: 'road-university',
    name: 'Ganeshkhind / University Road',
    volume: 78,
    roadClass: 'Arterial',
    paths: [
      [
        [73.853, 18.531],
        [73.838, 18.545],
        [73.826, 18.553],
        [73.808, 18.562],
      ],
    ],
  },
  {
    id: 'road-sinhagad',
    name: 'Sinhagad Road',
    volume: 68,
    roadClass: 'Arterial',
    paths: [
      [
        [73.855, 18.51],
        [73.84, 18.485],
        [73.82, 18.463],
        [73.808, 18.443],
      ],
    ],
  },
  {
    id: 'road-baner',
    name: 'Baner Road',
    volume: 66,
    roadClass: 'Arterial',
    paths: [
      [
        [73.826, 18.553],
        [73.803, 18.563],
        [73.787, 18.559],
        [73.775, 18.575],
      ],
    ],
  },
  {
    id: 'road-katraj-kondhwa',
    name: 'Katraj-Kondhwa Road',
    volume: 58,
    roadClass: 'Arterial',
    paths: [
      [
        [73.858, 18.456],
        [73.88, 18.465],
        [73.9, 18.475],
      ],
    ],
  },
  {
    id: 'road-airport',
    name: 'Airport / Viman Nagar Road',
    volume: 64,
    roadClass: 'Arterial',
    paths: [
      [
        [73.89, 18.555],
        [73.915, 18.567],
        [73.935, 18.58],
      ],
    ],
  },
  {
    id: 'road-fc',
    name: 'Fergusson College Road',
    volume: 62,
    roadClass: 'Arterial',
    paths: [
      [
        [73.84, 18.517],
        [73.835, 18.525],
        [73.83, 18.536],
      ],
    ],
  },
  {
    id: 'road-bund-garden',
    name: 'Bund Garden Road',
    volume: 60,
    roadClass: 'Arterial',
    paths: [
      [
        [73.874, 18.53],
        [73.882, 18.532],
        [73.89, 18.545],
      ],
    ],
  },
  {
    id: 'road-lbs',
    name: 'Lal Bahadur Shastri Road',
    volume: 55,
    roadClass: 'Arterial',
    paths: [
      [
        [73.84, 18.5],
        [73.853, 18.51],
        [73.866, 18.518],
      ],
    ],
  },
];

const box = (w: number, s: number, e: number, n: number): LonLat[] => [
  [w, s],
  [e, s],
  [e, n],
  [w, n],
];

export const PUNE_GREEN_AREAS: GreenArea[] = [
  { id: 'green-vetal', name: 'Vetal Tekdi', polygon: box(73.815, 18.508, 73.842, 18.53) },
  { id: 'green-pashan', name: 'Pashan Hills & Lake', polygon: box(73.775, 18.52, 73.8, 18.55) },
  { id: 'green-parvati', name: 'Parvati Hill', polygon: box(73.838, 18.482, 73.858, 18.497) },
  { id: 'green-katraj', name: 'Katraj Hills', polygon: box(73.82, 18.44, 73.87, 18.462) },
  { id: 'green-nda', name: 'Khadakwasla & NDA', polygon: box(73.74, 18.44, 73.79, 18.485) },
  { id: 'green-university', name: 'Savitribai Phule Pune University', polygon: box(73.818, 18.545, 73.836, 18.56) },
  { id: 'green-empress', name: 'Empress Garden & Race Course', polygon: box(73.883, 18.5, 73.9, 18.513) },
  { id: 'green-bhamburda', name: 'Bhamburda Hills', polygon: box(73.84, 18.545, 73.86, 18.565) },
  { id: 'green-ntf', name: 'Tekdi (Pimpri-Chinchwad)', polygon: box(73.74, 18.6, 73.76, 18.64) },
];

export const PUNE_INDUSTRIAL_AREAS: IndustrialArea[] = [
  { id: 'ind-pimpri-midc', name: 'Pimpri MIDC', polygon: box(73.8, 18.615, 73.84, 18.64) },
  { id: 'ind-bhosari', name: 'Bhosari MIDC', polygon: box(73.84, 18.62, 73.88, 18.64) },
  { id: 'ind-hadapsar', name: 'Hadapsar Industrial Estate', polygon: box(73.93, 18.488, 73.96, 18.51) },
  { id: 'ind-yerwada', name: 'Yerwada Industrial Belt', polygon: box(73.882, 18.568, 73.9, 18.58) },
  { id: 'ind-warje', name: 'Warje-Kothrud Industrial Pocket', polygon: box(73.8, 18.475, 73.815, 18.49) },
];

export const PUNE_INDUSTRIES: Industry[] = [
  {
    id: 'industry-pimpri-auto',
    name: 'Pimpri Auto Components (demo)',
    category: 'Manufacturing',
    location: [73.815, 18.628],
    emissionIntensity: 62,
    controlEfficiency: 0.55,
    mainPollutants: ['pm25', 'pm10', 'no2'],
    emissionProfile: 'Machining, paint shop and boiler stacks',
    status: 'Demo (approximate)',
  },
  {
    id: 'industry-bhosari-foundry',
    name: 'Bhosari Foundry Cluster (demo)',
    category: 'Metal',
    location: [73.855, 18.63],
    emissionIntensity: 78,
    controlEfficiency: 0.4,
    mainPollutants: ['pm25', 'pm10', 'so2'],
    emissionProfile: 'Cupola furnaces and casting',
    status: 'Demo (approximate)',
  },
  {
    id: 'industry-chemical-pcmc',
    name: 'PCMC Specialty Chemicals (demo)',
    category: 'Chemical',
    location: [73.83, 18.622],
    emissionIntensity: 70,
    controlEfficiency: 0.5,
    mainPollutants: ['pm25', 'so2', 'no2'],
    emissionProfile: 'Process reactors and solvent handling',
    status: 'Demo (approximate)',
  },
  {
    id: 'industry-bhosari-power',
    name: 'Captive Power Unit, Bhosari (demo)',
    category: 'Power',
    location: [73.868, 18.628],
    emissionIntensity: 74,
    controlEfficiency: 0.6,
    mainPollutants: ['pm25', 'so2', 'no2'],
    emissionProfile: 'Coal and biomass fired captive boiler',
    status: 'Demo (approximate)',
  },
  {
    id: 'industry-hadapsar-food',
    name: 'Hadapsar Food Processing (demo)',
    category: 'Processing',
    location: [73.942, 18.498],
    emissionIntensity: 38,
    controlEfficiency: 0.6,
    mainPollutants: ['pm25', 'pm10'],
    emissionProfile: 'Boilers and drying units',
    status: 'Demo (approximate)',
  },
  {
    id: 'industry-hadapsar-engg',
    name: 'Hadapsar Engineering Works (demo)',
    category: 'Manufacturing',
    location: [73.95, 18.5],
    emissionIntensity: 48,
    controlEfficiency: 0.5,
    mainPollutants: ['pm25', 'pm10', 'no2'],
    emissionProfile: 'Fabrication and surface treatment',
    status: 'Demo (approximate)',
  },
  {
    id: 'industry-yerwada-pharma',
    name: 'Yerwada Pharma Plant (demo)',
    category: 'Chemical',
    location: [73.892, 18.574],
    emissionIntensity: 42,
    controlEfficiency: 0.65,
    mainPollutants: ['pm25', 'so2'],
    emissionProfile: 'Batch reactors and solvent recovery',
    status: 'Demo (approximate)',
  },
  {
    id: 'industry-warje-metal',
    name: 'Warje Metal Works (demo)',
    category: 'Metal',
    location: [73.807, 18.482],
    emissionIntensity: 45,
    controlEfficiency: 0.45,
    mainPollutants: ['pm25', 'pm10', 'so2'],
    emissionProfile: 'Small furnaces and rolling',
    status: 'Demo (approximate)',
  },
  {
    id: 'industry-pimpri-processing',
    name: 'Pimpri Plastics & Rubber (demo)',
    category: 'Processing',
    location: [73.806, 18.619],
    emissionIntensity: 52,
    controlEfficiency: 0.5,
    mainPollutants: ['pm25', 'no2'],
    emissionProfile: 'Extrusion and curing ovens',
    status: 'Demo (approximate)',
  },
  {
    id: 'industry-chinchwad-forge',
    name: 'Chinchwad Forging Unit (demo)',
    category: 'Metal',
    location: [73.79, 18.636],
    emissionIntensity: 58,
    controlEfficiency: 0.45,
    mainPollutants: ['pm25', 'pm10', 'so2'],
    emissionProfile: 'Forging furnaces',
    status: 'Demo (approximate)',
  },
];

export interface UrbanCentre {
  name: string;
  center: LonLat;
  weight: number;
}

export const URBAN_CENTRES: UrbanCentre[] = [
  { name: 'Shivajinagar / Camp', center: [73.86, 18.525], weight: 1.0 },
  { name: 'Swargate', center: [73.858, 18.5], weight: 0.95 },
  { name: 'Kothrud', center: [73.808, 18.507], weight: 0.7 },
  { name: 'Hadapsar', center: [73.93, 18.5], weight: 0.65 },
  { name: 'Pimpri', center: [73.8, 18.627], weight: 0.75 },
  { name: 'Chinchwad', center: [73.79, 18.635], weight: 0.6 },
  { name: 'Viman Nagar / Kharadi', center: [73.93, 18.56], weight: 0.55 },
  { name: 'Baner / Aundh', center: [73.8, 18.56], weight: 0.6 },
  { name: 'Katraj', center: [73.86, 18.46], weight: 0.45 },
  { name: 'Wakad', center: [73.76, 18.6], weight: 0.45 },
];

import type { CityGeometry } from '../../types';

/** The demo city as a CityGeometry (the fallback when OpenStreetMap geometry is not loaded). */
export const PUNE_DEMO_GEOMETRY: CityGeometry = {
  source: 'demo',
  roads: PUNE_ROADS,
  greenAreas: PUNE_GREEN_AREAS,
  industrialAreas: PUNE_INDUSTRIAL_AREAS,
  industries: PUNE_INDUSTRIES,
};
