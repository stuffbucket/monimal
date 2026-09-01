/**
 * Derive the runtime dock icon from the bundle icon.
 *
 * `build/icon.icns` is the app's art, but a `.icns` is only ever read by the
 * OS from a packaged bundle. An unpackaged run — `electron-forge start` — shows
 * Electron's own icon instead, and `app.dock.setIcon` is the only way to change
 * that. It needs a raster image, so this renders one out of the icns rather
 * than committing a second copy of the same artwork that can drift from it.
 *
 * `sips` is macOS-only, which matches where this icon is needed: it is the dock
 * icon, and `app.dock` exists nowhere else. On any other platform the script
 * reports that it did nothing and exits clean, so it stays safe to wire into a
 * shared build step.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const source = resolve('build/icon.icns')
const output = resolve('build/icon.png')

if (process.platform !== 'darwin') {
  console.log('gen-icon-png: not darwin, nothing to do')
  process.exit(0)
}

if (!existsSync(source)) {
  console.error(`gen-icon-png: ${source} does not exist`)
  process.exit(1)
}

mkdirSync(dirname(output), { recursive: true })

// 512 rather than the icns's full 1024: the dock renders at a fraction of that,
// and `setIcon` holds the whole bitmap in memory for the life of the process.
const result = spawnSync(
  'sips',
  ['-s', 'format', 'png', '-z', '512', '512', source, '--out', output],
  { encoding: 'utf8' },
)

if (result.status !== 0) {
  console.error('gen-icon-png: sips failed')
  console.error(result.stderr ?? '')
  process.exit(1)
}

console.log(`gen-icon-png: wrote ${output}`)
