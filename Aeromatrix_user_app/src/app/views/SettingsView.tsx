import { Check, Palette } from 'lucide-react';
import { useUserStore, type UiTheme } from '../userStore';
import { Card, PageTitle } from '../ui';

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

export function SettingsView() {
  const settings = useUserStore((s) => s.settings);
  const setSettings = useUserStore((s) => s.setSettings);
  return (
    <div className="mx-auto max-w-3xl px-4 pb-40 pt-6 sm:px-6">
      <PageTitle title="Settings" />
      <div className="gov-stagger space-y-4">
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

      </div>
    </div>
  );
}
