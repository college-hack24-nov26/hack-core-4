/** Small, robust CSV reader: BOM, CRLF, quoted fields with commas/quotes/newlines, delimiter detection. */

export function detectDelimiter(text: string): string {
  const head = text.split(/\r?\n/).filter((l) => l.trim() !== '').slice(0, 12);
  let best = ',';
  let bestScore = -1;
  for (const d of [',', ';', '\t']) {
    // Count delimiters outside quotes on each line and prefer the most consistent, most frequent one.
    const counts = head.map((l) => {
      let n = 0;
      let q = false;
      for (const ch of l) {
        if (ch === '"') q = !q;
        else if (ch === d && !q) n++;
      }
      return n;
    });
    const max = Math.max(0, ...counts);
    const score = max * 10 + counts.filter((c) => c === max).length;
    if (max > 0 && score > bestScore) {
      best = d;
      bestScore = score;
    }
  }
  return best;
}

export function parseCsv(input: string, delimiter?: string): string[][] {
  const text = input.replace(/^﻿/, '');
  const d = delimiter ?? detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === d) {
      row.push(field.trim());
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length > 0) {
    row.push(field.trim());
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c !== ''));
}

const MISSING = new Set(['', 'na', 'n/a', 'nan', 'null', 'none', '-', '--', 'nodata', 'no data', 'nd', 'ns', 'nm', '#n/a']);

export function isMissing(v: string | undefined): boolean {
  return v === undefined || MISSING.has(v.trim().toLowerCase());
}

/** Number from a CSV cell, or null for missing / unparsable. Handles "1,234.5" and stray "<" or ">" prefixes. */
export function toNumber(v: string | undefined): number | null {
  if (isMissing(v)) return null;
  const cleaned = (v as string).replace(/[<>]/g, '').replace(/,(?=\d{3}\b)/g, '').trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export const normHeader = (h: string): string => h.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, '');

/** The text inside the first pair of brackets of a header: "PM2.5 (ug/m3)" -> "ug/m3". */
export function headerUnit(h: string): string {
  const m = h.match(/\(([^)]*)\)/);
  return m ? m[1].trim().toLowerCase() : '';
}

export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'station';
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const IST_MS = 5.5 * 3600 * 1000;

/**
 * Timestamp (ms, UTC) from the date formats seen in CPCB and ERA5 exports. A time without a zone is read as IST.
 * Returns null when the text is not a recognisable date.
 */
export function parseDateTime(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  // ISO-like with an explicit zone
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})$/i.test(s)) {
    const t = Date.parse(s.replace(' ', 'T').replace(/\s+/g, ''));
    return Number.isFinite(t) ? t : null;
  }
  let y: number, mo: number, d: number, h = 0, mi = 0, sec = 0;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    [y, mo, d] = [+m[1], +m[2], +m[3]];
    h = +(m[4] ?? 0);
    mi = +(m[5] ?? 0);
    sec = +(m[6] ?? 0);
  } else if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/))) {
    [d, mo, y] = [+m[1], +m[2], +m[3]];
    if (y < 100) y += 2000;
    h = +(m[4] ?? 0);
    mi = +(m[5] ?? 0);
    sec = +(m[6] ?? 0);
  } else if ((m = s.match(/^(\d{1,2})[-/ ]([A-Za-z]{3})[a-z]*[-/ ,]+(\d{4})(?:[ T,\-]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/))) {
    d = +m[1];
    mo = MONTHS[m[2].toLowerCase()] ?? 0;
    y = +m[3];
    h = +(m[4] ?? 0);
    mi = +(m[5] ?? 0);
    sec = +(m[6] ?? 0);
  } else return null;
  if (!mo || mo > 12 || d < 1 || d > 31 || h > 24 || mi > 59) return null;
  return Date.UTC(y, mo - 1, d, h, mi, sec) - IST_MS;
}

/** Start of the IST hour that contains t. */
export function floorToIstHour(t: number): number {
  return Math.floor((t + IST_MS) / 3600000) * 3600000 - IST_MS;
}
