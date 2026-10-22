import type { VercelRequest, VercelResponse } from '@vercel/node'

const isBflUrl = (url: URL) => url.protocol === 'https:' && url.hostname.endsWith('.bfl.ai')

// fetch keeps a custom header such as x-key across a redirect to another host, so each hop is followed by hand and
// only while it stays on BFL (image-proxy.ts does the same: each function deploys on its own).
const MAX_HOPS = 3
async function fetchOnBfl(url: string, init: RequestInit): Promise<Response | null> {
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    const response = await fetch(url, { ...init, redirect: 'manual' })
    const location = response.headers.get('location')
    if (response.status < 300 || response.status >= 400 || !location) return response
    const next = new URL(location, url)
    if (!isBflUrl(next)) return null
    url = next.href
  }
  return null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = req.headers['x-bfl-key'] as string
  if (!apiKey) return res.status(401).json({ error: 'API key required' })

  const { url } = req.query
  if (!url || typeof url !== 'string') return res.status(400).json({ error: 'url required' })

  try {
    if (!isBflUrl(new URL(url))) {
      return res.status(400).json({ error: 'Invalid URL: must be https on a .bfl.ai domain' })
    }
  } catch {
    return res.status(400).json({ error: 'Invalid URL' })
  }

  try {
    const response = await fetchOnBfl(url, {
      headers: { 'x-key': apiKey },
      signal: AbortSignal.timeout(15_000),
    })
    if (!response) return res.status(502).json({ error: 'Redirected away from BFL' })

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get('retry-after') ?? '5') || 5
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
