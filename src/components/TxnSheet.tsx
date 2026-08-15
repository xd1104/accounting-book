import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'
import type { TxnType } from '../lib/types'
import { Sheet } from './Sheet'
import { NumberPad, evalExpr, hasOperator } from './NumberPad'
import { IconTrash } from './icons'
import { money } from '../lib/format'
import { periodOf, today } from '../lib/date'
import { getPlan } from '../lib/budget'

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
  const [note, setNote] = useState('')

  const categories = useMemo(
    () => data.categories.filter((c) => c.type === type && !c.archived).sort((a, b) => a.order - b.order),
    [data.categories, type],
  )
  const accounts = useMemo(
    () => data.accounts.filter((a) => !a.archived).sort((a, b) => a.order - b.order),
    [data.accounts],
  )

  // Default the account to whichever one the current plan spends from.
  const defaultAccountId = useMemo(() => {
    const plan = getPlan(data, periodOf(today(), data.settings.monthStartDay))
    if (plan?.allowanceAccountId) return plan.allowanceAccountId
    return accounts.find((a) => a.kind === 'allowance')?.id ?? accounts[0]?.id ?? null
  }, [data, accounts])

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
      setNote(editing.note)
    } else {
      setType('expense')
      setExpr('')
      setCategoryId(lastUsedCategory('expense'))
      setAccountId(defaultAccountId)
      setDate(defaultDate ?? today())
      setNote('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editId])

  const switchType = (t: TxnType) => {
    setType(t)
    setCategoryId(lastUsedCategory(t))
  }

  const amount = evalExpr(expr)
  const valid = amount > 0 && !!categoryId

  const submit = () => {
    if (!valid) return
    const payload = { type, amount, categoryId, accountId, note: note.trim(), date }
    if (editing) updateTxn(editing.id, payload)
    else addTxn(payload)
    onClose()
  }

  const remove = () => {
    if (!editing) return
    if (confirm('刪除這筆記錄？')) {
      deleteTxn(editing.id)
      onClose()
    }
  }

  const sym = data.settings.currencySymbol

  return (
    <Sheet
      open={open}
      onClose={onClose}
      full
      footer={
        <NumberPad
          value={expr}
          onChange={setExpr}
          onSubmit={submit}
          submitDisabled={!valid}
          submitLabel={editing ? '儲存' : undefined}
        />
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

      {/* amount */}
      <div className="pt-3 pb-2 text-right">
        <div
          className={`text-5xl font-semibold tnum leading-none ${
            type === 'income' ? 'text-ok' : 'text-ink'
          }`}
        >
          {amount === 0 && !expr ? (
            <span className="text-faint">{sym}0</span>
          ) : (
            money(amount, sym)
          )}
        </div>
        <div className="h-5 mt-1 text-sm text-muted tnum">
          {hasOperator(expr) ? expr.replace(/-/g, '−') : ''}
        </div>
      </div>

      {/* categories */}
      <div className="grid grid-cols-5 gap-1.5">
        {categories.map((c) => {
          const on = c.id === categoryId
          return (
            <button
              key={c.id}
              onClick={() => setCategoryId(c.id)}
              className="flex flex-col items-center gap-1 py-2 rounded-2xl transition active:scale-95"
              style={on ? { background: `${c.color}22` } : undefined}
            >
              <span
                className="w-10 h-10 grid place-items-center rounded-full text-xl transition"
                style={{
                  background: on ? c.color : 'var(--surface-2)',
                  boxShadow: on ? `0 4px 12px ${c.color}55` : undefined,
                }}
              >
                {c.emoji}
              </span>
              <span className={`text-[11px] leading-tight ${on ? 'text-ink font-medium' : 'text-muted'}`}>
                {c.name}
              </span>
            </button>
          )
        })}
      </div>

      {/* date / account / note */}
      <div className="mt-4 space-y-2">
        <div className="flex gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="flex-1 h-11 px-3 rounded-xl bg-surface2 text-ink text-sm outline-none"
          />
          <select
            value={accountId ?? ''}
            onChange={(e) => setAccountId(e.target.value || null)}
            className="flex-1 h-11 px-3 rounded-xl bg-surface2 text-ink text-sm outline-none"
          >
            <option value="">未指定帳戶</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.emoji} {a.name}
              </option>
            ))}
          </select>
        </div>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="備註（選填）"
          className="w-full h-11 px-3 rounded-xl bg-surface2 text-ink text-sm outline-none placeholder:text-faint"
        />
      </div>
    </Sheet>
  )
}
