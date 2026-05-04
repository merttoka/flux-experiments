import { useRef, useState, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import EmergentWorlds, { type EmergentWorldsHandle } from './EmergentWorlds'
import ApiKeyButton from '../../lib/ApiKeyButton'
import LabHeader from '../../components/LabHeader'

const USAGE_TEXT = `🧫 WebGPU DLA sim → FLUX img2img pipeline

🌀 Sim — GPU diffusion-limited aggregation. Particles stick to seeds forming fractal dendrites. Tweak dims, seeds, speed, DOF, color.

📷 Capture — Manual or auto-capture at any frame interval. ✕ on hover to delete.

🔀 Transform — FLUX img2img on captured frames.
⛓ Chained: AI output feeds into next frame
⚡ Parallel: all frames fire concurrently

🎨 Style — 12 presets or custom prompt.

🔍 Lightbox — Click frames. Sim + AI side-by-side when available.

📦 Export/Import — Full session as zip.

⌨ Hold \\ for keyboard shortcuts`

function UsageTip() {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const onEnter = (e: MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setPos({ x: rect.left + rect.width / 2, y: rect.bottom + 8 })
  }
  return (
    <>
      <span
        className="tip"
        onMouseEnter={onEnter}
        onMouseLeave={() => setPos(null)}
        style={{ cursor: 'help' }}
      >?</span>
      {pos && createPortal(
        <div style={{
          position: 'fixed',
          left: Math.min(Math.max(16, pos.x), window.innerWidth - 316),
          top: pos.y,
          background: '#222',
          border: '1px solid var(--border)',
          borderRadius: 6,
          padding: '0.6rem 0.8rem',
          fontSize: '0.7rem',
          fontFamily: 'var(--font-body)',
          color: 'var(--text-secondary)',
          maxWidth: 300,
          lineHeight: 1.5,
          whiteSpace: 'pre-line',
          zIndex: 9999,
          pointerEvents: 'none',
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        }}>{USAGE_TEXT}</div>,
        document.body
      )}
    </>
  )
}

export default function EmergentWorldsPage() {
  const ewRef = useRef<EmergentWorldsHandle>(null)

  return (
    <div className="sim-page">
      <LabHeader
        breadcrumbs={[
          { label: 'FLUX Demos', href: '/' },
          { label: 'Reimagined Ecosystems' },
        ]}
        rightExtras={
          <>
            <UsageTip />
            <button
              className="btn btn-secondary"
              onClick={() => ewRef.current?.doImport()}
              style={{ padding: '0.2rem 0.5rem', fontSize: '0.65rem' }}
            >
              Import
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => ewRef.current?.doExport()}
              style={{ padding: '0.2rem 0.5rem', fontSize: '0.65rem' }}
            >
              Export
            </button>
            <ApiKeyButton />
          </>
        }
      />
      <EmergentWorlds ref={ewRef} />
    </div>
  )
}
