/**
 * Run the development app under its own name.
 *
 * `electron-forge start` resolves the Electron executable by `require()`ing
 * the `electron` package, which reads `ELECTRON_OVERRIDE_DIST_PATH` first. A
 * variable has to be set in the process that spawns Forge, and an npm
 * `prestart` is a different process, so the launch lives here rather than in
 * `package.json`.
 *
 * `scripts/name-dev-bundle.mjs` explains why the bundle being pointed at is a
 * private copy.
 */

import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

import { prepareDevBundle } from './name-dev-bundle.mjs'

const distPath = prepareDevBundle()

// The binary by path, not by name. `PATH` only carries `node_modules/.bin`
// when a package manager put it there, and going back through one to find out
// re-resolves the workspace lockfile.
const forge = resolve('node_modules/.bin/electron-forge')

const { status, error } = spawnSync(forge, ['start', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: distPath ? { ...process.env, ELECTRON_OVERRIDE_DIST_PATH: distPath } : process.env,
})

if (error) throw error
process.exit(status ?? 1)
