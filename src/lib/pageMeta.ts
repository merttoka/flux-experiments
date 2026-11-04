import { useEffect } from 'react'

/** A demo's own tab title and description; index.html's are the app's, shared by every route. */
export function usePageMeta(title: string, description: string) {
  useEffect(() => {
    const meta = document.querySelector('meta[name="description"]')
    const before = { title: document.title, description: meta?.getAttribute('content') ?? '' }
    document.title = title
    meta?.setAttribute('content', description)
    return () => {
      document.title = before.title
      meta?.setAttribute('content', before.description)
    }
  }, [title, description])
}
