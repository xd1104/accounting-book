/**
 * Photos live in IndexedDB, not localStorage: a single phone photo is several MB
 * and localStorage caps out around 5MB for everything combined.
 * Transactions only carry photo ids.
 */
const DB_NAME = 'accounting-book-photos'
const STORE = 'photos'

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode)
        const req = fn(t.objectStore(STORE))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      }),
  )
}

export function putPhoto(id: string, blob: Blob): Promise<unknown> {
  return tx('readwrite', (s) => s.put(blob, id))
}

export function getPhoto(id: string): Promise<Blob | undefined> {
  return tx<Blob | undefined>('readonly', (s) => s.get(id))
}

export async function deletePhotos(ids: string[]): Promise<void> {
  for (const id of ids) {
    await tx('readwrite', (s) => s.delete(id)).catch(() => {})
  }
}

export async function allPhotoIds(): Promise<string[]> {
  const keys = await tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys())
  return keys.map(String)
}

/**
 * 復原期間保留的照片（id → 保留次數）。
 *
 * 刪一筆有照片的記錄後有 5 秒可以復原；這段期間帳本裡已經沒有記錄引用那張照片，
 * 任何「沒被引用就刪」的清理都會把它當孤兒——按了復原，記錄回來、照片沒了。
 * holdSync() 只擋得住「新開始」的同步，擋不住已經在跑的那次（它回來後讀到的是刪除後的帳本），
 * 所以清理照片的每個地方（`pruneOrphans`、`syncPhotos` 刪雲端那段）都要在**動手前那一刻**
 * 問這裡，不是開始時拍一次快照：保留可能在清理途中才開始。
 */
const held = new Map<string, number>()

/** 保留這些照片不被當孤兒清掉；回傳的函式放開（重複呼叫無害）。 */
export function holdPhotos(ids: string[]): () => void {
  for (const id of ids) held.set(id, (held.get(id) ?? 0) + 1)
  let released = false
  return () => {
    if (released) return
    released = true
    for (const id of ids) {
      const n = (held.get(id) ?? 0) - 1
      if (n > 0) held.set(id, n)
      else held.delete(id)
    }
  }
}

export function isPhotoHeld(id: string): boolean {
  return held.has(id)
}

/** Remove photos no transaction references any more (and nobody is holding — see holdPhotos). */
export async function pruneOrphans(referenced: Set<string>): Promise<number> {
  const ids = await allPhotoIds()
  let n = 0
  for (const id of ids) {
    // 每張刪之前才問：前一張刪完的這段時間裡，可能剛好有人開始保留它。
    if (referenced.has(id) || isPhotoHeld(id)) continue
    await deletePhotos([id])
    n++
  }
  return n
}

/**
 * Downscale and re-encode before storing — a 4MB camera shot becomes ~150KB,
 * which keeps a few years of receipts well inside the storage quota.
 */
export async function compressImage(file: File, maxEdge = 1280, quality = 0.72): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(
    () => null,
  )
  if (!bitmap) return file

  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return file
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()

  const blob = await new Promise<Blob | null>((res) =>
    canvas.toBlob(res, 'image/jpeg', quality),
  )
  // Keep the original if re-encoding somehow made it bigger (tiny images can).
  return blob && blob.size < file.size ? blob : file
}

export function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

export async function dataURLToBlob(url: string): Promise<Blob> {
  const res = await fetch(url)
  return res.blob()
}

/** Human-readable storage usage, for the settings screen. */
export async function storageEstimate(): Promise<{ usedMB: number; quotaMB: number } | null> {
  if (!navigator.storage?.estimate) return null
  const { usage = 0, quota = 0 } = await navigator.storage.estimate()
  return { usedMB: usage / 1048576, quotaMB: quota / 1048576 }
}
