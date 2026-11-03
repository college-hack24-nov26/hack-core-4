const CLOUDS = [
  { top: '12%', size: 280, delay: '-8s', dur: '70s', opacity: 0.22 },
  { top: '26%', size: 200, delay: '-34s', dur: '90s', opacity: 0.16 },
  { top: '40%', size: 340, delay: '-52s', dur: '80s', opacity: 0.14 },
  { top: '6%', size: 160, delay: '-20s', dur: '110s', opacity: 0.12 },
];

/** Deterministic skyline rows: [x, width, height]. No randomness, so the server and browser draw the same picture. */
function row(seed: number, minH: number, spread: number, minW: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  let x = -10;
  let s = seed;
  while (x < 1210) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const w = minW + (s % 34);
    s = (s * 1103515245 + 12345) % 2147483648;
    const h = minH + (s % spread);
    out.push([x, w, h]);
    x += w + 2;
  }
  return out;
}
const FAR = row(7, 90, 90, 26);
const NEAR = row(23, 40, 70, 30);

function Cloud({ top, size, delay, dur, opacity }: (typeof CLOUDS)[number]) {
  return (
    <div
      className="cloud absolute left-0 will-change-transform"
      style={{ top, width: size, height: size * 0.4, opacity, animation: `drift ${dur} linear infinite`, animationDelay: delay }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 200 80" className="h-full w-full">
        <g fill="#fbf5e9">
          <ellipse cx="60" cy="52" rx="48" ry="22" />
          <ellipse cx="110" cy="40" rx="50" ry="28" />
          <ellipse cx="150" cy="54" rx="40" ry="20" />
        </g>
      </svg>
    </div>
  );
}

/** Hero backdrop: a dusk sky, slow clouds and a Pune-style skyline drawn in SVG. Pure CSS motion, no image needed. */
export function HeroScene() {
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute inset-0 bg-gradient-to-b from-cherry-950 via-cherry-800 to-cherry-500" />
      <div className="absolute left-1/2 top-[38%] h-[60vmin] w-[60vmin] -translate-x-1/2 rounded-full bg-cream-100/15 blur-3xl" />
      {CLOUDS.map((c, i) => (
        <Cloud key={i} {...c} />
      ))}
      <svg viewBox="0 0 1200 260" preserveAspectRatio="xMidYMax slice" className="absolute inset-x-0 bottom-0 h-[34%] w-full">
        <g fill="#1c0a10" fillOpacity=".5">
          {FAR.map(([x, w, h], i) => (
            <rect key={i} x={x} y={260 - h} width={w} height={h} />
          ))}
        </g>
        <g fill="#1c0a10">
          {NEAR.map(([x, w, h], i) => (
            <rect key={i} x={x} y={260 - h} width={w} height={h} />
          ))}
        </g>
      </svg>
    </div>
  );
}
