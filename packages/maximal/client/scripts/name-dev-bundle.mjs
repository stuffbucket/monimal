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
 * ## Which keys get named
 *
 * `CFBundleName` and `CFBundleDisplayName`. The first is what the menu bar
 * reads; the second is what the Finder reads, and macOS prefers it wherever
 * both are present.
 *
 * ## Why the bundle DIRECTORY is named too
 *
 * Neither key reaches the Dock. A tile's name — the string the tooltip shows —
 * comes from the bundle directory's own filename, for an app launched the way
 * `electron-forge start` launches one: exec'd directly, rather than opened
 * through LaunchServices.
 *
 * Measured rather than assumed, because the plist is the obvious suspect and it
 * is the wrong one. A bundle at a path macOS had never seen, carrying
 * `CFBundleName`, `CFBundleDisplayName` and `CFBundleExecutable` set to three
 * distinct probe strings and registered with `lsregister` under an identifier
 * of its own, still hovered as the name of the directory it sat in. Renaming
 * the directory was the only change that moved the tooltip: not the identifier,
 * not either name key, not the executable's filename, not restarting the Dock.
 * `NSRunningApplication.localizedName` and `lsappinfo` both answered "Maximal"
 * for the same process the whole time, which is what makes this worth writing
 * down — every API you would think to check agrees with you, and the Dock still
 * disagrees.
 *
 * So the copy's bundle directory is `Maximal.app`, and the launch path has to
 * go through it. That is why this returns an EXECUTABLE path rather than a dist
 * path: `ELECTRON_OVERRIDE_DIST_PATH` cannot express it. Electron's `index.js`
 * joins that variable with the contents of `path.txt`, which are
 * `Electron.app/Contents/MacOS/Electron` — so the `.app` component is fixed
 * whatever the variable says, and `path.txt` lives in the shared pnpm store
 * this file exists to avoid writing to. `forge.config.ts` takes the path
 * instead, through the `startLogic` hook Forge offers for exactly this.
 *
 * `CFBundleIdentifier` is deliberately untouched: it keys the app's own
 * storage and permissions, and changing it in development would silently move
 * where preferences and TCC grants live. `CFBundleExecutable` is untouched
 * too, for a blunter reason — it names a file inside the bundle, and renaming
 * the key without renaming the file stops the app launching at all.
 *
 * ## Why this finishes the install
 *
 * This runs before `electron-forge start`, and `electron`'s own postinstall is
 * what puts `dist` there. Under `verifyDepsBeforeRun: warn` a workspace whose
 * lockfile has moved on reaches this point with the package present and `dist`
 * missing. An earlier version read that as "no development bundle, nothing to
 * do" and returned; something later in the same command produced `dist`, and
 * Forge started the stock bundle from it — the exact failure this file exists
 * to prevent, arrived at by way of the file that prevents it. `install.js`
 * returns immediately when the dist is already correct, so making sure costs
 * nothing in the normal case.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const PRODUCT_NAME = 'Maximal'

/** The stock value, and what a bundle this script renamed is restored to. */
const STOCK_NAME = 'Electron'

/** Where the named copy lives. Package-local, and in `.gitignore`. */
const DEV_DIST = resolve('.electron-dev')

/** The bundle directory inside it. The Dock reads the name off this. */
const BUNDLE_DIR = `${PRODUCT_NAME}.app`

/** The stock bundle directory, as cloned, before it is renamed. */
const STOCK_BUNDLE_DIR = `${STOCK_NAME}.app`

/** What the copy was made from and for, so a version bump rebuilds it. */
const MARKER = join(DEV_DIST, '.built-from.json')

/**
 * The keys that hold the name, in the order they are reported on.
 *
 * The first is the anchor: it is the one whose presence decides whether the
 * plist is a layout this script understands, and whose old value is reported
 * back. A bundle carrying it but not the other is named as far as it goes
 * rather than abandoned — the missing key is a layout change upstream, not a
 * reason to run something called Electron.
 */
const NAME_KEYS = ['CFBundleName', 'CFBundleDisplayName']

/*
 * The plist is XML, and a key's value is the `<string>` immediately after its
 * `<key>`. Matched as that pair rather than by replacing the word "Electron",
 * which appears in several other values that must not change.
 */
const keyPattern = (key) => new RegExp(`(<key>${key}</key>\\s*<string>)([^<]*)(</string>)`)

/**
 * Rewrite a plist's name keys.
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
  let next = plist
  let changed = false
  let was

  for (const key of NAME_KEYS) {
    const pattern = keyPattern(key)
    const match = pattern.exec(next)
    if (!match) continue
    if (key === NAME_KEYS[0]) was = match[2]
    if (match[2] === name) continue
    next = next.replace(pattern, `$1${name}$3`)
    changed = true
  }

  return { changed, was, plist: next }
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
 * A one-time repair, not a habit. The value is only touched when the anchor
 * key is exactly what this script writes, so a bundle someone else named is
 * left alone, and a checkout that never ran the old version sees nothing
 * happen. Without it every existing checkout keeps the wrong name in the store
 * forever and this fix looks like it did nothing.
 *
 * The restore covers both name keys even though the version that caused the
 * damage only wrote one: on a bundle it renamed, the other is already stock
 * and the rewrite is a no-op.
 *
 * @param {string} sharedPlist
 */
