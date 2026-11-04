import { useEffect } from 'react';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { CesiumMap } from '../../map/CesiumMap';
import { useTwinStore } from '../../store/useTwinStore';

/** The Cesium 3D twin. Loaded only on capable desktops and only when the Commissioner asks for it. */
export default function Map3D() {
  useEffect(() => {
    // The app shows stations, not a heat surface.
    useTwinStore.getState().setLayer('heatmap', false);
  }, []);
  return (
    <div className="absolute inset-0 bg-ink-950">
      <CesiumMap />
    </div>
  );
}
