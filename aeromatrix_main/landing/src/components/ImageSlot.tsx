import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Optional pictures. Drop a jpg named like the slot into src/assets (for example card-predict.jpg) and it is used;
 * until then a gradient with a small drawn scene of the same size stands in, so the page never shows a broken image.
 * The glob is eager, so a missing file is simply absent from the map: no import error, the build works either way.
 */
const found = import.meta.glob('/src/assets/*.jpg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export type SlotName =
  | 'card-understand'
  | 'card-predict'
  | 'card-simulate'
  | 'card-act'
  | 'city-current'
  | 'city-cleaner'
  | 'closing-landscape';

export function slotUrl(name: SlotName): string | null {
  return found[`/src/assets/${name}.jpg`] ?? null;
}

const SKY: Record<SlotName, [string, string]> = {
  'card-understand': ['#f4ead7', '#e8d9bf'],
  'card-predict': ['#4a2130', '#251017'],
  'card-simulate': ['#c84a62', '#612b3d'],
  'card-act': ['#e8d9bf', '#d6c2a6'],
  'city-current': ['#a89a86', '#6e5a52'],
  'city-cleaner': ['#fbf5e9', '#eba3af'],
  'closing-landscape': ['#f4ead7', '#dd7487'],
};

function Skyline({ ink, haze }: { ink: string; haze: number }) {
  const blocks: [number, number, number][] = [
    [10, 52, 30], [44, 38, 26], [74, 60, 34], [112, 30, 28], [144, 48, 30], [178, 24, 24], [206, 44, 34], [244, 34, 26], [274, 56, 30], [308, 28, 28], [340, 46, 32], [376, 36, 24],
  ];
  return (
    <g>
      {blocks.map(([x, h, w], i) => (
        <rect key={i} x={x} y={150 - h} width={w} height={h} fill={ink} opacity={0.9 - i * 0.02} />
      ))}
      <rect x="0" y="150" width="400" height="50" fill={ink} />
      <rect x="0" y="0" width="400" height="200" fill="#a89a86" opacity={haze} />
    </g>
  );
}

function Scene({ name }: { name: SlotName }) {
  const [a, b] = SKY[name];
  const id = `g-${name}`;
  return (
    <svg viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" className="h-full w-full" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={a} />
          <stop offset="1" stopColor={b} />
        </linearGradient>
      </defs>
      <rect width="400" height="200" fill={`url(#${id})`} />
      {name === 'card-understand' && (
        <g stroke="#a3263f" strokeOpacity=".35" fill="none">
          {Array.from({ length: 9 }, (_, i) => (
            <path key={i} d={`M${20 + i * 45} 20V180M20 ${20 + i * 20}H380`} />
          ))}
          <rect x="155" y="60" width="45" height="40" fill="#a3263f" fillOpacity=".35" />
          <rect x="200" y="100" width="45" height="40" fill="#a3263f" fillOpacity=".6" />
        </g>
      )}
      {name === 'card-predict' && (
        <g fill="none" strokeLinecap="round">
          <path d="M20 140C80 110 110 150 170 100S270 70 380 50" stroke="#dd7487" strokeWidth="4" />
          <path d="M20 160C80 130 110 170 170 120S270 90 380 70M20 120C80 90 110 130 170 80S270 50 380 30" stroke="#dd7487" strokeOpacity=".35" strokeWidth="2" />
        </g>
      )}
      {name === 'card-simulate' && (
        <g>
          {[60, 100, 140].map((y, i) => (
            <g key={y}>
              <rect x="50" y={y} width="300" height="6" rx="3" fill="#f4ead7" fillOpacity=".35" />
              <circle cx={120 + i * 70} cy={y + 3} r="11" fill="#f4ead7" />
            </g>
          ))}
        </g>
      )}
      {name === 'card-act' && (
        <g fill="none" stroke="#a3263f" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
          {[55, 100, 145].map((y) => (
            <g key={y}>
              <path d={`M60 ${y}l10 10 20-22`} />
              <path d={`M115 ${y}H330`} strokeOpacity=".4" />
            </g>
          ))}
        </g>
      )}
      {(name === 'city-current' || name === 'city-cleaner') && <Skyline ink="#4a2130" haze={name === 'city-current' ? 0.55 : 0} />}
      {name === 'closing-landscape' && (
        <g>
          <circle cx="300" cy="60" r="26" fill="#fbf5e9" fillOpacity=".8" />
          <path d="M0 150C80 110 140 130 210 115S340 100 400 130V200H0Z" fill="#a3263f" fillOpacity=".5" />
          <path d="M0 170C90 140 170 160 250 145S360 140 400 155V200H0Z" fill="#4a2130" />
        </g>
      )}
    </svg>
  );
}

interface Props {
  name: SlotName;
  alt: string;
  className?: string;
  children?: ReactNode;
}

export function ImageSlot({ name, alt, className, children }: Props) {
  const url = slotUrl(name);
  return (
    <div className={cn('relative overflow-hidden bg-cream-200', className)} data-slot={name} data-source={url ? 'file' : 'fallback'}>
      {url ? <img src={url} alt={alt} loading="lazy" className="h-full w-full object-cover" /> : <div role="img" aria-label={alt} className="h-full w-full"><Scene name={name} /></div>}
      {children}
    </div>
  );
}
