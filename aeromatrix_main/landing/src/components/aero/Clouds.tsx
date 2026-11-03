type C = { top: string; w: number; h: number; dur: number; delay: number; op: number; mobile?: boolean };

export function Clouds({ clouds }: { clouds: C[] }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {clouds.map((c, i) => (
        <div
          key={i}
          className={`cloud ${c.mobile === false ? "hidden md:block" : ""}`}
          style={{
            top: c.top,
            left: 0,
            width: c.w,
            height: c.h,
            opacity: c.op,
            animationDuration: `${c.dur}s`,
            animationDelay: `-${c.delay}s`,
          }}
        />
      ))}
    </div>
  );
}
