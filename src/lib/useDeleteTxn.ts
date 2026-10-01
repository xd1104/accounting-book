import { useStore } from '../store'
import { deletePhotos } from './photos'
import { showUndo } from './undo'

/**
 * 刪一筆記錄、給 5 秒復原（滑動刪除與記帳視窗的刪除鈕共用）。
 * 照片等復原期過了才刪；期間先擋住同步，免得同步把「沒人引用的照片」清掉（見 holdSync）。
 */
export function useDeleteTxn() {
  const { data, deleteTxn, restoreTxn, holdSync } = useStore()
  return (id: string) => {
    const txn = data.txns.find((t) => t.id === id)
    if (!txn) return
    const name = txn.note || data.categories.find((c) => c.id === txn.categoryId)?.name || '記錄'
    const release = holdSync()
    deleteTxn(id, { keepPhotos: true })
    showUndo({
      label: `已刪除「${name}」`,
      undo: () => {
        restoreTxn(txn)
        release()
      },
      commit: () => {
        if (txn.photos?.length) deletePhotos(txn.photos)
        release()
      },
    })
  }
}
