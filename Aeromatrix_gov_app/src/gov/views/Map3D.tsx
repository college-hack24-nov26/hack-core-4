import { useEffect } from 'react';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { CesiumMap } from '../../map/CesiumMap';
import { MapLegend } from '../../map/MapLegend';
import { useTwinStore } from '../../store/useTwinStore';

/** The Cesium 3D twin. Loaded only on capable desktops and only when the Commissioner asks for it. */
export default function Map3D() {
  useEffect(() => {
    // The honest live field: Open-Meteo CAMS model data, not the prototype rule model.
    useTwinStore.getState().setDisplayMode('current');
  }, []);
  return (
    <div className="absolute inset-0 bg-ink-950">
      <CesiumMap />
      <MapLegend />
    </div>
  );
}
