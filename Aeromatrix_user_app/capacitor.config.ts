import type { CapacitorConfig } from '@capacitor/cli';

/**
 * The Android app: the built web app (dist/) packaged inside a native shell. It loads its files from the phone, so it
 * opens instantly and works without a hosting address; live data (air quality, map tiles) still needs the internet.
 */
const config: CapacitorConfig = {
  appId: 'com.aeromatrix.users',
  appName: 'AeroMatrix',
  webDir: 'dist',
  server: {
    // https keeps the web app's secure-context features (location) working inside the app.
    androidScheme: 'https',
  },
  android: {
    // A station-data service on your own network (plain http) can be reached when its address is set at build time.
    allowMixedContent: true,
    backgroundColor: '#fbf6ec',
  },
};

export default config;
