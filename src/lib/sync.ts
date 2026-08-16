import type { AppData } from './types'
import { migrate } from './storage'
import { getPhoto, putPhoto } from './photos'
import type { GitHubConfig } from './github'
import { blobToBase64, encodeText, getBlob, getFile, listFolder, putFile } from './github'

const DATA_PATH = 'data.json'
const PHOTO_DIR = 'photos'
const CONFIG_KEY = 'accounting-book/sync/v1'

export interface SyncConfig extends GitHubConfig {
  /** sha of the data.json we last pulled or pushed */
  lastSha: string | null
  /** data.updatedAt at that moment, used to tell "local changed" from "unchanged" */
  lastSyncedAt: string | null
}

/**
 * The token lives here rather than inside AppData on purpose: exported backups
 * are files a person might share, and a repo-scoped token has no business in one.
 */
export function loadSyncConfig(): SyncConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    return raw ? (JSON.parse(raw) as SyncConfig) : null
  } catch {
    return null
  }
}

export function saveSyncConfig(cfg: SyncConfig | null): void {
  if (cfg) localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg))
  else localStorage.removeItem(CONFIG_KEY)
}

export type SyncOutcome =
  | { action: 'pushed' }
  | { action: 'pulled'; data: AppData }
  | { action: 'inSync' }
  /** Both sides moved since the last sync — only the user can say which wins. */
  | { action: 'conflict'; remote: AppData; remoteSha: string }

/**
 * One round of sync. Pull first so the sha is fresh, then decide:
 * remote-only change wins, local-only change is pushed, both changed is a conflict.
 *
 * `hasLocalHistory` is false on a device that has never stored anything — its
 * data is just the seeded defaults. Without that distinction a fresh phone would
 * look "locally modified" and every first sync would land in a bogus conflict.
 */
export async function syncOnce(
  cfg: SyncConfig,
  local: AppData,
  hasLocalHistory: boolean,
): Promise<SyncOutcome> {
  const remote = await getFile(cfg, DATA_PATH)

  if (!remote) {
    const sha = await putFile(cfg, DATA_PATH, encodeText(serialise(local)), commitMessage(local))
    saveSyncConfig({ ...cfg, lastSha: sha, lastSyncedAt: local.updatedAt })
    return { action: 'pushed' }
  }

  const remoteChanged = remote.sha !== cfg.lastSha
  const localChanged =
    hasLocalHistory && (!cfg.lastSyncedAt || local.updatedAt > cfg.lastSyncedAt)

  if (remoteChanged && localChanged) {
    return { action: 'conflict', remote: migrate(JSON.parse(remote.text)), remoteSha: remote.sha }
  }

  if (remoteChanged) {
    const data = migrate(JSON.parse(remote.text))
    saveSyncConfig({ ...cfg, lastSha: remote.sha, lastSyncedAt: data.updatedAt })
    return { action: 'pulled', data }
  }

  if (localChanged) {
    const sha = await putFile(
      cfg,
      DATA_PATH,
      encodeText(serialise(local)),
      commitMessage(local),
      remote.sha,
    )
    saveSyncConfig({ ...cfg, lastSha: sha, lastSyncedAt: local.updatedAt })
    return { action: 'pushed' }
  }

  return { action: 'inSync' }
}

/** Force one side to win a conflict. */
export async function resolveConflict(
  cfg: SyncConfig,
  keep: 'local' | 'remote',
  local: AppData,
  remote: AppData,
  remoteSha: string,
): Promise<AppData> {
  if (keep === 'remote') {
    saveSyncConfig({ ...cfg, lastSha: remoteSha, lastSyncedAt: remote.updatedAt })
    return remote
  }
  const stamped = { ...local, updatedAt: new Date().toISOString() }
  const sha = await putFile(
    cfg,
    DATA_PATH,
    encodeText(serialise(stamped)),
    commitMessage(stamped),
    remoteSha,
  )
  saveSyncConfig({ ...cfg, lastSha: sha, lastSyncedAt: stamped.updatedAt })
  return stamped
}

/**
 * Photos ride along as individual files. Failures here are reported but never
 * abort a sync — a missing photo is a nuisance, a missing ledger is not.
 */
export async function syncPhotos(
  cfg: SyncConfig,
  data: AppData,
): Promise<{ uploaded: number; downloaded: number; failed: number }> {
  const referenced = [...new Set(data.txns.flatMap((t) => t.photos ?? []))]
  let uploaded = 0
  let downloaded = 0
  let failed = 0

  const remoteNames = new Set(await listFolder(cfg, PHOTO_DIR))

  for (const id of referenced) {
    const name = `${id}.jpg`
    const onRemote = remoteNames.has(name)
    const local = await getPhoto(id)

    try {
      if (local && !onRemote) {
        await putFile(cfg, `${PHOTO_DIR}/${name}`, await blobToBase64(local), `photo ${id}`)
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

  return { uploaded, downloaded, failed }
}

function serialise(data: AppData): string {
  return JSON.stringify(data, null, 2)
}

function commitMessage(data: AppData): string {
  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16)
  return `記帳本 ${stamp}（${data.txns.length} 筆）`
}
