const API_BASE = '/api'

const KEY_STORAGE = 'bfl_api_key'

export function getApiKey(): string {
  return localStorage.getItem(KEY_STORAGE) || ''
}

export function setApiKey(key: string) {
  localStorage.setItem(KEY_STORAGE, key)
}

export function hasApiKey(): boolean {
  return getApiKey().length > 0
}

export interface GenerationParams {
  prompt: string
  model: string
  input_image?: string
  image_prompt?: string
  width?: number
  height?: number
  steps?: number
  guidance?: number
}

interface SubmitResponse {
  id: string
  polling_url: string
}

interface PollResponse {
  id: string
  status: 'Pending' | 'Ready' | 'Error' | 'Request Moderated' | 'Content Moderated' | 'Task not found'
  result?: {
    sample: string
    prompt: string
  }
}

export const MODELS = [
  { label: 'FLUX.2 [pro]', value: 'flux-2-pro' },
  { label: 'FLUX.2 [max]', value: 'flux-2-max' },
  { label: 'FLUX.2 [flex]', value: 'flux-2-flex' },
  { label: 'FLUX.2 [klein] 9B', value: 'flux-2-klein-9b' },
  { label: 'FLUX.2 [klein] 4B', value: 'flux-2-klein-4b' },
  { label: 'FLUX.1.1 [pro]', value: 'flux-pro-1.1' },
  { label: 'FLUX.1.1 [pro] Ultra', value: 'flux-pro-1.1-ultra' },
] as const

export type ModelValue = typeof MODELS[number]['value']

function authHeaders(): Record<string, string> {
  const key = getApiKey()
  if (!key) throw new Error('No API key set. Add your BFL API key in settings.')
  return { 'x-bfl-key': key }
}

async function submitGeneration(params: GenerationParams): Promise<SubmitResponse> {
  const { model, ...rest } = params
  const res = await fetch(`${API_BASE}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ model, ...rest }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Generation failed: ${res.status} ${text}`)
  }
  return res.json()
}

async function pollResult(pollingUrl: string): Promise<PollResponse> {
  const res = await fetch(`${API_BASE}/result?url=${encodeURIComponent(pollingUrl)}`, {
    headers: authHeaders(),
  })
  const text = await res.text()
  let data: PollResponse
  try {
    data = JSON.parse(text)
  } catch {
    console.error('Poll response not JSON:', res.status, text)
    throw new Error(`Poll failed: ${res.status}`)
  }
  if (!res.ok) {
    console.error('Poll error:', res.status, data)
    throw new Error(`Poll failed: ${res.status}`)
  }
  return data
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

export async function generateImage(
  params: GenerationParams,
  onStatus?: (status: string) => void
): Promise<string> {
  onStatus?.('Submitting...')
  const { polling_url } = await submitGeneration(params)

  let delay = 1000
  const maxDelay = 5000

  while (true) {
    await sleep(delay)
    onStatus?.('Generating...')
    const result = await pollResult(polling_url)

    if (result.status === 'Ready' && result.result?.sample) {
      onStatus?.('Done')
      return result.result.sample
    }

    if (result.status === 'Error' || result.status === 'Request Moderated' ||
        result.status === 'Content Moderated' || result.status === 'Task not found') {
      throw new Error(`Generation failed: ${result.status}`)
    }

    delay = Math.min(delay * 1.5, maxDelay)
  }
}

export function canvasToBase64(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '')
}

export function isFlux2Model(model: string): boolean {
  return model.startsWith('flux-2-')
}
