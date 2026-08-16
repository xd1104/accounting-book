/**
 * Detecting and applying a new version of the app itself.
 *
 * A PWA shell is served cache-first, so an installed home-screen app does not
 * quietly become the new version: a new service worker installs and activates,
 * but the page keeps running the JavaScript it started with. Nothing on screen
 * changes, and the only symptom is "why are the new features not here?".
 *
 * So: notice when a newer worker has taken over, say so, and offer a reload.
 * Borrowed from lose-weight-helper, which solves the same problem the same way.
 */

/** Replaced at build time; identifies the build this page is actually running. */
declare const __BUILD_STAMP__: string
export const APP_VERSION: string =
  typeof __BUILD_STAMP__ === 'string' ? __BUILD_STAMP__ : 'dev'

type Listener = (ready: boolean) => void

let reg: ServiceWorkerRegistration | null = null
let ready = false
let hadController = false
const listeners = new Set<Listener>()

function markReady(): void {
  if (ready) return
  ready = true
  for (const fn of listeners) fn(true)
}

export function isUpdateReady(): boolean {
  return ready
}

export function subscribeUpdate(fn: Listener): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** True once a service worker is registered — the update UI is meaningless without one. */
export function updatesSupported(): boolean {
  return 'serviceWorker' in navigator
}

export function registerServiceWorker(url: string): void {
  if (!('serviceWorker' in navigator)) return

  // A page loaded with no controller is a first install, not an update — treat
  // the controller arriving as routine, or every first launch cries "new version".
  hadController = !!navigator.serviceWorker.controller

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) {
      hadController = true
      return
    }
    markReady()
  })

  navigator.serviceWorker
    // 'none' keeps the HTTP cache out of the update check: a stale sw.js would
    // make the app permanently believe it is up to date.
    .register(url, { updateViaCache: 'none' })
    .then((r) => {
      reg = r
      // A worker already waiting from a previous visit still counts as new.
      if (r.waiting && navigator.serviceWorker.controller) markReady()
      r.addEventListener('updatefound', () => {
        const w = r.installing
        if (!w) return
        w.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) markReady()
        })
      })
    })
    .catch(() => {
      // Offline support is a bonus — the app works fine without it.
    })
}

/**
 * Ask the server whether there is a newer build.
 *
 * Browsers check on their own, but on no schedule anyone can rely on, so there
 * has to be something to press when the answer is wanted now.
 */
export async function checkForUpdate(): Promise<boolean> {
  if (ready) return true
  if (!reg) return false
  try {
    await reg.update()
  } catch {
    return false
  }
  // The worker calls skipWaiting, so a new build normally activates by itself
  // and reports back through the listeners above. Give those events a moment
  // to land before answering, or every check would report "already up to date".
  await new Promise((r) => setTimeout(r, 1500))
  return ready
}

/**
 * Swap to the new version. Every edit is written to localStorage as it happens,
 * so there is nothing in flight to lose by reloading.
 */
export function applyUpdate(): void {
  window.location.reload()
}

/**
 * Look for a new build when the app comes back to the foreground — that is when
 * a phone that stays open for days would otherwise never notice a deploy.
 */
export function watchForUpdates(minIntervalMs = 60_000): () => void {
  let last = 0
  const onVisible = () => {
    if (document.visibilityState !== 'visible') return
    const now = Date.now()
    if (now - last < minIntervalMs) return
    last = now
    reg?.update().catch(() => {})
  }
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('focus', onVisible)
  return () => {
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('focus', onVisible)
  }
}
