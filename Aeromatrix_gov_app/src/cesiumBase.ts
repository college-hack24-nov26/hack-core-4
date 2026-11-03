// Must be imported before 'cesium' so static assets (Workers, Assets) resolve from /cesium/.
(globalThis as unknown as { CESIUM_BASE_URL: string }).CESIUM_BASE_URL = '/cesium/';
export {};
