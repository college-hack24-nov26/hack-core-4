/** Where the web app runs. Override with VITE_APP_URL when it is deployed elsewhere. */
export const APP_URL = ((import.meta.env.VITE_APP_URL as string | undefined)?.trim() || 'http://localhost:5173').replace(/\/+$/, '');

/** The app reads "#<section>" at startup (see its deepLink helper), so these land on the right panel. */
export type AppSection = 'overview' | 'air' | 'zones' | 'industries' | 'simulator' | 'actions' | 'sensors' | 'locations';

export function deepLink(section: AppSection): string {
  return `${APP_URL}/#${section}`;
}
