/**
 * Run the development app under its own name.
 *
 * `scripts/name-dev-bundle.mjs` explains why the bundle being pointed at is a
 * private copy called `Maximal.app`, and why its path cannot be expressed as
 * `ELECTRON_OVERRIDE_DIST_PATH`.
 *
 * The path is handed to Forge through `forge.config.ts`, which claims the start
 * command and returns it. This file's job is to prepare the bundle and put the
 * path somewhere that config can read: a variable has to be set in the process
 * that spawns Forge, and an npm `prestart` is a different process, so the launch
 * lives here rather than in `package.json`.
 */

import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

import { prepareDevBundle } from './name-dev-bundle.mjs'

const execPath = prepareDevBundle()

// The binary by path, not by name. `PATH` only carries `node_modules/.bin`
// when a package manager put it there, and going back through one to find out
// re-resolves the workspace lockfile.
const forge = resolve('node_modules/.bin/electron-forge')

const { status, error } = spawnSync(forge, ['start', ...process.argv.slice(2)], {
  stdio: 'inherit',
  // Absent, `forge.config.ts` declines the start command and Forge resolves the
  // stock bundle itself — the right answer on a platform with nothing to name.
  env: execPath ? { ...process.env, MAXIMAL_DEV_ELECTRON: execPath } : process.env,
})

if (error) throw error
process.exit(status ?? 1)
