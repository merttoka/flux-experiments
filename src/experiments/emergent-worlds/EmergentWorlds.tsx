import { useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef, type MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { generateImage, hasApiKey, canvasToBase64, MODELS, isFlux2Model, type ModelValue, type GenerationParams } from '../../lib/bfl'
import { init, type SimHandle, type SimConfig } from '../../sim/dla-advanced/simulation'
import { DEFAULT_PROMPT, buildStructureSuffix, STRUCTURE_SUFFIX_TIP } from './prompts'
import { presets as stylePresets } from '../flux-style-bridge/presets'
import JSZip from 'jszip'

const STORAGE_KEY = 'ew-settings'

interface PersistedSettings {
  model: ModelValue
  seedCount: number
  speed: number
  autoCapture: boolean
  captureInterval: number
  dofExponent: number
  dofFocus: number
  dofRadius: number
  dofIterations: number
  stoppedR: number
  stoppedG: number
  stoppedB: number
  fadeRate: number
  sizeMode: 'default' | 'custom'
  width: number
  height: number
  aspectRatio: string
  steps: number
  guidance: number
  outputFormat: 'jpeg' | 'png'
  safetyTolerance: number
  promptUpsampling: boolean
  raw: boolean
  imagePromptStrength: number
  dsWidth: number
  dsHeight: number
  simWidth: number
  simHeight: number
}

function loadSettings(): Partial<PersistedSettings> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) as Partial<PersistedSettings> : {}
  } catch { return {} }
}

function saveSettings(s: PersistedSettings) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)) } catch { /* quota */ }
}

const saved = loadSettings()

function Tip({ text, align = 'center' }: { text: string; align?: 'center' | 'top-left' }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const onEnter = (e: ReactMouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setPos({ x: rect.left + rect.width / 2, y: rect.top })
  }
  return (
    <>
      <span
        className="tip"
        onMouseEnter={onEnter}
        onMouseLeave={() => setPos(null)}
      >?</span>
      {pos && createPortal(
        <div style={{
          position: 'fixed',
          left: pos.x,
          top: pos.y - 6,
          transform: align === 'top-left' ? 'translate(-100%, -100%)' : 'translate(-50%, -100%)',
          background: '#222',
          border: '1px solid var(--border)',
          borderRadius: 6,
          padding: '0.4rem 0.6rem',
          fontSize: '0.7rem',
          fontFamily: 'var(--font-body)',
          color: 'var(--text-secondary)',
          width: align === 'top-left' ? 360 : undefined,
          maxWidth: 360,
          lineHeight: 1.4,
          zIndex: 9999,
          pointerEvents: 'none',
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        }}>{text}</div>,
        document.body
      )}
    </>
  )
}

// Model capability sets
const MODELS_WITH_GUIDANCE = new Set(['flux-2-flex'])
const MODELS_WITH_UPSAMPLING = new Set(['flux-2-flex', 'flux-pro-1.1', 'flux-pro-1.1-ultra'])
const MODELS_WITH_ASPECT_RATIO = new Set(['flux-pro-1.1-ultra'])
const MODELS_WITH_DIMENSIONS = new Set(['flux-2-pro', 'flux-2-max', 'flux-2-flex', 'flux-2-klein-9b', 'flux-2-klein-4b', 'flux-pro-1.1'])
const MODELS_WITH_RAW = new Set(['flux-pro-1.1-ultra'])
const MODELS_WITH_IMG_STRENGTH = new Set(['flux-pro-1.1-ultra'])
const MODELS_WITH_IMG2IMG = new Set(['flux-2-pro', 'flux-2-max', 'flux-2-flex', 'flux-pro-1.1-ultra'])

const ASPECT_RATIOS = ['21:9', '16:9', '3:2', '4:3', '1:1', '3:4', '2:3', '9:16', '9:21']

const PARAM_MATRIX: { param: string; models: Record<string, boolean> }[] = [
  { param: 'txt2img', models: { 'Pro': true, 'Max': true, 'Flex': true, 'Klein': true, '1.1 Pro': true, '1.1 Ultra': true } },
  { param: 'img2img', models: { 'Pro': true, 'Max': true, 'Flex': true, 'Klein': false, '1.1 Pro': false, '1.1 Ultra': true } },
  { param: 'width/height', models: { 'Pro': true, 'Max': true, 'Flex': true, 'Klein': true, '1.1 Pro': true, '1.1 Ultra': false } },
  { param: 'aspect_ratio', models: { 'Pro': false, 'Max': false, 'Flex': false, 'Klein': false, '1.1 Pro': false, '1.1 Ultra': true } },
  { param: 'steps', models: { 'Pro': false, 'Max': false, 'Flex': true, 'Klein': false, '1.1 Pro': false, '1.1 Ultra': false } },
  { param: 'guidance', models: { 'Pro': false, 'Max': false, 'Flex': true, 'Klein': false, '1.1 Pro': false, '1.1 Ultra': false } },
  { param: 'seed', models: { 'Pro': true, 'Max': true, 'Flex': true, 'Klein': true, '1.1 Pro': true, '1.1 Ultra': true } },
  { param: 'safety_tolerance', models: { 'Pro': true, 'Max': true, 'Flex': true, 'Klein': true, '1.1 Pro': true, '1.1 Ultra': true } },
  { param: 'output_format', models: { 'Pro': true, 'Max': true, 'Flex': true, 'Klein': true, '1.1 Pro': true, '1.1 Ultra': true } },
  { param: 'prompt_upsampling', models: { 'Pro': false, 'Max': false, 'Flex': true, 'Klein': false, '1.1 Pro': true, '1.1 Ultra': true } },
  { param: 'raw', models: { 'Pro': false, 'Max': false, 'Flex': false, 'Klein': false, '1.1 Pro': false, '1.1 Ultra': true } },
  { param: 'img_prompt_strength', models: { 'Pro': false, 'Max': false, 'Flex': false, 'Klein': false, '1.1 Pro': false, '1.1 Ultra': true } },
]
const MODEL_COLUMNS = ['Pro', 'Max', 'Flex', 'Klein', '1.1 Pro', '1.1 Ultra']

// Pricing
const IMG2IMG_COST: Record<string, { perMP: number } | { perImage: number } | null> = {
  'flux-2-pro': { perMP: 0.045 },
  'flux-2-max': { perMP: 0.07 },
  'flux-2-flex': { perMP: 0.10 },
  'flux-2-klein-9b': null,
  'flux-2-klein-4b': null,
  'flux-pro-1.1': null,
  'flux-pro-1.1-ultra': { perImage: 0.06 },
}

const DOWNSAMPLE_OPTIONS = [256, 384, 512, 768, 1024]

function calcCost(model: string, dsW: number, dsH: number, frameCount: number): { mp: number; cost: number; breakdown: string } | null {
  const pricing = IMG2IMG_COST[model]
  if (!pricing) return null
  const mp = (dsW * dsH) / 1_000_000
  if ('perImage' in pricing) {
    const cost = pricing.perImage * frameCount
    return { mp, cost, breakdown: `$${pricing.perImage}/img × ${frameCount}` }
  }
  const costPerFrame = pricing.perMP * mp
  const cost = costPerFrame * frameCount
  return { mp, cost, breakdown: `$${pricing.perMP}/MP × ${mp.toFixed(2)}MP × ${frameCount}` }
}

async function downsampleImage(dataUrl: string, w: number, h: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('no 2d context')); return }
      // Composite onto black — sim frames have transparent backgrounds
      ctx.fillStyle = '#000000'
      ctx.fillRect(0, 0, w, h)
      ctx.drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, ''))
    }
    img.onerror = () => reject(new Error('image load failed'))
    img.src = dataUrl
  })
}

/** Fetch a URL image and return as base64 PNG (for passing previous AI frames). */
async function urlToBase64(url: string, w: number, h: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('no 2d context')); return }
      ctx.drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, ''))
    }
    img.onerror = () => reject(new Error('failed to load AI frame for reference'))
    img.src = url
  })
}

// IndexedDB helpers
const IDB_NAME = 'ew-db'
const IDB_STORE = 'ew-session'
const IDB_VERSION = 1

interface CapturedFrame {
  dataUrl: string
  frame: number
  timestamp: number
  fps: number
  speed: number
  seedCount: number
  resolution: number
  agentCount: number
}

interface SessionData {
  capturedFrames: CapturedFrame[]
  aiFrames: (string | null)[]
  prompt: string
  model: ModelValue
  timestamp: number
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function saveSession(data: SessionData): Promise<void> {
  try {
    const db = await openDB()
    const tx = db.transaction(IDB_STORE, 'readwrite')
    tx.objectStore(IDB_STORE).put(data, 'current')
    db.close()
  } catch { /* silent */ }
}

async function loadSession(): Promise<SessionData | null> {
  try {
    const db = await openDB()
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly')
      const req = tx.objectStore(IDB_STORE).get('current')
      req.onsuccess = () => { db.close(); resolve(req.result as SessionData | null ?? null) }
      req.onerror = () => { db.close(); resolve(null) }
    })
  } catch { return null }
}

