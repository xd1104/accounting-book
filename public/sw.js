// Offline shell for 記帳本.
// Runtime caching only — Vite hashes asset filenames, so there is no fixed list to precache.
//
// The stamp is substituted at build time (see vite.config.ts). Two things depend
// on it: the cache name, so activating a new worker drops every older cache; and
// the bytes of this file, since a browser only treats a service worker as updated
// when its contents differ. A hand-maintained version number gets forgotten and
// then updates stop reaching installed phones with no visible symptom.
const STAMP = '__BUILD_STAMP__'
const CACHE = `accounting-book-${STAMP}`
/**
 * 導覽最多等網路多久，超過就先給快取裡的殼。
 *
 * 2 秒是這樣選的：Slow 4G（150ms 往返、1.6Mbps）上 index.html 只有 1.5KB，
 * 正常回應大約 0.2–0.4 秒，2 秒留了 5 倍餘裕 —— 網路只要還算活著，
 * 拿到的就仍然是最新的殼，部署後第一次開啟照樣看得到新版。
 * 而網路真的卡住時，最壞情況從「無上限」變成 2 秒。
 *
 * 再短（1 秒）會讓訊號普通的地方常常拿到舊殼、把「看到新版」推遲一次開啟；
 * 再長（3 秒以上）就失去了意義——那已經是會讓人以為 App 壞掉的等待。
 */
const NAV_TIMEOUT = 2000

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
]

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return

  // Navigations: try network so a new deploy is picked up, fall back to the cached shell.
  //
  // 但要有時限。純 network-first 的問題不是「沒網路」——完全離線時 fetch 立刻
  // 失敗、267ms 就從快取開起來；問題是「半死不活的網路」：電梯、地下停車場、
  // 捷運上，請求不會失敗也不會回來。實測伺服器每個請求延遲 8 秒時，
  // 這個 App 明明整份都在手機裡，還是要空白等 8.1 秒。
  //
  // 所以讓網路跟一個計時器賽跑，逾時就先把快取裡的殼給使用者。
  if (req.mode === 'navigate') {
    // 網路那份無論輸贏都要寫回快取 —— 不然加了逾時就等於殼再也不更新，
    // 那是比慢更糟的失敗（手機永遠停在舊版，而且沒有症狀）。
    let cacheWrite = Promise.resolve()
    const network = fetch(req).then((res) => {
      if (res && res.ok) {
        const copy = res.clone()
        cacheWrite = caches
          .open(CACHE)
          .then((c) => c.put('./index.html', copy))
          .catch(() => {})
      }
      return res
    })
    // 就算下面已經把快取回給頁面，worker 也要活到殼寫完為止。
    e.waitUntil(network.then(() => cacheWrite).catch(() => {}))

    e.respondWith(
      (async () => {
        const cached = (await caches.match('./index.html')) || (await caches.match('./'))
        // 還沒有快取可退（第一次安裝）就只能等網路，跟以前一樣。
        if (!cached) return network

        let timer
        const timeout = new Promise((r) => {
          timer = setTimeout(() => r(null), NAV_TIMEOUT)
        })
        const winner = await Promise.race([network.catch(() => null), timeout])
        clearTimeout(timer)
        return winner || cached
      })(),
    )
    return
  }

  // Hashed assets: cache first.
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
          }
          return res
        }),
    ),
  )
})
