import { APP_URL } from '@/lib/links';
import { Button } from '@/components/ui/button';
import { ImageSlot } from './ImageSlot';
import { Reveal } from './Section';

export function Closing() {
  return (
    <section id="start" className="relative overflow-hidden text-cream-50">
      <ImageSlot name="closing-landscape" alt="Hills under a clear evening sky" className="absolute inset-0 h-full w-full" />
      <div className="absolute inset-0 bg-gradient-to-t from-cherry-950/90 via-cherry-950/55 to-cherry-950/30" />
      <div className="relative z-10 mx-auto max-w-3xl px-4 py-28 text-center sm:px-6 sm:py-36">
        <Reveal>
          <h2 className="font-display text-4xl font-semibold leading-tight sm:text-6xl">Start with the air you breathe.</h2>
          <p className="mx-auto mt-5 max-w-xl text-lg text-cream-200">
            Open the system, pick a zone and see what is measured, what is predicted and what could change.
          </p>
          <div className="mt-9 flex justify-center">
            <Button asChild size="lg">
              <a href={APP_URL}>Explore the System</a>
            </Button>
          </div>
        </Reveal>
      </div>
      <footer className="relative z-10 border-t border-cream-100/10 bg-cherry-950/80 px-4 py-6 text-center text-xs text-cream-400">
        AeroMatrix is a prototype built for a hackathon. Demo and modelled values are labelled as such and are not official air-quality advice.
      </footer>
    </section>
  );
}
