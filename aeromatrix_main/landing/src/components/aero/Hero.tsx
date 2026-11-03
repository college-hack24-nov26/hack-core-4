import { ArrowRight } from "lucide-react";
import HeroScene from "./HeroScene";
import { Clouds } from "./Clouds";
import { MAIN_APP_URL } from "@/config/app";

export function Hero() {
  return (
    <section id="home" className="relative isolate min-h-[100svh] overflow-hidden bg-hero">
      <Clouds
        clouds={[
          { top: "72%", w: 760, h: 220, dur: 160, delay: 20, op: 0.35 },
          { top: "84%", w: 1100, h: 260, dur: 220, delay: 120, op: 0.45 },
          { top: "18%", w: 520, h: 140, dur: 190, delay: 60, op: 0.12, mobile: false },
        ]}
      />
      {/* India map: right side on desktop, behind text on mobile */}
      <div className="fade-scale absolute inset-0 z-[1] md:left-[38%]" style={{ animationDelay: "0.2s" }}>
        <div className="relative h-full w-full">
          <HeroScene />
        </div>
      </div>

      <div className="relative z-10 mx-auto flex min-h-[100svh] max-w-7xl flex-col justify-center px-5 pt-20 md:px-10 pointer-events-none">
        <div className="max-w-xl pointer-events-auto">
          <p className="eyebrow rise" style={{ animationDelay: "0.5s" }}>
            India · Air · Cities · Tomorrow
          </p>
          <h1
            className="rise mt-5 font-display whitespace-nowrap text-5xl leading-[0.95] text-vanilla sm:text-6xl lg:text-7xl"
            style={{ animationDelay: "0.7s" }}
          >
            AERO-MATRIX
          </h1>
          <p className="rise mt-5 font-display text-2xl text-cream sm:text-3xl" style={{ animationDelay: "0.85s" }}>
            Intelligence for Cleaner Cities
          </p>
          <span className="rise mt-6 block h-px w-12 bg-cream/60" style={{ animationDelay: "0.9s" }} />
          <p className="rise mt-6 max-w-md text-sm leading-relaxed text-cream/75 sm:text-base" style={{ animationDelay: "1s" }}>
            An AI-powered geospatial platform to understand, predict, and improve urban air quality.
          </p>
          <a
            href={MAIN_APP_URL}
            className="rise mt-9 inline-flex items-center gap-3 rounded-full border border-cherry bg-cola/80 px-7 py-3.5 text-sm text-vanilla shadow-cherry transition hover:bg-cherry"
            style={{ animationDelay: "1.2s" }}
          >
            Explore the System <ArrowRight size={16} />
          </a>
        </div>
        <a
          href="#concept"
          className="rise pointer-events-auto absolute bottom-10 left-5 flex items-center gap-3 text-[11px] tracking-[0.25em] text-cream/70 md:left-10"
          style={{ animationDelay: "1.5s" }}
        >
          <span className="flex h-9 w-6 justify-center rounded-full border border-cream/50 pt-1.5">
            <span className="scroll-dot h-2 w-0.5 rounded bg-cherry" />
          </span>
          SCROLL
        </a>
      </div>
    </section>
  );
}
