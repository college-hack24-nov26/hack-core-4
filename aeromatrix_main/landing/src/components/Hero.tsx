import { ArrowDown } from 'lucide-react';
import { APP_URL } from '@/lib/links';
import { Button } from '@/components/ui/button';
import { HeroScene } from './HeroScene';

export function Hero() {
  return (
    <section id="top" className="relative flex min-h-[100svh] items-center overflow-hidden text-cream-50">
      <HeroScene />
      <div className="relative z-10 mx-auto w-full max-w-6xl px-4 pb-28 pt-28 sm:px-6">
        <p className="mb-4 inline-block rounded-full border border-cream-100/25 px-4 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-cream-200 animate-[rise_0.9s_both]">
          Air-quality digital twin
        </p>
        <h1 className="max-w-3xl font-display text-5xl font-semibold leading-[1.05] sm:text-6xl lg:text-7xl animate-[rise_0.9s_0.1s_both]">
          See Pune&rsquo;s air, <span className="text-cherry-200">zone by zone.</span>
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-cream-200 animate-[rise_0.9s_0.2s_both]">
          A 3D map of Pune and Pimpri-Chinchwad that shows what is measured, what a trained model predicts, and what a change might do. Each
          number says where it came from.
        </p>
        <div className="mt-9 flex flex-wrap items-center gap-4 animate-[rise_0.9s_0.3s_both]">
          <Button asChild size="lg" variant="primary">
            <a href={APP_URL}>Explore the System</a>
          </Button>
          <Button asChild size="lg" variant="light" className="bg-transparent text-cream-50 ring-1 ring-cream-100/40 hover:bg-cream-100/10">
            <a href="#understand">How it works</a>
          </Button>
        </div>
      </div>
      <a
        href="#understand"
        aria-label="Scroll to the next section"
        className="absolute bottom-6 left-1/2 z-10 flex h-11 w-11 -translate-x-1/2 items-center justify-center rounded-full text-cream-100/80 ring-1 ring-cream-100/30 hover:text-cream-50"
      >
        <ArrowDown size={20} />
      </a>
    </section>
  );
}
