import type { AqiCategory } from './lib/airdata';

/** What the person in the AQI card looks like for each band. */
const LOOK: Record<AqiCategory, { shirt: string; mood: 'happy' | 'calm' | 'concerned' | 'worried' | 'unwell' | 'critical'; mask: boolean }> = {
  Good: { shirt: '#22c55e', mood: 'happy', mask: false },
  Satisfactory: { shirt: '#eab308', mood: 'calm', mask: false },
  Moderate: { shirt: '#f97316', mood: 'concerned', mask: true },
  Poor: { shirt: '#ef4444', mood: 'worried', mask: true },
  'Very Poor': { shirt: '#a21caf', mood: 'unwell', mask: true },
  Severe: { shirt: '#7f1d1d', mood: 'critical', mask: true },
};

const LABEL: Record<AqiCategory, string> = {
  Good: 'A happy, healthy person',
  Satisfactory: 'A comfortable person',
  Moderate: 'A concerned person wearing a mask',
  Poor: 'A worried person wearing a mask',
  'Very Poor': 'An uncomfortable person wearing a mask',
  Severe: 'A person in a mask with a health warning',
};

/** A friendly character whose face and clothes follow the air quality. */
export function PersonIllustration({ category, size = 170 }: { category: AqiCategory | null; size?: number }) {
  const look = LOOK[category ?? 'Moderate'];
  const { mood, mask } = look;
  const skin = '#f2c9a5';
  const ink = '#2a1d17';
  const browY = mood === 'happy' ? 66 : 68;
  const brows =
    mood === 'worried' || mood === 'unwell' || mood === 'critical'
      ? { l: `M57 ${browY + 2} L73 ${browY - 3}`, r: `M103 ${browY + 2} L87 ${browY - 3}` }
      : mood === 'concerned'
        ? { l: `M58 ${browY} L73 ${browY - 2}`, r: `M102 ${browY} L87 ${browY - 2}` }
        : { l: `M58 ${browY} Q66 ${browY - 4} 73 ${browY}`, r: `M102 ${browY} Q94 ${browY - 4} 87 ${browY}` };
  const eyeR = mood === 'critical' ? 4.6 : mood === 'unwell' ? 2.4 : 3.4;
  const mouth =
    mood === 'happy'
      ? 'M66 96 Q80 110 94 96'
      : mood === 'calm'
        ? 'M68 98 Q80 105 92 98'
        : mood === 'concerned'
          ? 'M70 101 L90 101'
          : '';
  return (
    <svg width={size} height={size * 1.05} viewBox="0 0 160 168" role="img" aria-label={LABEL[category ?? 'Moderate']} className="glass-face">
      {/* shoulders and shirt */}
      <path d="M18 168 C18 134 44 122 80 122 C116 122 142 134 142 168 Z" fill={look.shirt} />
      <path d="M62 124 L80 146 L98 124" fill="none" stroke="#ffffff" strokeOpacity=".55" strokeWidth="3" strokeLinejoin="round" />
      {/* neck */}
      <rect x="68" y="108" width="24" height="20" rx="8" fill={skin} />
      {/* ears */}
      <circle cx="41" cy="82" r="7" fill={skin} />
      <circle cx="119" cy="82" r="7" fill={skin} />
      {/* head */}
      <ellipse cx="80" cy="80" rx="38" ry="42" fill={skin} />
      {/* hair */}
      <path d="M42 76 C38 40 60 28 82 28 C106 28 124 44 118 76 C112 58 98 50 80 50 C62 50 48 58 42 76 Z" fill="#3b2a20" />
      {/* cheeks */}
      {(mood === 'happy' || mood === 'calm') && (
        <>
          <circle cx="56" cy="92" r="6" fill="#f08a8a" opacity=".35" />
          <circle cx="104" cy="92" r="6" fill="#f08a8a" opacity=".35" />
        </>
      )}
      {/* brows and eyes */}
      <path d={brows.l} stroke={ink} strokeWidth="3.2" strokeLinecap="round" fill="none" />
      <path d={brows.r} stroke={ink} strokeWidth="3.2" strokeLinecap="round" fill="none" />
      {mood === 'unwell' ? (
        <>
          <path d="M60 78 Q66 73 72 78" stroke={ink} strokeWidth="3" strokeLinecap="round" fill="none" />
          <path d="M88 78 Q94 73 100 78" stroke={ink} strokeWidth="3" strokeLinecap="round" fill="none" />
        </>
      ) : (
        <>
          <circle cx="66" cy="78" r={eyeR} fill={ink} />
          <circle cx="94" cy="78" r={eyeR} fill={ink} />
          <circle cx="67.2" cy="76.8" r="1.1" fill="#fff" />
          <circle cx="95.2" cy="76.8" r="1.1" fill="#fff" />
        </>
      )}
      {/* nose */}
      <path d="M80 82 Q76 92 81 94" stroke="#c98f69" strokeWidth="2.2" strokeLinecap="round" fill="none" />
      {/* mouth or mask */}
      {mask ? (
        <>
          <path d="M44 90 L58 94 M116 90 L102 94" stroke="#9ec5f0" strokeWidth="3" strokeLinecap="round" />
          <path d="M56 88 Q80 82 104 88 L102 112 Q80 124 58 112 Z" fill="#e8f2ff" stroke="#8db6e6" strokeWidth="2" strokeLinejoin="round" />
          <path d="M60 97 Q80 102 100 97 M60 104 Q80 109 100 104" stroke="#8db6e6" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <path d={mouth} stroke={ink} strokeWidth="3.2" strokeLinecap="round" fill="none" />
      )}
      {/* signs of discomfort */}
      {mood === 'unwell' && <path d="M122 54 q5 8 0 13 q-5 -5 0 -13z" fill="#60a5fa" />}
      {mood === 'critical' && (
        <g>
          <path d="M120 30 L136 58 L104 58 Z" fill="#ef4444" stroke="#fff" strokeWidth="2.5" strokeLinejoin="round" />
          <rect x="118.8" y="39" width="2.6" height="10" rx="1.3" fill="#fff" />
          <circle cx="120.1" cy="53.2" r="1.6" fill="#fff" />
        </g>
      )}
    </svg>
  );
}
