const API_BASE = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/api`

const KEY_STORAGE = 'bfl_api_key'

export function getApiKey(): string {
  return localStorage.getItem(KEY_STORAGE) || ''
}

export function setApiKey(key: string) {
  localStorage.setItem(KEY_STORAGE, key)
  window.dispatchEvent(new Event('bfl-key-change'))
}

export function clearApiKey() {
  localStorage.removeItem(KEY_STORAGE)
  window.dispatchEvent(new Event('bfl-key-change'))
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
  seed?: number
  safety_tolerance?: number
  output_format?: 'jpeg' | 'png'
  prompt_upsampling?: boolean
  aspect_ratio?: string
  raw?: boolean
  image_prompt_strength?: number
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

async function submitGeneration(params: GenerationParams, signal?: AbortSignal): Promise<SubmitResponse> {
  const { model, ...rest } = params
  const timeout = AbortSignal.timeout(30_000)
  const combinedSignal = signal ? AbortSignal.any([signal, timeout]) : timeout
  let res: Response
  try {
    res = await fetch(`${API_BASE}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ model, ...rest }),
      signal: combinedSignal,
    })
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new Error('Submit request timed out after 30s')
    }
    throw new Error(`Submit failed: ${err instanceof Error ? err.message : String(err)}`)
  }
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Generation failed: ${res.status} ${text}`)
  }
  return res.json()
}

async function pollResult(pollingUrl: string, signal?: AbortSignal): Promise<PollResponse> {
  const timeout = AbortSignal.timeout(15_000)
  const combinedSignal = signal ? AbortSignal.any([signal, timeout]) : timeout
  let res: Response
  try {
    res = await fetch(`${API_BASE}/result?url=${encodeURIComponent(pollingUrl)}`, {
      headers: authHeaders(),
      signal: combinedSignal,
    })
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new Error('Poll request timed out after 15s')
    }
    throw new Error(`Poll failed: ${err instanceof Error ? err.message : String(err)}`)
  }
  if (res.status === 404 || res.status === 410) {
    throw new Error('Polling URL expired')
  }
  if (res.status === 429) {
    const body = await res.json().catch(() => ({})) as { retryAfter?: number }
    const wait = body.retryAfter ?? 5
    await sleep(wait * 1000)
    return pollResult(pollingUrl, signal)
  }
  let data: PollResponse
  try {
    data = await res.json() as PollResponse
  } catch {
    throw new Error(`Poll failed: ${res.status} (non-JSON response)`)
  }
  if (!res.ok) {
    throw new Error(`Poll failed: ${res.status} ${(data as { error?: string }).error ?? JSON.stringify(data)}`)
  }
  return data
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

export async function generateImage(
  params: GenerationParams,
  onStatus?: (status: string) => void,
  signal?: AbortSignal
): Promise<string> {
  onStatus?.('Submitting...')
  const { polling_url } = await submitGeneration(params, signal)

  let delay = 1000
  const maxDelay = 5000
  const maxPollDuration = 10 * 60 * 1000
  const startTime = Date.now()

  while (true) {
    await sleep(delay)

    if (signal?.aborted) {
      throw new Error('Generation aborted')
    }

    if (Date.now() - startTime > maxPollDuration) {
      throw new Error('Generation timed out')
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000)
    onStatus?.(`Generating... ${elapsed}s`)
    const result = await pollResult(polling_url, signal)

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
