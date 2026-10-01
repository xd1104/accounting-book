import { useEffect } from 'react'
import { dismissUndo, runUndo, useUndo } from '../lib/undo'

const SHOW_MS = 5000

/**
 * 底部的「已刪除 · 復原」。掛在 App 一次，所有頁面共用。
 * 有分頁列的頁面要浮在分頁列上面（4rem 內容列 + 1px 邊框 + 安全區，同 `.nav-anchor`）。
 */
export function UndoToast({ aboveNav }: { aboveNav: boolean }) {
  const entry = useUndo()

  useEffect(() => {
    if (!entry) return
    const t = setTimeout(() => dismissUndo(entry.id), SHOW_MS)
    return () => clearTimeout(t)
  }, [entry])

  if (!entry) return null
  return (
    <div
      className="fixed inset-x-0 z-40 px-4 pointer-events-none"
      style={{
        bottom: aboveNav
          ? 'calc(4rem + 1px + env(safe-area-inset-bottom, 0px) + 0.75rem)'
          : 'calc(1rem + env(safe-area-inset-bottom, 0px))',
      }}
    >
      {/* data-no-swallow：列滑開時點「復原」也要按得到（見 SwipeRow 的 onOutside） */}
      <div
        key={entry.id}
        role="status"
        data-no-swallow
        className="pointer-events-auto mx-auto max-w-md flex items-center gap-2 pl-4 pr-1.5 py-1.5 rounded-2xl bg-ink text-surface shadow-lg animate-pop-in"
      >
        <span className="flex-1 min-w-0 truncate text-sm">{entry.label}</span>
        <button
          onClick={runUndo}
          className="h-11 px-4 shrink-0 rounded-xl text-sm font-bold text-brand-soft active:opacity-60"
        >
          復原
        </button>
      </div>
    </div>
  )
}
