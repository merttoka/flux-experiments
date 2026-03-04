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
          <div className="experiment-card" key={d.path}>
            <div className="card-label">
              <span className="dot" />
              {d.label}
            </div>
            <Link to={d.path}>{d.title}</Link>
            <p className="card-description">{d.description}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
