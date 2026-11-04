import './cesiumBase';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import './index.css';
import './app/theme.css';
import './app/mobile.css';
import './app/glass.css';
import { UserApp } from './app/UserApp';
import { registerServiceWorker } from './app/Pwa';
import { applyLiteMode } from './app/lib/perf';

applyLiteMode();
// No React.StrictMode: it would mount the Cesium viewer twice.
createRoot(document.getElementById('root')!).render(<UserApp />);
registerServiceWorker();
