import { isNative } from './native';

/** Whether this device should be OFFERED the 3D map. It is never loaded automatically, and never on phones. */
export interface DeviceInfo {
  webgl2: boolean;
  cores: number | null;
  memoryGb: number | null;
  widthPx: number;
  finePointer: boolean;
}

export function isCapableDesktop(d: DeviceInfo): boolean {
  return d.webgl2 && d.widthPx >= 1024 && d.finePointer && (d.cores === null || d.cores >= 4) && (d.memoryGb === null || d.memoryGb >= 4);
}

export function readDevice(): DeviceInfo {
  let webgl2 = false;
  // The Android app ships the light 2D map only.
  if (isNative()) {
    return { webgl2: false, cores: null, memoryGb: null, widthPx: window.innerWidth, finePointer: false };
  }
  try {
    const c = document.createElement('canvas');
    webgl2 = !!c.getContext('webgl2');
  } catch {
    webgl2 = false;
  }
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    webgl2,
    cores: typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : null,
    memoryGb: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
    widthPx: window.innerWidth,
    finePointer: typeof window.matchMedia === 'function' ? window.matchMedia('(pointer: fine)').matches : true,
  };
}
