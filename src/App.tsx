import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import FluxStyleBridge from './experiments/flux-style-bridge'
import ReimaginedEcosystems from './experiments/emergent-worlds'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/flux-style-bridge" element={<FluxStyleBridge />} />
      <Route path="/flux-reimagined-ecosystems" element={<ReimaginedEcosystems />} />
    </Routes>
  )
}
