import { Link } from 'react-router-dom'

const demos = [
  {
    path: '/flux-style-bridge',
    title: 'FLUX Style Bridge',
    label: 'img2img',
    description: 'Upload an image and transform it through curated style presets using FLUX image-to-image generation.',
  },
  {
    path: '/flux-reimagined-ecosystems',
    title: 'FLUX Reimagined Ecosystems',
    label: 'sim → flux',
    description: 'Watch a DLA simulation grow, then let FLUX reinterpret its emergent structures into vivid imagined ecosystems.',
  },
]

export default function Home() {
  return (
    <div className="lab-page">
      <header className="lab-header">
        <div className="breadcrumb">
          <a href="https://lab.merttoka.com">Lab</a>
          <span className="separator">/</span>
          <span className="current">FLUX Demos</span>
        </div>
        <p className="lab-subtitle">
          Experiments with Black Forest Labs image generation
        </p>
      </header>

      <div className="experiments-grid">
        {demos.map((d) => (
          <Link to={d.path} key={d.path} className="experiment-card" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="card-label">
              <span className="dot" />
              {d.label}
            </div>
            <span className="card-title">{d.title}</span>
            <p className="card-description">{d.description}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
