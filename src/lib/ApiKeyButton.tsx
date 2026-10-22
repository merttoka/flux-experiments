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
      {/* The page can't run without a key: until one is set, the header's accent button. */}
      <button type="button" className={hasKey ? 'lab-tool' : 'lab-tool is-primary'} onClick={() => setOpen(true)}>
        {hasKey ? 'API Key' : 'Set API Key'}
      </button>
      <ApiKeyModal open={open} onClose={() => setOpen(false)} />
    </>
  )
}
