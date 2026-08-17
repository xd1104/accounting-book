import type { AppData } from './types'
import { getPhoto, putPhoto } from './photos'
import type { GitHubConfig } from './github'
import { blobToBase64, deleteFile, encodeText, getBlob, getFile, listFolder, putFile } from './github'
import {
  META_PATH,
  MONTH_DIR,
  PHOTO_DIR,
  assemble,
  monthKeys,
  monthPath,
  monthTxns,
  parseMeta,
  parseMonth,
  serializeMeta,
  serializeMonth,
} from './mdstore'
import type { Meta, MonthFile } from './mdstore'

const CONFIG_KEY = 'accounting-book/sync/v1'

export interface SyncConfig extends GitHubConfig {
  /** path -> sha of the version this device last read or wrote */
  shas: Record<string, string>
  lastSyncedAt: string | null
}

/**
 * The token lives here rather than inside AppData on purpose: exported backups
 * are files a person might share, and a repo-scoped token has no business in one.
 */
export function loadSyncConfig(): SyncConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (!raw) return null
    const cfg = JSON.parse(raw) as SyncConfig
    return { ...cfg, shas: cfg.shas ?? {} }
  } catch {
    return null
  }
}

export function saveSyncConfig(cfg: SyncConfig | null): void {
  if (cfg) localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg))
  else localStorage.removeItem(CONFIG_KEY)
}

export type SyncOutcome =
  | { action: 'pushed'; files: number }
  | { action: 'pulled'; data: AppData }
  | { action: 'merged'; data: AppData; files: number }
  | { action: 'inSync' }
  /** The same file moved on both sides — only the user can say which wins. */
  | { action: 'conflict'; paths: string[]; remote: AppData }

interface RemoteSnapshot {
  meta: Meta | null
  metaSha: string | null
  months: MonthFile[]
  monthShas: Record<string, string>
  empty: boolean
}

async function readRemote(cfg: SyncConfig): Promise<RemoteSnapshot> {
  const metaFile = await getFile(cfg, META_PATH)
  const entries = await listFolder(cfg, MONTH_DIR)
  const months: MonthFile[] = []
  const monthShas: Record<string, string> = {}

  for (const { name } of entries) {
    if (!name.endsWith('.md')) continue
    const month = name.slice(0, -3)
    const f = await getFile(cfg, monthPath(month))
    if (!f) continue
    months.push(parseMonth(month, f.text))
    monthShas[monthPath(month)] = f.sha
  }

  return {
    meta: metaFile ? parseMeta(metaFile.text) : null,
    metaSha: metaFile?.sha ?? null,
    months,
    monthShas,
    empty: !metaFile && entries.length === 0,
  }
}

/**
 * One round of sync, file by file.
 *
 * Splitting the ledger by month means "who changed what" is answered per file:
 * a month only the remote touched is pulled, a month only this device touched is
 * pushed, and a conflict is limited to the months that genuinely moved on both
 * sides instead of the whole ledger.
 *
 * `hasLocalHistory` is false on a device that has never stored anything — its
 * data is just the seeded defaults. Without that distinction a fresh phone would
 * look "locally modified" and every first sync would open with a bogus conflict.
 */
