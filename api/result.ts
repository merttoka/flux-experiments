import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = req.headers['x-bfl-key'] as string
  if (!apiKey) return res.status(401).json({ error: 'API key required' })

  const { url } = req.query
  if (!url || typeof url !== 'string') return res.status(400).json({ error: 'url required' })

  try {
    const response = await fetch(url, {
      headers: { 'x-key': apiKey },
      signal: AbortSignal.timeout(15_000),
    })

    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get('retry-after') ?? '5', 10) || 5
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