async function clearSessionDB(): Promise<void> {
  try {
    const db = await openDB()
    const tx = db.transaction(IDB_STORE, 'readwrite')
    tx.objectStore(IDB_STORE).delete('current')
    db.close()
  } catch { /* silent */ }
}

// Keyboard shortcut descriptions
const SPEED_OPTIONS = [8, 5, 3, 2, 1, 0.75, 0.5, 0.25, 0.1]

const SHORTCUTS: [string, string][] = [
  ['Space', 'Pause / Resume sim'],
  ['\u2191 / \u2193', 'Speed up / slow down'],
  ['C', 'Capture frame'],
  ['T', 'Transform untransformed'],
  ['R', 'Reset simulation'],
  ['X', 'Clear all captures + AI'],
  ['E', 'Export session'],
  ['\\', 'Hold to show shortcuts'],
]

function flashButton(key: string) {
  const el = document.querySelector(`[data-shortcut="${key}"]`) as HTMLElement | null
  if (!el) return
  el.style.borderColor = 'var(--accent)'
  el.style.color = 'var(--accent)'
  el.style.transform = 'scale(0.95)'
  requestAnimationFrame(() => {
    setTimeout(() => {
      el.style.borderColor = ''
      el.style.color = ''
      el.style.transform = ''
    }, 150)
  })
}

export interface EmergentWorldsHandle {
  doExport: () => Promise<void>
  doImport: () => void
}

