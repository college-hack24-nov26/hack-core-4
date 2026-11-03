import { useRef, useState, type PointerEvent, type KeyboardEvent } from "react";
import { ArrowLeft, ArrowRight, Leaf, LineChart, Network, SlidersHorizontal } from "lucide-react";
import predict from "@/assets/card-predict.jpg";
import understand from "@/assets/card-understand.jpg";
import simulate from "@/assets/card-simulate.jpg";
import act from "@/assets/card-act.jpg";
import { Clouds } from "./Clouds";

const CARDS = [
  { title: "Predict", text: "Forecast future air quality.", img: predict, icon: LineChart },
  { title: "Understand", text: "Identify pollution hotspots and contributing sources.", img: understand, icon: Network },
  { title: "Simulate", text: "Explore environmental what-if scenarios.", img: simulate, icon: SlidersHorizontal },
  { title: "Act", text: "Explore potential mitigation strategies.", img: act, icon: Leaf },
];

function Card({ card, offset, onClick }: { card: (typeof CARDS)[number]; offset: number; onClick: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [hover, setHover] = useState(false);
  const active = offset === 0;
  const abs = Math.abs(offset);
  const Icon = card.icon;

  const move = (e: PointerEvent) => {
    if (e.pointerType !== "mouse" || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setTilt({ x: ((e.clientY - r.top) / r.height - 0.5) * -10, y: ((e.clientX - r.left) / r.width - 0.5) * 12 });
  };

  const x = offset * 62; // % of card width
  const scale = active ? 1 : hover ? 0.9 : 0.84 - (abs - 1) * 0.06;
  const rotY = -offset * 16 + tilt.y;
  const z = active ? 0 : -abs * 90 + (hover ? 40 : 0);

  return (
    <div
      ref={ref}
      onClick={onClick}
      onPointerMove={move}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => {
        setHover(false);
        setTilt({ x: 0, y: 0 });
      }}
      className="absolute left-1/2 top-0 h-full w-[62%] cursor-pointer sm:w-[46%] lg:w-[38%]"
      style={{
        transform: `translateX(calc(-50% + ${x}%)) translateZ(${z}px) rotateY(${rotY}deg) rotateX(${tilt.x}deg) scale(${scale})`,
        transition: "transform 0.7s cubic-bezier(.2,.7,.2,1), opacity 0.7s",
        zIndex: 10 - abs + (hover ? 1 : 0),
        opacity: abs > 2 ? 0 : 1,
      }}
      aria-hidden={!active}
    >
      <div
        className={`relative h-full overflow-hidden rounded-2xl border transition-shadow ${
          active ? "border-cherry shadow-cherry" : "border-border shadow-deep"
        }`}
      >
        <img src={card.img} alt="" loading="lazy" width={768} height={1024} className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-ink/85 via-ink/20 to-ink/80" />
        <div className="relative flex h-full flex-col justify-between p-6">
          <div>
            <Icon className="text-cherry" size={30} strokeWidth={1.5} />
            <h3 className="mt-4 font-display text-3xl text-vanilla">{card.title}</h3>
          </div>
          <p className={`text-sm leading-relaxed text-cream transition-opacity ${active ? "opacity-100" : "opacity-0"}`}>{card.text}</p>
        </div>
      </div>
    </div>
  );
}

export function Capabilities() {
  const [i, setI] = useState(0);
  const n = CARDS.length;
  const go = (d: number) => setI((v) => Math.max(0, Math.min(n - 1, v + d)));
  const startX = useRef<number | null>(null);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") go(1);
    if (e.key === "ArrowLeft") go(-1);
  };

  return (
    <section id="capabilities" className="relative overflow-hidden bg-cola-band py-28 md:py-36">
      <Clouds
        clouds={[
          { top: "8%", w: 700, h: 180, dur: 210, delay: 30, op: 0.08 },
          { top: "82%", w: 900, h: 220, dur: 260, delay: 140, op: 0.1, mobile: false },
        ]}
      />
      <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 md:px-10 lg:grid-cols-[0.75fr_1.6fr]">
        <div className="reveal">
          <p className="eyebrow">Our Capabilities</p>
          <h2 className="mt-5 font-display text-5xl leading-[1.02] text-vanilla md:text-6xl">
            From Data to <br />
            <span className="text-cherry">Real Impact.</span>
          </h2>
          <span className="mt-6 block h-px w-12 bg-cream/40" />
        </div>

        <div
          className="reveal relative"
          tabIndex={0}
          role="region"
          aria-roledescription="carousel"
          aria-label={`Capabilities — ${CARDS[i]?.title}, ${i + 1} of ${n}`}
          onKeyDown={onKey}
          onPointerDown={(e) => (startX.current = e.clientX)}
          onPointerUp={(e) => {
            if (startX.current == null) return;
            const dx = e.clientX - startX.current;
            if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
            startX.current = null;
          }}
        >
          <div className="relative h-[420px] select-none sm:h-[460px]" style={{ perspective: "1400px", transformStyle: "preserve-3d", touchAction: "pan-y" }}>
            {CARDS.map((c, k) => (
              <Card key={c.title} card={c} offset={k - i} onClick={() => setI(k)} />
            ))}
          </div>
          <div className="mt-8 flex items-center justify-center gap-5">
            <button
              aria-label="Previous capability"
              onClick={() => go(-1)}
              disabled={i === 0}
              className="grid h-10 w-10 place-items-center rounded-full border border-cream/40 text-vanilla transition hover:border-cherry hover:bg-cherry disabled:opacity-30"
            >
              <ArrowLeft size={16} />
            </button>
            <div className="flex gap-2">
              {CARDS.map((c, k) => (
                <button
                  key={c.title}
                  aria-label={`Show ${c.title}`}
                  onClick={() => setI(k)}
                  className={`h-1 rounded-full transition-all ${k === i ? "w-8 bg-cherry" : "w-4 bg-cream/30"}`}
                />
              ))}
            </div>
            <button
              aria-label="Next capability"
              onClick={() => go(1)}
              disabled={i === n - 1}
              className="grid h-10 w-10 place-items-center rounded-full border border-cream/40 text-vanilla transition hover:border-cherry hover:bg-cherry disabled:opacity-30"
            >
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
