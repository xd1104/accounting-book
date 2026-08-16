/**
 * Rasterises public/icon.svg into the PNG sizes the manifest and iOS need.
 *
 *   npm i -D playwright && node scripts/generate-icons.mjs
 *
 * Playwright is not a project dependency — icons change rarely, so it is
 * installed only when they do. The SVG is the source of truth; the PNGs are
 * committed so a normal build needs none of this.
 */
import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pub = join(root, 'public')
const art = readFileSync(join(pub, 'icon.svg'), 'utf8')

/** Android masks crop to a circle, so the artwork is inset to the 80% safe zone. */
const maskable = art
  .replace(/rx="115"/, 'rx="0"')
  .replace(/<\/svg>$/, '</svg>')
  .replace(
    /(<rect width="512" height="512"[^>]*\/>)/,
    '$1<g transform="translate(256 256) scale(0.78) translate(-256 -256)">',
  )
  .replace(/<\/svg>/, '</g></svg>')

// CHROMIUM_PATH lets a pre-installed browser be used where Playwright's own
// download is skipped; without it the bundled Chromium is used as normal.
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
)
const page = await browser.newPage()

async function shot(svg, size, out) {
  // Wrapped in HTML rather than opened directly: an SVG document has no <head>
  // to style, and this is also what lets it be scaled to each size.
  const file = join(pub, '.icon-tmp.html')
  writeFileSync(
    file,
    `<style>html,body{margin:0}svg{width:100vw;height:100vh;display:block}</style>${svg}`,
  )
  await page.setViewportSize({ width: size, height: size })
  await page.goto('file://' + file)
  await page.waitForTimeout(150)
  await page.screenshot({ path: join(pub, out), omitBackground: true })
  console.log(out)
}

for (const size of [180, 192, 512]) await shot(art, size, `icon-${size}.png`)
await shot(maskable, 512, 'icon-maskable-512.png')

await browser.close()
