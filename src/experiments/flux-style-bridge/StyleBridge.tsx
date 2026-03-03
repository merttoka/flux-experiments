import { useState, useRef, useCallback, useEffect, type DragEvent, type ChangeEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { generateImage, hasApiKey, MODELS, isFlux2Model, type ModelValue, type GenerationParams } from '../../lib/bfl'
import { presets, blendPrompts } from './presets'
import CompareSlider from './CompareSlider'
import { loadGallery, saveEntry, deleteEntry, estimateStorageBytes, urlToDataUrl, type StoredGalleryEntry } from '../../lib/galleryDB'

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
          left: Math.min(pos.x, window.innerWidth - 236),
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
          whiteSpace: 'pre-line',
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

// Param visibility matrix for help tooltip
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

interface GallerySettings {
  model: string
  seed: number | null
  format: string
  safety: number
  size?: string
  steps?: number
  guidance?: number
  upsampling?: boolean
  raw?: boolean
  imgStrength?: number
}

interface GalleryEntry {
  sourceImage: string | null
  resultUrl: string
  prompt: string
  timestamp: number
  settings: GallerySettings
  // A/B compare fields
  resultUrl2?: string
  settings2?: GallerySettings
  isCompare?: boolean
  compareWarning?: string
}

function modelShortLabel(m: ModelValue): string {
  const full = MODELS.find(x => x.value === m)?.label ?? m
  const match = full.match(/\[([^\]]+)\]/)
  return match ? `[${match[1]}]` : full
}

function capCheck(cap: Set<string>, m1: ModelValue, m2: ModelValue | null): { show: boolean; only: string | null } {
  const a = cap.has(m1)
  const b = m2 ? cap.has(m2) : false
  if (!a && !b) return { show: false, only: null }
  if (a && b) return { show: true, only: null }
  return { show: true, only: a ? modelShortLabel(m1) : modelShortLabel(m2!) }
}

function OnlyBadge({ only }: { only: string | null }) {
  if (!only) return null
  return (
    <span style={{
      fontSize: '0.55rem',
      fontFamily: 'var(--font-mono)',
      color: 'var(--text-muted)',
      marginLeft: 4,
      whiteSpace: 'nowrap',
      opacity: 0.7,
    }}>{only} only</span>
  )
}


function buildModelParams(
  capturedPrompt: string,
  targetModel: ModelValue,
  sourceBase64: string | null,
  resolvedSeed: number | null,
  opts: {
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
  },
): { params: GenerationParams; settings: GallerySettings } {
  const params: GenerationParams = { prompt: capturedPrompt, model: targetModel }

  if (sourceBase64) {
    if (isFlux2Model(targetModel)) {
      params.input_image = sourceBase64
    } else {
      params.image_prompt = sourceBase64
    }
  }

  if (opts.sizeMode === 'custom') {
    if (MODELS_WITH_DIMENSIONS.has(targetModel)) {
      params.width = opts.width
      params.height = opts.height
    }
    if (MODELS_WITH_ASPECT_RATIO.has(targetModel)) {
      params.aspect_ratio = opts.aspectRatio
    }
  }

  if (MODELS_WITH_GUIDANCE.has(targetModel)) {
    params.steps = opts.steps
    params.guidance = opts.guidance
  }
  if (resolvedSeed !== null) {
    params.seed = resolvedSeed
  }
  if (MODELS_WITH_UPSAMPLING.has(targetModel)) {
    params.prompt_upsampling = opts.promptUpsampling
  }

  params.output_format = opts.outputFormat
  params.safety_tolerance = opts.safetyTolerance
  if (MODELS_WITH_RAW.has(targetModel)) {
    params.raw = opts.raw
  }
  if (MODELS_WITH_IMG_STRENGTH.has(targetModel) && sourceBase64) {
    params.image_prompt_strength = opts.imagePromptStrength
  }

  const settings: GallerySettings = {
    model: MODELS.find(m => m.value === targetModel)?.label ?? targetModel,
    seed: resolvedSeed,
    format: opts.outputFormat,
    safety: opts.safetyTolerance,
  }
  if (opts.sizeMode === 'custom') {
    if (MODELS_WITH_DIMENSIONS.has(targetModel)) settings.size = `${opts.width}×${opts.height}`
    if (MODELS_WITH_ASPECT_RATIO.has(targetModel)) settings.size = opts.aspectRatio
  }
  if (MODELS_WITH_GUIDANCE.has(targetModel)) {
    settings.steps = opts.steps
    settings.guidance = opts.guidance
  }
  if (MODELS_WITH_UPSAMPLING.has(targetModel)) settings.upsampling = opts.promptUpsampling
  if (MODELS_WITH_RAW.has(targetModel)) settings.raw = opts.raw
  if (MODELS_WITH_IMG_STRENGTH.has(targetModel) && sourceBase64) settings.imgStrength = opts.imagePromptStrength

  return { params, settings }
}

