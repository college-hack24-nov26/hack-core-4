/** Approximate locality centres (DEMO naming aid only, not survey data). */
import type { LonLat } from '../../types';

export interface Locality {
  name: string;
  center: LonLat;
}

export const PUNE_LOCALITIES: Locality[] = [
  { name: 'Kothrud', center: [73.808, 18.507] },
  { name: 'Baner', center: [73.787, 18.559] },
  { name: 'Aundh', center: [73.808, 18.558] },
  { name: 'Hadapsar', center: [73.926, 18.499] },
  { name: 'Shivajinagar', center: [73.853, 18.53] },
  { name: 'Swargate', center: [73.858, 18.5] },
  { name: 'Katraj', center: [73.858, 18.456] },
  { name: 'Viman Nagar', center: [73.915, 18.567] },
  { name: 'Pimpri', center: [73.8, 18.627] },
  { name: 'Chinchwad', center: [73.792, 18.637] },
  { name: 'Wakad', center: [73.76, 18.598] },
  { name: 'Kharadi', center: [73.941, 18.551] },
  { name: 'Yerwada', center: [73.89, 18.555] },
  { name: 'Bhosari', center: [73.85, 18.63] },
  { name: 'Pashan', center: [73.79, 18.54] },
  { name: 'Warje', center: [73.8, 18.48] },
  { name: 'Wanowrie', center: [73.9, 18.49] },
  { name: 'Kondhwa', center: [73.89, 18.47] },
  { name: 'Magarpatta', center: [73.93, 18.514] },
  { name: 'Deccan Gymkhana', center: [73.84, 18.517] },
  { name: 'Sadashiv Peth', center: [73.85, 18.512] },
  { name: 'Pune Station', center: [73.874, 18.529] },
  { name: 'Koregaon Park', center: [73.893, 18.537] },
  { name: 'Sinhagad Road', center: [73.83, 18.475] },
  { name: 'Dhankawadi', center: [73.855, 18.475] },
  { name: 'Bibwewadi', center: [73.865, 18.48] },
  { name: 'Khadki', center: [73.84, 18.565] },
  { name: 'Dapodi', center: [73.835, 18.585] },
  { name: 'Nigdi', center: [73.77, 18.64] },
  { name: 'Sangvi', center: [73.81, 18.58] },
  { name: 'Hinjewadi Fringe', center: [73.745, 18.585] },
  { name: 'NDA / Khadakwasla', center: [73.765, 18.46] },
];
