import type { AppData } from './types'
import { DATA_VERSION } from './types'
import { DEFAULT_SETTINGS, defaultAccounts, defaultWallets, emptyData } from './defaults'
import { blobToDataURL, dataURLToBlob, getPhoto, putPhoto } from './photos'

/**
 * Where the ledger lives on this device. The cloud copy is not another
 * implementation of this — sync (see sync.ts) works on top of the local one,
 * pushing and pulling whatever is stored here, so this stays the single source
 * the UI reads and writes.
 */
export interface StorageAdapter {
  load(): Promise<AppData | null>
  save(data: AppData): Promise<void>
}

const KEY = 'accounting-book/data/v1'

export class LocalStorageAdapter implements StorageAdapter {
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

/** Fill in anything an older or hand-edited payload is missing so the app never crashes on load. */
export function migrate(raw: unknown): AppData {
  const base = emptyData()
  if (!raw || typeof raw !== 'object') return base
  const d = raw as Partial<AppData>

  // v1 had no wallets: everything lived in one undifferentiated pot. Seed the
  // defaults and point existing allocation items at the bank one, which is what
  // they effectively were.
  const wallets =
    Array.isArray(d.wallets) && d.wallets.length ? d.wallets : defaultWallets()
  const fallbackWallet = wallets.find((w) => w.kind === 'bank')?.id ?? wallets[0]?.id ?? null

  const accounts =
    Array.isArray(d.accounts) && d.accounts.length
      ? d.accounts.map((a) => ({
          // An explicit null is the editor's 「不指定」 and must survive a reload;
          // only a missing field is v1 data that predates wallets entirely.
          ...a,
          walletId: 'walletId' in a ? a.walletId : fallbackWallet,
        }))
      : defaultAccounts(wallets)

  // Existing transactions keep walletId null — "unspecified" is honest here,
  // guessing would invent a cash/bank split that was never recorded.
  const txns = Array.isArray(d.txns) ? d.txns.map((t) => ({ ...t, walletId: t.walletId ?? null })) : []

  return {
    version: DATA_VERSION,
    categories: Array.isArray(d.categories) && d.categories.length ? d.categories : base.categories,
    wallets,
    accounts,
    plans: d.plans && typeof d.plans === 'object' ? d.plans : {},
    txns,
    settings: { ...DEFAULT_SETTINGS, ...(d.settings ?? {}) },
    updatedAt: typeof d.updatedAt === 'string' ? d.updatedAt : new Date().toISOString(),
  }
}

/** A backup carries the photos too — without them it would silently lose data. */
export interface Backup extends AppData {
  photoData?: Record<string, string>
}

/**
 * Whether a parsed file is actually one of our backups.
 *
 * `migrate` is deliberately forgiving so a partial or hand-edited payload still
 * loads — but that makes it answer "sure, here is an empty ledger" for literally
 * any JSON. Importing the wrong file would then wipe everything and report
 * success. Import has to check first; loading can stay lenient.
 */
export function looksLikeBackup(raw: unknown): raw is Backup {
  if (!raw || typeof raw !== 'object') return false
  const d = raw as Partial<Backup>
  // Every backup this app has written carries all three, an empty ledger included.
  return typeof d.version === 'number' && Array.isArray(d.txns) && Array.isArray(d.categories)
}

export async function buildBackup(data: AppData): Promise<Backup> {
  const ids = [...new Set(data.txns.flatMap((t) => t.photos ?? []))]
  const photoData: Record<string, string> = {}
  for (const id of ids) {
    const blob = await getPhoto(id)
    if (blob) photoData[id] = await blobToDataURL(blob)
  }
  return { ...data, photoData }
}

export async function downloadBackup(data: AppData): Promise<void> {
  const backup = await buildBackup(data)
  const stamp = new Date().toISOString().slice(0, 10)
  const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `記帳本備份-${stamp}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Restore photos from a backup into IndexedDB. Returns how many were written. */
export async function restorePhotos(raw: unknown): Promise<number> {
  const photoData = (raw as Backup | null)?.photoData
  if (!photoData) return 0
  let n = 0
  for (const [id, dataURL] of Object.entries(photoData)) {
    try {
      await putPhoto(id, await dataURLToBlob(dataURL))
      n++
    } catch {
      // A single unreadable photo shouldn't abort the whole restore.
    }
  }
  return n
}
