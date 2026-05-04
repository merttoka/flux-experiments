import { useState, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import StyleBridge from './StyleBridge'
import ApiKeyButton from '../../lib/ApiKeyButton'
import LabHeader from '../../components/LabHeader'

const USAGE_TEXT = `🎨 Style Presets — pick a preset to auto-fill the prompt. Edit freely.

🧬 Style DNA Mixer — click + next to the preset dropdown to blend two styles. Adjust the A/B weight slider. Each style gets its own prompt textarea.

⚖️ A/B Model Compare — click + next to the model dropdown to generate with two models in parallel using the same seed.

⚙️ Advanced Settings — click the toggle right of the Model label. When comparing, settings for both models are shown with "[model] only" badges.

🖼️ Gallery — results persist in your browser (IndexedDB). Toggle list/thumbnail view. Hover the ? for storage size. Click entries to open lightbox.`

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

export default function FluxStyleBridge() {
  return (
    <div className="sim-page">
      <LabHeader
        breadcrumbs={[
          { label: 'FLUX Demos', href: '/' },
          { label: 'Style Bridge' },
        ]}
        rightExtras={<><UsageTip /><ApiKeyButton /></>}
      />
      <div style={{ flex: 1, width: '100%', paddingTop: '1.5rem' }}>
        <StyleBridge />
      </div>
    </div>
  )
}
