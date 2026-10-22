import { useState } from 'react'
import { getApiKey, setApiKey, clearApiKey, isKeyRemembered } from './bfl'

interface Props {
  open: boolean
  onClose: () => void
}

export default function ApiKeyModal({ open, onClose }: Props) {
  const [key, setKey] = useState(getApiKey())
  const [remember, setRemember] = useState(isKeyRemembered())

  if (!open) return null

  const save = () => {
    setApiKey(key.trim(), remember)
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
          It stays in this tab until you close it.
        </p>
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="bfl_..."
          style={{ width: '100%', marginBottom: '0.75rem' }}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          autoFocus
        />
        <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline', fontSize: '0.82rem', marginBottom: '1rem', lineHeight: 1.5 }}>
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <span>
            Remember on this device.{' '}
            <strong>Not on a public or shared computer.</strong>
          </span>
        </label>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          {getApiKey() && (
            <button
              className="btn btn-secondary"
              onClick={() => { clearApiKey(); setKey(''); onClose() }}
              style={{ color: '#f87171', marginRight: 'auto' }}
            >Delete Key</button>
          )}
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={!key.trim()}>Save</button>
        </div>
      </div>
    </div>
  )
}
