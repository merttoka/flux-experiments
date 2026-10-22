import type { VercelRequest, VercelResponse } from '@vercel/node'

// FLUX results only. BFL serves them from delivery*.bfl.ai without CORS (docs.bfl.ai), hence this proxy. It answers
// on lab.merttoka.com too, where visitors keep their BFL key, so it fetches nothing else and passes on nothing but an
// image the browser can't run as a page.
const MAX_BYTES = 20 * 1024 * 1024

// The type comes from the file's own first bytes, not the upstream label.
const imageType = (b: Buffer): string | null => {
  if (b.length >= 4 && b[0] === 0x89 && b.toString('latin1', 1, 4) === 'PNG') return 'image/png'
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.length >= 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'image/webp'
  return null
}

const isResultUrl = (raw: string): boolean => {
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' && url.port === '' && url.hostname.startsWith('delivery') && url.hostname.endsWith('.bfl.ai')
  } catch {
    return false
  }
}

// Each redirect is followed only while it stays on BFL's hosts, a few hops at most; null when one leaves or loops
// (result.ts does the same: each function deploys on its own).
const MAX_HOPS = 3
async function fetchResult(url: string, signal: AbortSignal): Promise<Response | null> {
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    const response = await fetch(url, { redirect: 'manual', signal })
    const location = response.headers.get('location')
    if (response.status < 300 || response.status >= 400 || !location) return response
    url = new URL(location, url).href
    if (!isResultUrl(url)) return null
  }
  return null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  // The key isn't checked here (BFL does that on generate/result), but asking for it keeps other sites from
  // embedding the proxy: a custom header needs a CORS preflight this API never grants.
  if (!req.headers['x-bfl-key']) return res.status(401).json({ error: 'API key required' })

  const imageUrl = req.query.url
  if (typeof imageUrl !== 'string' || !isResultUrl(imageUrl)) {
    return res.status(400).json({ error: 'url must be a FLUX result (https, delivery*.bfl.ai)' })
  }

  try {
    const response = await fetchResult(imageUrl, AbortSignal.timeout(30_000))
    if (!response) return res.status(502).json({ error: 'Redirected away from BFL' })
    if (!response.ok) return res.status(response.status).end()

    if (Number(response.headers.get('content-length') ?? 0) > MAX_BYTES) return res.status(413).json({ error: 'Image too large' })
    const buf = Buffer.from(await response.arrayBuffer())
    if (buf.length > MAX_BYTES) return res.status(413).json({ error: 'Image too large' })
    const type = imageType(buf)
    if (!type) return res.status(415).json({ error: 'Not an image' })

    res.setHeader('Content-Type', type)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox")
    // The signed result URLs last 10 minutes; the client keeps a data URL, so no shared cache needs this.
    res.setHeader('Cache-Control', 'private, max-age=600')
    return res.status(200).send(buf)
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'TimeoutError') return res.status(504).json({ error: 'Upstream timeout' })
    console.error('[image-proxy]', err instanceof Error ? err.message : String(err))
    return res.status(502).json({ error: 'Could not fetch the image' })
  }
}
