/** Small, pure helpers for the install experience (kept apart from the React bar so they can be tested). */

/** iPhone / iPad Safari: no install prompt exists there, only "Add to Home Screen" in the Share sheet. */
export function isIosSafari(ua: string, maxTouchPoints = 0): boolean {
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1); // iPadOS reports as a Mac
  if (!ios) return false;
  // Chrome, Firefox, Edge and in-app browsers on iOS cannot add to the home screen from their own menu the same way.
  return /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|FBAN|FBAV|Instagram|Line\//.test(ua);
}

export interface StandaloneEnv {
  matchMedia?: (q: string) => { matches: boolean };
  navigator?: { standalone?: boolean };
}

/** True when the app was opened from the home screen rather than a browser tab. */
export function isStandalone(env: StandaloneEnv): boolean {
  if (env.navigator?.standalone === true) return true;
  return !!env.matchMedia?.('(display-mode: standalone)').matches || !!env.matchMedia?.('(display-mode: minimal-ui)').matches;
}

/** A phone-sized touch device. Used only to choose lighter behaviour (for example no PDF iframe preview). */
export function isTouchPhone(env: { widthPx: number; coarsePointer: boolean }): boolean {
  return env.coarsePointer && env.widthPx < 820;
}
