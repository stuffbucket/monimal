/**
 * Give the development Electron bundle this application's name.
 *
 * macOS reads the bold application-menu title from the RUNNING BUNDLE's
 * `CFBundleName`, not from `app.setName()` and not from the menu template. A
 * packaged build is correct already — Forge writes `CFBundleName: Maximal` —
 * but `electron-forge start` runs the stock binary out of the `electron`
 * package, whose plist says "Electron". No amount of main-process code changes
 * that, so the only way to see the real name while developing is to name the
 * bundle that runs.
 *
 * ## Why this does not edit `node_modules/electron`
 *
 * It used to, on the reasoning that `node_modules` is disposable. Under pnpm
 * it is not one thing. `packages/maximal/client/node_modules/electron` and
 * `packages/maximal-electron/node_modules/electron` are both symlinks into one
 * store directory, so naming "the development bundle" named the OTHER
 * package's development bundle too: `@stuffbucket/maximal-electron`, a
 * generic UI shell with its own product name, opened with "Maximal" in the
 * menu bar. It was still that way when this was written.
 *
 * So the bundle that gets named is a copy this package owns, and
 * `ELECTRON_OVERRIDE_DIST_PATH` points Electron at it. The `electron` package
 * reads that variable before it reads `path.txt` (`index.js`), and
 * `electron-forge start` resolves the executable by `require()`ing that same
 * module (`@electron-forge/core/dist/util/electron-executable.js`), so one
 * variable covers both.
 *
 * ## Why the copy is affordable
 *
 * `cp -c` on APFS is a clone: the copy shares the original's blocks until one
 * of them is written to. The 295 MB dist copies in about a quarter of a
 * second and costs the disk one modified plist. On a filesystem without
 * `clonefile` the flag fails, and this falls back to a real copy — slower and
 * genuinely 295 MB, but correct, and still not a shared write.
 *
 * `CFBundleName` only. `CFBundleIdentifier` is deliberately untouched: it keys
 * the app's own storage and permissions, and changing it in development would
 * silently move where preferences and TCC grants live.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const PRODUCT_NAME = 'Maximal'

/** The stock value, and what a bundle this script renamed is restored to. */
const STOCK_NAME = 'Electron'

/** Where the named copy lives. Package-local, and in `.gitignore`. */
const DEV_DIST = resolve('.electron-dev')

/** What the copy was made from and for, so a version bump rebuilds it. */
const MARKER = join(DEV_DIST, '.built-from.json')

/*
 * The plist is XML, and `CFBundleName`'s value is the `<string>` immediately
 * after its `<key>`. Matched as that pair rather than by replacing the word
 * "Electron", which appears in several other values that must not change.
 */
const PATTERN = /(<key>CFBundleName<\/key>\s*<string>)([^<]*)(<\/string>)/

/**
 * Rewrite a plist's `CFBundleName`.
 *
 * Pure, and exported, because it is the only part of this file that can be
 * wrong in a way a filesystem cannot show you: the wrong capture group
 * silently rewrites `CFBundleIdentifier`'s neighbour instead.
 *
 * @param {string} plist
 * @param {string} name
 * @returns {{ changed: boolean, was?: string, plist: string }}
 */
export function renameBundle(plist, name) {
  const match = PATTERN.exec(plist)
  if (!match) return { changed: false, plist }
  if (match[2] === name) return { changed: false, was: match[2], plist }
  return { changed: true, was: match[2], plist: plist.replace(PATTERN, `$1${name}$3`) }
}

/** @param {string} file @param {string} name */
function writeName(file, name) {
  const result = renameBundle(readFileSync(file, 'utf8'), name)
  if (result.changed) writeFileSync(file, result.plist)
  return result
}

/**
 * Put back a shared bundle an older version of this script renamed.
 *
 * A one-time repair, not a habit. The value is only touched when it is exactly
 * what this script writes, so a bundle someone else named is left alone, and
 * a checkout that never ran the old version sees nothing happen. Without it
 * every existing checkout keeps the wrong name in the store forever and this
 * fix looks like it did nothing.
 *
 * @param {string} sharedPlist
 */
function repairSharedBundle(sharedPlist) {
  if (!existsSync(sharedPlist)) return
  const current = PATTERN.exec(readFileSync(sharedPlist, 'utf8'))?.[2]
  if (current !== PRODUCT_NAME) return
  writeName(sharedPlist, STOCK_NAME)
  console.log(
    `name-dev-bundle: put the shared Electron bundle back to ${STOCK_NAME}; ` +
      'it was renamed by an earlier version of this script and is shared with ' +
      '@stuffbucket/maximal-electron',
  )
}

/**
 * Build the named copy, and say where it is.
 *
 * Returns `undefined` when there is nothing to do — not darwin, or no
 * development bundle installed — rather than failing a developer's `start`.
 *
 * @returns {string | undefined} A value for `ELECTRON_OVERRIDE_DIST_PATH`.
 */
export function prepareDevBundle() {
  if (process.platform !== 'darwin') {
    console.log('name-dev-bundle: not darwin, nothing to do')
    return undefined
  }

  const stockDist = resolve('node_modules/electron/dist')
  const stockPlist = join(stockDist, 'Electron.app/Contents/Info.plist')
  if (!existsSync(stockPlist)) {
    console.log('name-dev-bundle: no development Electron bundle, nothing to do')
    return undefined
  }

  repairSharedBundle(stockPlist)

  const version = readFileSync(resolve('node_modules/electron/package.json'), 'utf8')
  const built = JSON.stringify({ version: JSON.parse(version).version, name: PRODUCT_NAME })
  const current = existsSync(MARKER) ? readFileSync(MARKER, 'utf8') : undefined

  if (current === built) {
    console.log(`name-dev-bundle: ${PRODUCT_NAME} bundle is current`)
    return DEV_DIST
  }

  // A stale copy is removed rather than copied over: an Electron upgrade
  // changes which files exist, and `cp` merges rather than replaces.
  rmSync(DEV_DIST, { recursive: true, force: true })
  mkdirSync(dirname(DEV_DIST), { recursive: true })

  try {
    // `-c` asks for a clone. It fails rather than falling back on its own, so
    // the fallback is here and says which one ran.
    execFileSync('cp', ['-Rc', stockDist, DEV_DIST], { stdio: 'pipe' })
  } catch {
    console.log('name-dev-bundle: clone unavailable on this filesystem, copying')
    execFileSync('cp', ['-R', stockDist, DEV_DIST], { stdio: 'inherit' })
  }

  const result = writeName(join(DEV_DIST, 'Electron.app/Contents/Info.plist'), PRODUCT_NAME)
  if (!result.changed && result.was === undefined) {
    // The layout changed upstream. Leave the copy in place and run the stock
    // bundle rather than a half-named one.
    console.log('name-dev-bundle: CFBundleName not found, running the stock bundle')
    rmSync(DEV_DIST, { recursive: true, force: true })
    return undefined
  }

  writeFileSync(MARKER, built)
  console.log(`name-dev-bundle: ${result.was ?? STOCK_NAME} -> ${PRODUCT_NAME} (private copy)`)
  return DEV_DIST
}
