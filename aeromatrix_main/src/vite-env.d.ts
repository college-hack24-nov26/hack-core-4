/// <reference types="vite/client" />

declare const CESIUM_BASE_URL: string;

interface ImportMetaEnv {
  readonly VITE_CESIUM_ION_TOKEN?: string;
  readonly VITE_LIVE_REFRESH_MINUTES?: string;
  readonly VITE_GOOGLE_MAPS_API_KEY?: string;
}
