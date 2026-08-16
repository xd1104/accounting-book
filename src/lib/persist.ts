/**
 * Storage durability helpers.
 *
 * Browser storage is evictable by default: iOS clears a site's data after a
 * stretch of not being opened, and a home-screen web app keeps its data in a
 * partition separate from Safari — deleting the home-screen icon takes that
 * data with it. Asking for persistent storage removes the automatic-eviction
 * half of that, and the backup reminder covers the rest.
 */

/** Ask the browser not to evict our data. Silently unsupported on some engines. */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false
    if (await navigator.storage.persisted?.()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

export async function isPersisted(): Promise<boolean | null> {
  try {
    if (!navigator.storage?.persisted) return null
    return await navigator.storage.persisted()
  } catch {
    return null
  }
}

/** True when this page is running as an installed/home-screen app. */
export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari exposes it here instead of via display-mode
    (navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

export function daysSince(iso: string | undefined): number | null {
  if (!iso) return null
  const ms = Date.now() - new Date(iso).getTime()
  return Number.isFinite(ms) ? Math.floor(ms / 86400000) : null
}

/** How overdue a backup is, given the record count and when one was last taken. */
export function backupStatus(
  txnCount: number,
  lastBackupAt: string | undefined,
): { due: boolean; never: boolean; days: number | null } {
  const days = daysSince(lastBackupAt)
  if (txnCount === 0) return { due: false, never: !lastBackupAt, days }
  if (!lastBackupAt) return { due: true, never: true, days: null }
  return { due: (days ?? 0) >= 7, never: false, days }
}
