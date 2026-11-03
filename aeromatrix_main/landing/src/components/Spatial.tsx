import { Layers, MapPinned, ShieldCheck } from 'lucide-react';
import { ImageSlot } from './ImageSlot';
import { Eyebrow, H2, ModelLink, Reveal, Section } from './Section';

const POINTS = [
  { icon: MapPinned, title: 'A grid you choose', text: 'Pune and Pimpri-Chinchwad split into 5x5, 10x10 or 20x20 zones, each with its own pollutant levels, traffic, green cover and nearby industry.' },
  { icon: Layers, title: 'Six pollutants', text: 'PM2.5, PM10, NO2, SO2, CO and O3 on one heatmap, with roads, industries, green areas and monitoring stations as layers.' },
  { icon: ShieldCheck, title: 'Every value labelled', text: 'Demo, observed, model data, model prediction or modelled scenario. Anything the app cannot know is shown as unavailable, not filled in.' },
];

export function Spatial() {
  return (
    <Section id="understand" tone="cream">
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <Reveal>
          <Eyebrow>Understand</Eyebrow>
          <H2>The city as a map you can read.</H2>
          <p className="mt-5 max-w-lg text-lg leading-relaxed text-cream-800">
            Air quality is local. AeroMatrix lays the whole city out zone by zone so you can see where the air is worst, what is nearby, and
            which source is likely behind it.
          </p>
          <ul className="mt-8 space-y-5">
            {POINTS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4">
                <span className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cherry-500/10 text-cherry-500">
                  <Icon size={20} />
                </span>
                <span>
                  <span className="block font-semibold">{title}</span>
                  <span className="text-cream-600">{text}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-8">
            <ModelLink section="air" />
          </div>
        </Reveal>
        <Reveal delay={120}>
          <ImageSlot name="card-understand" alt="A grid of city zones shaded by pollution level" className="aspect-[4/3] rounded-3xl shadow-xl ring-1 ring-cherry-900/10" />
        </Reveal>
      </div>
    </Section>
  );
}
