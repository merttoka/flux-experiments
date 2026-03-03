import { useState, useRef, useCallback, type DragEvent, type ChangeEvent } from 'react'
import { generateImage, MODELS, isFlux2Model, type ModelValue, type GenerationParams } from '../../lib/bfl'
import { presets } from './presets'

export default function StyleBridge() {
  const [sourceImage, setSourceImage] = useState<string | null>(null)
  const [sourceBase64, setSourceBase64] = useState<string | null>(null)
  const [prompt, setPrompt] = useState(presets[0].promptPrefix + ' ')
  const [selectedPreset, setSelectedPreset] = useState(0)
  const [model, setModel] = useState<ModelValue>('flux-2-pro')
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [generating, setGenerating] = useState(false)
  const [dragover, setDragover] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      setSourceImage(dataUrl)
      setSourceBase64(dataUrl.replace(/^data:image\/\w+;base64,/, ''))
    }
    reader.readAsDataURL(file)
  }, [])

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragover(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  const onPresetChange = (idx: number) => {
    setSelectedPreset(idx)
    setPrompt(presets[idx].promptPrefix + ' ')
  }

  const clearImage = () => {
    setSourceImage(null)
    setSourceBase64(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const generate = async () => {
    if (!prompt.trim()) return
    setGenerating(true)
    setResultUrl(null)
    setStatus('Submitting...')

    try {
      const params: GenerationParams = { prompt: prompt.trim(), model }

      if (sourceBase64) {
        if (isFlux2Model(model)) {
          params.input_image = sourceBase64
        } else {
          params.image_prompt = sourceBase64
        }
      }

      const url = await generateImage(params, setStatus)
      setResultUrl(url)
    } catch (err: unknown) {
      setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div style={{ padding: '0 1.5rem 2rem', maxWidth: 800, margin: '0 auto' }}>
      {/* Upload */}
      <div className="control-group">
        <label className="control-label">Source Image (optional)</label>
        {sourceImage ? (
          <div className="drop-zone has-image" style={{ position: 'relative' }}>
            <img src={sourceImage} alt="Source" style={{ width: '100%', display: 'block', borderRadius: 'var(--radius)' }} />
            <button
              onClick={clearImage}
              style={{
                position: 'absolute', top: 8, right: 8,
                background: 'rgba(0,0,0,0.7)', color: '#fff',
                border: 'none', borderRadius: 4, padding: '4px 10px',
                cursor: 'pointer', fontSize: '0.8rem',
              }}
            >
              Clear
            </button>
          </div>
        ) : (
          <div
            className={`drop-zone ${dragover ? 'dragover' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragover(true) }}
            onDragLeave={() => setDragover(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
          >
            Drop image here or click to upload
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={onFileChange}
          style={{ display: 'none' }}
        />
      </div>

      {/* Style Preset */}
      <div className="control-group">
        <label className="control-label">Style Preset</label>
        <select
          value={selectedPreset}
          onChange={(e) => onPresetChange(Number(e.target.value))}
        >
          {presets.map((p, i) => (
            <option key={i} value={i}>{p.name}</option>
          ))}
        </select>
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

      {/* Model */}
      <div className="control-group">
        <label className="control-label">Model</label>
        <select value={model} onChange={(e) => setModel(e.target.value as ModelValue)}>
          {MODELS.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>

      {/* Generate */}
      <button className="btn btn-primary" onClick={generate} disabled={generating || !prompt.trim()}>
        {generating ? <><span className="spinner" /> {status}</> : 'Generate'}
      </button>

      {/* Results */}
      {(sourceImage || resultUrl) && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: sourceImage && resultUrl ? '1fr 1fr' : '1fr',
          gap: '1rem',
          marginTop: '1.5rem',
        }}>
          {sourceImage && (
            <div>
              <div className="control-label" style={{ marginBottom: '0.5rem' }}>Original</div>
              <div className="image-display">
                <img src={sourceImage} alt="Original" />
              </div>
            </div>
          )}
          {resultUrl && (
            <div>
              <div className="control-label" style={{ marginBottom: '0.5rem' }}>Result</div>
              <div className="image-display">
                <img src={resultUrl} alt="Generated" />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Text-only result */}
      {!sourceImage && resultUrl && (
        <div style={{ marginTop: '1.5rem' }}>
          <div className="control-label" style={{ marginBottom: '0.5rem' }}>Result</div>
          <div className="image-display">
            <img src={resultUrl} alt="Generated" />
          </div>
        </div>
      )}

      {/* Status (non-generating) */}
      {!generating && status && status !== 'Done' && (
        <div className="status-bar" style={{ marginTop: '1rem' }}>
          <span className="status-dot" />
          {status}
        </div>
      )}
    </div>
  )
}
