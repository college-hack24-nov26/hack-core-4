import { ServiceError, serviceFetch } from './service';

export const MIN_TEXT = 10;
export const MAX_TEXT = 2000;
export const MAX_FILES = 5;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
/** PDFs, photographs, scans and the usual office documents. */
export const ACCEPT = '.pdf,.doc,.docx,.txt,.xls,.xlsx,.csv,image/*';
const ALLOWED_EXT = ['pdf', 'doc', 'docx', 'txt', 'xls', 'xlsx', 'csv', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp'];

const extOf = (name: string): string => (name.includes('.') ? name.split('.').pop()!.toLowerCase() : '');
export const isAllowedFile = (f: Pick<File, 'name' | 'type'>): boolean => f.type.startsWith('image/') || ALLOWED_EXT.includes(extOf(f.name));

export const formatBytes = (n: number): string => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/** The reason a complaint cannot be sent yet, or null when it is fine. */
export function validateComplaint(text: string, files: Array<Pick<File, 'name' | 'type' | 'size'>>): string | null {
  const t = text.trim();
  if (t.length < MIN_TEXT) return `Please describe the issue in at least ${MIN_TEXT} characters.`;
  if (t.length > MAX_TEXT) return `Please keep the description under ${MAX_TEXT} characters.`;
  if (files.length > MAX_FILES) return `You can attach up to ${MAX_FILES} files.`;
  for (const f of files) {
    if (!isAllowedFile(f)) return `"${f.name}" is not a supported file type. Use a PDF, photo or document.`;
    if (f.size > MAX_FILE_BYTES) return `"${f.name}" is larger than ${formatBytes(MAX_FILE_BYTES)}.`;
  }
  return null;
}

export type SendResult = { ok: true; reference: string } | { ok: false; reason: string };

/** Sends a complaint (text and files) to the authorities' service. */
export async function sendComplaint(input: { stationId: string; stationName: string; text: string; files: File[] }): Promise<SendResult> {
  const body = new FormData();
  body.append('station_id', input.stationId);
  body.append('station_name', input.stationName);
  body.append('text', input.text.trim());
  for (const f of input.files) body.append('files', f, f.name);
  try {
    const res = await serviceFetch('/complaints', { method: 'POST', body }, 60000);
    if (!res.ok) {
      const detail = await res
        .json()
        .then((j: { detail?: string }) => j.detail)
        .catch(() => undefined);
      return { ok: false, reason: typeof detail === 'string' ? detail : `The service refused the complaint (${res.status}).` };
    }
    const data = (await res.json()) as { reference: string };
    return { ok: true, reference: data.reference };
  } catch (e) {
    return { ok: false, reason: e instanceof ServiceError ? e.message : 'The complaint could not be sent.' };
  }
}

/** The status the authorities have given a sent complaint, or null when it cannot be read. */
export async function fetchComplaintStatus(reference: string): Promise<string | null> {
  try {
    const res = await serviceFetch(`/complaints/${encodeURIComponent(reference)}`, {}, 8000);
    if (!res.ok) return null;
    const data = (await res.json()) as { status?: string };
    return data.status ?? null;
  } catch {
    return null;
  }
}

export const STATUS_LABEL: Record<string, string> = {
  new: 'Received',
  reviewing: 'Under review',
  action_taken: 'Action taken',
  resolved: 'Resolved',
  closed: 'Closed',
};
