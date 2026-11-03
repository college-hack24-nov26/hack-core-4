import { ArrowRight } from "lucide-react";
import landscape from "@/assets/closing-landscape.jpg";
import { Clouds } from "./Clouds";
import { MAIN_APP_URL } from "@/config/app";

export function Closing() {
  return (
    <section id="about" className="relative overflow-hidden bg-ink">
      <img src={landscape} alt="" loading="lazy" width={1920} height={912} className="absolute inset-0 h-full w-full object-cover opacity-80" />
      <div className="absolute inset-0 bg-gradient-to-b from-vanilla/0 via-ink/30 to-ink" />
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-vanilla to-transparent" />
      <Clouds clouds={[{ top: "62%", w: 900, h: 200, dur: 240, delay: 90, op: 0.18 }]} />
      <div className="reveal relative mx-auto flex min-h-[80vh] max-w-3xl flex-col items-center justify-center px-5 text-center">
        <span className="mb-8 h-px w-10 bg-cherry" />
        <h2 className="font-display text-4xl leading-tight text-vanilla md:text-6xl">
          Understand Today.
          <br />
          Shape Cleaner Tomorrows.
        </h2>
        <a
          href={MAIN_APP_URL}
          className="mt-10 inline-flex items-center gap-3 rounded-full border border-cherry bg-cola/80 px-7 py-3.5 text-sm text-vanilla shadow-cherry transition hover:bg-cherry"
        >
          Explore the System <ArrowRight size={16} />
        </a>
      </div>
      <footer className="relative border-t border-border px-5 py-6 text-center text-xs text-cream/50">
        © {new Date().getFullYear()} AeroMatrix · Intelligence for Cleaner Cities
      </footer>
    </section>
  );
}
