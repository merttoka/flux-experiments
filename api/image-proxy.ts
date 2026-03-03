import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const imageUrl = req.query.url as string
  if (!imageUrl) return res.status(400).json({ error: 'url param required' })

  try {
    const response = await fetch(imageUrl, { signal: AbortSignal.timeout(30_000) })
    if (!response.ok) return res.status(response.status).end()

    const ct = response.headers.get('content-type')
    if (ct) res.setHeader('Content-Type', ct)
    res.setHeader('Cache-Control', 'public, max-age=86400')
    const buf = Buffer.from(await response.arrayBuffer())
    return res.status(200).send(buf)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return res.status(500).json({ error: message })
  }
}