export async function syncOnce(
  cfg: SyncConfig,
  local: AppData,
  hasLocalHistory: boolean,
): Promise<SyncOutcome> {
  const remote = await readRemote(cfg)

  // Nothing there yet — seed the repo from this device.
  if (remote.empty) {
    const written = await pushAll(cfg, local, {})
    saveSyncConfig({ ...cfg, shas: written, lastSyncedAt: local.updatedAt })
    return { action: 'pushed', files: Object.keys(written).length }
  }

  const remoteData = assemble(
    remote.meta ?? parseMeta(serializeMeta(local)),
    remote.months,
  )

  // A device with nothing of its own just takes what is there. Record the
  // adopted bodies too, or the next sync would see every file as locally
  // modified and push the whole ledger straight back.
  if (!hasLocalHistory) {
    const shas = { ...remote.monthShas }
    if (remote.metaSha) shas[META_PATH] = remote.metaSha
    for (const [path, body] of Object.entries(fileMap(remoteData))) shas[`${path}#local`] = body
    saveSyncConfig({ ...cfg, shas, lastSyncedAt: remoteData.updatedAt })
    return { action: 'pulled', data: remoteData }
  }

  // Work out, per file, which side moved.
  const localFiles = fileMap(local)
  const remoteFiles: Record<string, string> = { [META_PATH]: remote.metaSha ?? '' }
  for (const [p, s] of Object.entries(remote.monthShas)) remoteFiles[p] = s

  const paths = new Set([...Object.keys(localFiles), ...Object.keys(remote.monthShas), META_PATH])
  const conflicts: string[] = []
  const toPush: string[] = []
  const toPull: string[] = []

  for (const path of paths) {
    const known = cfg.shas[path]
    const remoteSha = path === META_PATH ? remote.metaSha : (remote.monthShas[path] ?? null)
    const remoteMoved = (remoteSha ?? '') !== (known ?? '')
    const localMoved = localFiles[path] !== undefined && localFiles[path] !== cfg.shas[`${path}#local`]

    if (remoteMoved && localMoved) conflicts.push(path)
    else if (remoteMoved) toPull.push(path)
    else if (localMoved) toPush.push(path)
  }

  if (conflicts.length) return { action: 'conflict', paths: conflicts, remote: remoteData }

  if (!toPush.length && !toPull.length) return { action: 'inSync' }

  // Pull first so pushes are built on top of the newest remote state.
  let merged = local
  if (toPull.length) {
    merged = mergeFiles(local, remoteData, toPull, remote)
  }

  const nextShas: Record<string, string> = { ...cfg.shas }
  for (const path of toPull) {
    const sha = path === META_PATH ? remote.metaSha : remote.monthShas[path]
    if (sha) nextShas[path] = sha
    // The local body is now the merged one; recording the pre-merge body would
    // make the file look modified again on the very next sync.
    nextShas[`${path}#local`] = contentOf(merged, path)
  }

  let pushed = 0
  for (const path of toPush) {
    const body = contentOf(merged, path)
    const sha = await putFile(cfg, path, encodeText(body), commitMessage(path, merged), remoteFiles[path] || undefined)
    nextShas[path] = sha
    nextShas[`${path}#local`] = body
    pushed++
  }

  saveSyncConfig({ ...cfg, shas: nextShas, lastSyncedAt: merged.updatedAt })

  if (pushed && toPull.length) return { action: 'merged', data: merged, files: pushed }
  if (pushed) return { action: 'pushed', files: pushed }
  return { action: 'pulled', data: merged }
}

/** Take the remote version of the listed files, keep local for everything else. */
function mergeFiles(
  local: AppData,
  remoteData: AppData,
  paths: string[],
  remote: RemoteSnapshot,
): AppData {
  const next: AppData = { ...local, plans: { ...local.plans }, txns: [...local.txns] }

  for (const path of paths) {
    if (path === META_PATH) {
      next.settings = remoteData.settings
      next.wallets = remoteData.wallets
      next.accounts = remoteData.accounts
      next.categories = remoteData.categories
      continue
    }
    const month = path.slice(MONTH_DIR.length + 1, -3)
    const rm = remote.months.find((m) => m.month === month)
    next.txns = next.txns.filter((t) => t.date.slice(0, 7) !== month)
    if (rm) {
      next.txns.push(...rm.txns)
      if (rm.plan) next.plans[month] = rm.plan
      else delete next.plans[month]
    } else {
      delete next.plans[month]
    }
  }

  next.updatedAt = new Date().toISOString()
  return next
}

/** The serialised body of each file this device would write. */
function fileMap(d: AppData): Record<string, string> {
  const out: Record<string, string> = { [META_PATH]: serializeMeta(d) }
  for (const month of monthKeys(d)) {
    out[monthPath(month)] = serializeMonth(month, d.plans[month] ?? null, monthTxns(d, month))
  }
  return out
}

function contentOf(d: AppData, path: string): string {
  if (path === META_PATH) return serializeMeta(d)
  const month = path.slice(MONTH_DIR.length + 1, -3)
  return serializeMonth(month, d.plans[month] ?? null, monthTxns(d, month))
}

