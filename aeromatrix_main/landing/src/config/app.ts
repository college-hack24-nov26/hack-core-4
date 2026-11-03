// Main AeroMatrix application entry point.
// Defaults to the local app started by RUN_AEROMATRIX.bat; set VITE_MAIN_APP_URL for a deployed app.
export const MAIN_APP_URL = import.meta.env.VITE_MAIN_APP_URL ?? "http://localhost:5173/";
