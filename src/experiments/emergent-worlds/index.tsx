import { Link } from 'react-router-dom'
import EmergentWorlds from './EmergentWorlds'
import ApiKeyButton from '../../lib/ApiKeyButton'

export default function EmergentWorldsPage() {
  return (
    <div className="sim-page">
      <header className="sim-header">
        <a href="https://lab.merttoka.com">Lab</a>
        <span className="separator">/</span>
        <Link to="/">FLUX Demos</Link>
        <span className="separator">/</span>
        <span className="sim-title">Reimagined Ecosystems</span>
        <ApiKeyButton />
      </header>
      <EmergentWorlds />
    </div>
  )
}
