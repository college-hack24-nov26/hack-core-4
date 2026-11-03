/**
 * Low-power detection. Weak phones, data-saver mode and "reduce motion" get a lite mode: no decorative animation, no
 * chart animation. The rest of the app behaves the same.
 */
export interface PerfEnv {
  reducedMotion: boolean;
  saveData: boolean;
  deviceMemory: number | null;
  cores: number | null;
}

export function isLowPower(env: PerfEnv): boolean {
  return env.reducedMotion || env.saveData || (env.deviceMemory !== null && env.deviceMemory <= 2) || (env.cores !== null && env.cores <= 2);
}

export function readPerfEnv(): PerfEnv {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  return {
    reducedMotion: typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    saveData: nav.connection?.saveData === true,
    deviceMemory: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
    cores: typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : null,
  };
}

/** Marks the page as lite (CSS and charts both read it). Returns whether lite mode is on. */
export function applyLiteMode(): boolean {
  let lite = false;
  try {
    lite = isLowPower(readPerfEnv());
  } catch {
    lite = false;
  }
  document.documentElement.dataset.lite = lite ? '1' : '0';
  return lite;
}

export const isLite = (): boolean => typeof document !== 'undefined' && document.documentElement.dataset.lite === '1';
