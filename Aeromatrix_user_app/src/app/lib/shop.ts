/**
 * The products in the Shop. Edit this file to change prices, wording or the purchase link. The link for the AQI Monitoring
 * Prototype is read from VITE_PROTOTYPE_PURCHASE_URL so it can be set per deployment without changing code.
 */
const env = import.meta.env as Record<string, string | undefined>;

export const PROTOTYPE_PURCHASE_URL: string = (env.VITE_PROTOTYPE_PURCHASE_URL ?? '').trim();

export interface Product {
  id: string;
  name: string;
  tagline: string;
  /** rupees; null while a product is not priced yet */
  price: number | null;
  features: string[];
  status: 'available' | 'soon';
  /** where Buy goes */
  url?: string;
}

export const PRODUCTS: Product[] = [
  {
    id: 'aqi-prototype',
    name: 'AQI Monitoring Prototype',
    tagline: 'Your own AeroMatrix air-quality unit, synced with this app.',
    price: 2000,
    features: ['Measures the air where you place it', 'Connects to this app with your device ID', 'Adds your area to the AeroMatrix network'],
    status: 'available',
    url: PROTOTYPE_PURCHASE_URL,
  },
  {
    id: 'pro-station',
    name: 'AeroMatrix Pro Station',
    tagline: 'A weather-ready station for societies, schools and offices.',
    price: null,
    features: ['Built for permanent outdoor use', 'Wider range of pollutants'],
    status: 'soon',
  },
  {
    id: 'home-monitor',
    name: 'AeroMatrix Home Monitor',
    tagline: 'Know the air inside your home.',
    price: null,
    features: ['Compact indoor unit', 'Alerts on the phone'],
    status: 'soon',
  },
  {
    id: 'wearable',
    name: 'AeroMatrix Wearable',
    tagline: 'Air quality that travels with you.',
    price: null,
    features: ['Clips on to a bag or jacket', 'Exposure summary each day'],
    status: 'soon',
  },
];

export const formatRupees = (n: number): string => `₹${new Intl.NumberFormat('en-IN').format(n)}`;
