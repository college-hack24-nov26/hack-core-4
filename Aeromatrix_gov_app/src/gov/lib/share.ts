/**
 * The phone's own share sheet (Web Share API, or Capacitor's Share inside the Android app). It only opens when the
 * Commissioner taps a button, and the Commissioner picks the app and the person, so the app still sends nothing.
 */
import { isNative, saveAndShare, shareTextNative } from './native';

export type ShareResult = 'shared' | 'cancelled' | 'unsupported' | 'failed';

interface ShareNav {
  share?: (data: { title?: string; text?: string; files?: File[] }) => Promise<void>;
  canShare?: (data: { files?: File[] }) => boolean;
}

const nav = (): ShareNav => (typeof navigator === 'undefined' ? {} : (navigator as unknown as ShareNav));

export const canShareText = (n: ShareNav = nav()): boolean => isNative() || typeof n.share === 'function';

export const canShareFile = (file: File, n: ShareNav = nav()): boolean => isNative() || (typeof n.share === 'function' && typeof n.canShare === 'function' && n.canShare({ files: [file] }));

async function run(fn: () => Promise<void>): Promise<ShareResult> {
  try {
    await fn();
    return 'shared';
  } catch (e) {
    const msg = e instanceof Error ? `${e.name} ${e.message}` : '';
    return /AbortError|cancel/i.test(msg) ? 'cancelled' : 'failed';
  }
}

export async function shareText(title: string, text: string, n: ShareNav = nav()): Promise<ShareResult> {
  if (isNative()) return run(() => shareTextNative(title, text));
  if (!n.share) return 'unsupported';
  return run(() => n.share!({ title, text }));
}

export async function shareFile(file: File, title: string, n: ShareNav = nav()): Promise<ShareResult> {
  if (isNative()) return run(() => saveAndShare(file.name, file, title));
  if (!canShareFile(file, n)) return 'unsupported';
  return run(() => n.share!({ title, files: [file] }));
}
