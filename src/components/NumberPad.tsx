import { IconBackspace, IconCheck } from './icons'

/** Evaluates a flat '12+30-5' expression. Returns 0 for anything unparseable. */
export function evalExpr(expr: string): number {
  if (!expr) return 0
  const tokens = expr.match(/[+-]|[\d.]+/g)
  if (!tokens) return 0
  let total = 0
  let sign = 1
  for (const tk of tokens) {
    if (tk === '+') sign = 1
    else if (tk === '-') sign = -1
    else {
      const n = parseFloat(tk)
      if (!Number.isNaN(n)) total += sign * n
    }
  }
  return Math.round(total * 100) / 100
}

export function hasOperator(expr: string): boolean {
  return /\d[+-]/.test(expr)
}

interface Props {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  submitLabel?: string
  submitDisabled?: boolean
}

export function NumberPad({ value, onChange, onSubmit, submitLabel, submitDisabled }: Props) {
  const press = (k: string) => {
    if (navigator.vibrate) navigator.vibrate(8)

    if (k === 'del') {
      onChange(value.slice(0, -1))
      return
    }
    if (k === '+' || k === '-') {
      if (!value) return
      // Replace a trailing operator rather than stacking them
      onChange(/[+-]$/.test(value) ? value.slice(0, -1) + k : value + k)
      return
    }
    if (k === '.') {
      const last = value.split(/[+-]/).pop() ?? ''
      if (last.includes('.')) return
      onChange(value === '' ? '0.' : value + '.')
      return
    }
    // digits / 00 — block a third decimal place
    const last = value.split(/[+-]/).pop() ?? ''
    if (last.includes('.') && last.split('.')[1].length + k.length > 2) return
    onChange(value + k)
  }

  const Key = ({
    k,
    children,
    className = '',
  }: {
    k: string
    children: React.ReactNode
    className?: string
  }) => (
    <button
      onClick={() => press(k)}
      className={`h-14 rounded-2xl text-2xl font-medium grid place-items-center transition active:scale-95 ${className}`}
    >
      {children}
    </button>
  )

  const numKey = 'bg-surface2 text-ink active:bg-line'
  const opKey = 'bg-surface2 text-brand active:bg-line'

  return (
    <div className="grid grid-cols-4 gap-2">
      <Key k="7" className={numKey}>7</Key>
      <Key k="8" className={numKey}>8</Key>
      <Key k="9" className={numKey}>9</Key>
      <Key k="del" className={opKey}>
        <IconBackspace className="w-6 h-6" />
      </Key>

      <Key k="4" className={numKey}>4</Key>
      <Key k="5" className={numKey}>5</Key>
      <Key k="6" className={numKey}>6</Key>
      <Key k="+" className={opKey}>+</Key>

      <Key k="1" className={numKey}>1</Key>
      <Key k="2" className={numKey}>2</Key>
      <Key k="3" className={numKey}>3</Key>
      <Key k="-" className={opKey}>−</Key>

      <Key k="." className={numKey}>.</Key>
      <Key k="0" className={numKey}>0</Key>
      <Key k="00" className={numKey}>00</Key>
      <button
        onClick={onSubmit}
        disabled={submitDisabled}
        className="h-14 rounded-2xl bg-brand text-on-brand grid place-items-center font-semibold transition active:scale-95 disabled:bg-surface2 disabled:text-muted disabled:shadow-none"
      >
        {submitLabel ?? <IconCheck className="w-6 h-6" />}
      </button>
    </div>
  )
}
