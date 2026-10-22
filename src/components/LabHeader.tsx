import type { MouseEvent, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import ThemeToggle from '../theme/ThemeToggle'
import './LabHeader.css'

export type Crumb = { label: string; href?: string }

interface Props {
  breadcrumbs?: Crumb[]
  rightExtras?: ReactNode
}

// The Lab's home, at the row these demos sit in.
const LAB_HOME = 'https://lab.merttoka.com/#diffusion-models'
// The Lab is a page load away, so the link waits for the burst to show, as merttoka.com's does.
const BURST_MS = 320

const STILL = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** A plain click boils the flask over, as on merttoka.com: bubbles spill from its neck, then the link goes to the Lab. */
function boilOver(e: MouseEvent<HTMLAnchorElement>) {
  if (STILL || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
  e.preventDefault()
  const link = e.currentTarget
  setTimeout(() => location.assign(link.href), BURST_MS)
  const r = (link.querySelector('.lab-flask svg') ?? link).getBoundingClientRect()
  const x = r.left + r.width / 2, y = r.top + 2
  for (let i = 0; i < 10; i++) {
    const b = document.createElement('span')
    const size = 3 + Math.random() * 4
    b.className = Math.random() < 0.4 ? 'lab-burst-bubble is-filled' : 'lab-burst-bubble'
    Object.assign(b.style, { left: `${x - size / 2}px`, top: `${y - size / 2}px`, width: `${size}px`, height: `${size}px` })
    document.body.append(b)
    // Up out of the neck, then over the sides, settling just below the bar.
    const dx = (Math.random() - 0.5) * 60, rise = 6 + Math.random() * 12, fall = 14 + Math.random() * 30
    b.animate([
      { transform: 'translate(0, 0) scale(0.4)', opacity: 0.95 },
      { transform: `translate(${dx * 0.35}px, ${-rise}px) scale(1)`, opacity: 0.9, offset: 0.3 },
      { transform: `translate(${dx}px, ${fall}px) scale(0.8)`, opacity: 0 },
    ], { duration: 420 + Math.random() * 240, delay: Math.random() * 70, easing: 'cubic-bezier(.25,.6,.45,1)', fill: 'both' })
      .onfinish = () => b.remove()
  }
  link.classList.add('is-boiling')
  setTimeout(() => link.classList.remove('is-boiling'), 400)
}

/** merttoka.com's lab flask (Font Awesome Free 7 "flask", CC BY 4.0, fontawesome.com), sized and spaced as it sits
 * after the name there: bubbles rise from it now and then, and it boils on hover. */
function Flask() {
  return (
    <span className="lab-flask" aria-hidden="true">
      <svg viewBox="0 0 448 512" width="13" height="15">
        <path fill="currentColor" d="M288 0L128 0C110.3 0 96 14.3 96 32s14.3 32 32 32L128 215.5 7.5 426.3C2.6 435 0 444.7 0 454.7 0 486.4 25.6 512 57.3 512l333.4 0c31.6 0 57.3-25.6 57.3-57.3 0-10-2.6-19.8-7.5-28.4L320 215.5 320 64c17.7 0 32-14.3 32-32S337.7 0 320 0L288 0zM192 215.5l0-151.5 64 0 0 151.5c0 11.1 2.9 22.1 8.4 31.8l41.6 72.7-164 0 41.6-72.7c5.5-9.7 8.4-20.6 8.4-31.8z" />
      </svg>
      <span className="lab-bubbles"><span /><span /><span /></span>
    </span>
  )
}

/** The Lab's header (lab.merttoka.com's src/components/LabHeader.tsx, kept in step by hand). */
export default function LabHeader({ breadcrumbs, rightExtras }: Props) {
  return (
    <header className="lab-header-bar">
      <div className="lab-header-left">
        <a href="https://merttoka.com" className="lab-header-site" aria-label="merttoka.com">
          <img src={`${import.meta.env.BASE_URL}logo.webp`} alt="" className="lab-header-logo" width={32} height={32} />
        </a>
        <a href={LAB_HOME} className="lab-header-brand" aria-label="Lab home" onClick={boilOver}>
          <span className="lab-header-wordmark">Lab</span>
          <Flask />
        </a>
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav className="lab-header-crumbs" aria-label="Breadcrumb">
            {breadcrumbs.map((c, i) => {
              const isLast = i === breadcrumbs.length - 1
              return (
                <span key={i} className="lab-header-crumb">
                  <span className="lab-header-sep" aria-hidden="true">/</span>
                  {c.href && !isLast ? (
                    <Link to={c.href}>{c.label}</Link>
                  ) : (
                    <span className={isLast ? 'is-current' : ''}>{c.label}</span>
                  )}
                </span>
              )
            })}
          </nav>
        )}
      </div>
      <div className="lab-header-right">
        {rightExtras && <div className="lab-header-tools">{rightExtras}</div>}
        <ThemeToggle />
      </div>
    </header>
  )
}
