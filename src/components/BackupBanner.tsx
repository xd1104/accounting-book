import { useState } from 'react'
import { useStore } from '../store'
import { downloadBackup } from '../lib/storage'
import { backupStatus, cloudState } from '../lib/persist'

/**
 * Browser storage is not a safe place for the only copy of a ledger, and there
 * is no way to recover it once it is gone — so nag, visibly, until a second copy
 * exists. Cloud sync counts as that second copy; a manual export is the fallback
 * for when sync is off or has stopped working.
 */
export function BackupBanner() {
  const { data, updateSettings, sync } = useStore()
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const cloud = cloudState(sync.status, !!sync.config)
  const status = backupStatus(data.txns.length, data.settings.lastBackupAt, cloud)
  if (!status.due || done) return null

  const run = async () => {
    setBusy(true)
    try {
      await downloadBackup(data)
      updateSettings({ lastBackupAt: new Date().toISOString() })
      setDone(true)
    } catch {
      alert('匯出失敗，請到設定頁再試一次')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-3xl p-4 bg-warn/12">
      <div className="flex items-start gap-2">
        <span className="text-lg leading-none">⚠️</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-warn">
            {cloud === 'stuck'
              ? '雲端同步沒在跑'
              : status.never
                ? '還沒備份過'
                : `已經 ${status.days} 天沒備份`}
          </div>
          <p className="text-[11px] text-muted mt-1 leading-relaxed">
            {cloud === 'stuck' ? (
              <>
                同步失敗或還在等你處理衝突，雲端那份已經跟不上了。
                先到設定頁看一下，或者先匯出一份存著。
              </>
            ) : (
              <>
                資料只存在這個瀏覽器裡。清除瀏覽器資料、換裝置，或把主畫面的 App
                刪掉，都會讓記錄一起消失，而且救不回來。
                <br />
                <span className="text-warn">開啟雲端同步就不用再手動備份了。</span>
              </>
            )}
          </p>
        </div>
      </div>
      <button
        onClick={run}
        disabled={busy}
        className="w-full h-10 mt-3 rounded-2xl bg-warn text-white text-sm font-semibold active:scale-[0.98] transition disabled:opacity-50"
      >
        {busy ? '匯出中…' : '立即匯出備份'}
      </button>
    </div>
  )
}
