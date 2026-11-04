/**
 * Named industrial estates and factories in and around Pune and Pimpri-Chinchwad, from public records (MPCB's lists of
 * MIDC estates and company websites). Positions are APPROXIMATE (placed from public knowledge, not surveyed). No public
 * source gives measured emissions per factory, so each entry carries a sector-typical emission strength; the "chance of
 * contributing" is read from that sector profile and its assumed controls, not from a measurement of the unit.
 *
 * Sources: Maharashtra Pollution Control Board (MIDC Bhosari, Pimpri, Chinchwad, Talawade; Chakan, Talegaon, Hinjewadi
 * estates named in its district environment reports) and the companies' own published site addresses.
 */
import type { Industry, IndustryCategory, Pollutant } from '../types';

interface Source {
  name: string;
  kind: 'Industrial estate' | 'Factory' | 'Waste site';
  category: IndustryCategory;
  lat: number;
  lon: number;
  /** 0-100, a sector-typical strength (not a measurement) */
  intensity: number;
  /** 0-1, assumed share of emissions captured by typical controls */
  controls: number;
  pollutants: Pollutant[];
  note: string;
}

const SOURCES: Source[] = [
  // MIDC estates named by the Maharashtra Pollution Control Board
  { name: 'MIDC Bhosari', kind: 'Industrial estate', category: 'Metal', lat: 18.6456, lon: 73.845, intensity: 68, controls: 0.5, pollutants: ['pm25', 'pm10', 'so2'], note: 'Forging, foundry and engineering units: particulates and sulphur dioxide from furnaces and boilers' },
  { name: 'MIDC Pimpri', kind: 'Industrial estate', category: 'Manufacturing', lat: 18.6279, lon: 73.8, intensity: 55, controls: 0.55, pollutants: ['pm25', 'pm10', 'no2'], note: 'Automotive and engineering units: boiler and process exhaust, heavy goods traffic' },
  { name: 'MIDC Chinchwad', kind: 'Industrial estate', category: 'Manufacturing', lat: 18.6455, lon: 73.7877, intensity: 50, controls: 0.55, pollutants: ['pm25', 'pm10', 'no2'], note: 'Engineering and auto-component units: boiler exhaust and heavy goods traffic' },
  { name: 'MIDC Talawade', kind: 'Industrial estate', category: 'Manufacturing', lat: 18.6975, lon: 73.7725, intensity: 40, controls: 0.6, pollutants: ['pm25', 'no2'], note: 'Mixed engineering and IT-linked units: moderate process exhaust' },
  { name: 'MIDC Chakan', kind: 'Industrial estate', category: 'Manufacturing', lat: 18.76, lon: 73.86, intensity: 58, controls: 0.6, pollutants: ['pm25', 'pm10', 'no2'], note: 'Large automotive hub: paint shops, boilers and heavy goods traffic' },
  { name: 'MIDC Talegaon', kind: 'Industrial estate', category: 'Manufacturing', lat: 18.727, lon: 73.676, intensity: 46, controls: 0.6, pollutants: ['pm25', 'no2'], note: 'Automotive and engineering units' },
  { name: 'MIDC Ranjangaon', kind: 'Industrial estate', category: 'Manufacturing', lat: 18.73, lon: 74.22, intensity: 46, controls: 0.6, pollutants: ['pm25', 'no2'], note: 'Consumer goods, auto and engineering units' },
  { name: 'Hadapsar Industrial Estate', kind: 'Industrial estate', category: 'Processing', lat: 18.5, lon: 73.93, intensity: 45, controls: 0.5, pollutants: ['pm25', 'pm10'], note: 'Small and medium processing and engineering units, close to dense housing' },
  { name: 'Hinjewadi Rajiv Gandhi IT Park', kind: 'Industrial estate', category: 'Processing', lat: 18.5912, lon: 73.7389, intensity: 20, controls: 0.5, pollutants: ['pm10'], note: 'Mostly offices: the main air effect is traffic and construction dust, not factory exhaust' },
  { name: 'Parvati Industrial Estate', kind: 'Industrial estate', category: 'Processing', lat: 18.495, lon: 73.845, intensity: 34, controls: 0.5, pollutants: ['pm25', 'pm10'], note: 'Small workshops inside the city' },
  // Well-known factories
  { name: 'Tata Motors, Pimpri plant', kind: 'Factory', category: 'Manufacturing', lat: 18.628, lon: 73.8, intensity: 50, controls: 0.65, pollutants: ['pm25', 'no2'], note: 'Vehicle assembly: paint shop solvents, boilers and goods traffic' },
  { name: 'Bajaj Auto, Akurdi', kind: 'Factory', category: 'Manufacturing', lat: 18.653, lon: 73.77, intensity: 44, controls: 0.65, pollutants: ['pm25', 'no2'], note: 'Two-wheeler assembly and machining' },
  { name: 'Force Motors, Akurdi', kind: 'Factory', category: 'Manufacturing', lat: 18.649, lon: 73.769, intensity: 40, controls: 0.65, pollutants: ['pm25', 'no2'], note: 'Vehicle and engine assembly' },
  { name: 'Thermax, Chinchwad', kind: 'Factory', category: 'Manufacturing', lat: 18.6385, lon: 73.8008, intensity: 42, controls: 0.7, pollutants: ['pm25', 'no2'], note: 'Boiler and heating equipment manufacturing: welding, painting, test firing' },
  { name: 'Finolex Industries, Pune', kind: 'Factory', category: 'Chemical', lat: 18.629, lon: 73.8, intensity: 52, controls: 0.6, pollutants: ['pm25', 'so2', 'no2'], note: 'Plastic pipes and resin processing: process heating and fumes' },
  { name: 'Hindustan Antibiotics, Pimpri', kind: 'Factory', category: 'Chemical', lat: 18.626, lon: 73.796, intensity: 38, controls: 0.65, pollutants: ['so2', 'no2'], note: 'Pharmaceutical production: boiler exhaust and solvents' },
  { name: 'Mercedes-Benz India, Chakan', kind: 'Factory', category: 'Manufacturing', lat: 18.7518, lon: 73.838, intensity: 40, controls: 0.75, pollutants: ['pm25', 'no2'], note: 'Car assembly with modern paint-shop controls' },
  { name: 'Volkswagen India, Chakan', kind: 'Factory', category: 'Manufacturing', lat: 18.746, lon: 73.845, intensity: 40, controls: 0.75, pollutants: ['pm25', 'no2'], note: 'Car assembly with modern paint-shop controls' },
  { name: 'Bharat Forge, Mundhwa', kind: 'Factory', category: 'Metal', lat: 18.5249, lon: 73.9402, intensity: 72, controls: 0.55, pollutants: ['pm25', 'pm10', 'so2'], note: 'Forging: furnaces and heavy machining, particulates and sulphur dioxide' },
  { name: 'Kirloskar Oil Engines, Khadki', kind: 'Factory', category: 'Metal', lat: 18.5599, lon: 73.846, intensity: 52, controls: 0.6, pollutants: ['pm25', 'pm10'], note: 'Engine casting and machining' },
  { name: 'Cummins India, Kothrud', kind: 'Factory', category: 'Manufacturing', lat: 18.507, lon: 73.813, intensity: 40, controls: 0.65, pollutants: ['pm25', 'no2'], note: 'Engine manufacturing and test cells' },
  { name: 'Uruli Devachi landfill', kind: 'Waste site', category: 'Processing', lat: 18.465, lon: 73.98, intensity: 48, controls: 0.3, pollutants: ['pm25', 'pm10'], note: 'City waste dump: open burning and dust when fires start' },
];

/** The chance a unit adds to local air pollution, from its sector strength and assumed controls (not a measurement). */
export function industryLikelihood(i: Pick<Industry, 'emissionIntensity' | 'controlEfficiency'>): 'High' | 'Medium' | 'Low' {
  const effective = i.emissionIntensity * (1 - i.controlEfficiency);
  return effective >= 28 ? 'High' : effective >= 17 ? 'Medium' : 'Low';
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const RESEARCHED_INDUSTRIES: Industry[] = SOURCES.map((s) => ({
  id: `pune-src-${slug(s.name)}`,
  name: s.name,
  category: s.category,
  location: [s.lon, s.lat],
  emissionIntensity: s.intensity,
  controlEfficiency: s.controls,
  mainPollutants: s.pollutants,
  emissionProfile: `${s.kind}. ${s.note}`,
  status: 'Public record, approximate location',
}));
