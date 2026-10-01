import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Account, Allocation, AllocationSplit, AppData, Category, MonthPlan, Settings, Txn, Wallet } from './lib/types'
import { LocalStorageAdapter } from './lib/storage'
import type { StorageAdapter } from './lib/storage'
import { emptyData, uid } from './lib/defaults'
import { deletePhotos, holdPhotos, pruneOrphans } from './lib/photos'
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
  /** keepPhotos：刪除可以復原時先別刪照片，等復原期過了再刪（見 lib/undo.ts）。 */
  deleteTxn: (id: string, opts?: { keepPhotos?: boolean }) => void
  /** 把剛刪掉的記錄原封不動放回來（同一個 id）。 */
  restoreTxn: (txn: Txn) => void

  savePlan: (plan: MonthPlan) => void
  /** 把剛刪掉的分配項目放回那個月份的原位置。用 mutate 讀最新資料，不怕閉包過期。 */
  restoreAllocation: (month: string, alloc: Allocation, index: number) => void
  /** 把剛移除的「零用錢放在哪」那一格放回原位（金額照舊，總額跟著加回去）。 */
  restoreSplit: (month: string, accountId: string, split: AllocationSplit, index: number) => void
  /**
   * 復原期間先別同步：同步完會清掉「沒有記錄引用的照片」（本機與雲端都會），
   * 復原回來的記錄就少了照片。回傳的函式放開這個保留，放開後若有改動就補同步一次。
   *
   * `photos`：被刪記錄的照片。只擋新的同步不夠——**已經在跑**的那次回來後讀到的是刪除後的
   * 帳本，會把它們當孤兒刪掉。所以這些照片另外保留（photos.ts 的 holdPhotos，清理時即時查），
   * 一直保留到放開之後、而且當下在跑的同步也結束了才放：那次同步可能拿著放開前的帳本。
   */
  holdSync: (photos?: string[]) => () => void

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
  conflict: { remote: AppData; paths: string[] } | null
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
      // theme-color 用 --surface（分頁列的顏色），不是頁面底色。
      // 在有 chrome 的瀏覽器裡，螢幕最底下那條由瀏覽器上色的區域會跟著這個值；
      // 設成分頁列的顏色，那條看起來就像分頁列延伸到底，而不是「版面漏了一條」。
      // index.html 有兩個帶 media 的 meta 負責 JS 啟動前的第一次繪製；
      // 使用者手動選了主題時要蓋掉它們，所以連 media 一起拔掉。
      for (const m of document.querySelectorAll('meta[name="theme-color"]')) {
        m.removeAttribute('media')
        m.setAttribute('content', dark ? '#16161f' : '#ffffff')
      }
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
  /** holdSync() 的計數，>0 時 runSync 直接跳過。 */
  const syncHold = useRef(0)
  /** 等「當下在跑的這次同步」結束才做的事（放開照片保留，見 holdSync）。 */
  const afterSync = useRef<Array<() => void>>([])
  /** Mirrors sync.status for the async callbacks, which cannot read state directly. */
  const syncStatus = useRef(sync.status)
  syncStatus.current = sync.status

  const runSync = useCallback(async () => {
    const cfg = loadSyncConfig()
    if (!cfg || syncing.current || syncHold.current > 0) return
    // An unresolved conflict is waiting on the user, and every retry re-reads the
    // whole repo only to reach the same answer. Editing while the question is on
    // screen would otherwise fire one full read every few seconds.
    if (syncStatus.current === 'conflict') return
    syncing.current = true
    setSync((s) => ({ ...s, status: 'syncing', error: null }))
    try {
      const out = await syncOnce(cfg, dataRef.current, hasLocalHistory.current)
      if (out.action === 'conflict') {
        setSync((s) => ({
          ...s,
          status: 'conflict',
          conflict: { remote: out.remote, paths: out.paths },
        }))
        return
      }
      if (out.action === 'pulled' || out.action === 'merged') adopt(out.data)

      const synced =
        out.action === 'pulled' || out.action === 'merged' ? out.data : dataRef.current
      const photos = await syncPhotos(cfg, synced)
      // A deletion made on another device arrives as a record disappearing; the
      // photo it referenced is then dead weight in this device's storage too.
      // 要 await：finally 會放開復原期間的照片保留，清理還在跑就放開等於沒保留。
      await pruneOrphans(new Set(synced.txns.flatMap((t) => t.photos ?? []))).catch(() => {})

      const saved = loadSyncConfig()
      const parts = [
        photos.uploaded && `上傳 ${photos.uploaded}`,
        photos.downloaded && `下載 ${photos.downloaded}`,
        photos.deleted && `刪除 ${photos.deleted}`,
      ].filter(Boolean)
      setSync((s) => ({
        ...s,
        status: 'idle',
        config: saved,
        lastSyncedAt: saved?.lastSyncedAt ?? null,
        conflict: null,
        error: null,
        detail: parts.length ? `照片：${parts.join('、')}` : null,
      }))
    } catch (e) {
      setSync((s) => ({ ...s, status: 'error', error: (e as Error).message || '同步失敗' }))
    } finally {
      syncing.current = false
      const after = afterSync.current
      afterSync.current = []
      after.forEach((f) => f())
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
      deleteTxn(id, opts) {
        mutate((d) => {
          const gone = d.txns.find((t) => t.id === id)
          if (gone?.photos?.length && !opts?.keepPhotos) deletePhotos(gone.photos)
          return { ...d, txns: d.txns.filter((t) => t.id !== id) }
        })
      },
      restoreTxn(txn) {
        mutate((d) => (d.txns.some((t) => t.id === txn.id) ? d : { ...d, txns: [...d.txns, txn] }))
      },

      savePlan(plan) {
        mutate((d) => ({ ...d, plans: { ...d.plans, [plan.month]: plan } }))
      },
      restoreAllocation(month, alloc, index) {
        mutate((d) => {
          const p = d.plans[month]
          if (!p || p.allocations.some((a) => a.accountId === alloc.accountId)) return d
          const allocations = [...p.allocations]
          allocations.splice(Math.min(index, allocations.length), 0, alloc)
          return { ...d, plans: { ...d.plans, [month]: { ...p, allocations } } }
        })
      },
      restoreSplit(month, accountId, split, index) {
        mutate((d) => {
          const p = d.plans[month]
          if (!p) return d
          return {
            ...d,
            plans: {
              ...d.plans,
              [month]: {
                ...p,
                allocations: p.allocations.map((a) => {
                  if (a.accountId !== accountId || a.splits?.some((s) => s.walletId === split.walletId)) return a
                  const splits = [...(a.splits ?? [])]
                  splits.splice(Math.min(index, splits.length), 0, split)
                  return { ...a, splits, amount: splits.reduce((n, s) => n + s.amount, 0) }
                }),
              },
            },
          }
        })
      },
      holdSync(photos = []) {
        syncHold.current++
        const unpin = photos.length ? holdPhotos(photos) : null
        let released = false
        return () => {
          if (released) return
          released = true
          syncHold.current = Math.max(0, syncHold.current - 1)
          // 照片保留：有同步在跑就等它跑完再放（它可能拿著刪除後、復原前的帳本）。
          if (unpin) {
            if (syncing.current) afterSync.current.push(unpin)
            else unpin()
          }
          // 補同步延到下一輪：按「復原」時 restoreTxn 的新資料要等這次事件處理完才渲染，
          // 當下的 dataRef 還是刪除後的帳本，拿它去同步會先推一份少一筆的上去。
          if (syncHold.current === 0 && dirty.current && loadSyncConfig()) setTimeout(runSync, 0)
        }
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
          const winner = await resolveConflict(cfg, keep, dataRef.current, c.remote)
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
