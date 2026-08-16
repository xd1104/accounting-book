import { useState } from 'react'
import { useStore } from '../store'
import { downloadBackup } from '../lib/storage'
import { backupStatus } from '../lib/persist'

/**
 * Browser storage is not a safe place for the only copy of a ledger, and there
 * is no way to recover it once it is gone — so nag, visibly, until a backup exists.
 */
export function BackupBanner() {
  const { data, updateSettings } = useStore()
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const status = backupStatus(data.txns.length, data.settings.lastBackupAt)
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
            {status.never ? '還沒備份過' : `已經 ${status.days} 天沒備份`}
          </div>
          <p className="text-[11px] text-muted mt-1 leading-relaxed">
            資料只存在這個瀏覽器裡。清除瀏覽器資料、換裝置，或把主畫面的 App
            刪掉，都會讓記錄一起消失，而且救不回來。
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