function SettingsTags({ s }: { s: GallerySettings }) {
  return (
    <>
      <span>{s.model}</span>
      <span>seed:{s.seed ?? 'rand'}</span>
      <span>{s.format}</span>
      <span>safety:{s.safety}</span>
      {s.size && <span>{s.size}</span>}
      {s.steps !== undefined && <span>steps:{s.steps}</span>}
      {s.guidance !== undefined && <span>g:{s.guidance}</span>}
      {s.upsampling !== undefined && <span>upsample:{s.upsampling ? 'on' : 'off'}</span>}
      {s.raw && <span>raw</span>}
      {s.imgStrength !== undefined && <span>str:{s.imgStrength}</span>}
    </>
  )
}

export default function StyleBridge() {
  const [sourceImage, setSourceImage] = useState<string | null>(null)
  const [sourceBase64, setSourceBase64] = useState<string | null>(null)
  const [prompt, setPrompt] = useState(presets[0].promptPrefix + ' ')
  const [selectedPreset, setSelectedPreset] = useState(0)
  const [model, setModel] = useState<ModelValue>('flux-2-pro')
  const [gallery, setGallery] = useState<GalleryEntry[]>([])
  const [galleryLoaded, setGalleryLoaded] = useState(false)
  const [storageSize, setStorageSize] = useState(0)
  const [galleryView, setGalleryView] = useState<'list' | 'thumb'>('list')
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [status, setStatus] = useState('')
  const [generating, setGenerating] = useState(false)
  const [dragover, setDragover] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [hasKey, setHasKey] = useState(hasApiKey())

  useEffect(() => {
    const onKeyChange = () => setHasKey(hasApiKey())
    window.addEventListener('bfl-key-change', onKeyChange)
    return () => window.removeEventListener('bfl-key-change', onKeyChange)
  }, [])

  // Style DNA Mixer state
  const [mixerEnabled, setMixerEnabled] = useState(false)
  const [secondPreset, setSecondPreset] = useState(1)
  const [prompt2, setPrompt2] = useState(presets[1].promptPrefix + ' ')
  const [blendWeight, setBlendWeight] = useState(60) // % for first preset

  // A/B Compare state
  const [compareEnabled, setCompareEnabled] = useState(false)
  const [model2, setModel2] = useState<ModelValue>('flux-2-max')
  const statusARef = useRef('Waiting...')
  const statusBRef = useRef('Waiting...')

  // Advanced settings state
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [sizeMode, setSizeMode] = useState<'default' | 'custom'>('default')
  const [width, setWidth] = useState(1024)
  const [height, setHeight] = useState(768)
  const [aspectRatio, setAspectRatio] = useState('16:9')
  const [steps, setSteps] = useState(50)
  const [guidance, setGuidance] = useState(5)
  const [seed, setSeed] = useState<number | null>(null)
  const [outputFormat, setOutputFormat] = useState<'jpeg' | 'png'>('jpeg')
  const [safetyTolerance, setSafetyTolerance] = useState(2)
  const [promptUpsampling, setPromptUpsampling] = useState(true)
  const [raw, setRaw] = useState(false)
  const [imagePromptStrength, setImagePromptStrength] = useState(0.1)
  const [helpHover, setHelpHover] = useState<{ x: number; y: number } | null>(null)

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

  const onSecondPresetChange = (idx: number) => {
    setSecondPreset(idx)
    setPrompt2(presets[idx].promptPrefix + ' ')
  }

  const clearImage = () => {
    setSourceImage(null)
    setSourceBase64(null)
    if (fileRef.current) fileRef.current.value = ''
  }

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

  const advancedOpts = {
    sizeMode, width, height, aspectRatio, steps, guidance,
    outputFormat, safetyTolerance, promptUpsampling, raw, imagePromptStrength,
  }

  const m2 = compareEnabled ? model2 : null
  const capGuidance = capCheck(MODELS_WITH_GUIDANCE, model, m2)
  const capUpsampling = capCheck(MODELS_WITH_UPSAMPLING, model, m2)
  const capAspectRatio = capCheck(MODELS_WITH_ASPECT_RATIO, model, m2)
  const capDimensions = capCheck(MODELS_WITH_DIMENSIONS, model, m2)
  const capRaw = capCheck(MODELS_WITH_RAW, model, m2)
  const capImgStrength = capCheck(MODELS_WITH_IMG_STRENGTH, model, m2)
  const capImg2Img = capCheck(MODELS_WITH_IMG2IMG, model, m2)

  const refreshStorageSize = useCallback(() => {
    estimateStorageBytes().then(setStorageSize)
  }, [])

  // Load gallery from IndexedDB on mount
  useEffect(() => {
    loadGallery().then(entries => {
      setGallery(entries as unknown as GalleryEntry[])
      setGalleryLoaded(true)
    })
    refreshStorageSize()
  }, [refreshStorageSize])

  const addToGallery = useCallback(async (entry: GalleryEntry) => {
    // Convert remote URLs to data URLs for permanent local storage
    const stored = { ...entry }
    try {
      if (stored.resultUrl && !stored.resultUrl.startsWith('data:')) {
        stored.resultUrl = await urlToDataUrl(stored.resultUrl)
      }
      if (stored.resultUrl2 && !stored.resultUrl2.startsWith('data:')) {
        stored.resultUrl2 = await urlToDataUrl(stored.resultUrl2)
      }
    } catch {
      // keep original URLs if conversion fails
    }
    setGallery(prev => [stored, ...prev])
    await saveEntry(stored as unknown as StoredGalleryEntry)
    refreshStorageSize()
  }, [refreshStorageSize])

  const removeFromGallery = useCallback(async (timestamp: number) => {
    setGallery(prev => prev.filter(e => e.timestamp !== timestamp))
    setLightboxIndex(null)
    await deleteEntry(timestamp)
    refreshStorageSize()
  }, [refreshStorageSize])

  const generate = async () => {
    if (!prompt.trim()) return
    setGenerating(true)
    setStatus('Submitting...')
    statusARef.current = 'Waiting...'
    statusBRef.current = 'Waiting...'

    const capturedSource = sourceImage

    // Compose final prompt — apply mixer blending if enabled
    let capturedPrompt = prompt.trim()
    if (mixerEnabled) {
      capturedPrompt = blendPrompts(presets[selectedPreset], presets[secondPreset], blendWeight, prompt.trim(), prompt2.trim())
    }

    // Ensure deterministic seed for compare mode
    const resolvedSeed = compareEnabled && seed === null
      ? Math.floor(Math.random() * 2147483647)
      : seed

    try {
      if (compareEnabled) {
        // A/B compare: parallel generation
        const { params: paramsA, settings: settingsA } = buildModelParams(capturedPrompt, model, sourceBase64, resolvedSeed, advancedOpts)
        const { params: paramsB, settings: settingsB } = buildModelParams(capturedPrompt, model2, sourceBase64, resolvedSeed, advancedOpts)

        setStatus('A: Submitting... | B: Submitting...')

        const [resultA, resultB] = await Promise.allSettled([
          generateImage(paramsA, (s) => { statusARef.current = s; setStatus(`A: ${s} | B: ${statusBRef.current}`) }),
          generateImage(paramsB, (s) => { statusBRef.current = s; setStatus(`A: ${statusARef.current} | B: ${s}`) }),
        ])

        const urlA = resultA.status === 'fulfilled' ? resultA.value : null
        const urlB = resultB.status === 'fulfilled' ? resultB.value : null
        const errA = resultA.status === 'rejected' ? (resultA.reason instanceof Error ? resultA.reason.message : String(resultA.reason)) : null
        const errB = resultB.status === 'rejected' ? (resultB.reason instanceof Error ? resultB.reason.message : String(resultB.reason)) : null

        if (!urlA && !urlB) {
          setStatus(`Both failed — A: ${errA} | B: ${errB}`)
          return
        }

        if (urlA && urlB) {
          addToGallery({
            sourceImage: capturedSource,
            resultUrl: urlA,
            resultUrl2: urlB,
            prompt: capturedPrompt,
            timestamp: Date.now(),
            settings: settingsA,
            settings2: settingsB,
            isCompare: true,
          })
        } else {
          const url = urlA ?? urlB!
          const s = urlA ? settingsA : settingsB
          const failedModel = urlA ? settingsB.model : settingsA.model
          const failErr = urlA ? errB : errA
          addToGallery({
            sourceImage: capturedSource,
            resultUrl: url,
            prompt: capturedPrompt,
            timestamp: Date.now(),
            settings: s,
            compareWarning: `${failedModel} failed: ${failErr}`,
          })
        }
        setStatus('Done')
      } else {
        const { params, settings } = buildModelParams(capturedPrompt, model, sourceBase64, resolvedSeed, advancedOpts)
        const url = await generateImage(params, setStatus)
        addToGallery({
          sourceImage: capturedSource,
          resultUrl: url,
          prompt: capturedPrompt,
          timestamp: Date.now(),
          settings,
        })
      }
    } catch (err: unknown) {
      setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setGenerating(false)
    }
  }

  // Lightbox keyboard navigation
  useEffect(() => {
    if (lightboxIndex === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxIndex(null)
      if (e.key === 'ArrowLeft') setLightboxIndex((i) => i !== null && i > 0 ? i - 1 : i)
      if (e.key === 'ArrowRight') setLightboxIndex((i) => i !== null && i < gallery.length - 1 ? i + 1 : i)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxIndex, gallery.length])

  const lightboxEntry = lightboxIndex !== null ? gallery[lightboxIndex] : null

  const labelStyle = {
    color: 'var(--text-muted)',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.75rem',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    marginBottom: '0.5rem',
  }

  const navBtnStyle = {
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.2)',
    color: '#fff',
    borderRadius: 6,
    padding: '8px 16px',
    cursor: 'pointer',
    fontSize: '0.85rem',
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

  const metaTagStyle = {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '0.2rem 0.5rem',
    fontSize: '0.65rem',
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-muted)',
    opacity: 0.7,
  }


  return (
    <div style={{ padding: '0 1.5rem 2rem', maxWidth: 800, margin: '0 auto' }}>
      {/* Upload */}
      <div className="control-group">
        <label className="control-label">Source Image (optional)</label>
        {sourceImage ? (
          <div className="drop-zone has-image" style={{ position: 'relative', display: 'inline-block' }}>
            <img src={sourceImage} alt="Source" style={{ display: 'block', maxHeight: 120, maxWidth: '100%', borderRadius: 'var(--radius)' }} />
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

      {/* Style Preset + Mixer */}
      <div className="control-group">
        <label className="control-label">Style Preset</label>

        {mixerEnabled && (
          <div style={{ marginBottom: '0.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={sliderLabelStyle}>Blend</span>
              <span style={sliderValueStyle}>{blendWeight}% A / {100 - blendWeight}% B</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={blendWeight}
              onChange={(e) => setBlendWeight(Number(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <select
            value={selectedPreset}
            onChange={(e) => onPresetChange(Number(e.target.value))}
            style={{ flex: 1 }}
          >
            {presets.map((p, i) => (
              <option key={i} value={i}>{p.name}{mixerEnabled ? ' (A)' : ''}</option>
            ))}
          </select>
          {mixerEnabled && (
            <select
              value={secondPreset}
              onChange={(e) => onSecondPresetChange(Number(e.target.value))}
              style={{ flex: 1 }}
            >
              {presets.map((p, i) => (
                <option key={i} value={i}>{p.name} (B)</option>
              ))}
            </select>
          )}
          {!mixerEnabled ? (
            <button
              className="btn-icon"
              onClick={() => setMixerEnabled(true)}
              title="Enable Style DNA Mixer"
            >+</button>
          ) : (
            <button
              className="btn-icon active"
              onClick={() => setMixerEnabled(false)}
              title="Disable mixer"
            >×</button>
          )}
        </div>
      </div>

      {/* Prompt */}
      <div className="control-group">
        <label className="control-label">Prompt</label>
        {mixerEnabled ? (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span className="label-mono">
                {presets[selectedPreset].name} (A)
              </span>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={5}
              />
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span className="label-mono">
                {presets[secondPreset].name} (B)
              </span>
              <textarea
                value={prompt2}
                onChange={(e) => setPrompt2(e.target.value)}
                rows={5}
              />
            </div>
          </div>
        ) : (
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={5}
          />
        )}
      </div>

      {/* Model + Compare + Advanced Settings */}
      <div className="control-group" style={{ marginBottom: '1rem', position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <label className="control-label" style={{ marginBottom: 0 }}>Model{compareEnabled ? ' A' : ''}</label>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              cursor: 'pointer',
              userSelect: 'none',
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
              ▾
            </span>
          {/* Help tooltip trigger */}
          <span
            style={{
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
            onMouseEnter={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              setHelpHover({ x: rect.left, y: rect.bottom + 6 })
            }}
            onMouseLeave={() => setHelpHover(null)}
          >
            ?
          </span>
          {helpHover && createPortal(
            <div style={{
              position: 'fixed',
              top: helpHover.y,
              right: 'auto',
              left: Math.min(helpHover.x, window.innerWidth - 420),
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '0.75rem',
              zIndex: 9999,
              maxWidth: 'min(500px, calc(100vw - 2rem))',
              fontSize: '0.7rem',
              fontFamily: 'var(--font-mono)',
              overflowX: 'auto' as const,
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
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
                          {row.models[m] ? '✓' : '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>,
            document.body
          )}
        </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <select value={model} onChange={(e) => setModel(e.target.value as ModelValue)} style={{ flex: 1 }}>
            {MODELS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          {compareEnabled && (
            <select value={model2} onChange={(e) => setModel2(e.target.value as ModelValue)} style={{ flex: 1 }}>
              {MODELS.map((m) => (
                <option key={m.value} value={m.value}>{m.label} (B)</option>
              ))}
            </select>
          )}
          {!compareEnabled ? (
            <button
              className="btn-icon"
              onClick={() => setCompareEnabled(true)}
              title="Enable A/B Model Compare"
            >+</button>
          ) : (
            <button
              className="btn-icon active"
              onClick={() => setCompareEnabled(false)}
              title="Disable compare"
            >×</button>
          )}
        </div>

        {advancedOpen && (
          <div className="advanced-panel">
            {/* Group 1: Size */}
            <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
              <div className="label-group">Size</div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <select value={sizeMode} onChange={(e) => setSizeMode(e.target.value as 'default' | 'custom')}>
                  <option value="default">{capImg2Img.show ? 'Source Dimensions' : 'Default'}</option>
                  <option value="custom">Custom</option>
                </select>

                {sizeMode === 'custom' && capDimensions.show && (
                  <>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <input
                        type="number"
                        value={width}
                        onChange={(e) => setWidth(Number(e.target.value))}
                        style={{ flex: 1 }}
                        min={256}
                        max={1440}
                        step={32}
                        placeholder="Width"
                      />
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>×</span>
                      <input
                        type="number"
                        value={height}
                        onChange={(e) => setHeight(Number(e.target.value))}
                        style={{ flex: 1 }}
                        min={256}
                        max={1440}
                        step={32}
                        placeholder="Height"
                      />
                    </div>
                    <OnlyBadge only={capDimensions.only} />
                  </>
                )}

                {sizeMode === 'custom' && capAspectRatio.show && (
                  <div>
                    <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)}>
                      {ASPECT_RATIOS.map(r => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                    <OnlyBadge only={capAspectRatio.only} />
                  </div>
                )}
              </div>
            </div>

            {/* Group 2: Generation */}
            <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
              <div className="label-group">Generation</div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {capGuidance.show && (
                  <>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                        <span style={{ ...sliderLabelStyle, display: 'flex', alignItems: 'center' }}>Steps<Tip text="Denoising iterations. More steps = higher quality but slower. Default 50." /><OnlyBadge only={capGuidance.only} /></span>
                        <span style={sliderValueStyle}>{steps}</span>
                      </div>
                      <input type="range" min={1} max={50} value={steps} onChange={(e) => setSteps(Number(e.target.value))} style={{ width: '100%' }} />
                    </div>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                        <span style={{ ...sliderLabelStyle, display: 'flex', alignItems: 'center' }}>Guidance<Tip text="Prompt adherence strength. Higher values follow the prompt more literally. Range 1.5–10." /><OnlyBadge only={capGuidance.only} /></span>
                        <span style={sliderValueStyle}>{guidance}</span>
                      </div>
                      <input type="range" min={1.5} max={10} step={0.5} value={guidance} onChange={(e) => setGuidance(Number(e.target.value))} style={{ width: '100%' }} />
                    </div>
                  </>
                )}

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                    <span style={{ ...sliderLabelStyle, display: 'flex', alignItems: 'center' }}>Seed<Tip text="Fixed seed for reproducible results. Leave empty for a random seed each generation." /></span>
                    <button
                      onClick={() => setSeed(Math.floor(Math.random() * 2147483647))}
                      className="btn-tag"
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

                {capUpsampling.show && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)', cursor: 'pointer', flexWrap: 'wrap' }}>
                    <input
                      type="checkbox"
                      checked={promptUpsampling}
                      onChange={(e) => setPromptUpsampling(e.target.checked)}
                      style={{ accentColor: 'var(--accent)' }}
                    />
                    Prompt Upsampling
                    <Tip text="Auto-enhances your prompt with additional detail before generation for richer results." />
                    <OnlyBadge only={capUpsampling.only} />
                  </label>
                )}
              </div>
            </div>

            {/* Group 3: Output */}
            <div>
              <div className="label-group">Output</div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', marginBottom: 2 }}>Format<Tip text="Output image format. PNG is lossless/larger file size. JPEG is lossy/smaller." /></span>
                  <select value={outputFormat} onChange={(e) => setOutputFormat(e.target.value as 'jpeg' | 'png')}>
                    <option value="jpeg">JPEG</option>
                    <option value="png">PNG</option>
                  </select>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ ...sliderLabelStyle, display: 'flex', alignItems: 'center' }}>Safety Tolerance<Tip text="Content filter strictness. 0 = most strict, higher = more permissive. Max 6 for 1.1 Pro." /></span>
                    <span style={sliderValueStyle}>
                      {safetyTolerance === 0 && <span style={{ marginRight: 4 }}>Strict</span>}
                      {safetyTolerance === (model === 'flux-pro-1.1' ? 6 : 5) && <span style={{ marginRight: 4 }}>Loose</span>}
                      {safetyTolerance}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={model === 'flux-pro-1.1' ? 6 : 5}
                    value={safetyTolerance}
                    onChange={(e) => setSafetyTolerance(Number(e.target.value))}
                    style={{ width: '100%' }}
                  />
                </div>

                {capRaw.show && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)', cursor: 'pointer', flexWrap: 'wrap' }}>
                    <input
                      type="checkbox"
                      checked={raw}
                      onChange={(e) => setRaw(e.target.checked)}
                      style={{ accentColor: 'var(--accent)' }}
                    />
                    Raw Mode
                    <Tip text="Disables automatic prompt enhancement for more direct, literal control over output." />
                    <OnlyBadge only={capRaw.only} />
                  </label>
                )}

                {capImgStrength.show && sourceBase64 && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                      <span style={{ ...sliderLabelStyle, display: 'flex', alignItems: 'center' }}>Image Prompt Strength<Tip text="How much the source image influences output. 0 = minimal influence, 1 = maximum adherence." /><OnlyBadge only={capImgStrength.only} /></span>
                      <span style={sliderValueStyle}>{imagePromptStrength.toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={imagePromptStrength}
                      onChange={(e) => setImagePromptStrength(Number(e.target.value))}
                      style={{ width: '100%' }}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Generate */}
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <button className="btn btn-primary" onClick={generate} disabled={generating || !prompt.trim() || !hasKey}>
          {generating ? <><span className="spinner" /> {status}</> : compareEnabled ? 'Generate A/B' : 'Generate'}
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

      {/* Status (non-generating) */}
      {!generating && status && status !== 'Done' && (
        <div className="status-bar" style={{ marginTop: '1rem' }}>
          <span className="status-dot" />
          {status}
        </div>
      )}

      {/* Gallery */}
      {gallery.length > 0 && (
        <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="control-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            Gallery ({gallery.length})
            <Tip text={`Stored locally in IndexedDB. \n\nCurrent size: ${storageSize < 1024 ? storageSize + ' B' : storageSize < 1048576 ? (storageSize / 1024).toFixed(1) + ' KB' : (storageSize / 1048576).toFixed(1) + ' MB'}`} />
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
              {(['list', 'thumb'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setGalleryView(v)}
                  className={`btn-tag${galleryView === v ? ' active' : ''}`}
                >{v === 'list' ? '☰' : '⊞'}</button>
              ))}
            </div>
          </div>

          {galleryView === 'list' ? (
            /* List view */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {gallery.map((entry, i) => (
                <div
                  key={entry.timestamp}
                  onClick={() => setLightboxIndex(i)}
                  className="gallery-entry"
                >
                  {entry.isCompare && entry.resultUrl2 ? (
                    <div>
                      <CompareSlider
                        imageA={entry.resultUrl}
                        imageB={entry.resultUrl2}
                        labelA={entry.settings.model}
                        labelB={entry.settings2?.model ?? 'B'}
                      />
                    </div>
                  ) : (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: entry.sourceImage ? '1fr 1fr' : '1fr',
                      gap: '0.75rem',
                    }}>
                      {entry.sourceImage && (
                        <div>
                          <div style={{ ...labelStyle, marginBottom: '0.35rem' }}>Original</div>
                          <div className="image-display">
                            <img src={entry.sourceImage} alt="Original" />
                          </div>
                        </div>
                      )}
                      <div>
                        <div style={{ ...labelStyle, marginBottom: '0.35rem' }}>Result</div>
                        <div className="image-display">
                          <img src={entry.resultUrl} alt="Generated" />
                        </div>
                      </div>
                    </div>
                  )}
                  <div style={{
                    marginTop: '0.5rem',
                    fontSize: '0.8rem',
                    color: 'var(--text-muted)',
                    overflow: 'hidden',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                  }}>
                    {entry.prompt}
                  </div>
                  {entry.compareWarning && (
                    <div style={{ marginTop: '0.25rem', fontSize: '0.7rem', color: '#f59e0b' }}>
                      ⚠ {entry.compareWarning}
                    </div>
                  )}
                  <div style={{ ...metaTagStyle, marginTop: '0.35rem', alignItems: 'center' }}>
                    <span style={{ opacity: 1, color: 'var(--text-muted)', fontSize: '0.6rem' }}>
                      {new Date(entry.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <SettingsTags s={entry.settings} />
                    {entry.isCompare && entry.settings2 && (
                      <>
                        <span style={{ color: 'var(--accent)' }}>vs</span>
                        <SettingsTags s={entry.settings2} />
                      </>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); removeFromGallery(entry.timestamp) }}
                      style={{
                        marginLeft: 'auto',
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        fontSize: '0.65rem',
                        fontFamily: 'var(--font-mono)',
                        opacity: 1,
                        padding: '2px 4px',
                        transition: 'opacity 0.15s, color 0.15s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444' }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)' }}
                      title="Delete from gallery"
                    >
                      delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Thumbnail view */
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: '0.5rem',
            }}>
              {gallery.map((entry, i) => (
                <div
                  key={entry.timestamp}
                  onClick={() => setLightboxIndex(i)}
                  style={{
                    cursor: 'pointer',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    overflow: 'hidden',
                    transition: 'border-color 0.15s',
                    position: 'relative',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
                >
                  <div style={{ aspectRatio: '1', overflow: 'hidden', position: 'relative' }}>
                    {entry.isCompare && entry.resultUrl2 ? (
                      <CompareSlider
                        imageA={entry.resultUrl}
                        imageB={entry.resultUrl2}
                        labelA={entry.settings.model}
                        labelB={entry.settings2?.model ?? 'B'}
                        style={{ width: '100%', height: '100%' }}
                        cover
                      />
                    ) : (
                      <img
                        src={entry.resultUrl}
                        alt="Generated"
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      />
                    )}
                  </div>
                  <div style={{
                    padding: '4px 6px',
                    fontSize: '0.55rem',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-muted)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    <span>{new Date(entry.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeFromGallery(entry.timestamp) }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        fontSize: '0.55rem',
                        fontFamily: 'var(--font-mono)',
                        opacity: 0.4,
                        padding: 0,
                        transition: 'opacity 0.15s, color 0.15s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = '#ef4444' }}
                      onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.4'; e.currentTarget.style.color = 'var(--text-muted)' }}
                      title="Delete"
                    >×</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Lightbox */}
      {lightboxEntry && (
        <div className="lightbox-overlay" onClick={() => setLightboxIndex(null)}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              maxWidth: '90vw',
              maxHeight: '90vh',
              gap: '1rem',
              overflow: 'hidden',
              cursor: 'default',
              background: '#0a0a0a',
              borderRadius: 12,
              padding: '1.5rem',
              boxShadow: '0 0 0 1px rgba(255,255,255,0.06), 0 24px 80px rgba(0,0,0,0.7), 0 8px 24px rgba(0,0,0,0.5)',
            }}
          >
            {/* Images — flex-shrink so text below always shows */}
            <div style={{ flex: '1 1 auto', minHeight: 0, overflow: 'auto', width: '100%', display: 'flex', justifyContent: 'center' }}>
              {lightboxEntry.isCompare && lightboxEntry.resultUrl2 ? (
                <div style={{ width: '100%', maxWidth: 900 }}>
                  {lightboxEntry.sourceImage && (
                    <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                      <div style={labelStyle}>Original</div>
                      <img
                        src={lightboxEntry.sourceImage}
                        alt="Original"
                        style={{ maxWidth: '40%', maxHeight: '20vh', borderRadius: 'var(--radius)' }}
                      />
                    </div>
                  )}
                  <CompareSlider
                    imageA={lightboxEntry.resultUrl}
                    imageB={lightboxEntry.resultUrl2}
                    labelA={lightboxEntry.settings.model}
                    labelB={lightboxEntry.settings2?.model ?? 'B'}
                  />
                </div>
              ) : (
                <div style={{
                  display: 'flex',
                  gap: '1.5rem',
                  alignItems: 'flex-start',
                }}>
                  {lightboxEntry.sourceImage && (
                    <div style={{ flex: 1, textAlign: 'center' }}>
                      <div style={labelStyle}>Original</div>
                      <img
                        src={lightboxEntry.sourceImage}
                        alt="Original"
                        style={{ maxWidth: '100%', maxHeight: '65vh', borderRadius: 'var(--radius)' }}
                      />
                    </div>
                  )}
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={labelStyle}>Result</div>
                    <img
                      src={lightboxEntry.resultUrl}
                      alt="Generated"
                      style={{ maxWidth: '100%', maxHeight: '65vh', borderRadius: 'var(--radius)' }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Prompt + settings — flex-shrink: 0 so always visible */}
            <div style={{ flexShrink: 0, width: '100%', textAlign: 'center' }}>
              <div style={{
                color: 'var(--text-muted)',
                fontSize: '0.85rem',
                lineHeight: 1.5,
                marginBottom: '0.5rem',
              }}>
                {lightboxEntry.prompt}
              </div>
              {lightboxEntry.compareWarning && (
                <div style={{ fontSize: '0.75rem', color: '#f59e0b', marginBottom: '0.5rem' }}>
                  ⚠ {lightboxEntry.compareWarning}
                </div>
              )}
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '0.2rem 0.5rem',
                fontSize: '0.7rem',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-muted)',
                opacity: 0.7,
              }}>
                <span style={{ opacity: 1, fontSize: '0.6rem' }}>
                  {new Date(lightboxEntry.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
                <SettingsTags s={lightboxEntry.settings} />
                {lightboxEntry.isCompare && lightboxEntry.settings2 && (
                  <>
                    <span style={{ color: 'var(--accent)' }}>vs</span>
                    <SettingsTags s={lightboxEntry.settings2} />
                  </>
                )}
              </div>
              <button
                onClick={() => removeFromGallery(lightboxEntry.timestamp)}
                style={{
                  marginTop: '0.5rem',
                  background: 'none',
                  border: '1px solid rgba(255,255,255,0.15)',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: '0.7rem',
                  fontFamily: 'var(--font-mono)',
                  padding: '4px 12px',
                  borderRadius: 4,
                  transition: 'border-color 0.15s, color 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#ef4444'; e.currentTarget.style.color = '#ef4444' }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; e.currentTarget.style.color = 'var(--text-muted)' }}
              >
                Delete
              </button>
            </div>

            {/* Navigation */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <button
                style={{ ...navBtnStyle, opacity: lightboxIndex === 0 ? 0.3 : 1 }}
                disabled={lightboxIndex === 0}
                onClick={() => setLightboxIndex((i) => i !== null && i > 0 ? i - 1 : i)}
              >
                &larr; Newer
              </button>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
                {lightboxIndex! + 1} / {gallery.length}
              </span>
              <button
                style={{ ...navBtnStyle, opacity: lightboxIndex === gallery.length - 1 ? 0.3 : 1 }}
                disabled={lightboxIndex === gallery.length - 1}
                onClick={() => setLightboxIndex((i) => i !== null && i < gallery.length - 1 ? i + 1 : i)}
              >
                Older &rarr;
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
