import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Account, AppData, Category, MonthPlan, Settings, Txn, Wallet } from './lib/types'
import { LocalStorageAdapter } from './lib/storage'
import type { StorageAdapter } from './lib/storage'
import { emptyData, uid } from './lib/defaults'
import { deletePhotos, pruneOrphans } from './lib/photos'
import type { SyncConfig } from './lib/sync'
import { loadSyncConfig, resolveConflict, saveSyncConfig, syncOnce, syncPhotos } from './lib/sync'

export type Theme = 'system' | 'light' | 'dark'

interface Store {
  data: AppData
  ready: boolean
  theme: Theme
  setTheme: (t: Theme) => void

  addTxn: (t: Omit<Txn, 'id' | 'createdAt' | 'updatedAt'>) => string
  updateTxn: (id: string, patch: Partial<Txn>) => void
  deleteTxn: (id: string) => void

  savePlan: (plan: MonthPlan) => void

  addCategory: (c: Omit<Category, 'id' | 'order'>) => void
  updateCategory: (id: string, patch: Partial<Category>) => void
  deleteCategory: (id: string) => void

  addAccount: (a: Omit<Account, 'id' | 'order'>) => string
  updateAccount: (id: string, patch: Partial<Account>) => void
  deleteAccount: (id: string) => void

  addWallet: (w: Omit<Wallet, 'id' | 'order'>) => string
  updateWallet: (id: string, patch: Partial<Wallet>) => void
  deleteWallet: (id: string) => void

  updateSettings: (patch: Partial<Settings>) => void
  replaceAll: (data: AppData) => void
  resetAll: () => void

  sync: SyncInfo
  configureSync: (cfg: SyncConfig) => void
  disconnectSync: () => void
  syncNow: () => Promise<void>
  resolveSync: (keep: 'local' | 'remote') => Promise<void>
}

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'error' | 'conflict'

export interface SyncInfo {
  status: SyncStatus
  config: SyncConfig | null
  lastSyncedAt: string | null
  error: string | null
  detail: string | null
  conflict: { remote: AppData; remoteSha: string } | null
}

const Ctx = createContext<Store | null>(null)

const THEME_KEY = 'accounting-book/theme'

function readTheme(): Theme {
  const v = localStorage.getItem(THEME_KEY)
  return v === 'light' || v === 'dark' ? v : 'system'
}

