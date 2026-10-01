/**
 * 按 Escape 只關最上層的視窗（桌機才有這個鍵）。
 *
 * 視窗會疊（編輯項目 → 選擇圖示、記帳視窗 → 照片檢視），每一層都在 document 上聽 keydown。
 * 以前每一層都照單全收，按一次 Escape 兩層一起關，外層沒存的修改跟著丟。
 * 現在只有 DOM 順序最後一個 `[data-sheet]` 回應——子視窗渲染在外層裡面，一定排在後面。
 *
 * 處理完 preventDefault、其他層看到 defaultPrevented 就不動——這是保險：
 * 真的鍵盤事件在每個監聽器之間會跑 microtask，React 可能在那裡就把上層卸載了，
 * 若外層的監聽器排在上層之後，它再查一次「誰在最上面」就會變成自己、又把自己關掉。
 * 目前的元件碰不到（關上層時外層會重新掛監聽器，派送中被移除的監聽器不會被呼叫），
 * 拿掉這行測試也不會紅（2026-10-01 突變實測），但不要依賴那個巧合。
 */
export function watchEscape(getRoot: () => Element | null, close: () => void): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return
    const root = getRoot()
    const sheets = document.querySelectorAll('[data-sheet]')
    if (!root || sheets[sheets.length - 1] !== root) return
    e.preventDefault()
    close()
  }
  document.addEventListener('keydown', onKey)
  return () => document.removeEventListener('keydown', onKey)
}
