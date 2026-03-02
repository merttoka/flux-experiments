import { Link } from 'react-router-dom'
import StyleBridge from './StyleBridge'
import ApiKeyButton from '../../lib/ApiKeyButton'

export default function FluxStyleBridge() {
  return (
    <div className="sim-page">
      <header className="sim-header">
        <Link to="/">Lab</Link>
        <span className="separator">/</span>
        <span className="sim-title">FLUX Style Bridge</span>
        <ApiKeyButton />
      </header>
      <div style={{ flex: 1, width: '100%', paddingTop: '1.5rem' }}>
        <StyleBridge />
      </div>
    </div>
  )
}
