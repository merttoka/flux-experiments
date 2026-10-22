import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

export type ResolvedTheme = 'light' | 'dark'

interface ThemeContextValue {
  /** The visitor's pick, or null while the theme follows the system (until the toggle is first clicked). */
  preference: ResolvedTheme | null
  resolved: ResolvedTheme
  /** The other theme from the one showing, remembered from then on. */
  toggle: () => void
}

// Shared with the Lab (lab.merttoka.com, the same origin through its proxy) and the inline script in index.html. 'auto',
// the old 3-state toggle's value, reads as no pick.
const STORAGE_KEY = 'lab.theme'

const ThemeContext = createContext<ThemeContextValue | null>(null)

function readStoredPreference(): ResolvedTheme | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'light' || raw === 'dark') return raw
  } catch {
    // localStorage unavailable
  }
  return null
}

function systemPrefersDark(): boolean {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  } catch {
    return true
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ResolvedTheme | null>(() => readStoredPreference())
  const [systemDark, setSystemDark] = useState<boolean>(() => systemPrefersDark())

  const resolved: ResolvedTheme = preference ?? (systemDark ? 'dark' : 'light')

  // Apply data-theme synchronously during render so descendant effects observe
  // the updated CSS variables on the same commit (e.g. canvas color reads).
  if (typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') !== resolved) {
    document.documentElement.setAttribute('data-theme', resolved)
  }

  // Subscribe to system theme changes
  useEffect(() => {
    let mq: MediaQueryList
    try {
      mq = window.matchMedia('(prefers-color-scheme: dark)')
    } catch {
      return
    }
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const value = useMemo<ThemeContextValue>(() => ({
    preference,
    resolved,
    toggle: () => {
      const next = resolved === 'dark' ? 'light' : 'dark'
      // Persisted only on a click, so a visitor who never clicks keeps following the system.
      try {
        localStorage.setItem(STORAGE_KEY, next)
      } catch {
        // intentional: theme preference is non-critical, fall back to in-memory
      }
      setPreference(next)
    },
  }), [preference, resolved])

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider')
  return ctx
}
