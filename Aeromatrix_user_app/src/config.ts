/** Optional build-time keys. Never hard-code a token: they come from .env (see .env.example). */
const env = import.meta.env as Record<string, string | undefined>;

export const ION_TOKEN = (env.VITE_CESIUM_ION_TOKEN ?? '').trim();
export const GOOGLE_MAPS_KEY = (env.VITE_GOOGLE_MAPS_API_KEY ?? '').trim();

/** The photorealistic 3D city layer exists only when a token / key is configured. */
export const PHOTOREAL_AVAILABLE = Boolean(ION_TOKEN || GOOGLE_MAPS_KEY);
