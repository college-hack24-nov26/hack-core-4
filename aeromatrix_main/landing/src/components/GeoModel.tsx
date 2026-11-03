import { LineChart, RadioTower, TriangleAlert } from 'lucide-react';
import { ImageSlot } from './ImageSlot';
import { Eyebrow, H2, ModelLink, Reveal, Section } from './Section';

const CARDS = [
  {
    icon: LineChart,
    title: 'Trained station forecasts',
    text: 'When the model service is running, AeroMatrix shows its forecasts for the monitoring stations with an uncertainty range, and says plainly when a forecast is historical or unavailable.',
    section: 'air' as const,
  },
  {
    icon: RadioTower,
    title: 'Sensor Intelligence',
    text: 'Replay a past hour with some sensors removed and see how well the second model recovers the reading from the stations around it. It is a replay of history, labelled that way.',
    section: 'sensors' as const,
  },
];

export function GeoModel() {
  return (
    <Section id="predict" tone="dark">
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <Reveal className="lg:order-2">
          <Eyebrow dark>Predict</Eyebrow>
          <H2 dark>What the models say, and how sure they are.</H2>
          <p className="mt-5 max-w-lg text-lg leading-relaxed text-cream-200">
            Two trained packages sit behind the map. Their numbers appear next to their error ranges, and a model that is weak for a pollutant is
            called weak.
          </p>
          <div className="mt-8 space-y-4">
            {CARDS.map(({ icon: Icon, title, text, section }) => (
              <div key={title} className="rounded-2xl bg-cherry-800/70 p-5 ring-1 ring-cream-100/10">
                <div className="mb-2 flex items-center gap-3">
                  <Icon size={20} className="text-cherry-300" />
                  <h3 className="font-semibold text-cream-50">{title}</h3>
                </div>
                <p className="mb-3 text-sm leading-relaxed text-cream-300">{text}</p>
                <ModelLink section={section} dark />
              </div>
            ))}
          </div>
          <p className="mt-6 flex gap-2 text-sm text-cream-400">
            <TriangleAlert size={16} className="mt-0.5 shrink-0 text-cherry-300" />
            The models are not retrained on intervention effects, so a what-if result is never presented as a forecast.
          </p>
        </Reveal>
        <Reveal delay={120} className="lg:order-1">
          <ImageSlot name="card-predict" alt="A forecast line with a shaded uncertainty band" className="aspect-[4/3] rounded-3xl shadow-2xl ring-1 ring-cream-100/10" />
        </Reveal>
      </div>
    </Section>
  );
}
