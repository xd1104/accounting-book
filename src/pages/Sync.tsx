import { useState } from 'react'
import { useStore } from '../store'
import { checkAccess } from '../lib/github'
import { IconCheck } from '../components/icons'

const TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new'
const NEW_REPO_URL = 'https://github.com/new'

export function Sync() {
  const { data, sync, configureSync, disconnectSync, syncNow, resolveSync } = useStore()
  const connected = !!sync.config

  const [owner, setOwner] = useState('')
  const [repo, setRepo] = useState('accounting-data')
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [warn, setWarn] = useState('')

  const connect = async () => {
    setBusy(true)
    setErr('')
    setWarn('')
    try {
      const info = await checkAccess({ owner: owner.trim(), repo: repo.trim(), token: token.trim() })
      if (!info.private) {
        setWarn('提醒：這個 repo 是公開的，帳目所有人都看得到。建議改成 Private。')
      }
      configureSync({
        owner: owner.trim(),
        repo: repo.trim(),
        branch: info.defaultBranch,
        token: token.trim(),
        shas: {},
        lastSyncedAt: null,
      })
      setToken('')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (sync.conflict) {
    return (
      <div className="px-4 pb-6 space-y-4">
        <div className="bg-warn/12 rounded-3xl p-4">
          <div className="font-semibold text-warn mb-1">兩邊都有新的修改</div>
          <p className="text-xs text-muted leading-relaxed">
            這台裝置和雲端改到了同一個月份，沒辦法自動合併，請選一邊留下。
            <br />
            另一邊不會真的消失 — 雲端每次同步都是一次 commit，之後還能從 GitHub 的歷史紀錄找回來。
          </p>
          <div className="mt-2 text-[11px] text-muted">
            衝突的檔案：
            {sync.conflict.paths
              .map((p) => (p.endsWith('meta.md') ? '設定' : p.split('/').pop()?.replace('.md', '')))
              .join('、')}
          </div>
        </div>

        <div className="grid gap-2">
          <button
            onClick={() => resolveSync('local')}
            className="bg-surface rounded-3xl p-4 text-left active:scale-[0.99] transition"
          >
            <div className="font-semibold text-sm">用這台裝置的版本</div>
            <div className="text-xs text-muted mt-0.5 tnum">
              {data.txns.length} 筆記錄 · 覆蓋雲端
            </div>
          </button>
          <button
            onClick={() => resolveSync('remote')}
            className="bg-surface rounded-3xl p-4 text-left active:scale-[0.99] transition"
          >
            <div className="font-semibold text-sm">用雲端的版本</div>
            <div className="text-xs text-muted mt-0.5 tnum">
              {sync.conflict.remote.txns.length} 筆記錄 · 覆蓋這台裝置
            </div>
          </button>
        </div>
      </div>
    )
  }

  if (connected) {
    return (
      <div className="px-4 pb-6 space-y-4">
        <div className="bg-surface rounded-3xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <span
              className={`w-8 h-8 grid place-items-center rounded-full ${
                sync.status === 'error' ? 'bg-bad/15 text-bad' : 'bg-ok/15 text-ok'
              }`}
            >
              {sync.status === 'error' ? '!' : <IconCheck className="w-4 h-4" />}
            </span>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">
                {sync.status === 'syncing'
                  ? '同步中…'
                  : sync.status === 'error'
                    ? '同步失敗'
                    : '已連線'}
              </div>
              <div className="text-[11px] text-muted truncate">
                {sync.config!.owner}/{sync.config!.repo}
              </div>
            </div>
          </div>

          {sync.error && <div className="text-xs text-bad mb-2">{sync.error}</div>}
          {sync.detail && <div className="text-xs text-muted mb-2">{sync.detail}</div>}

          <div className="text-xs text-muted mb-3">
            上次同步：
            {sync.lastSyncedAt
              ? new Date(sync.lastSyncedAt).toLocaleString('zh-TW', {
                  month: 'numeric',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : '尚未同步'}
          </div>

          <button
            onClick={syncNow}
            disabled={sync.status === 'syncing'}
            className="w-full h-11 rounded-2xl bg-brand text-white text-sm font-semibold active:scale-[0.98] transition disabled:opacity-50"
          >
            {sync.status === 'syncing' ? '同步中…' : '立即同步'}
          </button>
        </div>

        <div className="bg-surface rounded-3xl p-4 text-xs text-muted leading-relaxed">
          記錄有變動後會自動上傳，開啟 App 時會自動下載。
          <br />
          在另一台裝置用同一個 repo 連線，就會拿到同一份資料。
        </div>

        <button
          onClick={() => confirm('中斷連線？這台裝置的資料會留著，只是不再同步。') && disconnectSync()}
          className="w-full h-11 rounded-2xl bg-bad/12 text-bad text-sm font-semibold active:scale-[0.98] transition"
        >
          中斷連線
        </button>
      </div>
    )
  }

  return (
    <div className="px-4 pb-6 space-y-4">
      <div className="bg-surface rounded-3xl p-4 text-xs text-muted leading-relaxed">
        把資料存到你自己的 <b className="text-ink">私人 GitHub repo</b>，手機和電腦就會是同一份，
        而且每次同步都是一次 commit，改錯還能從歷史紀錄復原。
      </div>

      <Step n={1} title="開一個私人 repo">
        <p>
          到{' '}
          <a href={NEW_REPO_URL} target="_blank" rel="noreferrer" className="text-brand underline">
            github.com/new
          </a>{' '}
          建立，名稱建議 <code className="text-ink">accounting-data</code>，
          <b className="text-warn">務必選 Private</b>，並勾選 Add a README（不能是空 repo）。
        </p>
      </Step>

      <Step n={2} title="產生存取 token">
        <p>
          到{' '}
          <a href={TOKEN_URL} target="_blank" rel="noreferrer" className="text-brand underline">
            Fine-grained tokens
          </a>{' '}
          建立：
        </p>
        <ul className="mt-1 space-y-0.5 list-disc pl-4">
          <li>Repository access → Only select repositories → 選剛剛那個</li>
          <li>Permissions → Repository permissions → Contents → <b className="text-ink">Read and write</b></li>
          <li>Expiration 可以設久一點，到期後要重新產生</li>
        </ul>
      </Step>

      <Step n={3} title="填進來">
        <div className="space-y-2 mt-2">
          <input
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            placeholder="GitHub 帳號，例如 xd1104"
            autoCapitalize="none"
            autoCorrect="off"
            className="w-full h-11 px-3 rounded-xl bg-surface2 text-sm outline-none placeholder:text-faint"
          />
          <input
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            placeholder="repo 名稱"
            autoCapitalize="none"
            autoCorrect="off"
            className="w-full h-11 px-3 rounded-xl bg-surface2 text-sm outline-none placeholder:text-faint"
          />
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="貼上 token（github_pat_…）"
            type="password"
            autoCapitalize="none"
            autoCorrect="off"
            className="w-full h-11 px-3 rounded-xl bg-surface2 text-sm outline-none placeholder:text-faint"
          />
        </div>

        {err && <div className="text-xs text-bad mt-2">{err}</div>}
        {warn && <div className="text-xs text-warn mt-2">{warn}</div>}

        <button
          onClick={connect}
          disabled={busy || !owner.trim() || !repo.trim() || !token.trim()}
          className="w-full h-12 mt-3 rounded-2xl bg-brand text-white font-semibold disabled:opacity-40 active:scale-[0.98] transition"
        >
          {busy ? '檢查中…' : '連線'}
        </button>
      </Step>

      <p className="text-[11px] text-faint px-1 leading-relaxed">
        Token 只存在這台裝置的瀏覽器裡，不會被寫進 repo，也不會出現在匯出的備份檔中。
        建議只給這一個 repo 的權限，這樣即使外流，影響範圍也僅限於它。
      </p>
    </div>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface rounded-3xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="w-6 h-6 shrink-0 grid place-items-center rounded-full bg-brand text-white text-xs font-bold">
          {n}
        </span>
        <span className="font-semibold text-sm">{title}</span>
      </div>
      <div className="text-xs text-muted leading-relaxed">{children}</div>
    </div>
  )
}
