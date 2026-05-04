import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import ThemeToggle from '../theme/ThemeToggle'
import './LabHeader.css'

export type Crumb = { label: string; href?: string }

interface Props {
  breadcrumbs?: Crumb[]
  rightExtras?: ReactNode
}

const LAB_HOME = 'https://lab.merttoka.com'

export default function LabHeader({ breadcrumbs, rightExtras }: Props) {
  return (
    <header className="lab-header-bar">
      <div className="lab-header-left">
        <a href={LAB_HOME} className="lab-header-brand" aria-label="Lab home">
          <img src="/favicon.ico" alt="" className="lab-header-logo" width={24} height={24} />
          <span className="lab-header-wordmark">Lab</span>
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
        {rightExtras}
        <ThemeToggle />
      </div>
    </header>
  )
}
