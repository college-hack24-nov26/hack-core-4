import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Eye, Layers, MapPin, Shield, Wind, X } from "lucide-react";
import GeoModel from "./GeoModel";
import { Clouds } from "./Clouds";

const LAYERS = [
  { id: "all", label: "All Layers", icon: Layers },
  { id: "hotspots", label: "Pollution Hotspots", icon: Eye },
  { id: "traffic", label: "Traffic Corridors", icon: Wind },
  { id: "industrial", label: "Industrial Zones", icon: MapPin },
  { id: "buffers", label: "Green Buffers", icon: Shield },
];
const ZONE_LABEL: Record<string, string> = {
  hotspots: "Pollution hotspot",
  traffic: "Traffic corridor",
  industrial: "Industrial zone",
  buffers: "Green buffer",
  normal: "Background cell",
};

type Sel = { zoneType: string; r: number; c: number; height: number } | null;

export function Spatial() {
  const [layer, setLayer] = useState("all");
  const [focused, setFocused] = useState(false);
  const [sel, setSel] = useState<Sel>(null);
  const onSelect = useCallback((s: Sel) => setSel(s), []);

  useEffect(() => {
    if (!focused) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFocused(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [focused]);

  const enter = () => {
    document.getElementById("concept")?.scrollIntoView({ behavior: "smooth" });
    setTimeout(() => setFocused(true), 350);
  };

  return (
    <section id="concept" className="relative overflow-hidden bg-dusk-cream pb-24 pt-40 text-burgundy md:pb-32">
      <Clouds
        clouds={[
          { top: "4%", w: 900, h: 200, dur: 200, delay: 40, op: 0.5 },
          { top: "70%", w: 700, h: 200, dur: 240, delay: 150, op: 0.35, mobile: false },
        ]}
      />
      <div
        className="relative mx-auto grid max-w-7xl items-center gap-10 px-5 md:px-10 lg:grid-cols-[0.8fr_1.6fr]"
      >
        <div className={`reveal transition-opacity duration-500 ${focused ? "!opacity-0" : ""}`}>
          <p className="eyebrow">Geospatial Intelligence</p>
          <h2 className="mt-5 font-display text-5xl leading-[1.02] text-ink md:text-6xl">
            Pollution is <br />
            <span className="text-cherry">Spatial.</span>
          </h2>
          <span className="mt-6 block h-px w-12 bg-burgundy/40" />
          <p className="mt-6 max-w-sm text-base leading-relaxed text-burgundy/80">
            Explore how pollution moves across cities and understand its spatial patterns.
          </p>
          <button
            onClick={enter}
            className="group mt-8 inline-flex items-center gap-3 rounded-full border border-cherry/40 py-1.5 pl-1.5 pr-5 text-sm font-semibold text-cherry transition hover:bg-cherry hover:text-vanilla"
          >
            <span className="grid h-8 w-8 place-items-center rounded-full border border-cherry/50 group-hover:border-vanilla">
              <ArrowRight size={15} />
            </span>
            Explore the Layers
          </button>
        </div>
        <div className="relative aspect-[4/3] lg:aspect-[16/11]">
      <div
        id="digital-twin"
        className={`transition-all duration-700 ${focused ? "fixed inset-0 z-[60] bg-ink" : "absolute inset-0"}`}
      >
        <div
          className={`relative h-full w-full overflow-hidden bg-ink shadow-deep ${
            focused ? "rounded-none" : "rounded-2xl border border-cola"
          }`}
        >
          <GeoModel activeLayer={layer} focused={focused} onSelect={onSelect} />

          {/* Selected voxel — from the model's own zone data */}
          <div className="pointer-events-none absolute left-4 top-4 max-w-[15rem] rounded-xl border border-border bg-ink/85 p-3.5 text-xs text-cream backdrop-blur">
            <p className="text-[10px] tracking-[0.2em] text-teal">SELECTED VOXEL</p>
            {sel ? (
              <>
                <p className="mt-1.5 text-sm font-semibold text-vanilla">{ZONE_LABEL[sel.zoneType]}</p>
                <p className="mt-1 text-cream/70">
                  Grid cell R{sel.r + 5} · C{sel.c + 5}
                </p>
                <p className="text-cream/70">Relative intensity: {sel.height.toFixed(2)}</p>
              </>
            ) : (
              <p className="mt-1.5 text-cream/70">Click a column to inspect it.</p>
            )}
          </div>

          {/* Layer controls */}
          <div
            className={`absolute flex gap-2 ${
              focused
                ? "bottom-6 left-1/2 -translate-x-1/2 flex-wrap justify-center md:bottom-auto md:left-auto md:right-6 md:top-1/2 md:-translate-y-1/2 md:translate-x-0 md:flex-col"
                : "bottom-3 left-3 right-3 overflow-x-auto md:bottom-auto md:left-auto md:right-4 md:top-1/2 md:-translate-y-1/2 md:flex-col md:overflow-visible"
            }`}
            role="radiogroup"
            aria-label="Spatial layers"
          >
            {LAYERS.map((l) => {
              const Icon = l.icon;
              const on = layer === l.id;
              return (
                <button
                  key={l.id}
                  role="radio"
                  aria-checked={on}
                  onClick={() => setLayer(l.id)}
                  className={`flex shrink-0 items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-xs transition ${
                    on
                      ? "border-cherry bg-cola text-vanilla shadow-cherry"
                      : "border-border bg-ink/80 text-cream/75 hover:border-cherry/60 hover:text-vanilla"
                  }`}
                >
                  <Icon size={14} />
                  {l.label}
                </button>
              );
            })}
          </div>

          {focused && (
            <>
              <div className="absolute left-1/2 top-6 -translate-x-1/2 text-center">
                <p className="eyebrow">Digital Twin · Spatial Layers</p>
              </div>
              <button
                onClick={() => setFocused(false)}
                className="absolute right-5 top-5 inline-flex items-center gap-2 rounded-full border border-border bg-ink/80 px-4 py-2 text-xs text-vanilla hover:border-cherry"
              >
                <X size={14} /> Exit
              </button>
            </>
          )}
        </div>
      </div>
        </div>
      </div>
    </section>
  );
}
