/** The AeroMatrix logo, on a small cream tile so it reads on both light and dark surfaces. */
export function LogoMark({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[28%] gov-logo-tile ${className}`} style={{ width: size, height: size }}>
      <img src="/aeromatrix-logo.png" alt="AeroMatrix" width={size} height={size} className="gov-logo-img h-[88%] w-[88%] object-contain" draggable={false} />
    </span>
  );
}

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`font-display text-[17px] font-bold tracking-tight text-sand-50 ${className}`}>
      Aero<span className="text-accent-300">Matrix</span>
    </span>
  );
}
