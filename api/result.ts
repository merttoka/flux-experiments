import type { VercelRequest, VercelResponse } from '@vercel/node'

const BFL_API_KEY = process.env.BFL_API_KEY

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  if (!BFL_API_KEY) return res.status(500).json({ error: 'BFL_API_KEY not configured' })

  const { id } = req.query
  if (!id || typeof id !== 'string') return res.status(400).json({ error: 'id required' })

  try {
    const response = await fetch(`https://api.bfl.ai/v1/get_result?id=${encodeURIComponent(id)}`, {
      headers: { 'x-key': BFL_API_KEY },
    })

    const data = await response.json()
    if (!response.ok) return res.status(response.status).json(data)
    return res.status(200).json(data)
  } catch (err: any) {
    return res.status(500).json({ error: err.message })
  }
}
