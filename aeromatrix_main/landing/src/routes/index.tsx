import { createFileRoute } from "@tanstack/react-router";
import { Nav } from "@/components/aero/Nav";
import { Hero } from "@/components/aero/Hero";
import { Spatial } from "@/components/aero/Spatial";
import { Capabilities } from "@/components/aero/Capabilities";
import { WhatIf } from "@/components/aero/WhatIf";
import { Closing } from "@/components/aero/Closing";
import { useReveal } from "@/components/aero/useReveal";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "AeroMatrix — Intelligence for Cleaner Cities" },
      { name: "description", content: "AI-powered geospatial platform to understand, predict, and improve urban air quality across India." },
      { property: "og:title", content: "AeroMatrix — Intelligence for Cleaner Cities" },
      { property: "og:description", content: "Explore pollution spatially, simulate what-if scenarios, and shape cleaner cities." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  useReveal();
  return (
    <main>
      <Nav />
      <Hero />
      <Spatial />
      <Capabilities />
      <WhatIf />
      <Closing />
    </main>
  );
}