function repairSharedBundle(sharedPlist) {
  if (!existsSync(sharedPlist)) return
  const current = keyPattern(NAME_KEYS[0]).exec(readFileSync(sharedPlist, 'utf8'))?.[2]
  if (current !== PRODUCT_NAME) return
  writeName(sharedPlist, STOCK_NAME)
  console.log(
    `name-dev-bundle: put the shared Electron bundle back to ${STOCK_NAME}; ` +
      'it was renamed by an earlier version of this script and is shared with ' +
      '@stuffbucket/maximal-electron',
  )
}

/**
 * Make sure the `electron` package has a dist to copy.
 *
 * `install.js` is the package's own postinstall, and its first act is to
 * return when the dist on disk already matches the version it was built for,
 * so the common path is a process spawn and nothing else.
 *
 * `ELECTRON_OVERRIDE_DIST_PATH` is stripped from the child's environment on
 * purpose: `install.js` reads it in both `isInstalled()` and `extractFile()`,
 * so a developer who exports it globally would otherwise have the install
 * inspect, and extract into, the wrong directory.
 *
 * A failure here is reported and swallowed. Not being able to reach the
 * download server is a reason to fall back to whatever bundle is present, not
 * a reason for `start` to fail.
 */
function ensureStockDist(stockPlist) {
  if (existsSync(stockPlist)) return true

  const installer = resolve('node_modules/electron/install.js')
  if (!existsSync(installer)) return false

  const env = { ...process.env }
  delete env.ELECTRON_OVERRIDE_DIST_PATH

  console.log('name-dev-bundle: no Electron dist yet, finishing the install')
  try {
    execFileSync(process.execPath, [installer], { cwd: dirname(installer), env, stdio: 'inherit' })
  } catch (error) {
    console.log(`name-dev-bundle: could not install the Electron dist (${error.message})`)
  }

  return existsSync(stockPlist)
}

/**
 * The binary inside the named copy.
 *
 * Exported and pure because the directory component is the whole point: spell
 * `Maximal.app` wrong and Forge falls back to the stock bundle, which starts
 * perfectly well under the wrong name. The file inside is still called
 * `Electron` — `CFBundleExecutable` names it, and the header says why that key
 * is left alone.
 *
 * @param {string} distPath
 * @returns {string}
 */
export function executablePath(distPath) {
  return join(distPath, BUNDLE_DIR, 'Contents/MacOS', STOCK_NAME)
}

/**
 * Build the named copy, and say what to launch.
 *
 * Returns `undefined` when there is nothing to do — not darwin, or no
 * development bundle to be had — rather than failing a developer's `start`.
 *
 * @returns {string | undefined} The executable `forge.config.ts` should start.
 */
export function prepareDevBundle() {
  if (process.platform !== 'darwin') {
    console.log('name-dev-bundle: not darwin, nothing to do')
    return undefined
  }

  const stockDist = resolve('node_modules/electron/dist')
  const stockPlist = join(stockDist, 'Electron.app/Contents/Info.plist')
  if (!ensureStockDist(stockPlist)) {
    console.log('name-dev-bundle: no development Electron bundle, nothing to do')
    return undefined
  }

  repairSharedBundle(stockPlist)

  const version = readFileSync(resolve('node_modules/electron/package.json'), 'utf8')
  // The keys are part of what the copy was built for, not just the version:
  // teaching this script a new key has to rebuild a copy made before it knew.
  const built = JSON.stringify({
    version: JSON.parse(version).version,
    name: PRODUCT_NAME,
    keys: NAME_KEYS,
    bundle: BUNDLE_DIR,
  })
  const current = existsSync(MARKER) ? readFileSync(MARKER, 'utf8') : undefined

  if (current === built) {
    console.log(`name-dev-bundle: ${PRODUCT_NAME} bundle is current`)
    return executablePath(DEV_DIST)
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

  // The directory is renamed before the plist, because it is the one the Dock
  // reads and the one the returned path is built from.
  const stockBundle = join(DEV_DIST, STOCK_BUNDLE_DIR)
  if (existsSync(stockBundle)) renameSync(stockBundle, join(DEV_DIST, BUNDLE_DIR))

  const result = writeName(join(DEV_DIST, BUNDLE_DIR, 'Contents/Info.plist'), PRODUCT_NAME)
  if (!result.changed && result.was === undefined) {
    // The layout changed upstream. Leave the copy in place and run the stock
    // bundle rather than a half-named one.
    console.log(`name-dev-bundle: ${NAME_KEYS[0]} not found, running the stock bundle`)
    rmSync(DEV_DIST, { recursive: true, force: true })
    return undefined
  }

  writeFileSync(MARKER, built)
  console.log(`name-dev-bundle: ${result.was ?? STOCK_NAME} -> ${PRODUCT_NAME} (private copy)`)
  return executablePath(DEV_DIST)
}
