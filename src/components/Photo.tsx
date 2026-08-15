import { useEffect, useState } from 'react'
import { getPhoto } from '../lib/photos'
import { IconX } from './icons'

/** Resolve a stored photo id to an object URL, revoking it on unmount. */
export function usePhotoURL(id: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!id) {
      setUrl(null)
      return
    }
    let revoked: string | null = null
    let alive = true
    getPhoto(id).then((blob) => {
      if (!alive || !blob) return
      revoked = URL.createObjectURL(blob)
      setUrl(revoked)
    })
    return () => {
      alive = false
      if (revoked) URL.revokeObjectURL(revoked)
    }
  }, [id])

  return url
}

export function PhotoThumb({
  id,
  onClick,
  onRemove,
  size = 64,
}: {
  id: string
  onClick?: () => void
  onRemove?: () => void
  size?: number
}) {
  const url = usePhotoURL(id)
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <button
        onClick={onClick}
        className="w-full h-full rounded-xl overflow-hidden bg-surface2 block active:scale-95 transition"
      >
        {url && <img src={url} alt="" className="w-full h-full object-cover" />}
      </button>
      {onRemove && (
        <button
          onClick={onRemove}
          aria-label="移除照片"
          className="absolute -top-1.5 -right-1.5 w-5 h-5 grid place-items-center rounded-full bg-bad text-white shadow"
        >
          <IconX className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}

/** Full-screen viewer, tap anywhere to close. */
export function PhotoViewer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const url = usePhotoURL(id)
  if (!id) return null
  return (
    <div
      className="fixed inset-0 z-[60] bg-black/92 grid place-items-center animate-fade-in"
      onClick={onClose}
    >
      {url && <img src={url} alt="" className="max-w-full max-h-full object-contain" />}
      <button
        onClick={onClose}
        aria-label="關閉"
        className="absolute top-4 right-4 w-10 h-10 grid place-items-center rounded-full bg-white/15 text-white safe-t"
      >
        <IconX className="w-5 h-5" />
      </button>
    </div>
  )
}
