import type { AppData } from './types'
import { DATA_VERSION } from './types'
import { DEFAULT_SETTINGS, emptyData } from './defaults'

/**
 * Everything above this layer only knows about StorageAdapter, so a cloud backend
 * (e.g. a private GitHub repo via the API) can be added later without touching the UI.
 */
export interface StorageAdapter {
  id: string
  label: string
  load(): Promise<AppData | null>
  save(data: AppData): Promise<void>
}

const KEY = 'accounting-book/data/v1'

export class LocalStorageAdapter implements StorageAdapter {
  id = 'local'
  label = '此裝置'

  async load(): Promise<AppData | null> {
    try {
      const raw = localStorage.getItem(KEY)
      if (!raw) return null
      return migrate(JSON.parse(raw))
    } catch {
      return null
    }
  }

  async save(data: AppData): Promise<void> {
    localStorage.setItem(KEY, JSON.stringify(data))
  }
}

/** Fill in anything a older/hand-edited payload is missing so the app never crashes on load. */
export function migrate(raw: unknown): AppData {
  const base = emptyData()
  if (!raw || typeof raw !== 'object') return base
  const d = raw as Partial<AppData>

  return {
    version: DATA_VERSION,
    categories: Array.isArray(d.categories) && d.categories.length ? d.categories : base.categories,
    accounts: Array.isArray(d.accounts) && d.accounts.length ? d.accounts : base.accounts,
    plans: d.plans && typeof d.plans === 'object' ? d.plans : {},
    txns: Array.isArray(d.txns) ? d.txns : [],
    settings: { ...DEFAULT_SETTINGS, ...(d.settings ?? {}) },
    updatedAt: typeof d.updatedAt === 'string' ? d.updatedAt : new Date().toISOString(),
  }
}

export function exportJSON(data: AppData): string {
  return JSON.stringify(data, null, 2)
}

export function downloadBackup(data: AppData): void {
  const stamp = new Date().toISOString().slice(0, 10)
  const blob = new Blob([exportJSON(data)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `記帳本備份-${stamp}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
