import { useEffect, useState } from 'react'
import { applyUpdate, isUpdateReady, subscribeUpdate } from '../lib/appUpdate'

/**
 * Sits under the header while a newer build is waiting. Dismissable, because an
 * update is never urgent — but it comes back on the next launch, since a version
 * that is quietly never applied is the failure this whole feature exists to fix.
 */
export function UpdateBanner() {
  const [ready, setReady] = useState(isUpdateReady)
  const [hidden, setHidden] = useState(false)

  useEffect(() => subscribeUpdate(setReady), [])

  if (!ready || hidden) return null

  return (
    <div className="px-4 pt-2">
      <div className="rounded-2xl bg-brand/12 px-3 py-2.5 flex items-center gap-2">
        <span className="text-base leading-none">🎉</span>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-brand">有新版本了</div>
          <div className="text-[11px] text-muted">重新載入就會換過去，記錄不會不見。</div>
        </div>
        <button
          onClick={applyUpdate}
          className="shrink-0 h-8 px-3 rounded-full bg-brand text-white text-xs font-semibold active:scale-95 transition"
        >
          立即更新
        </button>
        <button
          onClick={() => setHidden(true)}
          aria-label="稍後再說"
          className="shrink-0 w-7 h-7 grid place-items-center rounded-full text-faint active:bg-surface2"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
