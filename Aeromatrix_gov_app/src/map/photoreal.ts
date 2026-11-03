import {
  Cesium3DTileset,
  GoogleMaps,
  Ion,
  createGooglePhotorealistic3DTileset,
  createWorldTerrainAsync,
  type TerrainProvider,
  type Viewer,
} from 'cesium';
import { GOOGLE_MAPS_KEY, ION_TOKEN } from '../config';

/**
 * Photorealistic 3D city: Google Photorealistic 3D Tiles (via Cesium ion or a Google Maps key) plus Cesium World
 * Terrain. Only available when VITE_CESIUM_ION_TOKEN or VITE_GOOGLE_MAPS_API_KEY is set; never hard-coded.
 * The Cesium and Google logos must stay visible (their terms require it): the credit display is left untouched.
 */
export interface PhotorealHandle {
  tileset: Cesium3DTileset;
  terrain: TerrainProvider | null;
}

export async function loadPhotoreal(viewer: Viewer): Promise<PhotorealHandle> {
  let tileset: Cesium3DTileset;
  let terrain: TerrainProvider | null = null;
  if (ION_TOKEN) {
    Ion.defaultAccessToken = ION_TOKEN;
    tileset = await Cesium3DTileset.fromIonAssetId(2275207);
    terrain = await createWorldTerrainAsync();
  } else if (GOOGLE_MAPS_KEY) {
    GoogleMaps.defaultApiKey = GOOGLE_MAPS_KEY;
    tileset = await createGooglePhotorealistic3DTileset();
  } else {
    throw new Error('No token configured for the photorealistic layer.');
  }
  viewer.scene.primitives.add(tileset);
  return { tileset, terrain };
}
