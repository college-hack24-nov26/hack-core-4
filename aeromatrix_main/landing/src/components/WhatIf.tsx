import { useState } from 'react';
import { ImageSlot } from './ImageSlot';
import { Eyebrow, H2, ModelLink, Reveal, Section } from './Section';

const LEVERS = ['Traffic volume and emission controls', 'Industry intensity, closures and new sites', 'Green cover and buffers', 'Weather: wind, temperature, humidity'];

export function WhatIf() {
  const [pos, setPos] = useState(50);
  return (
    <Section id="simulate" tone="sand">
      <div className="mx-auto max-w-2xl text-center">
        <Reveal>
          <Eyebrow>Simulate</Eyebrow>
          <H2>Change something. See the difference.</H2>
          <p className="mt-5 text-lg leading-relaxed text-cream-800">
            Move the levers in the What-If simulator and compare the baseline with the scenario, zone by zone. Results are labelled as modelled
            scenarios from a prototype model, not forecasts.
          </p>
        </Reveal>
      </div>

      <Reveal delay={100} className="mx-auto mt-12 max-w-4xl">
        <div className="relative aspect-[16/8] overflow-hidden rounded-3xl shadow-2xl ring-1 ring-cherry-900/15">
          <ImageSlot name="city-current" alt="The city today, under haze" className="absolute inset-0 h-full w-full" />
          <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${pos}%)` }}>
            <ImageSlot name="city-cleaner" alt="The same city with cleaner air" className="h-full w-full" />
          </div>
          <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-cream-50 shadow" style={{ left: `${pos}%` }} />
          <span className="pointer-events-none absolute left-4 top-4 rounded-full bg-cherry-950/70 px-3 py-1 text-xs font-semibold text-cream-100">Today</span>
          <span className="pointer-events-none absolute right-4 top-4 rounded-full bg-cherry-950/70 px-3 py-1 text-xs font-semibold text-cream-100">With changes</span>
          <input
            type="range"
            min={0}
            max={100}
            value={pos}
            onChange={(e) => setPos(Number(e.target.value))}
            aria-label="Compare today with a cleaner scenario"
            className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
          />
        </div>
        <p className="mt-3 text-center text-sm text-cream-600">An illustration of the idea. The numbers in the app come from the simulator, never from this picture.</p>
      </Reveal>

      <Reveal delay={150} className="mx-auto mt-12 grid max-w-4xl gap-6 sm:grid-cols-2">
        <div>
          <h3 className="font-semibold">What you can change</h3>
          <ul className="mt-3 space-y-2 text-cream-800">
            {LEVERS.map((l) => (
              <li key={l} className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-cherry-500" />
                {l}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col justify-between rounded-2xl bg-cream-50 p-6 ring-1 ring-cherry-900/10">
          <p className="text-cream-800">
            Then ask Plan-It for budgeted plans that use the same simulator, with prices that show their source and a PDF you can take away.
          </p>
          <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2">
            <ModelLink section="simulator">Try the simulator</ModelLink>
            <ModelLink section="actions">See reduction actions</ModelLink>
          </div>
        </div>
      </Reveal>
    </Section>
  );
}
