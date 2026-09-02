import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import type { TxnType } from '../lib/types'
import { Sheet } from './Sheet'
import { NumberPad, evalExpr, hasOperator } from './NumberPad'
import { IconCamera, IconCheck, IconChevronR, IconTrash } from './icons'
import { WALLET_KIND_LABEL } from '../lib/defaults'
import { money } from '../lib/format'
import { addDays, periodOf, today } from '../lib/date'
import { getPlan } from '../lib/budget'
import { uid } from '../lib/defaults'
import { compressImage, deletePhotos, putPhoto } from '../lib/photos'
import { PhotoThumb, PhotoViewer } from './Photo'

interface Props {
  open: boolean
  onClose: () => void
  editId?: string | null
  /** Pre-fill the date, e.g. when adding from a specific day's list */
  defaultDate?: string
}

export function TxnSheet({ open, onClose, editId, defaultDate }: Props) {
  const { data, addTxn, updateTxn, deleteTxn } = useStore()
  const editing = editId ? data.txns.find((t) => t.id === editId) ?? null : null

  const [type, setType] = useState<TxnType>('expense')
  const [expr, setExpr] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [accountId, setAccountId] = useState<string | null>(null)
  const [date, setDate] = useState(today())
  const [walletId, setWalletId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [photos, setPhotos] = useState<string[]>([])
  /** The keypad covers half the sheet, so it stays down until the amount is tapped. */
  const [padOpen, setPadOpen] = useState(false)
  const [picker, setPicker] = useState<'category' | 'wallet' | null>(null)
  const [busy, setBusy] = useState(false)
  const [viewing, setViewing] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  /** Photos written to IndexedDB during this session, dropped again if the sheet is cancelled. */
  const addedRef = useRef<string[]>([])
  const savedRef = useRef(false)

  const categories = useMemo(
    () => data.categories.filter((c) => c.type === type && !c.archived).sort((a, b) => a.order - b.order),
    [data.categories, type],
  )
  const accounts = useMemo(
    () => data.accounts.filter((a) => !a.archived).sort((a, b) => a.order - b.order),
    [data.accounts],
  )
  const wallets = useMemo(
    () => data.wallets.filter((w) => !w.archived).sort((a, b) => a.order - b.order),
    [data.wallets],
  )

  // Default the allocation item to whichever one the current plan spends from.
  const defaultAccountId = useMemo(() => {
    const plan = getPlan(data, periodOf(today(), data.settings.monthStartDay))
    if (plan?.allowanceAccountId) return plan.allowanceAccountId
    return accounts.find((a) => a.kind === 'allowance')?.id ?? accounts[0]?.id ?? null
  }, [data, accounts])

  /** Cash or card is a habit — reuse whatever was picked last. */
  const defaultWalletId = useMemo(() => {
    const recent = [...data.txns]
      .filter((t) => t.type === 'expense' && t.walletId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    if (recent?.walletId && wallets.some((w) => w.id === recent.walletId)) return recent.walletId
    return wallets[0]?.id ?? null
  }, [data.txns, wallets])

  /** The category used most recently for this type — saves a tap on the common case. */
  const lastUsedCategory = (t: TxnType) => {
    const recent = [...data.txns]
      .filter((x) => x.type === t)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    const list = data.categories.filter((c) => c.type === t && !c.archived)
    if (recent && list.some((c) => c.id === recent.categoryId)) return recent.categoryId
    return list.sort((a, b) => a.order - b.order)[0]?.id ?? ''
  }

  // Reset the form each time the sheet opens.
  useEffect(() => {
    if (!open) return
    if (editing) {
      setType(editing.type)
      setExpr(String(editing.amount))
      setCategoryId(editing.categoryId)
      setAccountId(editing.accountId)
      setDate(editing.date)
      setWalletId(editing.walletId)
      setNote(editing.note)
      setPhotos(editing.photos ?? [])
    } else {
      setType('expense')
      setExpr('')
      setCategoryId(lastUsedCategory('expense'))
      setAccountId(defaultAccountId)
      setDate(defaultDate ?? today())
      setWalletId(defaultWalletId)
      setNote('')
      setPhotos([])
    }
    addedRef.current = []
    savedRef.current = false
    setPadOpen(false)
    setPicker(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editId])

  const switchType = (t: TxnType) => {
    setType(t)
    setCategoryId(lastUsedCategory(t))
  }

  const attach = async (files: FileList) => {
    setBusy(true)
    try {
      const ids: string[] = []
      for (const file of Array.from(files).slice(0, 6)) {
        if (!file.type.startsWith('image/')) continue
        const blob = await compressImage(file)
        const id = uid()
        await putPhoto(id, blob)
        addedRef.current.push(id)
        ids.push(id)
      }
      setPhotos((p) => [...p, ...ids])
    } catch {
      alert('照片存不進去，可能是儲存空間滿了')
    } finally {
      setBusy(false)
    }
  }

  const amount = evalExpr(expr)
  const valid = amount > 0 && !!categoryId

  const submit = () => {
    if (!valid) return
    savedRef.current = true
    // Photos taken off an existing record are only really deleted once we save.
    const dropped = (editing?.photos ?? []).filter((id) => !photos.includes(id))
    if (dropped.length) deletePhotos(dropped)

    const payload = { type, amount, categoryId, accountId, walletId, note: note.trim(), date, photos }
    if (editing) updateTxn(editing.id, payload)
    else addTxn(payload)
    onClose()
  }

  /** Cancelling should not leave photos behind in IndexedDB. */
  const cancel = () => {
    if (!savedRef.current && addedRef.current.length) deletePhotos(addedRef.current)
    addedRef.current = []
    onClose()
  }

  const remove = () => {
    if (!editing) return
    if (confirm('刪除這筆記錄？')) {
      savedRef.current = true
      deleteTxn(editing.id)
      onClose()
    }
  }

  const sym = data.settings.currencySymbol
  const selectedCategory = categories.find((c) => c.id === categoryId)
  const selectedWallet = wallets.find((w) => w.id === walletId)

  return (
    <Sheet
      open={open}
      onClose={cancel}
      // Hug the (now compact) form; only claim the screen once the keypad is up.
      full={padOpen}
      footer={
        padOpen ? (
          <div>
            <button
              onClick={() => setPadOpen(false)}
              className="w-full h-7 -mt-1 mb-1 grid place-items-center text-faint active:text-muted"
              aria-label="收起鍵盤"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            <NumberPad
              value={expr}
              onChange={setExpr}
              onSubmit={submit}
              submitDisabled={!valid}
              submitLabel={editing ? '儲存' : undefined}
            />
          </div>
        ) : (
          <button
            onClick={submit}
            disabled={!valid}
            className="w-full h-12 rounded-2xl bg-brand text-on-brand font-semibold disabled:bg-surface2 disabled:text-muted disabled:shadow-none active:scale-[0.98] transition"
          >
            {amount > 0 ? (editing ? '儲存' : `記一筆 ${money(amount, sym)}`) : '先輸入金額'}
          </button>
        )
      }
    >
      {/* type switch */}
      <div className="flex items-center gap-2">
        <div className="flex-1 grid grid-cols-2 gap-1 p-1 rounded-2xl bg-surface2">
          {(['expense', 'income'] as const).map((t) => (
            <button
              key={t}
              onClick={() => switchType(t)}
              className={`h-9 rounded-xl text-sm font-semibold transition ${
                type === t ? 'bg-surface text-ink shadow-sm' : 'text-muted'
              }`}
            >
              {t === 'expense' ? '支出' : '收入'}
            </button>
          ))}
        </div>
        {editing && (
          <button
            onClick={remove}
            aria-label="刪除"
            className="w-10 h-10 grid place-items-center rounded-xl text-bad bg-surface2 active:scale-95"
          >
            <IconTrash className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* 1. date — first, the way the form is filled in */}
      <div className="flex gap-2 mt-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="flex-1 min-w-0 h-10 px-3 rounded-xl bg-surface2 text-ink text-sm outline-none"
        />
        <div className="flex gap-1">
          {[
            ['今天', today()],
            ['昨天', addDays(today(), -1)],
          ].map(([label, d]) => (
            <button
              key={label}
              onClick={() => setDate(d)}
              className={`px-3 h-10 rounded-xl text-[13px] font-medium transition ${
                date === d ? 'bg-brand text-on-brand' : 'bg-surface2 text-muted'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 2. amount — tapping it raises the keypad */}
      <button
        onClick={() => setPadOpen(true)}
        className={`w-full mt-3 mb-1 px-3 py-2 rounded-2xl text-right transition ${
          padOpen ? 'bg-brand-soft' : 'bg-surface2 active:scale-[0.99]'
        }`}
      >
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-[11px] text-muted shrink-0">
            {padOpen ? '輸入金額' : amount > 0 ? '金額' : '點一下輸入金額'}
          </span>
          <span
            className={`text-4xl font-semibold tnum leading-none truncate ${
              type === 'income' ? 'text-ok-ink' : 'text-ink'
            }`}
          >
            {amount === 0 && !expr ? <span className="text-faint">{sym}0</span> : money(amount, sym)}
          </span>
        </span>
        {hasOperator(expr) && (
          <span className="block h-4 mt-0.5 text-xs text-muted tnum">
            {expr.replace(/-/g, '−')}
          </span>
        )}
      </button>

      {/* 3. category and 4. source — collapsed into rows; the grids were crowding the sheet */}
      <div className="mt-3 space-y-2">
        <PickerRow
          label="分類"
          emoji={selectedCategory?.emoji}
          color={selectedCategory?.color}
          text={selectedCategory?.name ?? '選擇分類'}
          muted={!selectedCategory}
          onClick={() => setPicker('category')}
        />
        <PickerRow
          label={type === 'expense' ? '從哪裡付' : '收到哪裡'}
          emoji={selectedWallet?.emoji}
          color={selectedWallet?.color}
          text={selectedWallet?.name ?? '不指定'}
          muted={!selectedWallet}
          onClick={() => setPicker('wallet')}
        />
      </div>

      {/* 5. detail and photos */}
      <div className="mt-2 space-y-2">
        <div className="flex gap-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onFocus={() => setPadOpen(false)}
            rows={2}
            placeholder={
              selectedCategory
                ? `${selectedCategory.name}吃了/買了什麼？（選填）`
                : '詳細說明（選填）'
            }
            className="flex-1 min-w-0 px-3 py-2.5 rounded-xl bg-surface2 text-ink text-sm outline-none placeholder:text-faint resize-none leading-relaxed"
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="shrink-0 w-[62px] rounded-xl bg-surface2 grid place-items-center text-muted active:scale-95 transition disabled:text-faint"
            aria-label="加照片"
          >
            {busy ? (
              <span className="text-[10px]">處理中</span>
            ) : (
              <>
                <IconCamera className="w-5 h-5" />
                <span className="text-[10px] mt-0.5">照片</span>
              </>
            )}
          </button>
        </div>

        {photos.length > 0 && (
          <div className="flex gap-2 items-center overflow-x-auto pt-1 pb-1">
            {photos.map((id) => (
              <PhotoThumb
                key={id}
                id={id}
                onClick={() => setViewing(id)}
                onRemove={() => setPhotos((p) => p.filter((x) => x !== id))}
              />
            ))}
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) attach(e.target.files)
            e.target.value = ''
          }}
        />

        <select
          value={accountId ?? ''}
          onChange={(e) => setAccountId(e.target.value || null)}
          className="w-full h-10 px-3 rounded-xl bg-surface2 text-muted text-xs outline-none"
        >
          <option value="">算在：不列入零用錢</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              算在：{a.emoji} {a.name}
            </option>
          ))}
        </select>
      </div>

      <PhotoViewer id={viewing} onClose={() => setViewing(null)} />

      {/* category picker */}
      <Sheet open={picker === 'category'} onClose={() => setPicker(null)} title="選擇分類">
        <div className="grid grid-cols-4 gap-1.5 pb-4">
          {categories.map((c) => {
            const on = c.id === categoryId
            return (
              <button
                key={c.id}
                onClick={() => {
                  setCategoryId(c.id)
                  setPicker(null)
                }}
                className="flex flex-col items-center gap-1 py-3 rounded-2xl transition active:scale-95"
                style={on ? { background: `${c.color}22` } : undefined}
              >
                <span
                  className="w-12 h-12 grid place-items-center rounded-full text-2xl transition"
                  style={{
                    background: on ? c.color : 'var(--surface-2)',
                    boxShadow: on ? `0 4px 12px ${c.color}55` : undefined,
                  }}
                >
                  {c.emoji}
                </span>
                <span
                  className={`text-xs leading-tight ${on ? 'text-ink font-medium' : 'text-muted'}`}
                >
                  {c.name}
                </span>
              </button>
            )
          })}
        </div>
      </Sheet>

      {/* payment source picker */}
      <Sheet
        open={picker === 'wallet'}
        onClose={() => setPicker(null)}
        title={type === 'expense' ? '從哪裡付？' : '收到哪裡？'}
      >
        <div className="pb-4">
          {(['cash', 'bank'] as const).map((k) => {
            const group = wallets.filter((w) => w.kind === k)
            if (!group.length) return null
            return (
              <div key={k} className="mb-1">
                <div className="text-[11px] text-muted px-2 pt-2 pb-1">{WALLET_KIND_LABEL[k]}</div>
                {group.map((w) => (
                  <button
                    key={w.id}
                    onClick={() => {
                      setWalletId(w.id)
                      setPicker(null)
                    }}
                    className={`w-full flex items-center gap-3 p-3 rounded-2xl text-left transition ${
                      walletId === w.id ? 'bg-brand-soft' : 'active:bg-surface2'
                    }`}
                  >
                    <span
                      className="w-10 h-10 shrink-0 grid place-items-center rounded-full text-lg"
                      style={{ background: `${w.color}22` }}
                    >
                      {w.emoji}
                    </span>
                    <span className={`flex-1 ${walletId === w.id ? 'font-semibold text-brand' : ''}`}>
                      {w.name}
                    </span>
                    {walletId === w.id && <IconCheck className="w-4 h-4 text-brand" />}
                  </button>
                ))}
              </div>
            )
          })}
          <button
            onClick={() => {
              setWalletId(null)
              setPicker(null)
            }}
            className={`w-full flex items-center gap-3 p-3 mt-1 rounded-2xl text-left transition ${
              walletId === null ? 'bg-brand-soft' : 'active:bg-surface2'
            }`}
          >
            <span className="w-10 h-10 shrink-0 grid place-items-center rounded-full text-lg bg-surface2">
              ❓
            </span>
            <span className={`flex-1 ${walletId === null ? 'font-semibold text-brand' : ''}`}>
              不指定
            </span>
            {walletId === null && <IconCheck className="w-4 h-4 text-brand" />}
          </button>
        </div>
      </Sheet>
    </Sheet>
  )
}

/** A compact row that shows the current pick and opens a chooser, matching the 「算在」 select. */
function PickerRow({
  label,
  emoji,
  color,
  text,
  muted,
  onClick,
}: {
  label: string
  emoji?: string
  color?: string
  text: string
  muted?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="w-full h-11 px-3 rounded-xl bg-surface2 flex items-center gap-2 text-left active:scale-[0.99] transition"
    >
      <span className="text-xs text-muted shrink-0">{label}</span>
      {emoji && (
        <span
          className="w-6 h-6 shrink-0 grid place-items-center rounded-full text-sm"
          style={{ background: `${color ?? '#6b7280'}22` }}
        >
          {emoji}
        </span>
      )}
      <span className={`flex-1 min-w-0 truncate text-sm ${muted ? 'text-faint' : 'text-ink'}`}>
        {text}
      </span>
      <IconChevronR className="w-4 h-4 text-faint shrink-0" />
    </button>
  )
}
