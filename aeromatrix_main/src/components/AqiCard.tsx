import { Cloud, Droplets, Navigation } from 'lucide-react';
import { AQI_COLORS, type AqiCategory } from '../services/cpcbAqi';

/** A simple face that shows how the air feels: smiling when clean, neutral when moderate, behind a mask when poor. */
export function AirFace({ category, size = 64 }: { category: AqiCategory | null; size?: number }) {
  const masked = category === 'Poor' || category === 'Very Poor' || category === 'Severe';
  const mood = category === 'Good' || category === 'Satisfactory' ? 'happy' : 'flat';
  const ink = '#4a3a12';
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={masked ? 'Face wearing a mask' : mood === 'happy' ? 'Smiling face' : 'Neutral face'} fill="none" stroke={ink} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 27c0-13 8-19 18-19s18 6 18 19v6c0 11-8 21-18 21S14 44 14 33z" />
      <path d="M14 28c5-1 9-5 11-10 4 4 10 6 25 4" opacity="0.7" />
      <path d="M13 31c-3 0-3 7 0 7M51 31c3 0 3 7 0 7" />
      {masked ? (
        <>
          <circle cx="25" cy="30" r="1.6" fill={ink} stroke="none" />
          <circle cx="39" cy="30" r="1.6" fill={ink} stroke="none" />
          <path d="M16 35h6M42 35h6" />
          <path d="M22 35h20v7c0 6-5 10-10 10s-10-4-10-10z" fill="#fbf5e9" fillOpacity="0.85" />
          <path d="M25 40h14M25 44h14" opacity="0.55" />
        </>
      ) : (
        <>
          <circle cx="25" cy="31" r="1.6" fill={ink} stroke="none" />
          <circle cx="39" cy="31" r="1.6" fill={ink} stroke="none" />
          <path d="M31 33c-1 3-1 5 1 5" />
          <path d={mood === 'happy' ? 'M25 44c4 4 10 4 14 0' : 'M26 46h12'} />
        </>
      )}
    </svg>
  );
}

const ADVICE: Record<AqiCategory, string> = {
  Good: 'Air is clean. Enjoy the outdoors.',
  Satisfactory: 'Fine for most people.',
  Moderate: 'Sensitive people should take it easy outside.',
  Poor: 'Wear a mask outdoors. Limit long exposure.',
  'Very Poor': 'Wear a mask and avoid outdoor exercise.',
  Severe: 'Stay indoors if you can. Wear a mask outside.',
};

export interface AqiCardProps {
  value: number | null;
  category: AqiCategory | null;
  mainPollutant: string | null;
  concentration?: string | null;
  weather?: { temperature: number | null; windKmh: number | null; humidity: number | null } | null;
}

/** The headline air-quality card: AQI, how it feels, the main pollutant and the weather. */
export function AqiCard({ value, category, mainPollutant, concentration, weather }: AqiCardProps) {
  const color = category ? AQI_COLORS[category] : '#9a8a80';
  const tint = `color-mix(in srgb, ${color} 34%, #fffaf0)`;
  const chip = `color-mix(in srgb, ${color} 70%, #fffaf0)`;
  const fmtN = (v: number | null | undefined, d = 0) => (v === null || v === undefined ? '-' : v.toFixed(d));
  return (
    <div className="overflow-hidden rounded-3xl shadow-sm ring-1 ring-black/5" aria-label="Air quality now">
      <div className="px-4 pb-3 pt-4" style={{ background: tint }}>
        <div className="flex items-center gap-3">
          <div className="flex h-[72px] w-[72px] shrink-0 flex-col items-center justify-center rounded-2xl text-[#3a2c0b]" style={{ background: chip }}>
            <span className="font-display text-3xl font-bold leading-none">{value ?? '-'}</span>
            <span className="mt-1 text-[10px] font-semibold tracking-wide opacity-80">AQI</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-display text-xl font-bold leading-tight text-[#3a2c0b]">{category ?? 'No reading'}</div>
            {category && <p className="mt-0.5 text-xs leading-snug text-[#3a2c0b]/75">{ADVICE[category]}</p>}
          </div>
          <AirFace category={category} />
        </div>
        {mainPollutant && (
          <div className="mt-3 flex items-baseline justify-between gap-2 border-t border-black/10 pt-3 text-[#3a2c0b]">
            <span className="text-sm">
              Main pollutant: <strong className="text-base">{mainPollutant}</strong>
            </span>
            {concentration && <span className="font-display text-base font-semibold">{concentration}</span>}
          </div>
        )}
      </div>
      {weather && (
        <div className="grid grid-cols-3 bg-white/90 px-4 py-2.5 text-sm font-semibold text-[#3a2c0b]">
          <span className="flex items-center gap-1.5">
            <Cloud size={18} className="text-slate-400" /> {fmtN(weather.temperature)}°
          </span>
          <span className="flex items-center justify-center gap-1.5">
            <Navigation size={16} className="text-slate-400" /> {fmtN(weather.windKmh)} km/h
          </span>
          <span className="flex items-center justify-end gap-1.5">
            <Droplets size={16} className="text-sky-500" /> {fmtN(weather.humidity)} %
          </span>
        </div>
      )}
    </div>
  );
}
