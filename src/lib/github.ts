/**
 * Minimal GitHub Contents API client — enough to keep one JSON file and a folder
 * of photos in a private repo. The repo doubles as the backup: every save is a
 * commit, so an accidental wipe can be recovered from history.
 */

export interface GitHubConfig {
  owner: string
  repo: string
  branch: string
  token: string
}

export interface RemoteFile {
  text: string
  sha: string
}

const API = 'https://api.github.com'

function headers(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

export class GitHubError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function fail(res: Response): Promise<never> {
  let detail = ''
  try {
    detail = ((await res.json()) as { message?: string }).message ?? ''
  } catch {
    /* body was not JSON */
  }
  const friendly: Record<number, string> = {
    401: 'Token 無效或已過期',
    403: 'Token 權限不足，需要這個 repo 的 Contents 讀寫權限',
    404: '找不到這個 repo 或分支，請確認名稱和 token 的存取範圍',
    409: '遠端有更新的版本',
    422: '請求被拒絕，通常是分支名稱不對',
  }
  throw new GitHubError(friendly[res.status] ?? detail ?? `GitHub 回應 ${res.status}`, res.status)
}

// --- base64 helpers that survive non-ASCII and large payloads ---

function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/\s/g, ''))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

export function encodeText(s: string): string {
  return bytesToBase64(new TextEncoder().encode(s))
}

export function decodeText(b64: string): string {
  return new TextDecoder().decode(base64ToBytes(b64))
}

// --- API ---

/** Confirms the token can reach the repo, and returns its default branch. */
export async function checkAccess(
  cfg: Omit<GitHubConfig, 'branch'>,
): Promise<{ defaultBranch: string; private: boolean }> {
  const res = await fetch(`${API}/repos/${cfg.owner}/${cfg.repo}`, {
    headers: headers(cfg.token),
  })
  if (!res.ok) await fail(res)
  const json = (await res.json()) as { default_branch: string; private: boolean }
  return { defaultBranch: json.default_branch, private: json.private }
}

/** null when the file does not exist yet. */
export async function getFile(cfg: GitHubConfig, path: string): Promise<RemoteFile | null> {
  const res = await fetch(
    `${API}/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURI(path)}?ref=${encodeURIComponent(cfg.branch)}`,
    { headers: { ...headers(cfg.token), 'Cache-Control': 'no-cache' } },
  )
  if (res.status === 404) return null
  if (!res.ok) await fail(res)
  const json = (await res.json()) as { content: string; sha: string }
  return { text: decodeText(json.content), sha: json.sha }
}

export async function getBlob(cfg: GitHubConfig, path: string): Promise<Blob | null> {
  const res = await fetch(
    `${API}/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURI(path)}?ref=${encodeURIComponent(cfg.branch)}`,
    { headers: { ...headers(cfg.token), 'Cache-Control': 'no-cache' } },
  )
  if (res.status === 404) return null
  if (!res.ok) await fail(res)
  const json = (await res.json()) as { content: string }
  const bytes = base64ToBytes(json.content)
  return new Blob([bytes.buffer as ArrayBuffer], { type: 'image/jpeg' })
}

/** Names of the files directly inside a folder; empty when it does not exist. */
export async function listFolder(cfg: GitHubConfig, path: string): Promise<string[]> {
  const res = await fetch(
    `${API}/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURI(path)}?ref=${encodeURIComponent(cfg.branch)}`,
    { headers: { ...headers(cfg.token), 'Cache-Control': 'no-cache' } },
  )
  if (res.status === 404) return []
  if (!res.ok) await fail(res)
  const json = (await res.json()) as Array<{ name: string; type: string }> | unknown
  if (!Array.isArray(json)) return []
  return json.filter((e) => e.type === 'file').map((e) => e.name)
}

/**
 * Writes a file. `sha` must be the version being replaced; GitHub rejects the
 * call if the remote moved on, which is how a conflict is detected rather than
 * silently overwriting the other device's work.
 */
export async function putFile(
  cfg: GitHubConfig,
  path: string,
  contentBase64: string,
  message: string,
  sha?: string,
): Promise<string> {
  const res = await fetch(`${API}/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURI(path)}`, {
    method: 'PUT',
    headers: { ...headers(cfg.token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, content: contentBase64, branch: cfg.branch, sha }),
  })
  if (!res.ok) await fail(res)
  const json = (await res.json()) as { content: { sha: string } }
  return json.content.sha
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer())
  return bytesToBase64(buf)
}

/**
 * The repo this copy of the app is being served from, read off the Pages URL.
 *
 * Storing the ledger in the same repo as the app is a perfectly good option, and
 * the one that needs no setup at all — so it should not require typing out an
 * account and repo name that the address bar already knows.
 *
 * Returns null anywhere that is not a github.io host (local dev, a custom
 * domain), where the URL says nothing about which repo is behind it.
 */
export function repoFromPagesUrl(href: string): { owner: string; repo: string } | null {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return null
  }
  const host = /^([A-Za-z0-9-]+)\.github\.io$/.exec(url.hostname)
  if (!host) return null
  const owner = host[1]
  const first = url.pathname.split('/').filter(Boolean)[0]
  // No path segment means a user site, which lives in a repo named after itself.
  return { owner, repo: first ?? `${owner}.github.io` }
}
