# AeroMatrix landing site

The explainer page for AeroMatrix. It runs on port 3000 and sends visitors to the web app on port 5173.

Stack: TanStack Start, React 19, Vite 8, Tailwind CSS 4, shadcn-style Radix UI components.

## Run

```bash
npm install
npm run dev        # http://127.0.0.1:3000
npm run build      # production build in dist/
npm run typecheck
```

`RUN_AEROMATRIX.bat` in the parent folder does the install and starts this site together with the web app.

## Pages and sections

One route (`src/routes/index.tsx`) with the sections in `src/components/`:

| Section | File | Anchor |
| --- | --- | --- |
| Nav | `Nav.tsx` | |
| Hero, with `HeroScene` (animated clouds and a drawn skyline) | `Hero.tsx`, `HeroScene.tsx` | `#top` |
| Understand | `Spatial.tsx` | `#understand` |
| Predict | `GeoModel.tsx` | `#predict` |
| Simulate | `WhatIf.tsx` | `#simulate` |
| Capabilities | `Capabilities.tsx` | `#capabilities` |
| Closing | `Closing.tsx` | `#start` |

Anchors work as deep links (`/#simulate`). Blocks fade in as they scroll into view (`src/hooks/useReveal.ts`); with reduced motion
turned on, or without JavaScript, everything is simply visible.

## Links into the web app

"Explore the System" opens `VITE_APP_URL` (default `http://localhost:5173`). The "Model in AeroMatrix" links add `#<section>` (for
example `#sensors`, `#simulator`), which the web app reads at startup and opens that panel. See `src/lib/links.ts`.

## Images

Seven pictures are optional. Put JPGs with these names in `src/assets/` and they are used automatically:

`card-understand.jpg`, `card-predict.jpg`, `card-simulate.jpg`, `card-act.jpg`, `city-current.jpg`, `city-cleaner.jpg`, `closing-landscape.jpg`

Without them each slot shows a gradient with a small drawn scene of the same size, so the page never has a broken image and the
build works either way (`src/components/ImageSlot.tsx`, using `import.meta.glob`).

## What the page claims

Only what the product does. There are no invented statistics, accuracy figures or user counts. Illustrations are labelled as
illustrations.

## Palette

Cherry Cola and Vanilla Cream, the same as the web app (tokens in `src/styles.css`).
