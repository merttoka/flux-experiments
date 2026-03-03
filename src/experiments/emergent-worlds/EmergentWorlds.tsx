import { useState, useRef, useEffect, useCallback, type MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { generateImage, hasApiKey, canvasToBase64, MODELS, isFlux2Model, type ModelValue, type GenerationParams } from '../../lib/bfl'
import { init, type SimHandle, type SimConfig } from '../../sim/dla-advanced/simulation'
import { DEFAULT_PROMPT } from './prompts'

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

function Tip({ text }: { text: string }) {
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
          transform: 'translate(-50%, -100%)',
          background: '#222',
          border: '1px solid var(--border)',
          borderRadius: 6,
          padding: '0.4rem 0.6rem',
          fontSize: '0.7rem',
          fontFamily: 'var(--font-body)',
          color: 'var(--text-secondary)',
          maxWidth: 220,
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

interface GalleryEntry {
  imageUrl: string
  prompt: string
  timestamp: number
  simFrame: number
}

export default function EmergentWorlds() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const simRef = useRef<SimHandle | null>(null)
  const autoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [model, setModel] = useState<ModelValue>(saved.model ?? 'flux-2-pro')
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT)
  const [frameCount, setFrameCount] = useState(0)
  const [generating, setGenerating] = useState(false)
  const [status, setStatus] = useState('')
  const [autoGenerate, setAutoGenerate] = useState(false)
  const [gallery, setGallery] = useState<GalleryEntry[]>([])
  const [lightbox, setLightbox] = useState<{ source: 'capture' | 'gallery'; index: number } | null>(null)
  const [simReady, setSimReady] = useState(false)
  const [hasKey, setHasKey] = useState(hasApiKey())

  useEffect(() => {
    const onKeyChange = () => setHasKey(hasApiKey())
    window.addEventListener('bfl-key-change', onKeyChange)
    return () => window.removeEventListener('bfl-key-change', onKeyChange)
  }, [])
  const [simError, setSimError] = useState<string | null>(null)
  const [simStats, setSimStats] = useState({ resolution: 0, agentCount: 0 })
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

  // Frame capture
  const [capturedFrames, setCapturedFrames] = useState<CapturedFrame[]>([])
  const [captureInterval, setCaptureInterval] = useState(saved.captureInterval ?? 1000)
  const [autoCapture, setAutoCapture] = useState(saved.autoCapture ?? false)
  const [paused, setPaused] = useState(false)
  const lastCaptureFrameRef = useRef(0)

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
  const [helpHover, setHelpHover] = useState(false)

  // Persist settings to localStorage
  useEffect(() => {
    saveSettings({
      model, seedCount, speed, autoCapture, captureInterval,
      dofExponent, dofFocus, dofRadius, dofIterations,
      stoppedR, stoppedG, stoppedB, fadeRate,
      sizeMode, width, height, aspectRatio, steps, guidance,
      outputFormat, safetyTolerance, promptUpsampling, raw, imagePromptStrength,
    })
  }, [
    model, seedCount, speed, autoCapture, captureInterval,
    dofExponent, dofFocus, dofRadius, dofIterations,
    stoppedR, stoppedG, stoppedB, fadeRate,
    sizeMode, width, height, aspectRatio, steps, guidance,
    outputFormat, safetyTolerance, promptUpsampling, raw, imagePromptStrength,
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
  }, [fps, speed, seedCount, simStats])

  const startSim = useCallback(async (config?: Partial<SimConfig>) => {
    if (!canvasRef.current) return
    if (simRef.current) {
      simRef.current.cleanup()
      simRef.current = null
    }
    setSimReady(false)
    setFrameCount(0)
    setCapturedFrames([])
    lastFrameRef.current = 0
    lastCaptureFrameRef.current = 0

    try {
      const handle = await init(canvasRef.current, {
        resolution: 640,
        seedCount: config?.seedCount ?? seedCount,
        speed: config?.speed ?? speed,
      })
      simRef.current = handle
      handle.setDofParams(dofExponent, dofFocus, dofRadius, dofIterations)
      handle.setColorParams(stoppedR, stoppedG, stoppedB, fadeRate)
      setSimStats({ resolution: handle.resolution, agentCount: handle.agentCount })
      setSimReady(true)
    } catch (err: unknown) {
      setSimError(err instanceof Error ? err.message : 'WebGPU not supported')
    }
  }, [seedCount, speed])

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
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [simReady, captureInterval, autoCapture, speed, seedCount])

  const doGenerate = useCallback(async () => {
    if (!simRef.current || generating) return
    setGenerating(true)
    setStatus('Capturing...')

    try {
      const base64 = canvasToBase64(simRef.current.canvas)
      const frame = simRef.current.getFrame()
      const currentPrompt = prompt

      const params: GenerationParams = {
        prompt: currentPrompt,
        model,
        ...(isFlux2Model(model) ? { input_image: base64 } : { image_prompt: base64 }),
      }

      // Size params
      if (sizeMode === 'custom') {
        if (MODELS_WITH_DIMENSIONS.has(model)) {
          params.width = width
          params.height = height
        }
        if (MODELS_WITH_ASPECT_RATIO.has(model)) {
          params.aspect_ratio = aspectRatio
        }
      }

      // Generation params
      if (MODELS_WITH_GUIDANCE.has(model)) {
        params.steps = steps
        params.guidance = guidance
      }
      if (seed !== null) params.seed = seed
      if (MODELS_WITH_UPSAMPLING.has(model)) params.prompt_upsampling = promptUpsampling

      // Output params
      params.output_format = outputFormat
      params.safety_tolerance = safetyTolerance
      if (MODELS_WITH_RAW.has(model)) params.raw = raw
      if (MODELS_WITH_IMG_STRENGTH.has(model)) params.image_prompt_strength = imagePromptStrength

      const imageUrl = await generateImage(params, setStatus)

      setGallery((prev) => [{
        imageUrl,
        prompt: currentPrompt,
        timestamp: Date.now(),
        simFrame: frame,
      }, ...prev])
    } catch (err: unknown) {
      setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setGenerating(false)
    }
  }, [model, prompt, generating, sizeMode, width, height, aspectRatio, steps, guidance, seed, outputFormat, safetyTolerance, promptUpsampling, raw, imagePromptStrength])

  // Auto-generate toggle
  useEffect(() => {
    if (autoGenerate && simReady) {
      autoIntervalRef.current = setInterval(() => {
        if (!generating) doGenerate()
      }, 30000)
    }
    return () => {
      if (autoIntervalRef.current) {
        clearInterval(autoIntervalRef.current)
        autoIntervalRef.current = null
      }
    }
  }, [autoGenerate, simReady, doGenerate, generating])

  // Lightbox keyboard navigation
  useEffect(() => {
    if (!lightbox) return
    const items = lightbox.source === 'capture' ? capturedFrames : gallery
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null)
      if (e.key === 'ArrowLeft' && lightbox.index > 0)
        setLightbox({ ...lightbox, index: lightbox.index - 1 })
      if (e.key === 'ArrowRight' && lightbox.index < items.length - 1)
        setLightbox({ ...lightbox, index: lightbox.index + 1 })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox, capturedFrames, gallery])

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
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      {/* Left: Sim */}
      <div style={{
        flex: '0 0 50%',
        display: 'flex',
        flexDirection: 'column',
        padding: '1rem',
        background: '#050505',
        minWidth: 0,
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
          <button
            className="btn btn-secondary"
            onClick={() => startSim()}
            disabled={!simReady && !simError}
            style={{ padding: '0.35rem 0.8rem', fontSize: '0.75rem' }}
          >
            Reset
          </button>
          <label style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            Seeds
            <select
              value={seedCount}
              onChange={(e) => { const v = Number(e.target.value); setSeedCount(v); startSim({ seedCount: v }) }}
              style={{ width: 52, padding: '0.2rem 0.3rem', fontSize: '0.75rem' }}
            >
              {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            Speed
            <select
              value={speed}
              onChange={(e) => {
                const v = Number(e.target.value)
                setSpeed(v)
                if (simRef.current) simRef.current.setSpeed(paused ? 0 : v)
              }}
              style={{ width: 60, padding: '0.2rem 0.3rem', fontSize: '0.75rem' }}
            >
              {[0.1, 0.25, 0.5, 0.75, 1, 2, 3, 5, 8].map(n => <option key={n} value={n}>{n}x</option>)}
            </select>
          </label>
          <button
            className="btn btn-secondary"
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
            }}
          >
            {paused ? 'Play' : 'Pause'}
          </button>
        </div>

        {/* Visual controls — collapsible */}
        <div style={{ flexShrink: 0, marginBottom: '0.5rem' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              cursor: 'pointer',
              userSelect: 'none',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.7rem',
              color: 'var(--text-muted)',
              marginBottom: visualOpen ? '0.5rem' : 0,
            }}
            onClick={() => setVisualOpen(!visualOpen)}
          >
            <span style={{
              fontSize: '0.7rem',
              transition: 'transform 0.2s',
              transform: visualOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              display: 'inline-block',
            }}>&#9662;</span>
            VISUAL
          </div>
          {visualOpen && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '0.75rem',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '0.6rem',
              fontSize: '0.7rem',
              fontFamily: 'var(--font-mono)',
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
                  maxHeight: 'calc(100vh - 140px)',
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
                {simStats.resolution}x{simStats.resolution}
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

        {/* Frame Capture Strip */}
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
              onClick={captureFrame}
              disabled={!simReady}
              style={{ padding: '0.2rem 0.6rem', fontSize: '0.65rem' }}
            >
              Capture
            </button>
            {capturedFrames.length > 0 && (
              <button
                className="btn btn-secondary"
                onClick={() => setCapturedFrames([])}
                style={{ padding: '0.2rem 0.6rem', fontSize: '0.65rem', marginLeft: 'auto' }}
              >
                Clear
              </button>
            )}
          </div>
          {capturedFrames.length > 0 && (
            <div style={{
              display: 'flex',
              gap: '0.35rem',
              overflowX: 'auto',
              paddingBottom: '0.3rem',
              minWidth: 0,
            }}>
              {capturedFrames.map((cf, i) => (
                <div key={i} style={{
                  flexShrink: 0,
                  width: 72,
                  cursor: 'pointer',
                }} onClick={() => setLightbox({ source: 'capture', index: i })}>
                  <img
                    src={cf.dataUrl}
                    alt={`f.${cf.frame}`}
                    style={{
                      width: 72,
                      height: 72,
                      objectFit: 'cover',
                      borderRadius: 3,
                      border: '1px solid var(--border)',
                    }}
                  />
                  <div style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.55rem',
                    color: 'var(--text-muted)',
                    textAlign: 'center',
                    marginTop: 2,
                    lineHeight: 1.2,
                  }}>
                    f.{cf.frame}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right: Model + Gallery */}
      <div style={{
        flex: '0 0 50%',
        overflow: 'auto',
        padding: '1.5rem',
        borderLeft: '1px solid var(--border)',
      }}>
        {/* Model + Advanced Settings */}
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', marginBottom: '1rem' }}>
          <div className="control-group" style={{ flex: 1, marginBottom: 0 }}>
            <label className="control-label">Model</label>
            <select value={model} onChange={(e) => setModel(e.target.value as ModelValue)}>
              {MODELS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          <div style={{ flex: 1, paddingTop: '1.15rem', position: 'relative' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                cursor: 'pointer',
                userSelect: 'none',
                height: '2.12rem',
              }}
              onClick={() => setAdvancedOpen(!advancedOpen)}
            >
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--text-muted)',
              }}>
                Advanced Settings
              </span>
              <span style={{
                color: 'var(--text-muted)',
                fontSize: '0.8rem',
                transition: 'transform 0.2s',
                transform: advancedOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                display: 'inline-block',
              }}>
                &#9662;
              </span>
              <span
                style={{
                  position: 'relative',
                  marginLeft: '0.25rem',
                  color: 'var(--text-muted)',
                  fontSize: '0.75rem',
                  fontFamily: 'var(--font-mono)',
                  border: '1px solid var(--border)',
                  borderRadius: '50%',
                  width: 18,
                  height: 18,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'help',
                }}
                onClick={(e) => e.stopPropagation()}
                onMouseEnter={() => setHelpHover(true)}
                onMouseLeave={() => setHelpHover(false)}
              >
                ?
                {helpHover && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    marginTop: 6,
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: '0.75rem',
                    zIndex: 50,
                    maxWidth: 'min(500px, calc(100vw - 3rem))',
                    fontSize: '0.7rem',
                    fontFamily: 'var(--font-mono)',
                    overflowX: 'auto' as const,
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
                  </div>
                )}
              </span>
            </div>
            {advancedOpen && (
              <div style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                width: 300,
                marginTop: 6,
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '0.75rem',
                zIndex: 40,
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
                maxHeight: 'calc(100vh - 200px)',
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
              </div>
            )}
          </div>
        </div>

        {/* Prompt */}
        <div className="control-group">
          <label className="control-label">Prompt</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
          />
        </div>

        {/* Generate controls */}
        <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <button
              className="btn btn-primary"
              onClick={doGenerate}
              disabled={generating || !simReady || !hasKey}
            >
              {generating ? <><span className="spinner" /> {status}</> : 'Generate Now'}
            </button>
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
                fontSize: '0.7rem',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-secondary)',
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
              }}>BFL API key required</div>
            )}
          </div>

          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={autoGenerate}
              onChange={(e) => setAutoGenerate(e.target.checked)}
              disabled={!simReady || !hasKey}
            />
            Auto-generate (30s)
          </label>
        </div>

        {/* Error status */}
        {!generating && status && !status.startsWith('Done') && status !== 'Capturing...' && (
          <div className="status-bar" style={{ marginBottom: '1rem' }}>
            <span className="status-dot" />
            {status}
          </div>
        )}

        {/* Gallery */}
        <div>
          <label className="control-label" style={{ marginBottom: '0.6rem' }}>Timeline</label>
          {gallery.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              No generations yet. Hit "Generate Now" to capture the simulation.
            </p>
          ) : (
            <div className="gallery-grid">
              {gallery.map((entry, i) => (
                <div
                  key={i}
                  className="gallery-item"
                  onClick={() => setLightbox({ source: 'gallery', index: i })}
                >
                  <img src={entry.imageUrl} alt={`f${entry.simFrame}`} />
                  <div className="gallery-label">
                    f{entry.simFrame}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && (() => {
        const items = lightbox.source === 'capture' ? capturedFrames : gallery
        const idx = lightbox.index
        const item = items[idx]
        if (!item) return null
        const imgSrc = lightbox.source === 'capture'
          ? (item as CapturedFrame).dataUrl
          : (item as GalleryEntry).imageUrl
        const label = lightbox.source === 'capture'
          ? `f.${(item as CapturedFrame).frame}`
          : `f${(item as GalleryEntry).simFrame}`
        const canPrev = idx > 0
        const canNext = idx < items.length - 1
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
              <img src={imgSrc} alt={label} style={{ maxWidth: '100%', maxHeight: '75vh', borderRadius: 'var(--radius)' }} />
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.75rem',
                color: 'var(--text-muted)',
              }}>
                {label}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <button
                  style={{
                    background: 'rgba(255,255,255,0.1)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    color: '#fff',
                    borderRadius: 6,
                    padding: '6px 14px',
                    cursor: canPrev ? 'pointer' : 'default',
                    fontSize: '0.8rem',
                    opacity: canPrev ? 1 : 0.3,
                  }}
                  disabled={!canPrev}
                  onClick={() => setLightbox({ ...lightbox, index: idx - 1 })}
                >
                  &larr;
                </button>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                  {idx + 1} / {items.length}
                </span>
                <button
                  style={{
                    background: 'rgba(255,255,255,0.1)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    color: '#fff',
                    borderRadius: 6,
                    padding: '6px 14px',
                    cursor: canNext ? 'pointer' : 'default',
                    fontSize: '0.8rem',
                    opacity: canNext ? 1 : 0.3,
                  }}
                  disabled={!canNext}
                  onClick={() => setLightbox({ ...lightbox, index: idx + 1 })}
                >
                  &rarr;
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
