import { useSyncExternalStore } from 'react'

/**
 * 全 App 共用的「已刪除 · 復原」。
 *
 * 刪除不再先跳 confirm()：直接刪、底部給 5 秒復原，跟 iPhone 內建 App 一樣。
 * - `undo`：使用者按了復原。
 * - `commit`：沒按、時間到（或被下一個復原擠掉）——真正收尾的事放這裡，
 *   例如刪照片。復原期間照片不能先刪，不然按了復原記錄回來、照片卻沒了。
 */
export interface UndoEntry {
  label: string
  undo: () => void
  commit?: () => void
}

let current: (UndoEntry & { id: number }) | null = null
let seq = 0
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())

export function showUndo(entry: UndoEntry): void {
  // 上一個還沒結束就被擠掉：等同時間到，要收尾。
  current?.commit?.()
  current = { ...entry, id: ++seq }
  emit()
}

export function runUndo(): void {
  const c = current
  current = null
  emit()
  c?.undo()
}

export function dismissUndo(id: number): void {
  if (current?.id !== id) return
  const c = current
  current = null
  emit()
  c.commit?.()
}

export function useUndo() {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => current,
  )
}
