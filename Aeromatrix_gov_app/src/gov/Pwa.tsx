import { useEffect, useState } from 'react';
import { Download, WifiOff, X } from 'lucide-react';

export const INSTALL_HIDDEN_KEY = 'aeromatrix.gov.installHidden';

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function installHidden(): boolean {
  try {
    return localStorage.getItem(INSTALL_HIDDEN_KEY) === '1';
  } catch {
    return false;
  }
}

function hideInstall() {
  try {
    localStorage.setItem(INSTALL_HIDDEN_KEY, '1');
  } catch {
    /* storage unavailable: the prompt may reappear next visit */
  }
}

/**
 * Two small notices: "Offline" when the browser has no network (so nothing stale is mistaken for current), and an
 * install prompt that can be dismissed for good.
 */
export function PwaBar() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [hidden, setHidden] = useState(installHidden);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    const before = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as InstallEvent);
    };
    const installed = () => setInstallEvent(null);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    window.addEventListener('beforeinstallprompt', before);
    window.addEventListener('appinstalled', installed);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      window.removeEventListener('beforeinstallprompt', before);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);

  return (
    <>
      {!online && (
        <div role="status" className="flex items-center justify-center gap-2 bg-amber-600 px-3 py-1.5 text-xs font-bold text-white">
          <WifiOff size={14} /> Offline. Live air-quality data is not available; nothing old is shown as current.
        </div>
      )}
      {installEvent && !hidden && (
        <div className="flex items-center justify-between gap-2 bg-ink-800 px-3 py-1.5 text-xs text-sand-100">
          <span>Install AeroMatrix on this device for quick access.</span>
          <span className="flex items-center gap-1">
            <button
              type="button"
              className="gov-tap inline-flex min-h-11 items-center gap-1 rounded-lg bg-accent-500 px-3 font-bold text-white"
              onClick={() => {
                void installEvent.prompt();
                setInstallEvent(null);
              }}
            >
              <Download size={14} /> Install
            </button>
            <button
              type="button"
              aria-label="Dismiss the install prompt"
              className="gov-tap flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-ink-700"
              onClick={() => {
                hideInstall();
                setHidden(true);
              }}
            >
              <X size={16} />
            </button>
          </span>
        </div>
      )}
    </>
  );
}

/** Registers the service worker in production builds only; the development server must never be cached. */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      /* the app works without it */
    });
  });
}
