import { useState, useEffect } from 'react'
import { hasApiKey } from './bfl'
import ApiKeyModal from './ApiKeyModal'

export default function ApiKeyButton() {
  const [open, setOpen] = useState(false)
  const [hasKey, setHasKey] = useState(hasApiKey())

  useEffect(() => {
    if (!open) setHasKey(hasApiKey())
  }, [open])

  useEffect(() => {
    const onKeyChange = () => setHasKey(hasApiKey())
    window.addEventListener('bfl-key-change', onKeyChange)
    return () => window.removeEventListener('bfl-key-change', onKeyChange)
  }, [])

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          marginLeft: 'auto',
          background: hasKey ? 'transparent' : 'var(--accent)',
          color: hasKey ? 'var(--text-muted)' : '#fff',
          border: hasKey ? '1px solid var(--border)' : 'none',
          borderRadius: 6,
          padding: '0.3rem 0.7rem',
          fontSize: '0.75rem',
          fontFamily: 'var(--font-mono)',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}
      >
        {hasKey ? 'API Key' : 'Set API Key'}
      </button>
      <ApiKeyModal open={open} onClose={() => setOpen(false)} />
    </>
  )
}
