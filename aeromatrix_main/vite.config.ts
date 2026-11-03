import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/** Sensor Intelligence (Task 2) is an external service. Only these read-only routes are proxied; /task2/predict is NOT exposed. */
const TASK2_TARGET = process.env.TASK2_API_TARGET || 'http://127.0.0.1:8030';
const task2Proxy = {
  '^/task2/(health|stations|models|cases|replay|evaluation|demos|plan)': { target: TASK2_TARGET, changeOrigin: true },
};

export default defineConfig({
  server: { proxy: task2Proxy },
  preview: { proxy: task2Proxy },
  plugins: [react(), tailwindcss()],
  define: {
    CESIUM_BASE_URL: JSON.stringify('/cesium/'),
  },
  build: {
    chunkSizeWarningLimit: 6000,
  },
});