async function pushAll(
  cfg: SyncConfig,
  d: AppData,
  known: Record<string, string>,
): Promise<Record<string, string>> {
  const shas: Record<string, string> = { ...known }
  for (const [path, body] of Object.entries(fileMap(d))) {
    shas[path] = await putFile(cfg, path, encodeText(body), commitMessage(path, d), known[path])
    shas[`${path}#local`] = body
  }
  return shas
}

/** Force one side to win, then bring the repo in line with it. */
export async function resolveConflict(
  cfg: SyncConfig,
  keep: 'local' | 'remote',
  local: AppData,
  remote: AppData,
): Promise<AppData> {
  if (keep === 'remote') {
    const snapshot = await readRemote(cfg)
    const shas = { ...snapshot.monthShas }
    if (snapshot.metaSha) shas[META_PATH] = snapshot.metaSha
    const data = assemble(snapshot.meta ?? parseMeta(serializeMeta(remote)), snapshot.months)
    for (const [path, body] of Object.entries(fileMap(data))) shas[`${path}#local`] = body
    saveSyncConfig({ ...cfg, shas, lastSyncedAt: data.updatedAt })
    return data
  }

  const stamped = { ...local, updatedAt: new Date().toISOString() }
  const snapshot = await readRemote(cfg)
  const current: Record<string, string> = { ...snapshot.monthShas }
  if (snapshot.metaSha) current[META_PATH] = snapshot.metaSha
  const shas = await pushAll(cfg, stamped, current)
  saveSyncConfig({ ...cfg, shas, lastSyncedAt: stamped.updatedAt })
  return stamped
}

/**
 * Photos ride along as individual files. Failures here are reported but never
 * abort a sync — a missing photo is a nuisance, a missing ledger is not.
 *
 * This runs only after the ledger sync has succeeded, so `data` is the merged
 * view of every device that has synced. That is what makes deletion safe: a
 * photo no record in that view references is genuinely orphaned, not merely
 * missing from this device's copy.
 */
export async function syncPhotos(
  cfg: SyncConfig,
  data: AppData,
): Promise<{ uploaded: number; downloaded: number; deleted: number; failed: number }> {
  const referenced = new Set(data.txns.flatMap((t) => t.photos ?? []))
  let uploaded = 0
  let downloaded = 0
  let deleted = 0
  let failed = 0

  // Not skipped when nothing is referenced: deleting the last photo is exactly
  // when the repo has one to clean up.
  const remote = await listFolder(cfg, PHOTO_DIR)
  const remoteShas = new Map(remote.map((e) => [e.name, e.sha]))

  for (const id of referenced) {
    const name = `${id}.jpg`
    const onRemote = remoteShas.has(name)
    const local = await getPhoto(id)
    try {
      if (local && !onRemote) {
        await putFile(cfg, `${PHOTO_DIR}/${name}`, await blobToBase64(local), `照片 ${id}`)
        uploaded++
      } else if (!local && onRemote) {
        const blob = await getBlob(cfg, `${PHOTO_DIR}/${name}`)
        if (blob) {
          await putPhoto(id, blob)
          downloaded++
        }
      }
    } catch {
      failed++
    }
  }

  // Delete a record and its photo goes with it, here as well as on the device.
  for (const [name, sha] of remoteShas) {
    const id = name.replace(/\.jpg$/, '')
    if (referenced.has(id)) continue
    // No sha, no delete: the API needs it to know what it is removing, and
    // guessing is not an option when the call is destructive.
    if (!sha) continue
    try {
      await deleteFile(cfg, `${PHOTO_DIR}/${name}`, sha, `刪除照片 ${id}`)
      deleted++
    } catch {
      failed++
    }
  }

  return { uploaded, downloaded, deleted, failed }
}

function commitMessage(path: string, d: AppData): string {
  if (path === META_PATH) return '設定與分類'
  const month = path.slice(MONTH_DIR.length + 1, -3)
  const n = d.txns.filter((t) => t.date.slice(0, 7) === month).length
  return `${month}（${n} 筆）`
}
