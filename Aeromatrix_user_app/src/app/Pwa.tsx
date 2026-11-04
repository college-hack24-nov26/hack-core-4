import { useEffect, useState } from 'react';
import { Download, RefreshCw, Share, WifiOff, X } from 'lucide-react';
import { isIosSafari, isStandalone } from './lib/pwa';
import { isNative } from './lib/native';

export const INSTALL_HIDDEN_KEY = 'aeromatrix.user.installHidden';
export const IOS_HINT_HIDDEN_KEY = 'aeromatrix.user.iosHintHidden';
export const UPDATE_EVENT = 'aeromatrix:update';

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function flag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function setFlag(key: string) {
  try {
    localStorage.setItem(key, '1');
  } catch {
    /* storage unavailable: the prompt may reappear next visit */
  }
}

const barBtn = 'gov-tap inline-flex min-h-11 items-center justify-center gap-1 rounded-lg px-3 text-xs font-bold';

/**
 * Small notices above the header: "Offline" when the browser has no network (so nothing stale is mistaken for current),
 * an install prompt (Android / desktop), an "Add to Home Screen" hint (iPhone / iPad) and "a new version is ready".
 */
export function PwaBar() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [hidden, setHidden] = useState(() => flag(INSTALL_HIDDEN_KEY));
  const [iosHidden, setIosHidden] = useState(() => flag(IOS_HINT_HIDDEN_KEY));
  const [update, setUpdate] = useState<ServiceWorker | null>(null);
  const standalone = isNative() || (typeof window !== 'undefined' && isStandalone({ matchMedia: window.matchMedia?.bind(window), navigator: navigator as { standalone?: boolean } }));
  const ios = typeof navigator !== 'undefined' && isIosSafari(navigator.userAgent, navigator.maxTouchPoints);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    const before = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as InstallEvent);
    };
    const installed = () => setInstallEvent(null);
    const upd = (e: Event) => setUpdate((e as CustomEvent<ServiceWorker>).detail);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    window.addEventListener('beforeinstallprompt', before);
    window.addEventListener('appinstalled', installed);
    window.addEventListener(UPDATE_EVENT, upd);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      window.removeEventListener('beforeinstallprompt', before);
      window.removeEventListener('appinstalled', installed);
      window.removeEventListener(UPDATE_EVENT, upd);
    };
  }, []);

  const reload = () => {
    if (!update) return;
    navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
    update.postMessage({ type: 'SKIP_WAITING' });
  };

  return (
    <>
      {!online && (
        <div role="status" className="flex items-center justify-center gap-2 bg-amber-600 px-3 py-1.5 text-xs font-bold text-white">
          <WifiOff size={14} /> Offline. Live air-quality data is not available; nothing old is shown as current.
        </div>
      )}
      {update && (
        <div role="status" className="flex items-center justify-between gap-2 bg-accent-500 px-3 py-1 text-xs text-white">
          <span>A new version is ready.</span>
          <button type="button" className={`${barBtn} bg-white/20 hover:bg-white/30`} onClick={reload}>
            <RefreshCw size={14} /> Reload
          </button>
        </div>
      )}
      {!standalone && installEvent && !hidden && (
        <div className="flex items-center justify-between gap-2 bg-ink-800 px-3 py-1 text-xs text-sand-100">
          <span>Install AeroMatrix on this phone for one-tap access.</span>
          <span className="flex items-center gap-1">
            <button
              type="button"
              className={`${barBtn} bg-accent-500 text-white`}
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
              className={`${barBtn} min-w-11 hover:bg-ink-700`}
              onClick={() => {
                setFlag(INSTALL_HIDDEN_KEY);
                setHidden(true);
              }}
            >
              <X size={16} />
            </button>
          </span>
        </div>
      )}
      {!standalone && ios && !iosHidden && (
        <div className="flex items-center justify-between gap-2 bg-ink-800 px-3 py-1 text-xs text-sand-100">
          <span className="flex items-center gap-1.5">
            To install: tap <Share size={14} aria-label="Share" /> then <b>Add to Home Screen</b>.
          </span>
          <button
            type="button"
            aria-label="Dismiss the install hint"
            className={`${barBtn} min-w-11 hover:bg-ink-700`}
            onClick={() => {
              setFlag(IOS_HINT_HIDDEN_KEY);
              setIosHidden(true);
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </>
  );
}

/**
 * Registers the service worker in production builds only (the development server must never be cached) and tells the
 * page when a new version is waiting. It also checks for a new version whenever the app comes back to the foreground.
 */
export function registerServiceWorker(): void {
  // The Android app already carries its files inside the package, so it needs no service worker.
  if (!import.meta.env.PROD || isNative() || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        const notify = (w: ServiceWorker) => window.dispatchEvent(new CustomEvent(UPDATE_EVENT, { detail: w }));
        if (reg.waiting && navigator.serviceWorker.controller) notify(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const w = reg.installing;
          w?.addEventListener('statechange', () => {
            if (w.state === 'installed' && navigator.serviceWorker.controller) notify(w);
          });
        });
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') reg.update().catch(() => undefined);
        });
      })
      .catch(() => {
        /* the app works without it */
      });
  });
}
