import './cesiumBase';
import { createRoot } from 'react-dom/client';
import './index.css';
import './gov/mobile.css';
import { GovApp } from './gov/GovApp';
import { registerServiceWorker } from './gov/Pwa';

// No React.StrictMode: it would mount the Cesium viewer twice.
createRoot(document.getElementById('root')!).render(<GovApp />);
registerServiceWorker();
