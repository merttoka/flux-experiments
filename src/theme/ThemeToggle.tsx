import { useTheme } from './ThemeProvider'
import './ThemeToggle.css'

// merttoka.com's switch (js/load-header-footer.js there): the icon of the theme showing, a bright sun (a filled disc and
// rays) or a crescent moon, in the text colour.
const SUN = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="4.5" fill="currentColor" stroke="none" />
    <path d="M12 1.5v2M12 20.5v2M4.6 4.6 6 6M18 18l1.4 1.4M1.5 12h2M20.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
  </svg>
)
const MOON = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
)

/** One button between light and dark; the theme follows the system until it's first clicked. */
export default function ThemeToggle() {
  const { resolved, toggle } = useTheme()
  const label = resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
  return (
    <button type="button" className="theme-toggle" aria-label={label} title={label} onClick={toggle}>
      {resolved === 'dark' ? MOON : SUN}
    </button>
  )
}
