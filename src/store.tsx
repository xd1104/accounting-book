import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Account, AppData, Category, MonthPlan, Settings, Txn } from './lib/types'
import { LocalStorageAdapter } from './lib/storage'
import type { StorageAdapter } from './lib/storage'
import { emptyData, uid } from './lib/defaults'
import { deletePhotos, pruneOrphans } from './lib/photos'

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

  addAccount: (a: Omit<Account, 'id' | 'order'>) => void
  updateAccount: (id: string, patch: Partial<Account>) => void
  deleteAccount: (id: string) => void

  updateSettings: (patch: Partial<Settings>) => void
  replaceAll: (data: AppData) => void
  resetAll: () => void
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

  // Initial load
  useEffect(() => {
    let alive = true
    adapter.load().then((loaded) => {
      if (!alive) return
      if (loaded) setData(loaded)
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
    setData((prev) => ({ ...fn(prev), updatedAt: new Date().toISOString() }))
  }, [])

  const setTheme = useCallback((t: Theme) => {
    localStorage.setItem(THEME_KEY, t)
    setThemeState(t)
  }, [])

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
        mutate((d) => ({
          ...d,
          accounts: [...d.accounts, { ...a, id: uid(), order: nextOrder(d.accounts) }],
        }))
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
    }
  }, [data, ready, theme, setTheme, mutate])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore(): Store {
  const v = useContext(Ctx)
  if (!v) throw new Error('useStore must be used inside StoreProvider')
  return v
}
