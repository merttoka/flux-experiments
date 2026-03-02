# FLUX Demos

Two interactive demos for BFL's FLUX image generation models. Vite+React+TS, deployed to Vercel.

## Demos

### FLUX Style Bridge (`/flux-style-bridge`)
Upload an image and transform it through curated style presets (bioluminescent, brutalist, Dutch masters, etc.) using FLUX img2img. Or go text-only.

### Emergent Worlds (`/emergent-worlds`)
A WebGPU DLA (Diffusion-Limited Aggregation) simulation runs in real-time. Capture screenshots and send them to FLUX for artistic reinterpretation. Prompts auto-update based on the simulation's growth stage.

## Setup

```bash
npm install
npm run dev
```

## API Key

Users provide their own BFL API key via the in-app settings button. Keys are stored in `localStorage` and passed through the serverless proxy — never stored server-side. Get a key at [api.bfl.ai](https://api.bfl.ai).

## Deploy

```bash
npx vercel --prod
```

No server-side environment variables needed.

## Stack
- Vite + React + TypeScript
- WebGPU (DLA simulation)
- Vercel serverless functions (BFL API proxy)
- BFL FLUX.2 / FLUX.1.1 models
