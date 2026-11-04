import { useEffect, useState } from 'react';
import { Plus, RefreshCw, Trash2, Wifi, WifiOff } from 'lucide-react';
import { useUserStore } from '../userStore';
import { deviceStatus, isValidDeviceId, normaliseDeviceId, registerDevice, syncDevice, type DeviceStatus } from '../lib/device';
import { serviceConfigured } from '../lib/service';
import { Btn } from '../ui';
import { Sheet } from '../Sheet';
import { DeviceArt } from './ShopView';

const STATUS: Record<DeviceStatus, { label: string; dot: string; hint: string }> = {
  not_connected: { label: 'Not connected', dot: '#94a3b8', hint: 'Add your AeroMatrix device to see its readings here.' },
  waiting_service: { label: 'Saved on this phone', dot: '#f59e0b', hint: 'Waiting for the AeroMatrix service to confirm it.' },
  waiting_device: { label: 'Connected', dot: '#3b82f6', hint: 'Waiting for the first reading from your device.' },
  live: { label: 'Live', dot: '#22c55e', hint: 'Your device is sending readings.' },
  stale: { label: 'No recent data', dot: '#f59e0b', hint: 'Your device has not sent a reading in the last 30 minutes.' },
};

const fmtTime = (ms: number | null) => (ms ? new Date(ms).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : 'never');
const num = (v: number | null, d = 0, unit = '') => (v === null ? '-' : `${v.toFixed(d)}${unit}`);

