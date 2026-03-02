import { Link } from 'react-router-dom'
import EmergentWorlds from './EmergentWorlds'
import ApiKeyButton from '../../lib/ApiKeyButton'

export default function EmergentWorldsPage() {
  return (
    <div className="sim-page">
      <header className="sim-header">
        <Link to="/">Lab</Link>
        <span className="separator">/</span>
        <span className="sim-title">Emergent Worlds</span>
        <ApiKeyButton />
      </header>
      <EmergentWorlds />
    </div>
  )
}
