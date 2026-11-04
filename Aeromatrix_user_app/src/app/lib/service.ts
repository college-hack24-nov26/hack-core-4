/**
 * The AeroMatrix user service: the one backend the user app and the authorities' app share. Complaints filed here appear
 * in the authorities' app, and a user's prototype device reports to it. It lives in aeromatrix_main/backend/userservice.
 * In development the app looks for it on port 8040; a production build uses VITE_USER_API_URL (empty = not connected).
 */
const env = import.meta.env as Record<string, string | undefined>;

export const USER_API_URL: string = (env.VITE_USER_API_URL ?? (import.meta.env.DEV ? 'http://localhost:8040' : '')).replace(/\/+$/, '');
export const serviceConfigured = USER_API_URL !== '';

export class ServiceError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
  }
}

/** A request to the service with a time limit; failures become a ServiceError with a short reason. */
export async function serviceFetch(path: string, init: RequestInit = {}, timeoutMs = 12000): Promise<Response> {
  if (!serviceConfigured) throw new ServiceError('The AeroMatrix service is not connected.', null);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    return await fetch(`${USER_API_URL}${path}`, { ...init, signal: ctl.signal });
  } catch {
    throw new ServiceError('The AeroMatrix service could not be reached.', null);
  } finally {
    clearTimeout(timer);
  }
}
