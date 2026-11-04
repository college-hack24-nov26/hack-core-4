/**
 * Complaints that users file in the AeroMatrix user app arrive here. They are read from the shared AeroMatrix user service
 * (aeromatrix_main/backend/userservice). In development it is expected on port 8040; a production build uses
 * VITE_USER_API_URL. The authorities' key (VITE_AUTHORITY_KEY) is sent with every request.
 */
const env = import.meta.env as Record<string, string | undefined>;

export const USER_API_URL: string = (env.VITE_USER_API_URL ?? (import.meta.env.DEV ? 'http://localhost:8040' : '')).replace(/\/+$/, '');
const AUTHORITY_KEY: string = env.VITE_AUTHORITY_KEY ?? (import.meta.env.DEV ? 'dev-authority-key' : '');

export type ComplaintStatus = 'new' | 'reviewing' | 'action_taken' | 'resolved' | 'closed';
export const STATUSES: ComplaintStatus[] = ['new', 'reviewing', 'action_taken', 'resolved', 'closed'];
export const STATUS_LABEL: Record<ComplaintStatus, string> = {
  new: 'New',
  reviewing: 'Under review',
  action_taken: 'Action taken',
  resolved: 'Resolved',
  closed: 'Closed',
};

export interface ComplaintFile {
  id: string;
  name: string;
  content_type: string | null;
  size: number;
}

export interface Complaint {
  reference: string;
  station_id: string;
  station_name: string;
  text: string;
  status: ComplaintStatus;
  note: string | null;
  created_at: string;
  updated_at: string;
  files: ComplaintFile[];
}

export interface ComplaintList {
  complaints: Complaint[];
  counts: Partial<Record<ComplaintStatus, number>>;
}

export type Loaded<T> = { ok: true; data: T } | { ok: false; reason: string };

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  if (USER_API_URL === '') throw new Error('The AeroMatrix user service is not connected.');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12000);
  try {
    return await fetch(`${USER_API_URL}${path}`, { ...init, headers: { ...(init.headers ?? {}), 'X-Authority-Key': AUTHORITY_KEY }, signal: ctl.signal });
  } catch {
    throw new Error('The AeroMatrix user service could not be reached.');
  } finally {
    clearTimeout(timer);
  }
}

const problem = async (res: Response): Promise<string> => {
  if (res.status === 401) return "The service did not accept this app's key.";
  const detail = await res
    .json()
    .then((j: { detail?: string }) => j.detail)
    .catch(() => undefined);
  return typeof detail === 'string' ? detail : `The service answered with an error (${res.status}).`;
};

export async function loadComplaints(status?: ComplaintStatus): Promise<Loaded<ComplaintList>> {
  try {
    const res = await call(`/complaints${status ? `?status=${status}` : ''}`);
    if (!res.ok) return { ok: false, reason: await problem(res) };
    return { ok: true, data: (await res.json()) as ComplaintList };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'Complaints could not be loaded.' };
  }
}

export async function setComplaintStatus(reference: string, status: ComplaintStatus, note?: string): Promise<Loaded<{ status: ComplaintStatus; note: string | null }>> {
  try {
    const res = await call(`/complaints/${encodeURIComponent(reference)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, note: note?.trim() || null }) });
    if (!res.ok) return { ok: false, reason: await problem(res) };
    return { ok: true, data: (await res.json()) as { status: ComplaintStatus; note: string | null } };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'The status could not be changed.' };
  }
}

/** A link that opens an uploaded file (the key travels in the link, as files open in a new tab). */
export const fileUrl = (reference: string, fileId: string): string => `${USER_API_URL}/complaints/${encodeURIComponent(reference)}/files/${fileId}?key=${encodeURIComponent(AUTHORITY_KEY)}`;

export const formatBytes = (n: number): string => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