const EmergentWorlds = forwardRef<EmergentWorldsHandle>(function EmergentWorlds(_props, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const simRef = useRef<SimHandle | null>(null)
  const captureStripRef = useRef<HTMLDivElement>(null)
  const aiStripRef = useRef<HTMLDivElement>(null)
  const scrollingRef = useRef(false)
  const transformAbortRef = useRef<AbortController | null>(null)
  const pauseAfterFrameRef = useRef<number | null>(null)
  const visualRef = useRef<HTMLDivElement>(null)
  const advancedRef = useRef<HTMLDivElement>(null)
  const advancedToggleRef = useRef<HTMLDivElement>(null)

  const [model, setModel] = useState<ModelValue>(saved.model ?? 'flux-2-pro')
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT)
  const [stylePreset, setStylePreset] = useState('')
  const [frameCount, setFrameCount] = useState(0)
  const [status, setStatus] = useState('')
  const [lightbox, setLightbox] = useState<number | null>(null)
  const [simReady, setSimReady] = useState(false)
  const [hasKey, setHasKey] = useState(hasApiKey())

  useEffect(() => {
    const onKeyChange = () => setHasKey(hasApiKey())
    window.addEventListener('bfl-key-change', onKeyChange)
    return () => window.removeEventListener('bfl-key-change', onKeyChange)
  }, [])
  const [simError, setSimError] = useState<string | null>(null)
  const [simStats, setSimStats] = useState({ resolution: 0, simWidth: 0, simHeight: 0, agentCount: 0 })
  const [fps, setFps] = useState(0)
  const lastFrameRef = useRef(0)

  // Visual controls
  const [visualOpen, setVisualOpen] = useState(false)
  const [dofExponent, setDofExponent] = useState(saved.dofExponent ?? 0.9)
  const [dofFocus, setDofFocus] = useState(saved.dofFocus ?? 1.4)
  const [dofRadius, setDofRadius] = useState(saved.dofRadius ?? 0.8)
  const [dofIterations, setDofIterations] = useState(saved.dofIterations ?? 30)
  const [stoppedR, setStoppedR] = useState(saved.stoppedR ?? 0.01)
  const [stoppedG, setStoppedG] = useState(saved.stoppedG ?? 0.8)
  const [stoppedB, setStoppedB] = useState(saved.stoppedB ?? 1.3)
  const [fadeRate, setFadeRate] = useState(saved.fadeRate ?? 0.20)

  // Sim params
  const [seedCount, setSeedCount] = useState(saved.seedCount ?? 1)
  const [speed, setSpeed] = useState(saved.speed ?? 1)
  const [simWidth, setSimWidth] = useState(saved.simWidth ?? 640)
  const [simHeight, setSimHeight] = useState(saved.simHeight ?? 640)
  const [simDimCustom, setSimDimCustom] = useState(false) // true when text fields edited

  // Frame capture
  const [capturedFrames, setCapturedFrames] = useState<CapturedFrame[]>([])
  const [captureInterval, setCaptureInterval] = useState(saved.captureInterval ?? 1000)
  const [autoCapture, setAutoCapture] = useState(saved.autoCapture ?? false)
  const [paused, setPaused] = useState(false)
  const lastCaptureFrameRef = useRef(0)

  // AI frames — parallel to capturedFrames
  const [aiFrames, setAiFrames] = useState<(string | null)[]>([])
  const [transforming, setTransforming] = useState(false)
  const [transformMode, setTransformMode] = useState<'chained' | 'parallel'>('parallel')
  const [transformIndex, setTransformIndex] = useState(-1)

  // Downsample
  const [dsWidth, setDsWidth] = useState(saved.dsWidth ?? 512)
  const [dsHeight, setDsHeight] = useState(saved.dsHeight ?? 512)

  // Shortcuts overlay
  const [showShortcuts, setShowShortcuts] = useState(false)

  // Discard confirmation
  const [discardConfirm, setDiscardConfirm] = useState<{ action: () => void } | null>(null)

  // Advanced settings
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [sizeMode, setSizeMode] = useState<'default' | 'custom'>(saved.sizeMode ?? 'default')
  const [width, setWidth] = useState(saved.width ?? 1024)
  const [height, setHeight] = useState(saved.height ?? 768)
  const [aspectRatio, setAspectRatio] = useState(saved.aspectRatio ?? '16:9')
  const [steps, setSteps] = useState(saved.steps ?? 50)
  const [guidance, setGuidance] = useState(saved.guidance ?? 5)
  const [seed, setSeed] = useState<number | null>(null)
  const [outputFormat, setOutputFormat] = useState<'jpeg' | 'png'>(saved.outputFormat ?? 'jpeg')
  const [safetyTolerance, setSafetyTolerance] = useState(saved.safetyTolerance ?? 2)
  const [promptUpsampling, setPromptUpsampling] = useState(saved.promptUpsampling ?? true)
  const [raw, setRaw] = useState(saved.raw ?? false)
  const [imagePromptStrength, setImagePromptStrength] = useState(saved.imagePromptStrength ?? 0.1)
  const [helpPos, setHelpPos] = useState<{ x: number; y: number } | null>(null)
  const [advancedPos, setAdvancedPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })

  // Persist settings to localStorage
  useEffect(() => {
    saveSettings({
      model, seedCount, speed, autoCapture, captureInterval,
      dofExponent, dofFocus, dofRadius, dofIterations,
      stoppedR, stoppedG, stoppedB, fadeRate,
      sizeMode, width, height, aspectRatio, steps, guidance,
      outputFormat, safetyTolerance, promptUpsampling, raw, imagePromptStrength,
      dsWidth, dsHeight, simWidth, simHeight,
    })
  }, [
    model, seedCount, speed, autoCapture, captureInterval,
    dofExponent, dofFocus, dofRadius, dofIterations,
    stoppedR, stoppedG, stoppedB, fadeRate,
    sizeMode, width, height, aspectRatio, steps, guidance,
    outputFormat, safetyTolerance, promptUpsampling, raw, imagePromptStrength,
    dsWidth, dsHeight, simWidth, simHeight,
  ])

  // Reset/clamp values when model changes
  useEffect(() => {
    const maxSafety = model === 'flux-pro-1.1' ? 6 : 5
    setSafetyTolerance(prev => Math.min(prev, maxSafety))
    if (MODELS_WITH_UPSAMPLING.has(model)) {
      setPromptUpsampling(model === 'flux-2-flex')
    }
    if (!MODELS_WITH_RAW.has(model)) setRaw(false)
    if (!MODELS_WITH_GUIDANCE.has(model)) {
      setSteps(50)
      setGuidance(5)
    }
  }, [model])

  // Load session from IndexedDB on mount
  useEffect(() => {
    loadSession().then(session => {
      if (session) {
        setCapturedFrames(session.capturedFrames)
        setAiFrames(session.aiFrames)
        setPrompt(session.prompt)
        setModel(session.model)
      }
    })
  }, [])

  // Auto-save session after captures/transforms change
  useEffect(() => {
    if (capturedFrames.length === 0 && aiFrames.length === 0) return
    saveSession({ capturedFrames, aiFrames, prompt, model, timestamp: Date.now() })
  }, [capturedFrames, aiFrames, prompt, model])

  const captureFrame = useCallback(() => {
    if (!simRef.current) return
    const canvas = simRef.current.canvas
    const dataUrl = canvas.toDataURL('image/png')
    const frame = simRef.current.getFrame()
    setCapturedFrames(prev => [...prev, {
      dataUrl,
      frame,
      timestamp: Date.now(),
      fps,
      speed,
      seedCount,
      resolution: simStats.resolution,
      agentCount: simStats.agentCount,
    }])
    setAiFrames(prev => [...prev, null])
  }, [fps, speed, seedCount, simStats])

  const hasSessionData = capturedFrames.length > 0 || aiFrames.some(f => f !== null)

  const doClearAll = useCallback(() => {
    setCapturedFrames([])
    setAiFrames([])
    if (transformAbortRef.current) transformAbortRef.current.abort()
    setTransforming(false)
    setTransformIndex(-1)
    setStatus('')
    clearSessionDB()
  }, [])

  const deleteFrame = useCallback((index: number) => {
    setCapturedFrames(prev => prev.filter((_, i) => i !== index))
    setAiFrames(prev => prev.filter((_, i) => i !== index))
  }, [])

  const confirmOrDo = useCallback((action: () => void) => {
    if (hasSessionData) {
      setDiscardConfirm({ action })
    } else {
      action()
    }
  }, [hasSessionData])

  const startSim = useCallback(async (config?: Partial<SimConfig>) => {
    if (!canvasRef.current) return
    if (simRef.current) {
      simRef.current.cleanup()
      simRef.current = null
    }
    setSimReady(false)
    setFrameCount(0)
    lastFrameRef.current = 0
    lastCaptureFrameRef.current = 0

    try {
      const handle = await init(canvasRef.current, {
        width: config?.width ?? simWidth,
        height: config?.height ?? simHeight,
        seedCount: config?.seedCount ?? seedCount,
        speed: config?.speed ?? speed,
      })
      simRef.current = handle
      handle.setDofParams(dofExponent, dofFocus, dofRadius, dofIterations)
      handle.setColorParams(stoppedR, stoppedG, stoppedB, fadeRate)
      if (paused) pauseAfterFrameRef.current = 20
      setSimStats({ resolution: handle.resolution, simWidth: handle.simWidth, simHeight: handle.simHeight, agentCount: handle.agentCount })
      setSimReady(true)
    } catch (err: unknown) {
      setSimError(err instanceof Error ? err.message : 'WebGPU not supported')
    }
  }, [seedCount, speed, simWidth, simHeight, paused, dofExponent, dofFocus, dofRadius, dofIterations, stoppedR, stoppedG, stoppedB, fadeRate])

  // Init sim on mount
  useEffect(() => {
    startSim()
    return () => {
      if (simRef.current) simRef.current.cleanup()
      simRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update frame counter + auto-capture
  useEffect(() => {
    if (!simReady) return
    const interval = setInterval(() => {
      if (!simRef.current) return
      const frame = simRef.current.getFrame()
      setFps(frame - lastFrameRef.current)
      lastFrameRef.current = frame
      setFrameCount(frame)

      // Deferred pause after reset
      if (pauseAfterFrameRef.current !== null && frame >= pauseAfterFrameRef.current) {
        pauseAfterFrameRef.current = null
        simRef.current!.setSpeed(0)
        setPaused(true)
      }

      // Auto-capture
      if (autoCapture && captureInterval > 0 && frame - lastCaptureFrameRef.current >= captureInterval) {
        lastCaptureFrameRef.current = frame
        const canvas = simRef.current!.canvas
        const dataUrl = canvas.toDataURL('image/png')
        setCapturedFrames(prev => [...prev, {
          dataUrl,
          frame,
          timestamp: Date.now(),
          fps: frame - (lastFrameRef.current - (frame - lastFrameRef.current)),
          speed,
          seedCount,
          resolution: simRef.current!.resolution,
          agentCount: simRef.current!.agentCount,
        }])
        setAiFrames(prev => [...prev, null])
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [simReady, captureInterval, autoCapture, speed, seedCount])

  // Build generation params for a single frame
  const buildParams = useCallback(async (
    inputBase64: string,
    batchSeed: number,
    refDataUrl?: string | null,
  ): Promise<GenerationParams> => {
    let hasRefImage = false
    let refBase64: string | undefined
    if (isFlux2Model(model) && refDataUrl) {
      try {
        refBase64 = await urlToBase64(refDataUrl, dsWidth, dsHeight)
        hasRefImage = true
      } catch { /* skip */ }
    }

    const fullPrompt = prompt + buildStructureSuffix(hasRefImage)
    const params: GenerationParams = {
      prompt: fullPrompt,
      model,
      ...(isFlux2Model(model) ? { input_image: inputBase64 } : { image_prompt: inputBase64 }),
    }
    if (refBase64) params.input_image_2 = refBase64

    if (sizeMode === 'custom') {
      if (MODELS_WITH_DIMENSIONS.has(model)) { params.width = width; params.height = height }
      if (MODELS_WITH_ASPECT_RATIO.has(model)) params.aspect_ratio = aspectRatio
    }
    if (MODELS_WITH_GUIDANCE.has(model)) { params.steps = steps; params.guidance = guidance }
    params.seed = batchSeed
    if (MODELS_WITH_UPSAMPLING.has(model)) params.prompt_upsampling = promptUpsampling
    params.output_format = outputFormat
    params.safety_tolerance = safetyTolerance
    if (MODELS_WITH_RAW.has(model)) params.raw = raw
    if (MODELS_WITH_IMG_STRENGTH.has(model)) params.image_prompt_strength = imagePromptStrength
    return params
  }, [model, prompt, dsWidth, dsHeight, sizeMode, width, height, aspectRatio, steps, guidance, outputFormat, safetyTolerance, promptUpsampling, raw, imagePromptStrength])

  // Fetch AI image and convert to data URL
  const fetchAsDataUrl = useCallback(async (imageUrl: string): Promise<string> => {
    try {
      const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(imageUrl)}`
      const res = await fetch(proxyUrl)
      const blob = await res.blob()
      return await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.readAsDataURL(blob)
      })
    } catch {
      return imageUrl
    }
  }, [])

  // Transform batch
  const doTransform = useCallback(async () => {
    if (transforming || capturedFrames.length === 0) return
    if (!MODELS_WITH_IMG2IMG.has(model)) return

    const abort = new AbortController()
    transformAbortRef.current = abort
    setTransforming(true)
    setStatus('')

    const batchSeed = seed ?? Math.floor(Math.random() * 2_147_483_647)
    const toProcess = capturedFrames
      .map((_, i) => i)
      .filter(i => aiFrames[i] === null || aiFrames[i] === undefined)

    if (toProcess.length === 0) { setTransforming(false); return }

    try {
      if (transformMode === 'chained') {
        // Chained: feed (n-1)th AI output as input for nth frame
        let prevAiDataUrl: string | null = null
        // Find the last existing AI frame before our batch starts
        for (let j = toProcess[0] - 1; j >= 0; j--) {
          if (aiFrames[j]) { prevAiDataUrl = aiFrames[j]; break }
        }

        for (let k = 0; k < toProcess.length; k++) {
          if (abort.signal.aborted) break
          const i = toProcess[k]
          setTransformIndex(i)
          const statusCb = (s: string) => setStatus(`[${k + 1}/${toProcess.length}] ${s}`)

          // First untransformed frame uses its sim capture; rest use previous AI output
          const inputSrc = (prevAiDataUrl && k > 0) ? prevAiDataUrl : capturedFrames[i].dataUrl
          const inputBase64 = await downsampleImage(inputSrc, dsWidth, dsHeight)
          const refForPrompt = (k === 0) ? prevAiDataUrl : null
          const params = await buildParams(inputBase64, batchSeed, refForPrompt)

          const imageUrl = await generateImage(params, statusCb, abort.signal)
          const dataUrl = await fetchAsDataUrl(imageUrl)

          prevAiDataUrl = dataUrl
          setAiFrames(prev => { const next = [...prev]; next[i] = dataUrl; return next })
        }
      } else {
        // Parallel: all frames use their own sim capture, fire concurrently
        const total = toProcess.length
        let completed = 0

        const processFrame = async (i: number) => {
          if (abort.signal.aborted) return
          const inputBase64 = await downsampleImage(capturedFrames[i].dataUrl, dsWidth, dsHeight)
          const params = await buildParams(inputBase64, batchSeed)
          const statusCb = (s: string) => {
            completed++
            setStatus(`[${Math.min(completed, total)}/${total}] ${s}`)
          }
          const imageUrl = await generateImage(params, statusCb, abort.signal)
          const dataUrl = await fetchAsDataUrl(imageUrl)
          setAiFrames(prev => { const next = [...prev]; next[i] = dataUrl; return next })
        }

        await Promise.all(toProcess.map(i => processFrame(i)))
      }
      setStatus('Transform complete')
    } catch (err: unknown) {
      if (abort.signal.aborted) {
        setStatus('Transform cancelled')
      } else {
        setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`)
      }
    } finally {
      setTransforming(false)
      setTransformIndex(-1)
      transformAbortRef.current = null
    }
  }, [transforming, capturedFrames, aiFrames, model, seed, transformMode, dsWidth, dsHeight, buildParams, fetchAsDataUrl])

  // Export session
  const doExport = useCallback(async () => {
    if (capturedFrames.length === 0) return
    setStatus('Exporting...')
    try {
      const zip = new JSZip()
      // Helper: convert any URL (data:, blob:, http) to a Blob
      const toBlob = async (url: string): Promise<Blob> => {
        if (url.startsWith('data:') || url.startsWith('blob:')) {
          const res = await fetch(url)
          return res.blob()
        }
        const res = await fetch(`/api/image-proxy?url=${encodeURIComponent(url)}`)
        return res.blob()
      }
      // Captures
      for (let i = 0; i < capturedFrames.length; i++) {
        const cf = capturedFrames[i]
        const blob = await toBlob(cf.dataUrl)
        zip.file(`capture-${i}-f${cf.frame}.png`, blob)
      }
      // AI results
      for (let i = 0; i < aiFrames.length; i++) {
        const url = aiFrames[i]
        if (!url) continue
        try {
          const blob = await toBlob(url)
          const ext = blob.type.includes('png') ? 'png' : 'jpg'
          zip.file(`ai-${i}-f${capturedFrames[i]?.frame ?? i}.${ext}`, blob)
        } catch { /* skip */ }
      }
      // Metadata + settings
      const raw_settings = localStorage.getItem(STORAGE_KEY)
      zip.file('session.json', JSON.stringify({
        prompt,
        model,
        dsWidth,
        dsHeight,
        timestamp: Date.now(),
        settings: raw_settings ? JSON.parse(raw_settings) : {},
        frames: capturedFrames.map((cf, i) => ({
          index: i,
          frame: cf.frame,
          timestamp: cf.timestamp,
          fps: cf.fps,
          speed: cf.speed,
          seedCount: cf.seedCount,
          resolution: cf.resolution,
          agentCount: cf.agentCount,
          hasAi: aiFrames[i] !== null,
        })),
      }, null, 2))

      const blob = await zip.generateAsync({ type: 'blob' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `ew-export-${Date.now()}.zip`
      a.click()
      URL.revokeObjectURL(a.href)
      setStatus('Export complete')
    } catch (err: unknown) {
      setStatus(`Export error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [capturedFrames, aiFrames, prompt, model, dsWidth, dsHeight])

  // Shared zip import logic
  const importFromZip = useCallback(async (blob: Blob, label = 'Import') => {
    setStatus(`${label}ing...`)
    try {
      const zip = await JSZip.loadAsync(blob)
      const sessionFile = zip.file('session.json')
      if (!sessionFile) { setStatus('Invalid archive: no session.json'); return }
      const session = JSON.parse(await sessionFile.async('text'))

      // Restore settings
      if (session.settings) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(session.settings))
        const s = session.settings as Partial<PersistedSettings>
        if (s.model) setModel(s.model)
        if (s.dsWidth) setDsWidth(s.dsWidth)
        if (s.dsHeight) setDsHeight(s.dsHeight)
        if (s.seedCount) setSeedCount(s.seedCount)
        if (s.speed) setSpeed(s.speed)
      }
      if (session.prompt) setPrompt(session.prompt)
      if (session.model) setModel(session.model as ModelValue)

      // Restore frames
      const frames: CapturedFrame[] = []
      const ai: (string | null)[] = []
      const frameMeta: { index: number; frame: number; timestamp: number; fps: number; speed: number; seedCount: number; resolution: number; agentCount: number; hasAi: boolean }[] = session.frames ?? []

      for (const meta of frameMeta) {
        const capFile = zip.file(new RegExp(`^capture-${meta.index}-`))?.[0]
        if (!capFile) continue
        const capBlob = await capFile.async('blob')
        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.readAsDataURL(capBlob)
        })
        frames.push({
          dataUrl,
          frame: meta.frame,
          timestamp: meta.timestamp ?? Date.now(),
          fps: meta.fps ?? 0,
          speed: meta.speed ?? 1,
          seedCount: meta.seedCount ?? 1,
          resolution: meta.resolution ?? 0,
          agentCount: meta.agentCount ?? 0,
        })

        if (meta.hasAi) {
          const aiFile = zip.file(new RegExp(`^ai-${meta.index}-`))?.[0]
          if (aiFile) {
            const aiBlob = await aiFile.async('blob')
            ai.push(URL.createObjectURL(aiBlob))
          } else {
            ai.push(null)
          }
        } else {
          ai.push(null)
        }
      }

      setCapturedFrames(frames)
      setAiFrames(ai)
      setStatus(`${label}ed ${frames.length} frames`)
    } catch (err: unknown) {
      setStatus(`${label} error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [])

  // Import session from zip file picker
  const doImport = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.zip'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      await importFromZip(file, 'Import')
    }
    input.click()
  }, [importFromZip])

  // Load bundled example session
  const loadExample = useCallback(async () => {
    setStatus('Loading example...')
    try {
      const res = await fetch('/examples/emergent-worlds/example.zip')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      await importFromZip(blob, 'Load')
    } catch (err: unknown) {
      setStatus(`Example error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [importFromZip])

  useImperativeHandle(ref, () => ({ doExport, doImport }), [doExport, doImport])

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (lightbox !== null || discardConfirm) return

      if (e.key === '\\') { setShowShortcuts(true); return }

      if (e.key === ' ') {
        e.preventDefault()
        const next = !paused
        setPaused(next)
        if (simRef.current) simRef.current.setSpeed(next ? 0 : speed)
        flashButton('pause')
        return
      }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault()
        const idx = SPEED_OPTIONS.indexOf(speed)
        const nextIdx = e.key === 'ArrowUp'
          ? Math.max(0, idx - 1)           // toward higher speeds (lower index)
          : Math.min(SPEED_OPTIONS.length - 1, idx + 1) // toward lower speeds
        if (nextIdx !== idx) {
          const v = SPEED_OPTIONS[nextIdx]
          setSpeed(v)
          if (simRef.current) simRef.current.setSpeed(paused ? 0 : v)
        }
        flashButton('speed')
        return
      }
      if (e.key.toLowerCase() === 'c') { flashButton('capture'); captureFrame(); return }
      if (e.key.toLowerCase() === 't') { flashButton('transform'); doTransform(); return }
      if (e.key.toLowerCase() === 'r') {
        flashButton('reset')
        confirmOrDo(() => { startSim(); doClearAll() })
        return
      }
      if (e.key.toLowerCase() === 'x') {
        flashButton('clear')
        confirmOrDo(doClearAll)
        return
      }
      if (e.key.toLowerCase() === 'e') { flashButton('export'); doExport(); return }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === '\\') setShowShortcuts(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [paused, speed, lightbox, discardConfirm, captureFrame, doTransform, startSim, doClearAll, confirmOrDo, doExport])

  // Lightbox keyboard navigation
  useEffect(() => {
    if (lightbox === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null)
      if (e.key === 'ArrowLeft' && lightbox > 0)
        setLightbox(lightbox - 1)
      if (e.key === 'ArrowRight' && lightbox < capturedFrames.length - 1)
        setLightbox(lightbox + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox, capturedFrames.length])

  // Close visual panel on outside click
  useEffect(() => {
    if (!visualOpen) return
    const onClick = (e: MouseEvent) => {
      if (visualRef.current && !visualRef.current.contains(e.target as Node)) {
        setVisualOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [visualOpen])

  // Close advanced panel on outside click
  useEffect(() => {
    if (!advancedOpen) return
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node
      if (advancedRef.current?.contains(target)) return
      if (advancedToggleRef.current?.contains(target)) return
      setAdvancedOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [advancedOpen])

  // Scroll sync between strips
  const syncScroll = useCallback((source: 'capture' | 'ai') => {
    if (scrollingRef.current) return
    scrollingRef.current = true
    const from = source === 'capture' ? captureStripRef.current : aiStripRef.current
    const to = source === 'capture' ? aiStripRef.current : captureStripRef.current
    if (from && to) to.scrollLeft = from.scrollLeft
    requestAnimationFrame(() => { scrollingRef.current = false })
  }, [])

  const modelHasImg2Img = MODELS_WITH_IMG2IMG.has(model)
  const untransformedCount = aiFrames.filter((f, i) => (f === null || f === undefined) && i < capturedFrames.length).length
  const transformedCount = aiFrames.filter(f => f !== null).length
  const costInfo = calcCost(model, dsWidth, dsHeight, Math.max(untransformedCount, 1))

  const groupLabelStyle = {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.65rem',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    color: 'var(--text-muted)',
    marginBottom: '0.5rem',
  }

  const sliderLabelStyle = {
    fontSize: '0.75rem',
    color: 'var(--text-muted)',
  }

  const sliderValueStyle = {
    fontSize: '0.75rem',
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-muted)',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* Top: Sim */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        padding: '1rem',
        background: '#050505',
        minWidth: 0,
        minHeight: 0,
        overflow: 'hidden',
      }}>
        {/* Sim controls */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          marginBottom: '0.8rem',
          flexShrink: 0,
          fontFamily: 'var(--font-mono)',
          fontSize: '0.75rem',
        }}>
          {/* Dims . Seeds . Reset */}
          <label style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            Dim
            <select
              value={!simDimCustom && simWidth === simHeight ? simWidth : ''}
              onChange={(e) => {
                const v = Number(e.target.value)
                setSimWidth(v)
                setSimHeight(v)
                setSimDimCustom(false)
                e.target.blur()
              }}
              style={{
                width: 64, padding: '0.2rem 0.3rem', fontSize: '0.75rem',
                opacity: simDimCustom ? 0.35 : 1,
                transition: 'opacity 0.15s',
              }}
            >
              {simDimCustom && <option value="">—</option>}
              {[256, 384, 512, 640, 768, 1024, 1280].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <input
              type="text"
              inputMode="numeric"
              value={simWidth}
              onChange={(e) => { setSimWidth(Number(e.target.value.replace(/\D/g, '')) || 0); setSimDimCustom(true) }}
              onBlur={(e) => { setSimWidth(v => Math.max(128, Math.min(2048, v))); e.target.blur() }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLElement).blur() }}
              style={{ width: 52, padding: '0.15rem 0.3rem', fontSize: '0.7rem', textAlign: 'center' }}
            />
            <span style={{ opacity: 0.35 }}>&times;</span>
            <input
              type="text"
              inputMode="numeric"
              value={simHeight}
              onChange={(e) => { setSimHeight(Number(e.target.value.replace(/\D/g, '')) || 0); setSimDimCustom(true) }}
              onBlur={(e) => { setSimHeight(v => Math.max(128, Math.min(2048, v))); e.target.blur() }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLElement).blur() }}
              style={{ width: 52, padding: '0.15rem 0.3rem', fontSize: '0.7rem', textAlign: 'center' }}
            />
          </label>
          <label style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            Seeds
            <select
              value={seedCount}
              onChange={(e) => { setSeedCount(Number(e.target.value)); e.target.blur() }}
              style={{ width: 52, padding: '0.2rem 0.3rem', fontSize: '0.75rem' }}
            >
              {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <button
            className="btn btn-secondary"
            data-shortcut="reset"
            onClick={() => confirmOrDo(() => { startSim(); doClearAll() })}
            disabled={!simReady && !simError}
            style={{ padding: '0.35rem 0.8rem', fontSize: '0.75rem', transition: 'all 0.15s' }}
          >
            Reset
          </button>
          {/* divider */}
          <span style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />
          {/* Play/Pause . Speed . Visuals */}
          <button
            className="btn btn-secondary"
            data-shortcut="pause"
            onClick={() => {
              const next = !paused
              setPaused(next)
              if (simRef.current) simRef.current.setSpeed(next ? 0 : speed)
            }}
            disabled={!simReady && !simError}
            style={{
              padding: '0.35rem 0.8rem',
              fontSize: '0.75rem',
              color: paused ? '#f59e0b' : undefined,
              borderColor: paused ? '#f59e0b' : undefined,
              transition: 'all 0.15s',
            }}
          >
            {paused ? 'Play' : 'Pause'}
          </button>
          <label style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            Speed
            <select
              value={speed}
              data-shortcut="speed"
              onChange={(e) => {
                const v = Number(e.target.value)
                setSpeed(v)
                if (simRef.current) simRef.current.setSpeed(paused ? 0 : v)
                e.target.blur()
              }}
              style={{ width: 68, padding: '0.2rem 0.3rem', fontSize: '0.75rem', transition: 'all 0.15s' }}
            >
              {SPEED_OPTIONS.map(n => <option key={n} value={n}>{n}x</option>)}
            </select>
          </label>
          <div ref={visualRef} style={{ position: 'relative' }}>
            <button
              className="btn btn-secondary"
              onClick={() => setVisualOpen(!visualOpen)}
              style={{
                padding: '0.35rem 0.8rem',
                fontSize: '0.75rem',
                transition: 'all 0.15s',
                color: visualOpen ? 'var(--accent)' : undefined,
                borderColor: visualOpen ? 'var(--accent)' : undefined,
              }}
            >
              Visual
              <span style={{
                fontSize: '0.6rem',
                marginLeft: '0.15rem',
                transition: 'transform 0.2s',
                transform: visualOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                display: 'inline-block',
              }}>&#9662;</span>
            </button>
            {visualOpen && (
              <div style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: 6,
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '0.75rem',
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '0.75rem',
                fontSize: '0.7rem',
                fontFamily: 'var(--font-mono)',
                zIndex: 40,
                width: 340,
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              }}>
                {/* Column 1: DOF */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <span style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.6rem' }}>Depth of Field</span>
                  {([
                    { label: 'Exp', value: dofExponent, set: setDofExponent, min: 0.1, max: 3.0, step: 0.05 },
                    { label: 'Focus', value: dofFocus, set: setDofFocus, min: 0.0, max: 3.0, step: 0.05 },
                    { label: 'Radius', value: dofRadius, set: setDofRadius, min: 0.0, max: 3.0, step: 0.05 },
                    { label: 'Iter', value: dofIterations, set: setDofIterations, min: 1, max: 60, step: 1 },
                  ] as const).map(s => (
                    <div key={s.label}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                        <span>{s.label}</span>
                        <span>{s.step < 1 ? s.value.toFixed(2) : s.value}</span>
                      </div>
                      <input type="range" min={s.min} max={s.max} step={s.step} value={s.value}
                        onChange={e => {
                          const v = Number(e.target.value)
                          s.set(v)
                          if (simRef.current) simRef.current.setDofParams(
                            s.label === 'Exp' ? v : dofExponent,
                            s.label === 'Focus' ? v : dofFocus,
                            s.label === 'Radius' ? v : dofRadius,
                            s.label === 'Iter' ? v : dofIterations,
                          )
                        }}
                        style={{ width: '100%' }}
                      />
                    </div>
                  ))}
                </div>
                {/* Column 2: Color */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <span style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.6rem' }}>Color</span>
                  {([
                    { label: 'R', value: stoppedR, set: setStoppedR, min: 0, max: 2, step: 0.01 },
                    { label: 'G', value: stoppedG, set: setStoppedG, min: 0, max: 2, step: 0.01 },
                    { label: 'B', value: stoppedB, set: setStoppedB, min: 0, max: 2, step: 0.01 },
                    { label: 'Fade', value: fadeRate, set: setFadeRate, min: 0.01, max: 1.0, step: 0.01 },
                  ] as const).map(s => (
                    <div key={s.label}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                        <span>{s.label}</span>
                        <span>{s.value.toFixed(2)}</span>
                      </div>
                      <input type="range" min={s.min} max={s.max} step={s.step} value={s.value}
                        onChange={e => {
                          const v = Number(e.target.value)
                          s.set(v)
                          if (simRef.current) simRef.current.setColorParams(
                            s.label === 'R' ? v : stoppedR,
                            s.label === 'G' ? v : stoppedG,
                            s.label === 'B' ? v : stoppedB,
                            s.label === 'Fade' ? v : fadeRate,
                          )
                        }}
                        style={{ width: '100%' }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Canvas + Stats */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          {simError ? (
            <div style={{
              color: 'var(--text-muted)',
              textAlign: 'center',
              padding: '2rem',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.85rem',
            }}>
              <p style={{ marginBottom: '0.5rem' }}>WebGPU not available</p>
              <p style={{ fontSize: '0.75rem' }}>{simError}</p>
            </div>
          ) : (
            <div style={{ display: 'inline-flex', flexDirection: 'column', maxWidth: '100%' }}>
              <canvas
                ref={canvasRef}
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                }}
              />
              <div style={{
                alignSelf: 'flex-end',
                marginTop: '0.4rem',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.7rem',
                color: 'var(--text-muted)',
              }}>
                {paused && <><span style={{ color: '#f59e0b' }}>PAUSED</span><span style={{ opacity: 0.35, margin: '0 0.4rem' }}>|</span></>}
                {simStats.simWidth}x{simStats.simHeight}
                <span style={{ opacity: 0.35, margin: '0 0.4rem' }}>|</span>
                f.{frameCount}
                <span style={{ opacity: 0.35, margin: '0 0.4rem' }}>|</span>
                {fps}fps
                <span style={{ opacity: 0.35, margin: '0 0.4rem' }}>|</span>
                {simStats.agentCount.toLocaleString()} agents
              </div>
            </div>
          )}
        </div>

        {/* Capture Timeline */}
        <div style={{
          flexShrink: 0,
          marginTop: '0.6rem',
          borderTop: '1px solid var(--border)',
          paddingTop: '0.5rem',
          minWidth: 0,
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '0.4rem',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.7rem',
            color: 'var(--text-muted)',
            flexWrap: 'wrap',
          }}>
            <span>Captures ({capturedFrames.length})</span>
            {transformedCount > 0 && (
              <span style={{ color: 'var(--accent)', fontSize: '0.6rem' }}>AI {transformedCount}/{capturedFrames.length}</span>
            )}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.15rem',
              background: 'var(--bg-surface)',
              borderRadius: 4,
              padding: '1px 2px',
              border: '1px solid var(--border)',
            }}>
              <button
                onClick={() => setAutoCapture(false)}
                style={{
                  background: !autoCapture ? 'var(--accent)' : 'transparent',
                  color: !autoCapture ? '#fff' : 'var(--text-muted)',
                  border: 'none',
                  borderRadius: 3,
                  padding: '2px 6px',
                  fontSize: '0.6rem',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                Manual
              </button>
              <button
                onClick={() => setAutoCapture(true)}
                style={{
                  background: autoCapture ? 'var(--accent)' : 'transparent',
                  color: autoCapture ? '#fff' : 'var(--text-muted)',
                  border: 'none',
                  borderRadius: 3,
                  padding: '2px 6px',
                  fontSize: '0.6rem',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                Auto
              </button>
            </div>
            {autoCapture && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                every
                <input
                  type="number"
                  value={captureInterval}
                  onChange={(e) => setCaptureInterval(Math.max(0, Number(e.target.value)))}
                  style={{ width: 55, padding: '0.15rem 0.3rem', fontSize: '0.7rem', textAlign: 'center' }}
                  min={0}
                  step={100}
                />
                f
              </label>
            )}
            <button
              className="btn btn-secondary"
              data-shortcut="capture"
              onClick={captureFrame}
              disabled={!simReady}
              style={{ padding: '0.2rem 0.6rem', fontSize: '0.65rem', transition: 'all 0.15s' }}
            >
              Capture
            </button>
            {capturedFrames.length > 0 && (
              <>
                <button
                  className="btn btn-secondary"
                  data-shortcut="export"
                  onClick={doExport}
                  style={{ padding: '0.2rem 0.6rem', fontSize: '0.65rem', transition: 'all 0.15s' }}
                >
                  Export
                </button>
                <button
                  className="btn btn-secondary"
                  data-shortcut="clear"
                  onClick={() => confirmOrDo(doClearAll)}
                  style={{ padding: '0.2rem 0.6rem', fontSize: '0.65rem', marginLeft: 'auto', transition: 'all 0.15s' }}
                >
                  Clear
                </button>
              </>
            )}
          </div>
          {/* Sim capture strip — always visible with empty slots */}
          <div
            ref={captureStripRef}
            onScroll={() => syncScroll('capture')}
            style={{
              display: 'flex',
              gap: '0.35rem',
              overflowX: 'auto',
              paddingBottom: '0.15rem',
              minWidth: 0,
              minHeight: 56,
            }}
          >
            {capturedFrames.length === 0 ? (
              // Empty placeholder slots
              Array.from({ length: 8 }).map((_, i) => (
                <div key={i} style={{
                  flexShrink: 0,
                  width: 56,
                  height: 56,
                  borderRadius: 3,
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  opacity: 0.25,
                }} />
              ))
            ) : (
              capturedFrames.map((cf, i) => (
                <div key={i} className="frame-thumb" style={{
                  flexShrink: 0,
                  width: 56,
                  height: 56,
                  position: 'relative',
                  cursor: 'pointer',
                  borderRadius: 3,
                  border: '1px solid var(--border)',
                  overflow: 'hidden',
                }} onClick={() => setLightbox(i)}>
                  <button
                    className="frame-delete"
                    onClick={(e) => { e.stopPropagation(); deleteFrame(i) }}
                  >
                    &times;
                  </button>
                  <img
                    src={cf.dataUrl}
                    alt={`f.${cf.frame}`}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block',
                    }}
                  />
                  <span style={{
                    position: 'absolute',
                    bottom: 2,
                    left: 3,
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.45rem',
                    color: '#fff',
                    textShadow: '0 0 3px rgba(0,0,0,0.9)',
                    lineHeight: 1,
                  }}>
                    {cf.frame}
                  </span>
                </div>
              ))
            )}
          </div>
          {/* AI strip — always visible with empty slots */}
          <div
            ref={aiStripRef}
            onScroll={() => syncScroll('ai')}
            style={{
              display: 'flex',
              gap: '0.35rem',
              overflowX: 'auto',
              paddingBottom: '0.3rem',
              marginTop: '0.2rem',
              minWidth: 0,
              minHeight: 56,
            }}
          >
            {capturedFrames.length === 0 ? (
              Array.from({ length: 8 }).map((_, i) => (
                <div key={i} style={{
                  flexShrink: 0,
                  width: 56,
                  height: 56,
                  borderRadius: 3,
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  opacity: 0.15,
                }} />
              ))
            ) : (
              capturedFrames.map((cf, i) => {
                const aiUrl = aiFrames[i]
                const isCurrentlyGenerating = transforming && transformIndex === i
                return (
                  <div key={i} style={{
                    flexShrink: 0,
                    width: 56,
                    height: 56,
                    position: 'relative',
                    borderRadius: 3,
                    border: `1px solid ${aiUrl ? 'var(--accent)' : 'var(--border)'}`,
                    overflow: 'hidden',
                    background: aiUrl ? 'transparent' : 'var(--bg-surface)',
                  }}>
                    {aiUrl ? (
                      <img
                        src={aiUrl}
                        alt={`ai-f.${cf.frame}`}
                        onClick={() => setLightbox(i)}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          cursor: 'pointer',
                          display: 'block',
                          animation: 'fadeScaleIn 0.35s var(--transition-spring)',
                        }}
                      />
                    ) : (
                      <div style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.55rem',
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--text-muted)',
                        opacity: 0.4,
                      }}>
                        {isCurrentlyGenerating ? (
                          <span className="spinner" style={{ width: 14, height: 14, borderWidth: 1.5 }} />
                        ) : null}
                      </div>
                    )}
                    <span style={{
                      position: 'absolute',
                      bottom: 2,
                      left: 3,
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.45rem',
                      color: aiUrl ? '#fff' : 'var(--text-muted)',
                      textShadow: aiUrl ? '0 0 3px rgba(0,0,0,0.9)' : 'none',
                      lineHeight: 1,
                      opacity: aiUrl ? 1 : 0.4,
                    }}>
                      {cf.frame}
                    </span>
                  </div>
                )
              })
            )}
          </div>
          {/* Example session — shown when no captures */}
          {capturedFrames.length === 0 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginTop: '0.35rem',
              padding: '0.3rem 0',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.65rem',
              color: 'var(--text-secondary)',
            }}>
              <div style={{ display: 'flex', gap: '0.25rem' }}>
                {[0, 1, 2].map(i => (
                  <img
                    key={i}
                    src={`/examples/emergent-worlds/preview-${i}.jpg`}
                    alt={`Example preview ${i + 1}`}
                    style={{
                      width: 40,
                      height: 40,
                      objectFit: 'cover',
                      borderRadius: 3,
                      border: '1px solid var(--border)',
                      opacity: 0.7,
                    }}
                  />
                ))}
              </div>
              <button
                className="btn btn-secondary"
                onClick={loadExample}
                style={{ padding: '0.2rem 0.6rem', fontSize: '0.6rem' }}
              >
                Load Example
              </button>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.6rem' }}>
                9 frames + AI results
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Bottom: AI Controls + Prompt */}
      <div style={{
        flex: '0 0 auto',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '50vh',
      }}>

        {/* AI controls bar above prompt */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          padding: '0.5rem 1rem',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.7rem',
          flexWrap: 'wrap',
        }}>
          {/* Model dropdown — compact */}
          <select
            value={model}
            onChange={(e) => setModel(e.target.value as ModelValue)}
            style={{ padding: '0.15rem 0.2rem', fontSize: '0.65rem', maxWidth: 100 }}
          >
            {MODELS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>

          {/* Style preset */}
          <select
            value={stylePreset}
            onChange={(e) => {
              const name = e.target.value
              setStylePreset(name)
              if (name) {
                const preset = stylePresets.find(p => p.name === name)
                if (preset) setPrompt(preset.promptPrefix)
              } else {
                setPrompt(DEFAULT_PROMPT)
              }
              e.target.blur()
            }}
            style={{ padding: '0.15rem 0.2rem', fontSize: '0.65rem', maxWidth: 130 }}
          >
            <option value="">Default style</option>
            {stylePresets.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
          </select>

          {/* Advanced Settings toggle + ? */}
          <div
            ref={advancedToggleRef}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
              cursor: 'pointer',
              userSelect: 'none',
              color: advancedOpen ? 'var(--accent)' : 'var(--text-muted)',
              transition: 'color 0.15s',
            }}
            onClick={(e) => {
              if (!advancedOpen) setAdvancedPos({ x: e.clientX, y: e.clientY })
              setAdvancedOpen(!advancedOpen)
            }}
          >
            <span style={{ fontSize: '0.65rem' }}>Advanced</span>
            <span style={{
              fontSize: '0.55rem',
              transition: 'transform 0.2s',
              transform: advancedOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              display: 'inline-block',
            }}>&#9662;</span>
          </div>
          <span
            style={{
              color: 'var(--text-muted)',
              fontSize: '0.55rem',
              fontFamily: 'var(--font-mono)',
              border: '1px solid var(--border)',
              borderRadius: '50%',
              width: 14,
              height: 14,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'help',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => setHelpPos({ x: e.clientX, y: e.clientY })}
            onMouseLeave={() => setHelpPos(null)}
          >
            ?
              {helpPos && createPortal(
                <div style={{
                  position: 'fixed',
                  top: Math.max(8, helpPos.y - 8),
                  left: helpPos.x + 12,
                  transform: 'translateY(-100%)',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '0.75rem',
                  zIndex: 50,
                  maxWidth: 'min(500px, calc(100vw - 3rem))',
                  fontSize: '0.7rem',
                  fontFamily: 'var(--font-mono)',
                  overflowX: 'auto' as const,
                  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                  pointerEvents: 'none',
                }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '2px 6px', color: 'var(--text-muted)' }}>Param</th>
                        {MODEL_COLUMNS.map(m => (
                          <th key={m} style={{ padding: '2px 6px', color: 'var(--accent)', textAlign: 'center' }}>{m}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {PARAM_MATRIX.map(row => (
                        <tr key={row.param}>
                          <td style={{ padding: '2px 6px', color: 'var(--text-muted)' }}>{row.param}</td>
                          {MODEL_COLUMNS.map(m => (
                            <td key={m} style={{
                              padding: '2px 6px',
                              textAlign: 'center',
                              color: row.models[m] ? '#4ade80' : 'var(--text-muted)',
                            }}>
                              {row.models[m] ? '\u2713' : '\u2014'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>,
                document.body
              )}
            </span>
            {advancedOpen && createPortal(
              <div ref={advancedRef} style={{
                position: 'fixed',
                top: Math.max(8, advancedPos.y - 8),
                left: advancedPos.x + 12,
                transform: 'translateY(-100%)',
                width: 300,
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '0.75rem',
                zIndex: 40,
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
                maxHeight: 'calc(100vh - 16px)',
                overflowY: 'auto' as const,
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              }}>
                {/* Size */}
                <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
                  <div style={{ ...groupLabelStyle, display: 'flex', alignItems: 'center' }}>
                    <Tip text="Default uses model-recommended dimensions. Custom lets you set exact pixel size or aspect ratio." />
                    Size
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <select value={sizeMode} onChange={(e) => setSizeMode(e.target.value as 'default' | 'custom')}>
                      <option value="default">Default</option>
                      <option value="custom">Custom</option>
                    </select>
                    {sizeMode === 'custom' && MODELS_WITH_DIMENSIONS.has(model) && (
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <input type="number" value={width} onChange={(e) => setWidth(Number(e.target.value))} style={{ flex: 1 }} min={256} max={1440} step={32} placeholder="Width" />
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>&times;</span>
                        <input type="number" value={height} onChange={(e) => setHeight(Number(e.target.value))} style={{ flex: 1 }} min={256} max={1440} step={32} placeholder="Height" />
                      </div>
                    )}
                    {sizeMode === 'custom' && MODELS_WITH_ASPECT_RATIO.has(model) && (
                      <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)}>
                        {ASPECT_RATIOS.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    )}
                  </div>
                </div>

                {/* Generation */}
                <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
                  <div style={{ ...groupLabelStyle, display: 'flex', alignItems: 'center' }}>
                    <Tip text="Controls for the diffusion process — steps, guidance, seed, and prompt enhancement." />
                    Generation
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {MODELS_WITH_GUIDANCE.has(model) && (
                      <>
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                            <span style={{ ...sliderLabelStyle, display: 'flex', alignItems: 'center' }}><Tip text="Denoising iterations. More steps = higher quality but slower." />Steps</span>
                            <span style={sliderValueStyle}>{steps}</span>
                          </div>
                          <input type="range" min={1} max={50} value={steps} onChange={(e) => setSteps(Number(e.target.value))} style={{ width: '100%' }} />
                        </div>
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                            <span style={{ ...sliderLabelStyle, display: 'flex', alignItems: 'center' }}><Tip text="Prompt adherence strength. Higher = more literal. Range 1.5-10." />Guidance</span>
                            <span style={sliderValueStyle}>{guidance}</span>
                          </div>
                          <input type="range" min={1.5} max={10} step={0.5} value={guidance} onChange={(e) => setGuidance(Number(e.target.value))} style={{ width: '100%' }} />
                        </div>
                      </>
                    )}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                        <span style={{ ...sliderLabelStyle, display: 'flex', alignItems: 'center' }}><Tip text="Fixed seed for reproducible results. Empty = random." />Seed</span>
                        <button
                          onClick={() => setSeed(null)}
                          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
                          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = seed === null ? 'var(--accent)' : 'var(--text-muted)' }}
                          style={{
                            background: 'none',
                            border: '1px solid var(--border)',
                            borderRadius: 4,
                            color: seed === null ? 'var(--accent)' : 'var(--text-muted)',
                            fontSize: '0.65rem',
                            fontFamily: 'var(--font-mono)',
                            padding: '1px 6px',
                            cursor: 'pointer',
                            textTransform: 'uppercase',
                            transition: 'border-color 0.2s, color 0.2s',
                          }}
                        >
                          Random
                        </button>
                      </div>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={seed !== null ? String(seed) : ''}
                        onChange={(e) => {
                          const v = e.target.value.replace(/[^0-9]/g, '')
                          setSeed(v === '' ? null : Number(v))
                        }}
                        placeholder="Random"
                        style={{ width: '100%' }}
                      />
                    </div>
                    {MODELS_WITH_UPSAMPLING.has(model) && (
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
                        <input type="checkbox" checked={promptUpsampling} onChange={(e) => setPromptUpsampling(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
                        <Tip text="Auto-enhances your prompt with additional detail before generation." />
                        Prompt Upsampling
                      </label>
                    )}
                  </div>
                </div>

                {/* Output */}
                <div>
                  <div style={{ ...groupLabelStyle, display: 'flex', alignItems: 'center' }}>
                    <Tip text="Format, safety filtering, and image-specific output controls." />
                    Output
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', marginBottom: 2 }}><Tip text="PNG = lossless/larger. JPEG = lossy/smaller." />Format</span>
                      <select value={outputFormat} onChange={(e) => setOutputFormat(e.target.value as 'jpeg' | 'png')}>
                        <option value="jpeg">JPEG</option>
                        <option value="png">PNG</option>
                      </select>
                    </div>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                        <span style={{ ...sliderLabelStyle, display: 'flex', alignItems: 'center' }}><Tip text="Content filter strictness. 0 = most strict, higher = more permissive." />Safety Tolerance</span>
                        <span style={sliderValueStyle}>{safetyTolerance}</span>
                      </div>
                      <input type="range" min={0} max={model === 'flux-pro-1.1' ? 6 : 5} value={safetyTolerance} onChange={(e) => setSafetyTolerance(Number(e.target.value))} style={{ width: '100%' }} />
                    </div>
                    {MODELS_WITH_RAW.has(model) && (
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
                        <input type="checkbox" checked={raw} onChange={(e) => setRaw(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
                        <Tip text="Disables automatic prompt enhancement for more literal control." />
                        Raw Mode
                      </label>
                    )}
                    {MODELS_WITH_IMG_STRENGTH.has(model) && (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                          <span style={{ ...sliderLabelStyle, display: 'flex', alignItems: 'center' }}><Tip text="How much the source image influences output. 0 = minimal, 1 = maximum." />Image Prompt Strength</span>
                          <span style={sliderValueStyle}>{imagePromptStrength.toFixed(2)}</span>
                        </div>
                        <input type="range" min={0} max={1} step={0.05} value={imagePromptStrength} onChange={(e) => setImagePromptStrength(Number(e.target.value))} style={{ width: '100%' }} />
                      </div>
                    )}
                  </div>
                </div>
              </div>,
              document.body
            )}

          {/* Divider */}
          <span style={{ width: 1, height: 18, background: 'var(--border)', flexShrink: 0 }} />

          {/* Downsample */}
          <Tip text="Downsample captures before sending to FLUX. Smaller = cheaper + faster." />
          <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>DS</span>
          <select
            value={dsWidth}
            onChange={(e) => setDsWidth(Number(e.target.value))}
            style={{ width: 64, padding: '0.2rem 0.25rem', fontSize: '0.7rem' }}
          >
            {DOWNSAMPLE_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>&times;</span>
          <select
            value={dsHeight}
            onChange={(e) => setDsHeight(Number(e.target.value))}
            style={{ width: 64, padding: '0.2rem 0.25rem', fontSize: '0.7rem' }}
          >
            {DOWNSAMPLE_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.6rem' }}>
            {((dsWidth * dsHeight) / 1_000_000).toFixed(2)}MP
          </span>

          {/* Divider */}
          <span style={{ width: 1, height: 18, background: 'var(--border)', flexShrink: 0 }} />

          {/* Size (output) */}
          {MODELS_WITH_DIMENSIONS.has(model) && sizeMode === 'custom' && (
            <>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>Out</span>
              <input type="number" value={width} onChange={(e) => setWidth(Number(e.target.value))} style={{ width: 52, padding: '0.15rem 0.25rem', fontSize: '0.7rem', textAlign: 'center' }} min={256} max={1440} step={32} />
              <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>&times;</span>
              <input type="number" value={height} onChange={(e) => setHeight(Number(e.target.value))} style={{ width: 52, padding: '0.15rem 0.25rem', fontSize: '0.7rem', textAlign: 'center' }} min={256} max={1440} step={32} />
            </>
          )}
          {MODELS_WITH_ASPECT_RATIO.has(model) && sizeMode === 'custom' && (
            <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)} style={{ padding: '0.2rem 0.25rem', fontSize: '0.7rem' }}>
              {ASPECT_RATIOS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          )}

          {/* Cost */}
          {costInfo && capturedFrames.length > 0 && (
            <span style={{ color: 'var(--text-muted)', fontSize: '0.6rem' }} title={costInfo.breakdown}>
              ${costInfo.cost.toFixed(3)}
            </span>
          )}

          {/* Spacer */}
          <span style={{ flex: 1 }} />

          {/* Status */}
          {transforming && <span className="spinner" style={{ width: 12, height: 12, borderWidth: 1.5 }} />}
          {transforming && <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{status}</span>}
          {!transforming && status && !status.startsWith('Done') && status !== 'Transform complete' && status !== 'Export complete' && (
            <span style={{ fontSize: '0.6rem', color: status.toLowerCase().includes('error') ? '#ef4444' : 'var(--text-muted)' }}>{status}</span>
          )}

          {/* Cancel */}
          {transforming && (
            <button
              className="btn btn-secondary"
              onClick={() => { if (transformAbortRef.current) transformAbortRef.current.abort() }}
              style={{ padding: '0.2rem 0.5rem', fontSize: '0.65rem' }}
            >
              Cancel
            </button>
          )}

          {/* Transform button */}
          <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <button
              className="btn btn-primary"
              data-shortcut="transform"
              onClick={doTransform}
              disabled={transforming || !hasKey || capturedFrames.length === 0 || !modelHasImg2Img || untransformedCount === 0}
              style={{ padding: '0.3rem 0.8rem', fontSize: '0.75rem', transition: 'all 0.15s' }}
            >
              {transforming ? (
                <><span className="spinner" style={{ width: 14, height: 14 }} /> Transforming...</>
              ) : (
                <>Transform{untransformedCount > 0 ? ` (${untransformedCount})` : ''}</>
              )}
            </button>
            <Tip text={STRUCTURE_SUFFIX_TIP} align="top-left" />
            {!hasKey && (
              <div style={{
                position: 'absolute',
                bottom: '100%',
                left: '50%',
                transform: 'translateX(-50%)',
                marginBottom: 6,
                background: '#222',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.3rem 0.6rem',
                fontSize: '0.65rem',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-secondary)',
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
              }}>BFL API key required</div>
            )}
          </div>

          {/* Chained / Parallel toggle */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.15rem',
            background: 'var(--bg-surface)',
            borderRadius: 4,
            padding: '1px 2px',
            border: '1px solid var(--border)',
          }}>
            {(['chained', 'parallel'] as const).map(m => (
              <button
                key={m}
                onClick={() => setTransformMode(m)}
                disabled={transforming}
                style={{
                  background: transformMode === m ? 'var(--accent)' : 'transparent',
                  color: transformMode === m ? '#fff' : 'var(--text-muted)',
                  border: 'none',
                  borderRadius: 3,
                  padding: '2px 6px',
                  fontSize: '0.55rem',
                  cursor: transforming ? 'default' : 'pointer',
                  fontFamily: 'var(--font-mono)',
                  textTransform: 'capitalize',
                  opacity: transforming ? 0.5 : 1,
                }}
              >
                {m}
              </button>
            ))}
          </div>
          <Tip text="Parallel (recommended): each frame feeds only its simulation capture to FLUX — all frames fire concurrently, so it's much faster. Chained: feeds the simulation frame + the previous AI output into the next frame, building on each result sequentially." align="top-left" />
        </div>

        {!modelHasImg2Img && (
          <div style={{
            padding: '0.3rem 1rem',
            fontSize: '0.65rem',
            color: '#f59e0b',
            fontFamily: 'var(--font-mono)',
          }}>
            {model} does not support img2img. Use Pro, Max, Flex, or 1.1 Ultra.
          </div>
        )}

        {/* Prompt — full width */}
        <div style={{ padding: '0.5rem 1rem 0.6rem', borderTop: '1px solid var(--border)' }}>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={2}
            style={{ marginBottom: 0 }}
          />
        </div>
      </div>

      {/* Lightbox */}
      {lightbox !== null && (() => {
        const cf = capturedFrames[lightbox]
        if (!cf) return null
        const aiUrl = aiFrames[lightbox]
        const hasCompare = !!aiUrl
        const canPrev = lightbox > 0
        const canNext = lightbox < capturedFrames.length - 1
        const navBtn = (dir: 'prev' | 'next') => {
          const enabled = dir === 'prev' ? canPrev : canNext
          return (
            <button
              style={{
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.2)',
                color: '#fff',
                borderRadius: 6,
                padding: '6px 14px',
                cursor: enabled ? 'pointer' : 'default',
                fontSize: '0.8rem',
                opacity: enabled ? 1 : 0.3,
              }}
              disabled={!enabled}
              onClick={() => setLightbox(dir === 'prev' ? lightbox - 1 : lightbox + 1)}
            >
              {dir === 'prev' ? '\u2190' : '\u2192'}
            </button>
          )
        }
        return (
          <div className="lightbox-overlay" onClick={() => setLightbox(null)}>
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.75rem',
                maxWidth: '90vw',
                maxHeight: '90vh',
              }}
            >
              <div style={{
                display: 'flex',
                gap: '1.5rem',
                alignItems: 'stretch',
                justifyContent: 'center',
                maxWidth: '100%',
                maxHeight: '75vh',
              }}>
                {[
                  { src: cf.dataUrl, key: 'sim' as const },
                  ...(hasCompare ? [{ src: aiUrl, key: 'ai' as const }] : []),
                ].map(({ src, key }) => (
                  <div key={key} data-panel style={{
                    display: 'flex',
                    flexDirection: 'column',
                    flex: '1 1 0',
                    minWidth: 0,
                    maxWidth: hasCompare ? '45vw' : '80vw',
                  }}>
                    <div style={{
                      flex: 1,
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: 'var(--radius)',
                      overflow: 'hidden',
                      background: '#111',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <img
                        src={src}
                        alt={`${key} f.${cf.frame}`}
                        onLoad={(e) => {
                          const img = e.currentTarget
                          const label = img.closest('[data-panel]')?.querySelector('[data-dims]')
                          if (label) label.textContent = `${img.naturalWidth} × ${img.naturalHeight}`
                        }}
                        style={{ maxWidth: '100%', maxHeight: '70vh', display: 'block', objectFit: 'contain' }}
                      />
                    </div>
                    <span
                      data-dims
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.6rem',
                        color: 'var(--text-muted)',
                        marginTop: '0.35rem',
                        textAlign: key === 'sim' ? 'left' : 'right',
                      }}
                    />
                  </div>
                ))}
              </div>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.75rem',
                color: 'var(--text-muted)',
              }}>
                f.{cf.frame}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                {navBtn('prev')}
                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                  {lightbox + 1} / {capturedFrames.length}
                </span>
                {navBtn('next')}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Discard Confirmation Modal */}
      {discardConfirm && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="discard-title"
          aria-describedby="discard-desc"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(26,26,26,0.85)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1500,
          }}
          onClick={() => setDiscardConfirm(null)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setDiscardConfirm(null)
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Tab') {
              const focusable = e.currentTarget.querySelectorAll<HTMLElement>('button')
              if (focusable.length === 0) return
              const first = focusable[0]
              const last = focusable[focusable.length - 1]
              const goBack = e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey)
              const goFwd = e.key === 'ArrowRight' || (e.key === 'Tab' && !e.shiftKey)
              if (goBack && document.activeElement === first) {
                e.preventDefault(); last.focus()
              } else if (goFwd && document.activeElement === last) {
                e.preventDefault(); first.focus()
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                e.preventDefault()
                const idx = Array.from(focusable).indexOf(document.activeElement as HTMLElement)
                const next = e.key === 'ArrowRight' ? idx + 1 : idx - 1
                if (next >= 0 && next < focusable.length) focusable[next].focus()
              }
            }
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: '1.5rem',
              maxWidth: 360,
              width: '90vw',
              textAlign: 'center',
            }}
          >
            <div id="discard-title" style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.85rem',
              color: 'var(--text-primary)',
              marginBottom: '0.75rem',
            }}>
              Discard current session?
            </div>
            <div id="discard-desc" style={{
              fontSize: '0.75rem',
              color: 'var(--text-muted)',
              marginBottom: '1.25rem',
            }}>
              {capturedFrames.length} captures, {transformedCount} AI images will be lost.
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setDiscardConfirm(null)}
                ref={(el) => el?.focus()}
                style={{ fontSize: '0.85rem' }}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  discardConfirm.action()
                  setDiscardConfirm(null)
                }}
                style={{ fontSize: '0.85rem' }}
              >
                Discard
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Shortcuts Overlay */}
      {showShortcuts && createPortal(
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(10,10,10,0.85)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000,
          pointerEvents: 'none',
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: '0.6rem 1.5rem',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.85rem',
          }}>
            <div style={{
              gridColumn: '1 / -1',
              fontSize: '0.7rem',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: 'var(--text-muted)',
              marginBottom: '0.5rem',
            }}>
              Keyboard Shortcuts
            </div>
            {SHORTCUTS.map(([key, desc]) => (
              <div key={key} style={{ display: 'contents' }}>
                <div style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 4,
                  padding: '0.25rem 0.5rem',
                  textAlign: 'center',
                  color: 'var(--accent)',
                  fontWeight: 600,
                  minWidth: 36,
                }}>
                  {key}
                </div>
                <div style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}>
                  {desc}
                </div>
              </div>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
})

export default EmergentWorlds
