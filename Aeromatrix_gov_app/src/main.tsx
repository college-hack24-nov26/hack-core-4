import './cesiumBase';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import './index.css';
import './gov/theme.css';
import './gov/mobile.css';
import './gov/glass.css';
import { GovApp } from './gov/GovApp';
import { registerServiceWorker } from './gov/Pwa';
import { applyLiteMode } from './gov/lib/perf';

applyLiteMode();
// No React.StrictMode: it would mount the Cesium viewer twice.
createRoot(document.getElementById('root')!).render(<GovApp />);
registerServiceWorker();
