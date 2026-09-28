/**
 * Derive raster tray assets from the bundle icon.
 *
 * `build/icon.icns` is the app's source artwork. The menu bar and non-template
 * tray variants need raster images, so this renders them rather than committing
 * copies that can drift from the bundle icon.
 *
 * `sips` is macOS-only, which matches where this icon is needed: it is the dock
 * icon, and `app.dock` exists nowhere else. On any other platform the script
 * reports that it did nothing and exits clean, so it stays safe to wire into a
 * shared build step.
 */

import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const source = resolve('build/icon.icns')
const output = resolve('build/icon.png')
const trayOutputs = [
  resolve('resources/tray/tray.png'),
  resolve('resources/tray/trayTemplate.png'),
  resolve('resources/tray/trayTemplate@2x.png'),
]

if (process.platform !== 'darwin') {
  console.log('gen-icon-png: not darwin, nothing to do')
  process.exit(0)
}

if (!existsSync(source)) {
  console.error(`gen-icon-png: ${source} does not exist`)
  process.exit(1)
}

mkdirSync(dirname(output), { recursive: true })

// 512 rather than the icns's full 1024: the generated tray assets render at a
// fraction of that size.
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

for (const trayOutput of trayOutputs) {
  mkdirSync(dirname(trayOutput), { recursive: true })
  copyFileSync(output, trayOutput)
}

console.log(`gen-icon-png: wrote ${output} and tray resources`)
