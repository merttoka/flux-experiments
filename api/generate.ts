import type { VercelRequest, VercelResponse } from '@vercel/node'

// Keep in sync with src/lib/bfl.ts MODELS array
const ALLOWED_MODELS: ReadonlySet<string> = new Set([
  'flux-2-pro', 'flux-2-max', 'flux-2-flex',
  'flux-2-klein-9b', 'flux-2-klein-4b',
  'flux-pro-1.1', 'flux-pro-1.1-ultra',
])

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = req.headers['x-bfl-key'] as string
  if (!apiKey) return res.status(401).json({ error: 'API key required. Set your BFL key in settings.' })

  const { model, ...params } = req.body
  if (!model) return res.status(400).json({ error: 'model required' })
  if (!ALLOWED_MODELS.has(model)) return res.status(400).json({ error: 'Invalid model' })

  try {
    const response = await fetch(`https://api.bfl.ai/v1/${model}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-key': apiKey,
      },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(30_000),
    })

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get('retry-after')) || 5
      return res.status(429).json({ error: 'Rate limited', retryAfter })
    }

    const data = await response.json()
    if (!response.ok) return res.status(response.status).json(data)
    return res.status(200).json(data)
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      return res.status(504).json({ error: 'Upstream timeout' })
    }
    const message = err instanceof Error ? err.message : String(err)
    return res.status(500).json({ error: message })
  }
}
