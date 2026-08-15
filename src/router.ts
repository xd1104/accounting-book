import { useEffect, useState } from 'react'

/**
 * Hash routing, so the Android/browser back button closes sheets and pages
 * the way it does in a native app — and so GitHub Pages needs no SPA rewrite rules.
 */
function read(): string {
  const h = window.location.hash.replace(/^#/, '')
  return h.startsWith('/') ? h : '/'
}

export function useRoute() {
  const [path, setPath] = useState(read)

  useEffect(() => {
    const on = () => setPath(read())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])

  return path
}

export function push(path: string) {
  window.location.hash = path
}

export function replace(path: string) {
  window.history.replaceState(null, '', `#${path}`)
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}

export function back() {
  if (window.history.length > 1) window.history.back()
  else push('/')
}

/** Match '/edit/:id' style routes. Returns the trailing segment or null. */
export function segment(path: string, prefix: string): string | null {
  if (!path.startsWith(prefix)) return null
  const rest = path.slice(prefix.length)
  return rest.startsWith('/') ? decodeURIComponent(rest.slice(1)) : rest === '' ? '' : null
}