/** Home: add the AeroMatrix prototype you bought, then sync it. Shows whether it is connected and when it last synced. */
export function DeviceCard() {
  const device = useUserStore((s) => s.device);
  const setDevice = useUserStore((s) => s.setDevice);
  const patchDevice = useUserStore((s) => s.patchDevice);
  const setView = useUserStore((s) => s.setView);
  const [adding, setAdding] = useState(false);
  const [id, setId] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'add' | 'sync' | null>(null);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const status = deviceStatus(device);
  const st = STATUS[status];

  const sync = async (deviceId: string) => {
    setBusy('sync');
    setSyncNote(null);
    const r = await syncDevice(deviceId);
    setBusy(null);
    if (r.ok) {
      patchDevice({ state: 'connected', reading: r.reading ?? useUserStore.getState().device?.reading ?? null, lastSyncAt: Date.now() });
    } else {
      setSyncNote(r.reason);
    }
  };

  // sync once when the card opens with a device already added
  useEffect(() => {
    if (device && serviceConfigured) void sync(device.deviceId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device?.deviceId]);

  const add = async () => {
    const did = normaliseDeviceId(id);
    if (!isValidDeviceId(did)) {
      setError('Enter the device ID printed on your unit, for example AMX-7K2P-91QD.');
      return;
    }
    setError(null);
    setBusy('add');
    const r = await registerDevice(did, label.trim() || 'My AeroMatrix');
    setBusy(null);
    if (!r.ok && !r.unreachable) {
      setError(r.reason);
      return;
    }
    // reached the service: connected. Not reachable: kept on this phone until it can be confirmed.
    setDevice({ deviceId: did, label: label.trim() || 'My AeroMatrix', addedAt: Date.now(), state: r.ok ? 'connected' : 'saved', lastSyncAt: null, reading: null });
    setAdding(false);
    setId('');
    setLabel('');
  };

  return (
    <section className="gov-card p-5" aria-label="My device">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-sand-50">My Device</h2>
        {device && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-800 px-2.5 py-1 text-xs font-semibold text-sand-100">
            <span className="h-2 w-2 rounded-full" style={{ background: st.dot }} aria-hidden /> {st.label}
          </span>
        )}
      </div>

      {!device ? (
        <div className="flex items-center gap-4">
          <DeviceArt className="h-24 w-auto shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-sand-50">Connect your device</p>
            <p className="mt-0.5 text-sm text-sand-300">Add your AeroMatrix prototype and sync its readings with this app.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Btn variant="primary" icon={Plus} onClick={() => setAdding(true)} className="!min-h-10 text-sm">
                Add device
              </Btn>
              <Btn variant="ghost" onClick={() => setView('shop')} className="!min-h-10 text-sm">
                Get one
              </Btn>
            </div>
          </div>
        </div>
      ) : (
        <div className="glass-swap">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-[15px] font-semibold text-sand-50">{device.label}</div>
              <div className="font-mono text-xs text-sand-300">{device.deviceId}</div>
            </div>
            <span className="flex items-center gap-1 text-xs text-sand-300">{status === 'live' ? <Wifi size={14} /> : <WifiOff size={14} />} {st.hint}</span>
          </div>
          {device.reading ? (
            <dl className="mt-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
              {[
                ['PM2.5', num(device.reading.pm25, 0), 'µg/m³'],
                ['PM10', num(device.reading.pm10, 0), 'µg/m³'],
                ['Temperature', num(device.reading.temperature, 1), '°C'],
                ['Humidity', num(device.reading.humidity, 0), '%'],
              ].map(([k, v, u]) => (
                <div key={k} className="rounded-2xl bg-ink-850 py-2.5 ring-1 ring-white/40">
                  <dd className="text-lg font-bold tabular-nums text-sand-50">
                    {v} <span className="text-[10px] font-medium text-sand-400">{u}</span>
                  </dd>
                  <dt className="text-[11px] text-sand-300">{k}</dt>
                </div>
              ))}
            </dl>
          ) : null}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-sand-300">Last synced {fmtTime(device.lastSyncAt)}</span>
            <div className="flex gap-2">
              <Btn variant="secondary" icon={RefreshCw} onClick={() => void sync(device.deviceId)} disabled={busy === 'sync' || !serviceConfigured} className="!min-h-10 text-sm">
                {busy === 'sync' ? 'Syncing…' : 'Sync now'}
              </Btn>
              <Btn variant="ghost" icon={Trash2} ariaLabel="Remove device" onClick={() => setDevice(null)} className="!min-h-10 !px-3 text-sm" />
            </div>
          </div>
          {!serviceConfigured && <p className="mt-2 text-xs text-sand-300">The AeroMatrix service is not connected yet, so readings cannot be synced.</p>}
          {syncNote && <p role="status" className="mt-2 text-xs text-amber-700">{syncNote}</p>}
        </div>
      )}

      {adding && (
        <Sheet title="Add your device" subtitle="AeroMatrix AQI Monitoring Prototype" onClose={() => setAdding(false)}>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void add();
            }}
          >
            <label className="block">
              <span className="text-sm font-semibold text-sand-50">Device ID</span>
              <input
                value={id}
                onChange={(e) => setId(e.target.value)}
                placeholder="AMX-7K2P-91QD"
                autoCapitalize="characters"
                autoComplete="off"
                className="gov-tap mt-2 h-12 w-full rounded-2xl border border-sand-500/25 bg-ink-850 px-4 font-mono text-base uppercase text-sand-50 placeholder:normal-case placeholder:text-sand-500 focus:border-accent-400"
              />
              <span className="mt-1 block text-xs text-sand-300">It is printed on the label of your unit.</span>
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-sand-50">Name (optional)</span>
              <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} placeholder="Balcony" className="gov-tap mt-2 h-12 w-full rounded-2xl border border-sand-500/25 bg-ink-850 px-4 text-base text-sand-50 placeholder:text-sand-500 focus:border-accent-400" />
            </label>
            {error && (
              <p role="alert" className="rounded-2xl bg-red-500/10 p-3 text-sm font-medium text-red-700">
                {error}
              </p>
            )}
            <Btn type="submit" variant="primary" className="w-full" disabled={busy === 'add'}>
              {busy === 'add' ? 'Connecting…' : 'Connect device'}
            </Btn>
          </form>
        </Sheet>
      )}
    </section>
  );
}
