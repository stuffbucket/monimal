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
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, resolve } from 'node:path'

import {
  decodeRgbaPng,
  encodeRgbaPng,
  extractTrayGlyph,
} from './tray-image.mjs'

const source = resolve('build/icon.icns')
const output = resolve('build/icon.png')
const trayOutputs = [
  { path: resolve('resources/tray/tray.png'), size: 32, template: false },
  { path: resolve('resources/tray/trayTemplate.png'), size: 18, template: true },
  { path: resolve('resources/tray/trayTemplate@2x.png'), size: 36, template: true },
]

function verifyTrayGlyph(path) {
  const image = decodeRgbaPng(readFileSync(path))
  let visible = 0
  for (let offset = 3; offset < image.pixels.length; offset += 4) {
    if (image.pixels[offset] > 8) visible += 1
  }
  const coverage = visible / (image.width * image.height)
  if (coverage < 0.05 || coverage > 0.5) {
    throw new Error(`${path} has invalid visible-pixel coverage ${coverage.toFixed(3)}`)
  }
}

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

const appIcon = decodeRgbaPng(readFileSync(output))
for (const trayOutput of trayOutputs) {
  mkdirSync(dirname(trayOutput.path), { recursive: true })
  const intermediate = `${trayOutput.path}.source.png`
  writeFileSync(
    intermediate,
    encodeRgbaPng(extractTrayGlyph(appIcon, trayOutput)),
  )
  const trayResult = spawnSync(
    'sips',
    [
      '-z',
      String(trayOutput.size),
      String(trayOutput.size),
      intermediate,
      '--out',
      trayOutput.path,
    ],
    { encoding: 'utf8' },
  )
  rmSync(intermediate, { force: true })
  if (trayResult.status !== 0) {
    console.error(`gen-icon-png: could not write ${trayOutput.path}`)
    console.error(trayResult.stderr ?? '')
    process.exit(1)
  }
  verifyTrayGlyph(trayOutput.path)
}

console.log(`gen-icon-png: wrote ${output} and tray resources`)
