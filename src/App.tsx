import { useStore } from './store'
import { back, push, segment, useRoute } from './router'
import { Home } from './pages/Home'
import { Records } from './pages/Records'
import { Stats } from './pages/Stats'
import { Settings } from './pages/Settings'
import { Plan } from './pages/Plan'
import { Accounts } from './pages/Accounts'
import { Categories } from './pages/Categories'
import { TxnSheet } from './components/TxnSheet'
import { IconBack, IconChart, IconGear, IconHome, IconList, IconPlus } from './components/icons'

const TABS = [
  { path: '/', label: '首頁', Icon: IconHome },
  { path: '/records', label: '明細', Icon: IconList },
  { path: '/stats', label: '統計', Icon: IconChart },
  { path: '/settings', label: '設定', Icon: IconGear },
] as const

const SUB_PAGES: Record<string, string> = {
  '/plan': '薪水分配',
  '/accounts': '帳戶',
  '/categories': '分類',
}

export function App() {
  const { ready } = useStore()
  const path = useRoute()

  const editId = segment(path, '/edit')
  const sheetOpen = path === '/add' || !!editId
  // The sheet floats above whatever page was showing, so strip it from the base route.
  const base = sheetOpen ? (sessionStorage.getItem('lastBase') ?? '/') : path
  if (!sheetOpen) sessionStorage.setItem('lastBase', path)

  const subTitle = SUB_PAGES[base]
  const isTab = TABS.some((t) => t.path === base)

  if (!ready) return <div className="h-full bg-bg" />

  return (
    <div className="min-h-full bg-bg">
      <header className="sticky top-0 z-30 safe-t bg-bg/85 backdrop-blur-xl">
        <div className="h-12 flex items-center px-2">
          {subTitle ? (
            <>
              <button
                onClick={back}
                aria-label="返回"
                className="w-10 h-10 grid place-items-center rounded-full text-ink active:bg-surface2"
              >
                <IconBack className="w-5 h-5" />
              </button>
              <span className="font-semibold">{subTitle}</span>
            </>
          ) : (
            <span className="px-2 font-semibold">
              {TABS.find((t) => t.path === base)?.label ?? '記帳本'}
            </span>
          )}
        </div>
      </header>

      <main className={isTab ? 'pb-24' : 'pb-8'}>
        {base === '/' && <Home onEditTxn={(id) => push(`/edit/${id}`)} />}
        {base === '/records' && <Records onEditTxn={(id) => push(`/edit/${id}`)} />}
        {base === '/stats' && <Stats />}
        {base === '/settings' && <Settings />}
        {base === '/plan' && <Plan />}
        {base === '/accounts' && <Accounts />}
        {base === '/categories' && <Categories />}
      </main>

      {isTab && (
        <nav className="fixed bottom-0 inset-x-0 z-30 safe-b bg-surface/92 backdrop-blur-xl border-t border-line">
          <div className="h-16 grid grid-cols-5 items-center max-w-lg mx-auto">
            {TABS.slice(0, 2).map((t) => (
              <TabButton key={t.path} {...t} active={base === t.path} />
            ))}

            <div className="grid place-items-center">
              <button
                onClick={() => push('/add')}
                aria-label="記一筆"
                className="w-14 h-14 -mt-6 rounded-full bg-brand text-white grid place-items-center shadow-lg shadow-brand/35 active:scale-95 transition"
              >
                <IconPlus className="w-7 h-7" />
              </button>
            </div>

            {TABS.slice(2).map((t) => (
              <TabButton key={t.path} {...t} active={base === t.path} />
            ))}
          </div>
        </nav>
      )}

      <TxnSheet open={sheetOpen} onClose={back} editId={editId || null} />
    </div>
  )
}

function TabButton({
  path,
  label,
  Icon,
  active,
}: {
  path: string
  label: string
  Icon: (p: { className?: string }) => React.ReactElement
  active: boolean
}) {
  return (
    <button
      onClick={() => push(path)}
      className={`h-full flex flex-col items-center justify-center gap-0.5 transition ${
        active ? 'text-brand' : 'text-faint'
      }`}
    >
      <Icon className="w-6 h-6" />
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  )
}
