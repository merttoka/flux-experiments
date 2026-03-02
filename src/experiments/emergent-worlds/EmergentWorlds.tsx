import { useState, useRef, useEffect, useCallback } from 'react'
import { generateImage, canvasToBase64, MODELS, isFlux2Model, type ModelValue } from '../../lib/bfl'
import { init, type SimHandle } from '../../sim/dla-advanced/simulation'
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

  // Init sim
  useEffect(() => {
    if (!canvasRef.current) return
    let handle: SimHandle | null = null

    const run = async () => {
      try {
        handle = await init(canvasRef.current!, 640)
        simRef.current = handle
        setSimReady(true)
      } catch (err: any) {
        setSimError(err.message || 'WebGPU not supported')
      }
    }
    run()

    return () => {
      if (handle) handle.cleanup()
      simRef.current = null
    }
  }, [])

  // Update frame counter + stage prompt
  useEffect(() => {
    if (!simReady) return
    const interval = setInterval(() => {
      if (!simRef.current) return
      const frame = simRef.current.getFrame()
      setFrameCount(frame)
      const stage = getStageForFrame(frame)
      setCurrentStage(stage.label)
      setPrompt((prev) => {
        // Only auto-update if user hasn't manually edited
        const prevStage = getStageForFrame(frame - 60) // rough prev
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

      const params: any = {
        prompt: currentPrompt,
        model,
      }

      if (isFlux2Model(model)) {
        params.input_image = base64
      } else {
        params.image_prompt = base64
      }

      const imageUrl = await generateImage(params, setStatus)

      setGallery((prev) => [{
        imageUrl,
        prompt: currentPrompt,
        stage: stage.label,
        timestamp: Date.now(),
        simFrame: frame,
      }, ...prev])
    } catch (err: any) {
      setStatus(`Error: ${err.message}`)
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
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        background: '#050505',
      }}>
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
          <canvas
            ref={canvasRef}
            style={{
              maxWidth: '100%',
              maxHeight: 'calc(100vh - 60px)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
            }}
          />
        )}
      </div>

      {/* Right: Controls + Gallery */}
      <div style={{
        flex: '0 0 50%',
        overflow: 'auto',
        padding: '1.5rem',
        borderLeft: '1px solid var(--border)',
      }}>
        {/* Status bar */}
        <div className="status-bar" style={{ marginBottom: '1rem' }}>
          <span className={`status-dot ${simReady ? 'active' : ''}`} />
          Frame: {frameCount}
          <span style={{ margin: '0 0.3rem', opacity: 0.3 }}>|</span>
          Stage: {currentStage}
        </div>

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

        {/* Controls */}
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