export function StoreProvider({
  children,
  adapter = new LocalStorageAdapter(),
}: {
  children: ReactNode
  adapter?: StorageAdapter
}) {
  const [data, setData] = useState<AppData>(() => emptyData())
  const [ready, setReady] = useState(false)
  const [theme, setThemeState] = useState<Theme>(() => readTheme())
  const dirty = useRef(false)
  /** False until this device has stored something of its own — see syncOnce. */
  const hasLocalHistory = useRef(false)

  // Initial load
  useEffect(() => {
    let alive = true
    adapter.load().then((loaded) => {
      if (!alive) return
      if (loaded) {
        setData(loaded)
        hasLocalHistory.current = true
      }
      setReady(true)
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persist after any change (skip the very first render and the load itself)
  useEffect(() => {
    if (!ready || !dirty.current) return
    adapter.save(data)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, ready])

  // Apply theme
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches)
      document.documentElement.classList.toggle('dark', dark)
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', dark ? '#0b0b12' : '#f4f4f7')
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])

  const mutate = useCallback((fn: (d: AppData) => AppData) => {
    dirty.current = true
    hasLocalHistory.current = true
    setData((prev) => ({ ...fn(prev), updatedAt: new Date().toISOString() }))
  }, [])

  /** Adopt data verbatim — used for pulled data, whose updatedAt must survive
   *  so the next sync does not mistake it for a fresh local edit. */
  const adopt = useCallback((next: AppData) => {
    dirty.current = true
    hasLocalHistory.current = true
    setData(next)
  }, [])

  const setTheme = useCallback((t: Theme) => {
    localStorage.setItem(THEME_KEY, t)
    setThemeState(t)
  }, [])

  // ---- sync ----
  const [sync, setSync] = useState<SyncInfo>(() => {
    const cfg = loadSyncConfig()
    return {
      status: cfg ? 'idle' : 'off',
      config: cfg,
      lastSyncedAt: cfg?.lastSyncedAt ?? null,
      error: null,
      detail: null,
      conflict: null,
    }
  })
  /** Latest data, readable from async callbacks without stale closures. */
  const dataRef = useRef(data)
  dataRef.current = data
  const syncing = useRef(false)

  const runSync = useCallback(async () => {
    const cfg = loadSyncConfig()
    if (!cfg || syncing.current) return
    syncing.current = true
    setSync((s) => ({ ...s, status: 'syncing', error: null }))
    try {
      const out = await syncOnce(cfg, dataRef.current, hasLocalHistory.current)
      if (out.action === 'conflict') {
        setSync((s) => ({
          ...s,
          status: 'conflict',
          conflict: { remote: out.remote, remoteSha: out.remoteSha },
        }))
        return
      }
      if (out.action === 'pulled') adopt(out.data)

      const photos = await syncPhotos(cfg, out.action === 'pulled' ? out.data : dataRef.current)
      const saved = loadSyncConfig()
      setSync((s) => ({
        ...s,
        status: 'idle',
        config: saved,
        lastSyncedAt: saved?.lastSyncedAt ?? null,
        conflict: null,
        error: null,
        detail:
          photos.uploaded || photos.downloaded
            ? `照片：上傳 ${photos.uploaded}、下載 ${photos.downloaded}`
            : null,
      }))
    } catch (e) {
      setSync((s) => ({ ...s, status: 'error', error: (e as Error).message || '同步失敗' }))
    } finally {
      syncing.current = false
    }
  }, [adopt])

  // Pull once on startup so a device that was edited elsewhere catches up.
  useEffect(() => {
    if (ready && loadSyncConfig()) runSync()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  /**
   * Also pull when the app comes back to the foreground — a phone can keep this
   * page alive for days, and without this it would never notice edits made on
   * the computer in the meantime.
   */
  useEffect(() => {
    if (!ready) return
    let last = 0
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (!loadSyncConfig()) return
      if (Date.now() - last < 30_000) return
      last = Date.now()
      runSync()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [ready, runSync])

  // Push edits, debounced — typing an amount should not fire a commit per digit.
  useEffect(() => {
    if (!ready || !dirty.current || !loadSyncConfig()) return
    const id = setTimeout(runSync, 4000)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, ready])

  const value = useMemo<Store>(() => {
    const nextOrder = (xs: Array<{ order: number }>) =>
      xs.reduce((m, x) => Math.max(m, x.order), -1) + 1

    return {
      data,
      ready,
      theme,
      setTheme,

      addTxn(t) {
        const id = uid()
        const now = new Date().toISOString()
        mutate((d) => ({ ...d, txns: [...d.txns, { ...t, id, createdAt: now, updatedAt: now }] }))
        return id
      },
      updateTxn(id, patch) {
        mutate((d) => ({
          ...d,
          txns: d.txns.map((t) =>
            t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t,
          ),
        }))
      },
      deleteTxn(id) {
        mutate((d) => {
          const gone = d.txns.find((t) => t.id === id)
          if (gone?.photos?.length) deletePhotos(gone.photos)
          return { ...d, txns: d.txns.filter((t) => t.id !== id) }
        })
      },

      savePlan(plan) {
        mutate((d) => ({ ...d, plans: { ...d.plans, [plan.month]: plan } }))
      },

      addCategory(c) {
        mutate((d) => ({
          ...d,
          categories: [...d.categories, { ...c, id: uid(), order: nextOrder(d.categories) }],
        }))
      },
      updateCategory(id, patch) {
        mutate((d) => ({
          ...d,
          categories: d.categories.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        }))
      },
      deleteCategory(id) {
        // Categories in use are archived instead, so old records keep their label.
        mutate((d) => {
          const used = d.txns.some((t) => t.categoryId === id)
          return used
            ? { ...d, categories: d.categories.map((c) => (c.id === id ? { ...c, archived: true } : c)) }
            : { ...d, categories: d.categories.filter((c) => c.id !== id) }
        })
      },

      addAccount(a) {
        const id = uid()
        mutate((d) => ({
          ...d,
          accounts: [...d.accounts, { ...a, id, order: nextOrder(d.accounts) }],
        }))
        return id
      },
      updateAccount(id, patch) {
        mutate((d) => ({
          ...d,
          accounts: d.accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)),
        }))
      },
      deleteAccount(id) {
        mutate((d) => {
          const used =
            d.txns.some((t) => t.accountId === id) ||
            Object.values(d.plans).some((p) => p.allocations.some((a) => a.accountId === id))
          return used
            ? { ...d, accounts: d.accounts.map((a) => (a.id === id ? { ...a, archived: true } : a)) }
            : { ...d, accounts: d.accounts.filter((a) => a.id !== id) }
        })
      },

      addWallet(w) {
        const id = uid()
        mutate((d) => ({
          ...d,
          wallets: [...d.wallets, { ...w, id, order: nextOrder(d.wallets) }],
        }))
        return id
      },
      updateWallet(id, patch) {
        mutate((d) => ({
          ...d,
          wallets: d.wallets.map((w) => (w.id === id ? { ...w, ...patch } : w)),
        }))
      },
      deleteWallet(id) {
        // Referenced wallets are archived so old records keep their label.
        mutate((d) => {
          const used =
            d.txns.some((t) => t.walletId === id) ||
            d.accounts.some((a) => a.walletId === id) ||
            Object.values(d.plans).some((p) =>
              p.allocations.some((a) => a.splits?.some((s) => s.walletId === id)),
            )
          return used
            ? { ...d, wallets: d.wallets.map((w) => (w.id === id ? { ...w, archived: true } : w)) }
            : { ...d, wallets: d.wallets.filter((w) => w.id !== id) }
        })
      },

      updateSettings(patch) {
        mutate((d) => ({ ...d, settings: { ...d.settings, ...patch } }))
      },
      replaceAll(next) {
        // Anything the incoming data doesn't reference is now dead weight.
        pruneOrphans(new Set(next.txns.flatMap((t) => t.photos ?? []))).catch(() => {})
        mutate(() => next)
      },
      resetAll() {
        pruneOrphans(new Set()).catch(() => {})
        mutate(() => emptyData())
      },

      sync,
      configureSync(cfg) {
        saveSyncConfig(cfg)
        setSync({
          status: 'idle',
          config: cfg,
          lastSyncedAt: cfg.lastSyncedAt,
          error: null,
          detail: null,
          conflict: null,
        })
        runSync()
      },
      disconnectSync() {
        saveSyncConfig(null)
        setSync({
          status: 'off',
          config: null,
          lastSyncedAt: null,
          error: null,
          detail: null,
          conflict: null,
        })
      },
      syncNow: runSync,
      async resolveSync(keep) {
        const cfg = loadSyncConfig()
        const c = sync.conflict
        if (!cfg || !c) return
        setSync((s) => ({ ...s, status: 'syncing' }))
        try {
          const winner = await resolveConflict(cfg, keep, dataRef.current, c.remote, c.remoteSha)
          adopt(winner)
          const saved = loadSyncConfig()
          setSync((s) => ({
            ...s,
            status: 'idle',
            config: saved,
            lastSyncedAt: saved?.lastSyncedAt ?? null,
            conflict: null,
            error: null,
          }))
        } catch (e) {
          setSync((s) => ({ ...s, status: 'error', error: (e as Error).message }))
        }
      },
    }
  }, [data, ready, theme, setTheme, mutate, adopt, sync, runSync])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore(): Store {
  const v = useContext(Ctx)
  if (!v) throw new Error('useStore must be used inside StoreProvider')
  return v
}
