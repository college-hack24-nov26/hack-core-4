/** Original AeroSage mark (see assets/LICENSE_ASSETS.md). Drawn inline so it needs no image file. */
export function AeroSageAvatar({ size = 32, pulse = false }: { size?: number; pulse?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="AeroSage"
      className={pulse ? 'animate-pulse' : undefined}
    >
      <defs>
        <linearGradient id="aerosage-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2dd4bf" />
          <stop offset="1" stopColor="#0e7490" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="url(#aerosage-g)" />
      <path d="M14 36c6-1 8-8 14-8s7 6 13 6 7-5 9-5" fill="none" stroke="#f8fafc" strokeWidth="3" strokeLinecap="round" />
      <path d="M16 44c5-1 7-5 12-5s6 4 11 4 6-3 9-3" fill="none" stroke="#f8fafc" strokeOpacity=".6" strokeWidth="3" strokeLinecap="round" />
      <circle cx="44" cy="20" r="4" fill="#f8fafc" />
    </svg>
  );
}
