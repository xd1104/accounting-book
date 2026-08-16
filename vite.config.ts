import { execSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * A build stamp, derived rather than hand-maintained.
 *
 * lose-weight-helper keeps `APP_VER` in app.js and a cache name in sw.js and
 * bumps both by hand. Forgetting either is silent: the service worker file is
 * byte-identical, so the browser concludes there is no update and the phone
 * keeps running the old app forever. Deriving it from the commit means the
 * update check cannot rot.
 */
function buildStamp(): string {
  try {
    const sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
    const date = execSync('git log -1 --format=%cd --date=format:%Y.%m.%d', {
      encoding: 'utf8',
    }).trim()
    return `${date}-${sha}`
  } catch {
    // Building outside a checkout (a tarball, say) — fall back to the clock so
    // the stamp still changes between builds.
    return new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')
  }
}

const STAMP = buildStamp()

/**
 * The same stamp has to reach the service worker, and files in `public/` are
 * copied verbatim — so rewrite the placeholder on the way through, for both
 * `vite build` and the dev server.
 */
function stampServiceWorker(stamp: string): Plugin {
  const patch = (code: string) => code.replace(/__BUILD_STAMP__/g, stamp)
  return {
    name: 'stamp-service-worker',
    // public/ is copied as part of the write step, so patch after it lands.
    writeBundle: {
      order: 'post',
      async handler(options) {
        const path = `${options.dir ?? 'dist'}/sw.js`
        try {
          await writeFile(path, patch(await readFile(path, 'utf8')))
        } catch {
          /* no service worker in this build */
        }
      },
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.split('?')[0].endsWith('/sw.js')) return next()
        try {
          const body = patch(await readFile('public/sw.js', 'utf8'))
          res.setHeader('Content-Type', 'application/javascript')
          res.end(body)
        } catch {
          next()
        }
      })
    },
  }
}

// Deployed at https://<user>.github.io/accounting-book/
export default defineConfig({
  base: '/accounting-book/',
  plugins: [react(), tailwindcss(), stampServiceWorker(STAMP)],
  define: {
    __BUILD_STAMP__: JSON.stringify(STAMP),
  },
})
