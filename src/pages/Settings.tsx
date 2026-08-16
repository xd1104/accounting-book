import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import type { Theme } from '../store'
import { downloadBackup, looksLikeBackup, migrate, restorePhotos } from '../lib/storage'
import { storageEstimate } from '../lib/photos'
import { backupStatus, cloudState, isPersisted, isStandalone } from '../lib/persist'
import {
  APP_VERSION,
  applyUpdate,
  checkForUpdate,
  isUpdateReady,
  subscribeUpdate,
  updatesSupported,
} from '../lib/appUpdate'
import { push } from '../router'
import { IconChevronR } from '../components/icons'

export function Settings() {
  const { data, updateSettings, replaceAll, resetAll, theme, setTheme, sync } = useStore()
  const fileRef = useRef<HTMLInputElement>(null)
  // Failures share the message slot with successes, so they need to not be green.
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null)
  const say = (text: string, bad = false) => setMsg({ text, bad })
  const [busy, setBusy] = useState(false)
  const [usage, setUsage] = useState<{ usedMB: number; quotaMB: number } | null>(null)

  const [persisted, setPersisted] = useState<boolean | null>(null)
  const standalone = isStandalone()

  const [updateReady, setUpdateReady] = useState(isUpdateReady)
  const [checking, setChecking] = useState(false)
  const [verMsg, setVerMsg] = useState('')

  useEffect(() => {
    storageEstimate().then(setUsage)
    isPersisted().then(setPersisted)
  }, [data])

  useEffect(() => subscribeUpdate(setUpdateReady), [])

  const doCheckUpdate = async () => {
    setChecking(true)
    setVerMsg('')
    const found = await checkForUpdate()
    setChecking(false)
    // When one is found the button is replaced by 立即更新, so only the
    // negative answer needs saying out loud.
    if (!found) setVerMsg('已經是最新版了。')
  }

  const photoCount = data.txns.reduce((n, t) => n + (t.photos?.length ?? 0), 0)
  const cloud = cloudState(sync.status, !!sync.config)
  const backup = backupStatus(data.txns.length, data.settings.lastBackupAt, cloud)

  const doExport = async () => {
    setBusy(true)
    setMsg(null)
    try {
      await downloadBackup(data)
      updateSettings({ lastBackupAt: new Date().toISOString() })
      say(photoCount > 0 ? `已匯出（含 ${photoCount} 張照片，檔案會比較大）` : '已匯出')
    } catch {
      say('匯出失敗', true)
    } finally {
      setBusy(false)
    }
  }

  const doImport = async (file: File) => {
    setBusy(true)
    try {
      const parsed = JSON.parse(await file.text())
      if (!looksLikeBackup(parsed)) {
        say('這不是記帳本的備份檔，沒有做任何事', true)
        return
      }
      const next = migrate(parsed)
      const n = next.txns.length
      const have = data.txns.length
      if (!confirm(`匯入 ${n} 筆記錄，覆蓋這台裝置目前的 ${have} 筆。要繼續嗎？`)) return
      const restored = await restorePhotos(parsed)
      replaceAll(next)
      say(`已匯入 ${n} 筆記錄${restored ? `、${restored} 張照片` : ''}`)
    } catch {
      say('檔案讀不到或格式不對', true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="px-4 pb-6 space-y-4">
      <Group title="外觀">
        <Row label="主題">
          <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-surface2">
            {(['system', 'light', 'dark'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t as Theme)}
                className={`px-3 h-7 rounded-lg text-xs font-semibold transition ${
                  theme === t ? 'bg-surface text-ink shadow-sm' : 'text-muted'
                }`}
              >
                {t === 'system' ? '跟隨系統' : t === 'light' ? '淺色' : '深色'}
              </button>
            ))}
          </div>
        </Row>
      </Group>

      <Group title="記帳設定">
        <Row label="貨幣符號">
          <input
            value={data.settings.currencySymbol}
            onChange={(e) => updateSettings({ currencySymbol: e.target.value.slice(0, 3) })}
            className="w-20 h-9 px-3 text-right rounded-xl bg-surface2 outline-none text-sm"
          />
        </Row>
        <Row
          label="每月起算日"
          hint={
            data.settings.monthStartDay === 1
              ? '以自然月計算'
              : `每月 ${data.settings.monthStartDay} 號到下個月 ${data.settings.monthStartDay - 1} 號為一期`
          }
        >
          <select
            value={data.settings.monthStartDay}
            onChange={(e) => updateSettings({ monthStartDay: Number(e.target.value) })}
            className="h-9 px-3 rounded-xl bg-surface2 outline-none text-sm"
          >
            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                {d} 號
              </option>
            ))}
          </select>
        </Row>
      </Group>

      <Group title="管理">
        <NavRow
          label="存放處"
          hint={`${data.wallets.filter((w) => !w.archived).length} 個`}
          onClick={() => push('/wallets')}
        />
        <NavRow
          label="分配項目"
          hint={`${data.accounts.filter((a) => !a.archived).length} 個`}
          onClick={() => push('/accounts')}
        />
        <NavRow
          label="分類"
          hint={`${data.categories.filter((c) => !c.archived).length} 個`}
          onClick={() => push('/categories')}
        />
      </Group>

      <Group title="雲端同步">
        <NavRow
          label="雲端同步"
          hint={
            sync.status === 'off'
              ? '未設定 — 資料只在這台裝置'
              : sync.status === 'error'
                ? '同步失敗'
                : sync.status === 'conflict'
                  ? '需要處理衝突'
                  : `${sync.config?.owner}/${sync.config?.repo}`
          }
          onClick={() => push('/sync')}
        />
      </Group>

      <Group title="資料備份">
        <div className="px-4 pb-3 text-xs text-muted">
          {cloud === 'ok' ? (
            <>
              雲端同步開著，每次記帳都會自動上傳，<b className="text-ok">不需要再手動備份</b>。
              下面的匯出是額外的離線副本，想留就留。
            </>
          ) : (
            <>
              資料和照片都存在這個瀏覽器裡。<b className="text-warn">請定期匯出備份</b> —
              清除瀏覽器資料、換裝置，或刪掉主畫面的 App，記錄都會一起消失且救不回來。
              <br />
              <span className="text-faint">
                嫌麻煩的話，開啟「雲端同步」就會自動幫你存，不用再記得備份。
              </span>
            </>
          )}
          <br />
          <span className="text-faint">
            注意：iPhone 上「主畫面 App」和 Safari 的資料是分開的兩份，不會互通。
          </span>
        </div>
        <Row
          label="上次備份"
          hint={backup.never ? '從來沒有備份過' : undefined}
        >
          <span className={`text-sm tnum ${backup.due ? 'text-warn font-semibold' : 'text-muted'}`}>
            {backup.never ? '無' : backup.days === 0 ? '今天' : `${backup.days} 天前`}
          </span>
        </Row>
        <Row label="記錄筆數">
          <span className="text-sm tnum text-muted">
            {data.txns.length} 筆{photoCount > 0 && ` · ${photoCount} 張照片`}
          </span>
        </Row>
        {usage && (
          <Row
            label="已用空間"
            hint={usage.quotaMB > 0 ? `可用約 ${Math.round(usage.quotaMB)} MB` : undefined}
          >
            <span className="text-sm tnum text-muted">{usage.usedMB.toFixed(1)} MB</span>
          </Row>
        )}
        <Row
          label="目前開啟方式"
          hint={
            persisted === true
              ? '瀏覽器已承諾不會自動清除資料'
              : persisted === false
                ? '瀏覽器可能在長期未開啟後自動清除，請務必備份'
                : undefined
          }
        >
          <span className="text-sm text-muted">{standalone ? '主畫面 App' : '瀏覽器分頁'}</span>
        </Row>
        <div className="px-3 pb-3 grid grid-cols-2 gap-2">
          <button
            onClick={doExport}
            disabled={busy}
            className="h-11 rounded-2xl bg-brand text-white text-sm font-semibold active:scale-[0.98] transition disabled:opacity-50"
          >
            {busy ? '處理中…' : '匯出備份'}
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="h-11 rounded-2xl bg-surface2 text-ink text-sm font-semibold active:scale-[0.98] transition disabled:opacity-50"
          >
            匯入備份
          </button>
        </div>
        {msg && (
          <div className={`px-4 pb-3 text-xs ${msg.bad ? 'text-bad' : 'text-ok'}`}>{msg.text}</div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) doImport(f)
            e.target.value = ''
          }}
        />
      </Group>

      <Group title="版本">
        <Row label="目前跑的版本" hint="這是這台裝置實際跑的版本，不一定是最新的">
          <span className="text-sm tnum text-muted">{APP_VERSION}</span>
        </Row>
        <div className="px-3 pb-3">
          {updateReady ? (
            <>
              <div className="px-1 pb-2 text-xs text-brand font-semibold">
                🎉 新版本已經下載好了，重新載入就會換過去
              </div>
              <button
                onClick={applyUpdate}
                className="w-full h-11 rounded-2xl bg-brand text-white text-sm font-semibold active:scale-[0.98] transition"
              >
                立即更新
              </button>
            </>
          ) : (
            <>
              {verMsg && <div className="px-1 pb-2 text-xs text-muted">{verMsg}</div>}
              <button
                onClick={doCheckUpdate}
                disabled={checking || !updatesSupported()}
                className="w-full h-11 rounded-2xl bg-surface2 text-ink text-sm font-semibold active:scale-[0.98] transition disabled:opacity-50"
              >
                {checking ? '檢查中…' : '檢查有沒有新版本'}
              </button>
            </>
          )}
        </div>
      </Group>

      <Group title="其他">
        <Row label="安裝到手機" hint="用瀏覽器開啟後，選「加入主畫面」就會變成 App">
          <span />
        </Row>
        <div className="px-3 pb-3">
          <button
            onClick={() => {
              if (confirm('清除所有資料？這無法復原，建議先匯出備份。')) {
                resetAll()
                say('已清除')
              }
            }}
            className="w-full h-11 rounded-2xl bg-bad/12 text-bad text-sm font-semibold active:scale-[0.98] transition"
          >
            清除所有資料
          </button>
        </div>
      </Group>

      <div className="text-center text-xs text-faint pt-2">記帳本 · {APP_VERSION}</div>
    </div>
  )
}


function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted px-4 pb-1.5 pt-1">{title}</div>
      <div className="bg-surface rounded-3xl overflow-hidden">{children}</div>
    </div>
  )
}

function Row({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-line last:border-0">
      <span className="flex-1 min-w-0">
        <span className="block text-sm">{label}</span>
        {hint && <span className="block text-[11px] text-faint">{hint}</span>}
      </span>
      {children}
    </div>
  )
}

function NavRow({ label, hint, onClick }: { label: string; hint?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-line last:border-0 text-left active:bg-surface2"
    >
      <span className="flex-1 text-sm">{label}</span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
      <IconChevronR className="w-4 h-4 text-faint" />
    </button>
  )
}

