import type { ReactNode } from 'react'

interface Props {
  /** 0..1+ — values above 1 mean over budget */
  progress: number
  size?: number
  stroke?: number
  color: string
  children?: ReactNode
}

export function Ring({ progress, size = 208, stroke = 13, color, children }: Props) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const p = Math.max(0, Math.min(progress, 1))
  const over = progress > 1

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--surface-2)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p)}
          style={{ transition: 'stroke-dashoffset 0.5s cubic-bezier(0.32,0.72,0,1), stroke 0.3s' }}
        />
        {over && (
          // How far past the limit, as a thin inner arc. Deliberately faint and
          // capped short of a full circle: at 3x over, a second solid ring inside
          // a solid one just reads as a red blob, and the number already says it.
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r - stroke - 4}
            fill="none"
            stroke={color}
            strokeWidth={2.5}
            strokeLinecap="round"
            opacity={0.3}
            strokeDasharray={2 * Math.PI * (r - stroke - 4)}
            strokeDashoffset={
              2 * Math.PI * (r - stroke - 4) * (1 - Math.min(progress - 1, 0.92))
            }
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {children}
      </div>
    </div>
  )
}

/** Green while comfortable, amber when close, red once over. */
export function budgetColor(progress: number): string {
  if (progress > 1) return 'var(--bad)'
  if (progress > 0.8) return 'var(--warn)'
  return 'var(--ok)'
}
