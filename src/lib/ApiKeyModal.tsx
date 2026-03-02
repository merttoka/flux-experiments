import { useState } from 'react'
import { getApiKey, setApiKey } from './bfl'

interface Props {
  open: boolean
  onClose: () => void
}

export default function ApiKeyModal({ open, onClose }: Props) {
  const [key, setKey] = useState(getApiKey())

  if (!open) return null

  const save = () => {
    setApiKey(key.trim())
    onClose()
  }

  return (
    <div className="lightbox-overlay" onClick={onClose} style={{ zIndex: 2000 }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '2rem',
          maxWidth: 440,
          width: '90vw',
        }}
      >
        <h3 style={{ marginBottom: '0.5rem', fontSize: '1.1rem' }}>BFL API Key</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginBottom: '1rem', lineHeight: 1.5 }}>
          Enter your Black Forest Labs API key. Get one at{' '}
          <a href="https://api.bfl.ai" target="_blank" rel="noreferrer">api.bfl.ai</a>.
          Stored locally in your browser.
        </p>
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="bfl_..."
          style={{ width: '100%', marginBottom: '1rem' }}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          autoFocus
        />
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={!key.trim()}>Save</button>
        </div>
      </div>
    </div>
  )
}
