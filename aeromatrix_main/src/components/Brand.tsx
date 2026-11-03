export function LogoMark({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label="AeroMatrix"
    >
      <circle cx="32" cy="32" r="30" fill="#a3263f" />
      <circle cx="32" cy="32" r="22" fill="none" stroke="#fbf5e9" strokeWidth="2.5" opacity="0.55" />
      <path
        d="M14 36c6-12 12-12 18 0s12 12 18 0"
        fill="none"
        stroke="#fbf5e9"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <circle cx="32" cy="22" r="3.2" fill="#fbf5e9" />
    </svg>
  );
}

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`font-display text-[17px] font-bold tracking-tight text-sand-50 ${className}`}>
      Aero<span className="text-accent-300">Matrix</span>
    </span>
  );
}
