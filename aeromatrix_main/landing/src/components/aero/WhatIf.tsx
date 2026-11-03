import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowRight, Factory, MoveHorizontal, Car, Trees, X } from "lucide-react";
import current from "@/assets/city-current.jpg";
import cleaner from "@/assets/city-cleaner.jpg";
import { Clouds } from "./Clouds";
import { MAIN_APP_URL } from "@/config/app";

const LEVERS = [
  { id: "traffic", label: "Reduce traffic emissions", icon: Car },
  { id: "industry", label: "Modify industrial emissions", icon: Factory },
  { id: "green", label: "Increase green buffers", icon: Trees },
];

export function WhatIf() {
  const [pos, setPos] = useState(50);
  const [focused, setFocused] = useState(false);
  const [levers, setLevers] = useState<string[]>([]);
  const box = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const setFromX = (x: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    setPos(Math.max(2, Math.min(98, ((x - r.left) / r.width) * 100)));
  };

  useEffect(() => {
    if (!focused) return;
    const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && setFocused(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [focused]);

  const onHandleKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft") setPos((p) => Math.max(2, p - 5));
    if (e.key === "ArrowRight") setPos((p) => Math.min(98, p + 5));
  };

  const enter = () => {
    document.getElementById("what-if")?.scrollIntoView({ behavior: "smooth" });
    setTimeout(() => setFocused(true), 350);
  };

  const toggle = (id: string) => setLevers((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));

  return (
    <section id="what-if" className="relative overflow-hidden bg-cream-band py-28 text-burgundy md:py-36">
      <Clouds clouds={[{ top: "12%", w: 800, h: 200, dur: 230, delay: 70, op: 0.6 }]} />
      <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 md:px-10 lg:grid-cols-[0.75fr_1.6fr]">
        <div className={`reveal transition-opacity duration-500 ${focused ? "!opacity-0" : ""}`}>
          <p className="eyebrow">What If</p>
          <h2 className="mt-5 font-display text-5xl leading-[1.05] text-ink md:text-6xl">
            Cleaner Choices. <br />
            Brighter Tomorrows.
          </h2>
          <p className="mt-6 max-w-sm leading-relaxed text-burgundy/80">
            Explore how different actions could improve air quality in our cities.
          </p>
          <button
            onClick={enter}
            className="group mt-8 inline-flex items-center gap-3 rounded-full border border-cherry/40 py-1.5 pl-1.5 pr-5 text-sm font-semibold text-cherry transition hover:bg-cherry hover:text-vanilla"
          >
            <span className="grid h-8 w-8 place-items-center rounded-full border border-cherry/50 group-hover:border-vanilla">
              <ArrowRight size={15} />
            </span>
            Explore What-If Scenarios
          </button>
        </div>

        <div className="relative aspect-[16/10]">
          <div className={`transition-all duration-700 ${focused ? "fixed inset-0 z-[60] flex flex-col bg-ink p-4 md:p-8" : "absolute inset-0"}`}>
            {focused && (
              <div className="mb-4 flex items-center justify-between">
                <p className="eyebrow">What-If Scenarios</p>
                <button
                  onClick={() => setFocused(false)}
                  className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs text-vanilla hover:border-cherry"
                >
                  <X size={14} /> Exit
                </button>
              </div>
            )}
            <div
              ref={box}
              className="relative min-h-0 flex-1 h-full select-none overflow-hidden rounded-2xl shadow-deep"
              style={{ touchAction: "none" }}
              onPointerDown={(e) => {
                dragging.current = true;
                (e.target as Element).setPointerCapture?.(e.pointerId);
                setFromX(e.clientX);
              }}
              onPointerMove={(e) => dragging.current && setFromX(e.clientX)}
              onPointerUp={() => (dragging.current = false)}
              onPointerCancel={() => (dragging.current = false)}
            >
              <img src={cleaner} alt="Illustration of the city with cleaner air" width={1600} height={912} loading="lazy" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
              <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
                <img src={current} alt="Illustration of the city under heavy smog" width={1600} height={912} loading="lazy" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
              </div>
              <span className="absolute left-4 top-4 rounded-md bg-cherry px-3 py-1.5 text-xs text-vanilla">Current Scenario</span>
              <span className="absolute right-4 top-4 rounded-md bg-teal px-3 py-1.5 text-xs text-vanilla">Cleaner Scenario</span>
              <div className="absolute inset-y-0 w-0.5 bg-vanilla" style={{ left: `${pos}%` }}>
                <button
                  role="slider"
                  aria-label="Compare scenarios"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(pos)}
                  onKeyDown={onHandleKey}
                  className="absolute left-1/2 top-1/2 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize place-items-center rounded-full border-2 border-vanilla bg-ink/70 text-vanilla backdrop-blur transition hover:scale-110 hover:bg-cherry"
                >
                  <MoveHorizontal size={18} />
                </button>
              </div>
              <span className="absolute bottom-3 left-4 rounded bg-ink/60 px-2 py-1 text-[10px] tracking-wider text-cream/80">
                ILLUSTRATIVE VISUAL · NOT MODELED OUTPUT
              </span>
            </div>

            {focused && (
              <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-wrap gap-2" role="group" aria-label="Interventions to model">
                  {LEVERS.map((l) => {
                    const Icon = l.icon;
                    const on = levers.includes(l.id);
                    return (
                      <button
                        key={l.id}
                        aria-pressed={on}
                        onClick={() => toggle(l.id)}
                        className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs transition ${
                          on ? "border-cherry bg-cola text-vanilla" : "border-border text-cream/75 hover:border-cherry/60"
                        }`}
                      >
                        <Icon size={14} /> {l.label}
                      </button>
                    );
                  })}
                </div>
                <a
                  href={`${MAIN_APP_URL}?scenario=${levers.join(",")}`}
                  className={`inline-flex items-center justify-center gap-2 rounded-full bg-cherry px-5 py-2.5 text-xs text-vanilla transition ${levers.length ? "" : "pointer-events-none opacity-40"}`}
                  aria-disabled={!levers.length}
                >
                  Model in AeroMatrix <ArrowRight size={14} />
                </a>
              </div>
            )}
            {focused && (
              <p className="mt-2 text-[11px] text-cream/50">
                Pick interventions, then run them in the main app's simulation engine. No predicted values are shown here.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
