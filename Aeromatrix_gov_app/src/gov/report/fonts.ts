import regularUrl from './fonts/Inter_400Regular.ttf?url';
import boldUrl from './fonts/Inter_700Bold.ttf?url';
import type { ReportFonts } from './govReport';

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) bin += String.fromCharCode(...bytes.subarray(i, i + step));
  return btoa(bin);
}

let cached: Promise<ReportFonts> | null = null;

/** The Inter font files, fetched the first time a report is made (they are not part of the main download). */
export function loadReportFonts(): Promise<ReportFonts> {
  if (!cached) {
    cached = Promise.all([fetch(regularUrl), fetch(boldUrl)])
      .then(async ([r, b]) => {
        if (!r.ok || !b.ok) throw new Error('The report font could not be loaded.');
        return { regular: toBase64(await r.arrayBuffer()), bold: toBase64(await b.arrayBuffer()) };
      })
      .catch((e) => {
        cached = null;
        throw e;
      });
  }
  return cached;
}
