import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

function bflProxy(): Plugin {
  return {
    name: 'bfl-api-proxy',
    configureServer(server) {
      server.middlewares.use('/api/generate', async (req, res) => {
        try {
          if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
          const apiKey = req.headers['x-bfl-key'] as string
          if (!apiKey) { res.statusCode = 401; res.end(JSON.stringify({ error: 'API key required' })); return }

          const chunks: Buffer[] = []
          for await (const chunk of req) chunks.push(chunk as Buffer)
          const { model, ...params } = JSON.parse(Buffer.concat(chunks).toString())

          console.log(`[bfl] POST /v1/${model}`)
          const resp = await fetch(`https://api.bfl.ai/v1/${model}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-key': apiKey },
            body: JSON.stringify(params),
          })
          const text = await resp.text()
          console.log(`[bfl] generate response: ${resp.status} ${text.slice(0, 200)}`)
          res.statusCode = resp.status
          res.setHeader('Content-Type', 'application/json')
          res.end(text)
        } catch (err) {
          console.error('[bfl] generate error:', err)
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: String(err) }))
        }
      })

      server.middlewares.use('/api/result', async (req, res) => {
        try {
          const apiKey = req.headers['x-bfl-key'] as string
          if (!apiKey) { res.statusCode = 401; res.end(JSON.stringify({ error: 'API key required' })); return }

          const reqUrl = new URL(req.originalUrl || req.url || '', 'http://localhost')
          const pollingUrl = reqUrl.searchParams.get('url')
          console.log(`[bfl] polling: ${pollingUrl}`)
          const resp = await fetch(pollingUrl!, {
            headers: { 'x-key': apiKey },
          })
          const text = await resp.text()
          console.log(`[bfl] result response: ${resp.status} ${text.slice(0, 200)}`)
          res.statusCode = resp.status
          res.setHeader('Content-Type', 'application/json')
          res.end(text)
        } catch (err) {
          console.error('[bfl] result error:', err)
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: String(err) }))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), bflProxy()],
})
