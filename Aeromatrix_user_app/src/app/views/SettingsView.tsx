import { useMemo, useState, type ReactNode } from 'react';
import { Check, CheckCircle2, Download, Info, MapPin, Moon, Palette, Share, Smartphone, Sun, Sunrise, Thermometer, Trash2 } from 'lucide-react';
import { Select } from '../../components/Select';
import { useUserStore, type TempUnit, type ThemeChoice, type UiTheme } from '../userStore';
import { useAirData } from '../lib/airdata';
import { serviceConfigured } from '../lib/service';
import { useInstall } from '../Pwa';
import { Btn, Card, PageTitle } from '../ui';

const DESIGNS: Array<{ id: UiTheme; name: string; note: string }> = [
  { id: 'classic', name: 'Classic', note: 'The original warm look.' },
  { id: 'glass', name: 'Glass', note: 'Blue and white, frosted and light.' },
  { id: 'glass-adv', name: 'Glass Advanced', note: 'Deeper blur, glow and floating bars.' },
];

/** A tiny drawing of each design so the choice is visible before it is made. */
function Preview({ id }: { id: UiTheme }) {
  const glass = id !== 'classic';
  const adv = id === 'glass-adv';
  return (
    <div className="h-24 overflow-hidden rounded-2xl p-2.5" style={{ background: adv ? 'radial-gradient(70% 80% at 20% 10%,#93c5fd,transparent 70%),radial-gradient(60% 70% at 90% 90%,#7dd3fc,transparent 70%),#eaf3ff' : glass ? 'linear-gradient(160deg,#dbeafe,#f8fbff 60%,#bfdbfe)' : '#f6eedd' }} aria-hidden>
      <div className="h-3 w-2/5 rounded-full" style={{ background: glass ? '#2563eb' : '#a3263f' }} />
      <div className="mt-2 flex gap-2">
        <div className="h-12 flex-1 rounded-xl" style={{ background: glass ? 'rgba(255,255,255,.75)' : '#ebdec5', boxShadow: glass ? '0 4px 14px -6px rgba(37,99,235,.4)' : 'none', border: glass ? '1px solid #fff' : 'none' }} />
        <div className="h-12 w-1/3 rounded-xl" style={{ background: glass ? 'rgba(255,255,255,.55)' : '#e1d0b4', border: glass ? '1px solid #fff' : 'none' }} />
      </div>
    </div>
  );
}

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<{ value: T; label: string; icon?: ReactNode }>; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-1.5 rounded-2xl bg-ink-800 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`gov-tap flex min-h-10 items-center justify-center gap-1.5 rounded-xl text-sm font-semibold transition-all ${value === o.value ? 'bg-accent-500 text-white shadow' : 'text-sand-200 hover:bg-white/40'}`}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Row({ icon, title, note, children }: { icon: ReactNode; title: string; note?: string; children: ReactNode }) {
  return (
    <Card>
      <h2 className="gov-eyebrow flex items-center gap-2">
        {icon} {title}
      </h2>
      {note && <p className="mt-2 text-sm text-sand-300">{note}</p>}
      <div className="mt-4">{children}</div>
    </Card>
  );
}

/** Put the app on the phone: the browser's install dialog when it offers one, otherwise the steps for this phone. */
function InstallCard() {
  const { standalone, ios, canPrompt, prompt } = useInstall();
  const [note, setNote] = useState<string | null>(null);
  const inAppBrowser = typeof navigator !== 'undefined' && /FBAN|FBAV|Instagram|Line\/|WhatsApp|Twitter|Snapchat|MicroMessenger|; wv\)/.test(navigator.userAgent);
  return (
    <Row icon={<Smartphone size={15} />} title="Install the app" note="Add AeroMatrix to your home screen so it opens like any other app.">
      {standalone ? (
        <p className="flex items-center gap-2 rounded-2xl bg-emerald-500/12 p-3 text-sm font-medium text-emerald-700">
          <CheckCircle2 size={18} /> Installed. You are using the app from your home screen.
        </p>
      ) : (
        <div className="space-y-3">
          {canPrompt && (
            <Btn
              variant="primary"
              icon={Download}
              className="w-full"
              onClick={async () => {
                const r = await prompt();
                setNote(r === 'dismissed' ? 'No problem. You can install it any time from here.' : null);
              }}
            >
              Install AeroMatrix
            </Btn>
          )}
          {inAppBrowser && <p className="rounded-2xl bg-amber-500/12 p-3 text-sm text-amber-800">This page is open inside another app. Open the link in Chrome (Android) or Safari (iPhone) first, then install from there.</p>}
          {!canPrompt && ios && (
            <ol className="space-y-2 rounded-2xl bg-ink-850 p-3 text-sm text-sand-100 ring-1 ring-white/40">
              <li className="flex items-center gap-2">
                1. Tap <Share size={16} aria-label="Share" /> at the bottom of Safari.
              </li>
              <li>
                2. Choose <b>Add to Home Screen</b>.
              </li>
              <li>
                3. Tap <b>Add</b>.
              </li>
            </ol>
          )}
          {!canPrompt && !ios && (
            <ol className="space-y-2 rounded-2xl bg-ink-850 p-3 text-sm text-sand-100 ring-1 ring-white/40">
              <li>1. Open this page in Chrome (or Edge).</li>
              <li>
                2. Tap the <b>⋮</b> menu at the top right.
              </li>
              <li>
                3. Choose <b>Install app</b> or <b>Add to Home screen</b>.
              </li>
            </ol>
          )}
          {note && <p className="text-sm text-sand-300">{note}</p>}
        </div>
      )}
    </Row>
  );
}

