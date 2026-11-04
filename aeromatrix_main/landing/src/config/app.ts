// Main AeroMatrix application entry point.
// Defaults to the local app started by RUN_AEROMATRIX.bat; set VITE_MAIN_APP_URL for a deployed app.
// A production build points at the deployed system unless VITE_MAIN_APP_URL says otherwise; local development uses the local app.
export const MAIN_APP_URL = import.meta.env.VITE_MAIN_APP_URL ?? (import.meta.env.PROD ? "https://aeromatrix-main.vercel.app/" : "http://localhost:5173/");
