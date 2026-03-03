import { useState, useRef, useEffect, useCallback } from 'react'
import { generateImage, canvasToBase64, MODELS, isFlux2Model, type ModelValue, type GenerationParams } from '../../lib/bfl'
import { init, type SimHandle, type SimConfig } from '../../sim/dla-advanced/simulation'
import { getStageForFrame } from './prompts'

interface GalleryEntry {
  imageUrl: string
  prompt: string
  stage: string
  timestamp: number
  simFrame: number
}

export default function EmergentWorlds() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const simRef = useRef<SimHandle | null>(null)
  const autoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [model, setModel] = useState<ModelValue>('flux-2-pro')
  const [prompt, setPrompt] = useState('')
  const [currentStage, setCurrentStage] = useState('Nucleation')
  const [frameCount, setFrameCount] = useState(0)
  const [generating, setGenerating] = useState(false)
  const [status, setStatus] = useState('')
  const [autoGenerate, setAutoGenerate] = useState(false)
  const [gallery, setGallery] = useState<GalleryEntry[]>([])
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [simReady, setSimReady] = useState(false)
  const [simError, setSimError] = useState<string | null>(null)
  const [simStats, setSimStats] = useState({ resolution: 0, agentCount: 0 })
  const [fps, setFps] = useState(0)
  const lastFrameRef = useRef(0)

  // Sim params
  const [seedCount, setSeedCount] = useState(1)
  const [speed, setSpeed] = useState(1)

  const startSim = useCallback(async (config?: Partial<SimConfig>) => {
    if (!canvasRef.current) return
    if (simRef.current) {
      simRef.current.cleanup()
      simRef.current = null
    }
    setSimReady(false)
    setFrameCount(0)
    setCurrentStage('Nucleation')
    setPrompt('')
    lastFrameRef.current = 0

    try {
      const handle = await init(canvasRef.current, {
        resolution: 640,
        seedCount: config?.seedCount ?? seedCount,
        speed: config?.speed ?? speed,
      })
      simRef.current = handle
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
  }, [])

  // Update frame counter + stage prompt
  useEffect(() => {
    if (!simReady) return
    const interval = setInterval(() => {
      if (!simRef.current) return
      const frame = simRef.current.getFrame()
      setFps(frame - lastFrameRef.current)
      lastFrameRef.current = frame
      setFrameCount(frame)
      const stage = getStageForFrame(frame)
      setCurrentStage(stage.label)
      setPrompt((prev) => {
        const prevStage = getStageForFrame(frame - 60)
        if (prev === prevStage.prompt || prev === '') {
          return stage.prompt
        }
        return prev
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [simReady])

  const doGenerate = useCallback(async () => {
    if (!simRef.current || generating) return
    setGenerating(true)
    setStatus('Capturing...')

    try {
      const base64 = canvasToBase64(simRef.current.canvas)
      const frame = simRef.current.getFrame()
      const stage = getStageForFrame(frame)
      const currentPrompt = prompt || stage.prompt

      const params: GenerationParams = {
        prompt: currentPrompt,
        model,
        ...(isFlux2Model(model) ? { input_image: base64 } : { image_prompt: base64 }),
      }

      const imageUrl = await generateImage(params, setStatus)

      setGallery((prev) => [{
        imageUrl,
        prompt: currentPrompt,
        stage: stage.label,
        timestamp: Date.now(),
        simFrame: frame,
      }, ...prev])
    } catch (err: unknown) {
      setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setGenerating(false)
    }
  }, [model, prompt, generating])

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

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      {/* Left: Sim */}
      <div style={{
        flex: '0 0 50%',
        display: 'flex',
        flexDirection: 'column',
        padding: '1rem',
        background: '#050505',
      }}>
        {/* Sim controls — top bar */}
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
              onChange={(e) => { const v = Number(e.target.value); setSpeed(v); startSim({ speed: v }) }}
              style={{ width: 60, padding: '0.2rem 0.3rem', fontSize: '0.75rem' }}
            >
              {[0.1, 0.25, 0.5, 0.75, 1, 2, 3, 5, 8].map(n => <option key={n} value={n}>{n}x</option>)}
            </select>
          </label>
        </div>

        {/* Canvas + Stats wrapper */}
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
            <>
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
                {simStats.resolution}x{simStats.resolution}
                <span style={{ opacity: 0.35, margin: '0 0.4rem' }}>|</span>
                {simStats.agentCount.toLocaleString()} agents
                <span style={{ opacity: 0.35, margin: '0 0.4rem' }}>|</span>
                {fps}fps
                <span style={{ opacity: 0.35, margin: '0 0.4rem' }}>|</span>
                f.{frameCount}
                <span style={{ opacity: 0.35, margin: '0 0.4rem' }}>|</span>
                <span style={{ color: 'var(--accent)' }}>{currentStage}</span>
              </div>
            </>
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
        {/* Model */}
        <div className="control-group">
          <label className="control-label">Model</label>
          <select value={model} onChange={(e) => setModel(e.target.value as ModelValue)}>
            {MODELS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>

        {/* Prompt */}
        <div className="control-group">
          <label className="control-label">Prompt (auto-updates with stage)</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
          />
        </div>

        {/* Generate controls */}
        <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center', marginBottom: '1.5rem' }}>
          <button
            className="btn btn-primary"
            onClick={doGenerate}
            disabled={generating || !simReady}
          >
            {generating ? <><span className="spinner" /> {status}</> : 'Generate Now'}
          </button>

          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={autoGenerate}
              onChange={(e) => setAutoGenerate(e.target.checked)}
              disabled={!simReady}
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
                  onClick={() => setLightbox(entry.imageUrl)}
                >
                  <img src={entry.imageUrl} alt={entry.stage} />
                  <div className="gallery-label">
                    {entry.stage} · f{entry.simFrame}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div className="lightbox-overlay" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="Full size" />
        </div>
      )}
    </div>
  )
}
