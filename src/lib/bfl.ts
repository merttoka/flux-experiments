const API_BASE = '/api'

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
  polling_url?: string
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

async function submitGeneration(params: GenerationParams): Promise<SubmitResponse> {
  const { model, ...rest } = params
  const res = await fetch(`${API_BASE}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, ...rest }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Generation failed: ${res.status} ${text}`)
  }
  return res.json()
}

async function pollResult(id: string): Promise<PollResponse> {
  const res = await fetch(`${API_BASE}/result?id=${encodeURIComponent(id)}`)
  if (!res.ok) throw new Error(`Poll failed: ${res.status}`)
  return res.json()
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

export async function generateImage(
  params: GenerationParams,
  onStatus?: (status: string) => void
): Promise<string> {
  onStatus?.('Submitting...')
  const { id } = await submitGeneration(params)

  let delay = 1000
  const maxDelay = 5000

  while (true) {
    await sleep(delay)
    onStatus?.('Generating...')
    const result = await pollResult(id)

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
