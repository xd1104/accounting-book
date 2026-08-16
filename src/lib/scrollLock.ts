/**
 * Shared background-scroll lock.
 *
 * Sheets stack in this app (the entry sheet opens a category picker, the item
 * editor opens the bank list). If each one saved and restored document.body's
 * overflow itself, two closing together could restore in the wrong order and
 * leave the body stuck at `hidden` — the page then refuses to scroll until a
 * reload. Counting the locks instead makes the order irrelevant: the body is
 * only released once nothing is holding it.
 */
let locks = 0
let saved = ''

export function lockScroll(): void {
  if (locks === 0) {
    saved = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  locks++
}

export function unlockScroll(): void {
  locks = Math.max(0, locks - 1)
  if (locks === 0) document.body.style.overflow = saved
}
