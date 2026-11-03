import { ImageSlot, type SlotName } from './ImageSlot';
import { Eyebrow, H2, ModelLink, Reveal, Section } from './Section';
import type { AppSection } from '@/lib/links';

const ITEMS: { slot: SlotName; title: string; text: string; section: AppSection; link: string }[] = [
  { slot: 'card-understand', title: 'Understand', text: 'Heatmap, zones, roads, industries, green areas and station markers on a 3D Pune map.', section: 'overview', link: 'Open the map' },
  { slot: 'card-predict', title: 'Predict', text: 'Trained-model station forecasts and a missing-sensor replay, each with its limits stated.', section: 'sensors', link: 'Open Sensors' },
  { slot: 'card-simulate', title: 'Simulate', text: 'Change traffic, industry, greenery and weather, then compare against the baseline.', section: 'simulator', link: 'Open What-If' },
  { slot: 'card-act', title: 'Act', text: 'Reduction actions and budgeted Plan-It plans with sourced prices, plus a PDF to share.', section: 'actions', link: 'Open Actions' },
];

const EXTRAS = [
  'Ask AeroSage in English, Hindi or Marathi: it reads numbers from the services and opens the right panel',
  'Import your own station readings or industry list; nothing leaves your browser',
  'Works with every backend off: it says what is unavailable instead of guessing',
];

export function Capabilities() {
  return (
    <Section id="capabilities" tone="cream">
      <Reveal className="max-w-2xl">
        <Eyebrow>Capabilities</Eyebrow>
        <H2>From reading the air to acting on it.</H2>
      </Reveal>
      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {ITEMS.map((it, i) => (
          <Reveal key={it.title} delay={i * 90}>
            <article className="flex h-full flex-col overflow-hidden rounded-3xl bg-cream-50 ring-1 ring-cherry-900/10 transition-shadow hover:shadow-xl">
              <ImageSlot name={it.slot} alt={`${it.title}: illustration`} className="aspect-[16/10]" />
              <div className="flex flex-1 flex-col p-5">
                <h3 className="font-display text-2xl font-semibold">{it.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-cream-600">{it.text}</p>
                <div className="mt-4 text-sm">
                  <ModelLink section={it.section}>{it.link}</ModelLink>
                </div>
              </div>
            </article>
          </Reveal>
        ))}
      </div>
      <Reveal delay={200}>
        <ul className="mt-12 grid gap-4 rounded-3xl bg-cherry-900 p-6 text-cream-200 sm:grid-cols-3 sm:p-8">
          {EXTRAS.map((e) => (
            <li key={e} className="text-sm leading-relaxed">
              {e}
            </li>
          ))}
        </ul>
      </Reveal>
    </Section>
  );
}
