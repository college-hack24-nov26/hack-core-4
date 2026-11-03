import { createFileRoute } from '@tanstack/react-router';
import { Nav } from '@/components/Nav';
import { Hero } from '@/components/Hero';
import { Spatial } from '@/components/Spatial';
import { GeoModel } from '@/components/GeoModel';
import { WhatIf } from '@/components/WhatIf';
import { Capabilities } from '@/components/Capabilities';
import { Closing } from '@/components/Closing';
import { useHashScroll, useReveal } from '@/hooks/useReveal';

export const Route = createFileRoute('/')({
  component: Home,
});

function Home() {
  useReveal();
  useHashScroll();
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Spatial />
        <GeoModel />
        <WhatIf />
        <Capabilities />
        <Closing />
      </main>
    </>
  );
}
