import './cesiumBase';
import { createRoot } from 'react-dom/client';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import './index.css';
import { App } from './App';

// No React.StrictMode: it would mount the Cesium viewer twice.
createRoot(document.getElementById('root')!).render(<App />);
