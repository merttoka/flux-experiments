# FLUX Demos

## TypeScript
- Strict mode enabled. No `any` — use proper types or `unknown` for catch clauses.
- Use `err instanceof Error ? err.message : String(err)` pattern for error handling.

## Architecture
- Vercel serverless functions in `api/` proxy BFL API calls (CORS workaround).
- Client provides API key via `x-bfl-key` header — no server-side key.
- Keys stored in `localStorage`.
- WGSL shaders imported via `?raw` suffix.
