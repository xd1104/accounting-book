import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { IconX } from './icons'
import { lockScroll, unlockScroll } from '../lib/scrollLock'

interface Props {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  /** Fill the screen instead of hugging its content — for the entry form */
  full?: boolean
  footer?: ReactNode
}

export function Sheet({ open, onClose, title, children, full, footer }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    lockScroll()
    return () => {
      document.removeEventListener('keydown', onKey)
      unlockScroll()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/45 animate-fade-in" onClick={onClose} />
      <div
        className={`relative bg-surface rounded-t-3xl shadow-2xl animate-sheet-in flex flex-col ${
          full ? 'h-[92vh]' : 'max-h-[88vh]'
        }`}
      >
        <div className="flex items-center justify-between px-4 pt-3 pb-2 shrink-0">
          <div className="w-9" />
          <div className="flex-1 text-center">
            <div className="mx-auto mb-2 h-1 w-9 rounded-full bg-line" />
            {title && <div className="font-semibold">{title}</div>}
          </div>
          <button
            onClick={onClose}
            aria-label="關閉"
            className="w-9 h-9 grid place-items-center rounded-full text-muted active:bg-surface2"
          >
            <IconX className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-2">{children}</div>

        {footer && <div className="shrink-0 px-4 pt-2 pb-4 safe-b border-t border-line">{footer}</div>}
        {!footer && <div className="safe-b pb-2" />}
      </div>
    </div>
  )
}
