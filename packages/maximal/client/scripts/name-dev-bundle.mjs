/**
 * Give the development Electron bundle this application's name.
 *
 * macOS reads the bold application-menu title from the RUNNING BUNDLE's
 * `CFBundleName`, not from `app.setName()` and not from the menu template. A
 * packaged build is correct already — Forge writes `CFBundleName: Maximal` —
 * but `electron-forge start` runs the stock binary inside
 * `node_modules/electron/dist/Electron.app`, whose plist says "Electron". No
 * amount of main-process code changes that, so the only way to see the real
 * name while developing is to name that bundle.
 *
 * Safe to do, because the thing being edited is disposable: `node_modules` is
 * gitignored and rebuilt by `pnpm install`, which restores the stock plist. The
 * script is idempotent, only touches darwin, and leaves the tree alone if
 * anything is missing rather than failing a developer's `start`.
 *
 * `CFBundleName` only. `CFBundleIdentifier` is deliberately untouched: it keys
 * the app's own storage and permissions, and changing it in development would
 * silently move where preferences and TCC grants live.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const PRODUCT_NAME = 'Maximal'

if (process.platform !== 'darwin') {
  console.log('name-dev-bundle: not darwin, nothing to do')
  process.exit(0)
}

const plistPath = resolve('node_modules/electron/dist/Electron.app/Contents/Info.plist')

if (!existsSync(plistPath)) {
  console.log('name-dev-bundle: no development Electron bundle, nothing to do')
  process.exit(0)
}

const plist = readFileSync(plistPath, 'utf8')

// The plist is XML, and CFBundleName's value is the <string> immediately after
// its <key>. Matched as that pair rather than by replacing the word "Electron",
// which appears in several other values that must not change.
const pattern = /(<key>CFBundleName<\/key>\s*<string>)([^<]*)(<\/string>)/
const match = pattern.exec(plist)

if (!match) {
  console.log('name-dev-bundle: CFBundleName not found, leaving the bundle alone')
  process.exit(0)
}

if (match[2] === PRODUCT_NAME) {
  console.log(`name-dev-bundle: already ${PRODUCT_NAME}`)
  process.exit(0)
}

writeFileSync(plistPath, plist.replace(pattern, `$1${PRODUCT_NAME}$3`))
console.log(`name-dev-bundle: ${match[2]} -> ${PRODUCT_NAME}`)
