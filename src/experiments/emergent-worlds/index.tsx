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
          background: 'var(--bg-tooltip)',
          border: '1px solid var(--on-overlay-border)',
          borderRadius: 6,
          padding: '0.6rem 0.8rem',
          fontSize: '0.7rem',
          fontFamily: 'var(--font-body)',
          color: 'var(--on-overlay-fg)',
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

// The header's Import and Export: an arrow into a tray and one out of it (on a phone, the icon alone).
const ICON = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const
const IMPORT_ICON = <svg {...ICON}><path d="M12 3v12M7 10l5 5 5-5M4 20h16" /></svg>
const EXPORT_ICON = <svg {...ICON}><path d="M12 15V3M7 8l5-5 5 5M4 20h16" /></svg>

export default function EmergentWorldsPage() {
  const ewRef = useRef<EmergentWorldsHandle>(null)

  return (
    <div className="sim-page">
      <LabHeader
        breadcrumbs={[{ label: 'Reimagined Ecosystems' }]}
        tools={
          <>
            <UsageTip />
            <button type="button" className="lab-tool" aria-label="Import" title="Import" onClick={() => ewRef.current?.doImport()}>
              {IMPORT_ICON}<span className="lab-tool-label">Import</span>
            </button>
            <button type="button" className="lab-tool" aria-label="Export" title="Export" onClick={() => ewRef.current?.doExport()}>
              {EXPORT_ICON}<span className="lab-tool-label">Export</span>
            </button>
            <ApiKeyButton />
          </>
        }
      />
      <EmergentWorlds ref={ewRef} />
    </div>
  )
}
