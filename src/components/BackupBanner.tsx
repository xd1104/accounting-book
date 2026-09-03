import { useState } from 'react'
import { useStore } from '../store'
import { downloadBackup } from '../lib/storage'
import { backupStatus, cloudState } from '../lib/persist'

/**
 * Browser storage is not a safe place for the only copy of a ledger, and there
 * is no way to recover it once it is gone — so nag, visibly, until a second copy
 * exists. Cloud sync counts as that second copy; a manual export is the fallback
 * for when sync is off or has stopped working.
 *
 * 2026-09-03 改版：banner 降級成頂列的一顆 chip，點了才展開成卡片。判斷邏輯
 * （backupStatus / cloudState）、downloadBackup、lastBackupAt 的寫入一個字都
 * 沒動 —— 只改長相。chip 天天都在、一樣在第一屏、一樣是警示色，只是不再佔 200px。
 */
function useBackupInfo() {
  const { data, sync } = useStore()
  const cloud = cloudState(sync.status, !!sync.config)
  const status = backupStatus(data.txns.length, data.settings.lastBackupAt, cloud)
  return { status, cloud }
}

/** 收合態：頂列右側的一顆警示色 chip。 */
export function BackupChip({ onOpen }: { onOpen: () => void }) {
  const { status, cloud } = useBackupInfo()
  if (!status.due) return null

  const label = cloud === 'stuck' ? '同步沒在跑' : status.never ? '未備份' : `${status.days} 天沒備份`

  return (
    <button
      onClick={onOpen}
      className="relative shrink-0 h-[30px] px-3 rounded-full text-[12.5px] font-semibold
                 bg-warn/14 text-warn-ink flex items-center gap-1 active:scale-95 transition
                 after:content-[''] after:absolute after:top-1/2 after:left-1/2
                 after:-translate-x-1/2 after:-translate-y-1/2
                 after:w-[max(100%,44px)] after:h-11"
    >
      ⚠️ {label}
    </button>
  )
}

/** 展開態：點 chip 之後插在頂列下面的卡片。 */
export function BackupPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, updateSettings } = useStore()
  const { status, cloud } = useBackupInfo()
  const [busy, setBusy] = useState(false)
  if (!open || !status.due) return null

  const run = async () => {
    setBusy(true)
    try {
      await downloadBackup(data)
      updateSettings({ lastBackupAt: new Date().toISOString() })
      onClose()
    } catch {
      alert('匯出失敗，請到設定頁再試一次')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-[18px] p-3.5 bg-warn/12">
      <div className="flex items-start gap-2">
        <span className="text-lg leading-none">⚠️</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-warn-ink">
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
                <span className="text-warn-ink">開啟雲端同步就不用再手動備份了。</span>
              </>
            )}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-2.5 ml-7">
        <button
          onClick={run}
          disabled={busy}
          className="h-9 px-4 rounded-full bg-warn text-on-warn text-sm font-semibold active:scale-95 transition disabled:bg-surface2 disabled:text-muted"
        >
          {busy ? '匯出中…' : '立即匯出備份'}
        </button>
        {/* 只收合，不寫 lastBackupAt —— 「知道了」不算備份過。 */}
        <button
          onClick={onClose}
          className="h-9 px-3 rounded-full text-sm text-muted active:bg-surface2 transition"
        >
          知道了
        </button>
      </div>
    </div>
  )
}
