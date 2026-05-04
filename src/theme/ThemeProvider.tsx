import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

export type ThemePreference = 'light' | 'auto' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

interface ThemeContextValue {
  preference: ThemePreference
  resolved: ResolvedTheme
  setPreference: (p: ThemePreference) => void
}

const STORAGE_KEY = 'lab.theme'

const ThemeContext = createContext<ThemeContextValue | null>(null)

function readStoredPreference(): ThemePreference {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'light' || raw === 'dark' || raw === 'auto') return raw
  } catch {
    // localStorage unavailable
  }
  return 'auto'
}

function systemPrefersDark(): boolean {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  } catch {
    return true
  }
}

function resolve(pref: ThemePreference, systemDark: boolean): ResolvedTheme {
  if (pref === 'auto') return systemDark ? 'dark' : 'light'
  return pref
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => readStoredPreference())
  const [systemDark, setSystemDark] = useState<boolean>(() => systemPrefersDark())

  const resolved = resolve(preference, systemDark)

  // Apply data-theme synchronously during render so descendant effects observe
  // the updated CSS variables on the same commit (e.g. canvas color reads).
  if (typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') !== resolved) {
    document.documentElement.setAttribute('data-theme', resolved)
  }

  // Persist preference. localStorage may be unavailable (private mode, quota).
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, preference)
    } catch {
      // intentional: theme preference is non-critical, fall back to in-memory
    }
  }, [preference])

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

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, resolved, setPreference: setPreferenceState }),
    [preference, resolved],
  )

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
