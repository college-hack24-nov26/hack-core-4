/**
 * The Android app wraps the same web app (Capacitor). A few things differ inside it: a downloaded file must be saved
 * and handed to the phone's share sheet, and there is no service worker or 3D map. Everything else is identical.
 */
import { Capacitor } from '@capacitor/core';

export const isNative = (): boolean => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error('The file could not be read.'));
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.readAsDataURL(blob);
  });
}

/** Saves a file into the app cache and opens the phone's share sheet for it (Save to Drive, WhatsApp, email, ...). */
export async function saveAndShare(filename: string, blob: Blob, title: string): Promise<void> {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
  const written = await Filesystem.writeFile({ path: filename, data: await blobToBase64(blob), directory: Directory.Cache, recursive: true });
  await Share.share({ title, url: written.uri, dialogTitle: title });
}

/** Shares plain text through the phone's share sheet. */
export async function shareTextNative(title: string, text: string): Promise<void> {
  const { Share } = await import('@capacitor/share');
  await Share.share({ title, text, dialogTitle: title });
}

/**
 * The Android back button: close an open detail panel first, then go back to Home, and only then leave the app.
 */
export async function installBackButton(handler: () => boolean): Promise<() => void> {
  if (!isNative()) return () => undefined;
  const { App } = await import('@capacitor/app');
  const sub = await App.addListener('backButton', () => {
    if (!handler()) void App.exitApp();
  });
  return () => void sub.remove();
}