export function SettingsView() {
  const settings = useUserStore((s) => s.settings);
  const setSettings = useUserStore((s) => s.setSettings);
  const selectZone = useUserStore((s) => s.selectZone);
  const clearMyData = useUserStore((s) => s.clearMyData);
  const complaints = useUserStore((s) => s.complaints.length);
  const device = useUserStore((s) => s.device);
  const air = useAirData();
  const [confirm, setConfirm] = useState(false);

  const places = useMemo(() => {
    const seen = new Set<string>();
    return air.zones.filter((z) => (seen.has(z.place) ? false : (seen.add(z.place), true))).sort((a, b) => a.place.localeCompare(b.place));
  }, [air.zones]);

  return (
    <div className="mx-auto max-w-3xl px-4 pb-40 pt-6 sm:px-6">
      <PageTitle title="Settings" sub="Make AeroMatrix yours." />
      <div className="gov-stagger space-y-4">
        <InstallCard />

        <Row icon={<Sunrise size={15} />} title="Appearance" note="Light, dark, or the same as your phone.">
          <Segmented<ThemeChoice>
            label="Appearance"
            value={settings.theme}
            onChange={(theme) => setSettings({ theme })}
            options={[
              { value: 'system', label: 'Auto', icon: <Smartphone size={15} /> },
              { value: 'light', label: 'Light', icon: <Sun size={15} /> },
              { value: 'dark', label: 'Dark', icon: <Moon size={15} /> },
            ]}
          />
        </Row>

        <Row icon={<MapPin size={15} />} title="My area" note="Home opens on this place.">
          <Select
            value={settings.homeZoneId ?? ''}
            onChange={(e) => {
              const id = e.target.value || null;
              setSettings({ homeZoneId: id });
              selectZone(id);
            }}
            aria-label="My area"
            className="gov-tap min-h-12 w-full rounded-2xl border border-sand-500/25 bg-ink-850 px-4 text-[15px] font-medium text-sand-50"
          >
            <option value="">All Pune and Pimpri-Chinchwad</option>
            {places.map((z) => (
              <option key={z.id} value={z.id}>
                {z.place}
              </option>
            ))}
          </Select>
        </Row>

        <Row icon={<Thermometer size={15} />} title="Temperature">
          <Segmented<TempUnit>
            label="Temperature unit"
            value={settings.tempUnit}
            onChange={(tempUnit) => setSettings({ tempUnit })}
            options={[
              { value: 'c', label: '°C' },
              { value: 'f', label: '°F' },
            ]}
          />
        </Row>

        <Card>
          <h2 className="gov-eyebrow flex items-center gap-2">
            <Palette size={15} /> Interface design
          </h2>
          <p className="mt-2 text-sm text-sand-300">Change it any time. Your data and settings stay as they are.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Interface design">
            {DESIGNS.map((d) => {
              const on = settings.ui === d.id;
              return (
                <button
                  key={d.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setSettings({ ui: d.id })}
                  className={`gov-tap rounded-2xl p-3 text-left transition-all ${on ? 'ring-2 ring-accent-500' : 'ring-1 ring-sand-500/20 hover:ring-sand-500/40'}`}
                >
                  <Preview id={d.id} />
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span>
                      <span className="block text-[15px] font-semibold text-sand-50">{d.name}</span>
                      <span className="block text-xs text-sand-300">{d.note}</span>
                    </span>
                    {on && (
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-500 text-white">
                        <Check size={14} />
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        <Row icon={<Trash2 size={15} />} title="Your data" note="Settings, your device and your complaint history are kept on this phone only.">
          <dl className="mb-4 grid grid-cols-2 gap-2 text-center">
            <div className="rounded-2xl bg-ink-850 py-2.5 ring-1 ring-white/40">
              <dd className="text-xl font-bold tabular-nums text-sand-50">{complaints}</dd>
              <dt className="text-[11px] text-sand-300">Complaints</dt>
            </div>
            <div className="rounded-2xl bg-ink-850 py-2.5 ring-1 ring-white/40">
              <dd className="text-xl font-bold text-sand-50">{device ? '1' : '0'}</dd>
              <dt className="text-[11px] text-sand-300">Device</dt>
            </div>
          </dl>
          {confirm ? (
            <div className="glass-swap space-y-2 rounded-2xl bg-red-500/10 p-3">
              <p className="text-sm font-medium text-red-700">This removes your settings, device and complaint history from this phone. Complaints already sent stay with the authorities.</p>
              <div className="flex gap-2">
                <Btn
                  variant="primary"
                  className="flex-1 !bg-red-600 hover:!bg-red-500"
                  onClick={() => {
                    clearMyData();
                    setConfirm(false);
                  }}
                >
                  Yes, clear
                </Btn>
                <Btn variant="secondary" onClick={() => setConfirm(false)}>
                  Cancel
                </Btn>
              </div>
            </div>
          ) : (
            <Btn variant="secondary" icon={Trash2} className="w-full" onClick={() => setConfirm(true)}>
              Clear my data
            </Btn>
          )}
        </Row>

        <Row icon={<Info size={15} />} title="About">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-sand-300">App</dt>
              <dd className="font-medium text-sand-50">AeroMatrix For Users</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-sand-300">Air quality</dt>
              <dd className="text-right font-medium text-sand-50">US AQI, estimated from Open-Meteo where a station has no reading</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-sand-300">Complaints service</dt>
              <dd className="font-medium text-sand-50">{serviceConfigured ? 'Set up' : 'Not set up: complaints stay on this phone'}</dd>
            </div>
          </dl>
        </Row>
      </div>
    </div>
  );
}
