import { Link } from 'react-router-dom'
import LabHeader from '../components/LabHeader'

const demos = [
  {
    path: '/flux-style-bridge',
    slug: 'style-bridge',
    title: 'FLUX Style Bridge',
    label: 'img2img',
    badge: 'A/B compare',
    description: 'Upload an image and transform it through curated style presets using FLUX image-to-image generation.',
  },
  {
    path: '/flux-reimagined-ecosystems',
    slug: 'reimagined-ecosystems',
    title: 'FLUX Reimagined Ecosystems',
    label: 'sim → flux',
    badge: 'WebGPU DLA',
    description: 'Watch a DLA simulation grow, then let FLUX reinterpret its emergent structures into vivid imagined ecosystems.',
  },
]

const PREVIEWS = `${import.meta.env.BASE_URL}previews`

/** Thumbnail captured from the running demo: webp still (also the reduced-motion fallback) plus a muted loop. */
function CardPreview({ slug, badge }: { slug: string; badge: string }) {
  return (
    <div className="card-preview" style={{ backgroundImage: `url(${PREVIEWS}/${slug}/preview.webp)` }}>
      <video className="preview-media" autoPlay muted loop playsInline aria-hidden="true">
        <source src={`${PREVIEWS}/${slug}/preview.webm`} type="video/webm" />
        <source src={`${PREVIEWS}/${slug}/preview.mp4`} type="video/mp4" />
      </video>
      <span className="badge">{badge}</span>
    </div>
  )
}

export default function Home() {
  return (
    <>
      <LabHeader breadcrumbs={[{ label: 'FLUX Demos' }]} />
      <div className="lab-page">
        <header className="lab-header">
          <p className="lab-kicker">Generative image experiments</p>
          <h1 className="lab-title">
            FLUX <span className="accent">Demos</span>
          </h1>
          <p className="lab-subtitle">
            Experiments with Black Forest Labs image generation
          </p>
        </header>

        <div className="experiments-grid">
          {demos.map((d) => (
            <Link to={d.path} key={d.path} className="experiment-card">
              <CardPreview slug={d.slug} badge={d.badge} />
              <div className="card-body">
                <div className="card-label">
                  <span className="dot" />
                  {d.label}
                </div>
                <span className="card-title">{d.title}</span>
                <p className="card-description">{d.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </>
  )
}
