import { useTheme } from './ThemeProvider'
import type { ThemePreference } from './ThemeProvider'
import type { ReactElement } from 'react'
import './ThemeToggle.css'

const OPTIONS: Array<{ value: ThemePreference; label: string; icon: ReactElement }> = [
  {
    value: 'light',
    label: 'Light',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
    ),
  },
  {
    value: 'auto',
    label: 'Auto',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="2" y="4" width="20" height="14" rx="2" />
        <path d="M8 22h8M12 18v4" />
      </svg>
    ),
  },
  {
    value: 'dark',
    label: 'Dark',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    ),
  },
]

export default function ThemeToggle() {
  const { preference, setPreference } = useTheme()
  return (
    <div className="theme-toggle" role="group" aria-label="Theme">
      {OPTIONS.map(opt => (
        <button
          key={opt.value}
          type="button"
          className={`theme-toggle-option${preference === opt.value ? ' is-active' : ''}`}
          aria-pressed={preference === opt.value}
          aria-label={opt.label}
          title={opt.label}
          onClick={() => setPreference(opt.value)}
        >
          {opt.icon}
        </button>
      ))}
    </div>
  )
}
