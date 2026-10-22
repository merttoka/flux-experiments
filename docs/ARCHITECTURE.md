# Architecture

Two FLUX demos (Style Bridge, Reimagined Ecosystems) served as a subpage of lab.merttoka.com. Vite + React + TypeScript
(strict), Vercel serverless functions for the BFL API. Product details and the API-key policy: `README.md`.

## Topology

- Vercel project `bfl-flux-demos`, repo `merttoka/flux-experiments`; `main` deploys on push.
- The Lab (`lab.merttoka.com`, repo `merttoka/portfolio-web-labs`) proxies `/bfl-api/*` here, so the demos run on the
  Lab's origin: they share its `localStorage` (`lab.theme`, the remembered API key) and its root files.
- `vite.config.ts`: `base: '/bfl-api/'` when `VERCEL` is set (`/` in local dev). `vercel.json` rewrites
  `/bfl-api/{api,assets,examples,screenshots,previews}/*` and `/bfl-api/logo.webp` to this project's files and the rest
  of `/bfl-api/*` to the SPA. Anything new in `public/` that the app loads under `/bfl-api/` needs a rewrite here, or
  the SPA's HTML answers it.

## Modules

- `src/main.tsx` — router (basename from `BASE_URL`), `ThemeProvider`, tokens, global CSS.
- `src/App.tsx` — routes: `/` (index, standalone dev only: the Lab links the demos directly), `/flux-style-bridge`,
  `/flux-reimagined-ecosystems`.
- `src/pages/Home.tsx` — the index cards (previews in `public/previews/<slug>/`).
- `src/experiments/flux-style-bridge/` — Style Bridge: presets, Style DNA mixer, A/B compare slider.
- `src/experiments/emergent-worlds/` — Reimagined Ecosystems: the DLA sim (`src/sim/`, WebGPU) captured into FLUX
  img2img; Import/Export of a session in the header.
- `src/lib/` — `bfl.ts` (models, the `/api` client, polling), `galleryDB.ts` (IndexedDB results), `ApiKeyButton` /
  `ApiKeyModal` (the key: `sessionStorage`, or `localStorage` when remembered; `bfl-key-change` event).
- `api/` — `generate.ts` (allowlisted models), `result.ts` (polling, redirects only within BFL, default port only),
  `image-proxy.ts` (FLUX results only: `https://delivery*.bfl.ai`, default port, image types by their bytes; wants the
  `x-bfl-key` header like the others, so no other site can embed it: a custom header needs a CORS preflight these
  functions never grant). 500s say "Upstream request failed" and log the detail. Client side, `fetchResultImage()` in
  `src/lib/bfl.ts` is the one way to call the proxy. A rate limit on `/api/*` lives in the Vercel dashboard (Firewall),
  not in code.

## Header and theme (kept in step with the Lab by hand)

- `src/components/LabHeader.tsx` + `LabHeader.css` — the Lab's header (its `src/components/LabHeader.tsx` and
  `public/lab-header.css`): merttoka.com's floating glass bar, sticky in the flow (`--header-height` 68 px, 62 px at
  768 px and under, the bar's height minus `--header-gap`), the logo (`public/logo.webp`) to merttoka.com, "Lab" and the
  bubbling flask to the Lab's `#diffusion-models` row (the click waits 320 ms for the burst, it's a page load away),
  breadcrumbs, a page's `tools`, the theme button.
- `src/components/headerFit.ts` — out of room (the tools would scroll, or the page's name drops under 72 px), the bar
  drops the logo, then the flask (`is-tight-1`/`is-tight-2`), refit on resize and on any change to its tools.
- `src/components/LabHeaderTools.css` — the shared looks for a page's tools: `.lab-tool`, `.lab-tool.is-primary` (the
  API key button until a key is set), `.lab-tool-seg` (`aria-pressed`), and an icon + `.lab-tool-label` that shows the
  icon alone on a phone.
- `src/theme/` — `tokens.css` (the Lab's palette, drifted: no Toolpath palette), `ThemeProvider.tsx` (follows the OS
  until the button is first clicked, then `lab.theme` = `light`/`dark`; anything else stored follows the OS),
  `ThemeToggle.tsx` (merttoka.com's sun/moon). `index.html`'s inline script applies the theme before the first paint.

## Checks

`npx tsc -b`, `npm run build`, `npm run lint` (5 known errors: `CompareSlider` refs during render, `ApiKeyButton`'s
effect, an unused import in `EmergentWorlds`, `ThemeProvider` exporting a hook).
