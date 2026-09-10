#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { extractFile, listPackage } from '@electron/asar'
import {
  LLAMA_BACKENDS_VARIABLE,
  LLAMA_WORKER_FILENAME,
  llamaPackagePlan,
  parseLlamaBackends,
} from '@stuffbucket/maximal-harness/packaging'
import { llamaPackageChecks } from '@stuffbucket/maximal-harness/verify'
import { terminalPackageChecks } from 'stuffbucket-electron/verify'

import {
  externalClosure,
  hoistedDependencies,
  platformPackagePlan,
} from './package-contract.mjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const EXTERNAL_MODULES = ['node-pty', 'node-llama-cpp']
const LLAMA_SCOPE = 'node_modules/@node-llama-cpp'
const failures = []

function check(ok, message) {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${message}`)
  if (!ok) failures.push(message)
}

function locate() {
  const target = `Maximal-${process.platform}-${process.arch}`
  const dir = path.join(ROOT, 'out', target)
  if (process.platform === 'darwin') {
    const app = path.join(dir, 'Maximal.app')
    return { app, asar: path.join(app, 'Contents/Resources/app.asar') }
  }
  return {
    app: dir,
    asar: path.join(dir, 'resources/app.asar'),
  }
}

const { app, asar } = locate()
console.log('Verifying packaged Maximal client')
console.log(`  app:  ${path.relative(ROOT, app)}`)
console.log(`  asar: ${path.relative(ROOT, asar)}\n`)

if (!existsSync(asar)) {
  console.error('Packaged application not found. Run `pnpm run package` first.')
  process.exit(1)
}

const listing = listPackage(asar).map((entry) =>
  path.sep === '\\' ? entry.replaceAll('\\', '/') : entry,
)
const listedPaths = new Set(listing.map((entry) => entry.replace(/^\//, '')))
const resources = path.dirname(asar)
const unpacked = path.join(resources, 'app.asar.unpacked')
const unpackedFiles = existsSync(unpacked)
  ? readdirSync(unpacked, { recursive: true, encoding: 'utf8' }).map((entry) =>
      entry.split(path.sep).join('/'),
    )
  : []
console.log('application contents')
for (const [file, label] of [
  ['.vite/build/main.js', 'main bundle'],
  ['.vite/build/preload.js', 'preload bundle'],
  [`.vite/build/${LLAMA_WORKER_FILENAME}`, 'llama worker bundle'],
  ['.vite/renderer/main_window/index.html', 'renderer shell'],
  ['.vite/renderer/main_window/overlay.html', 'overlay shell'],
]) {
  check(listedPaths.has(file), `${label} is packed`)
}
const sidecars = existsSync(path.join(resources, 'bin'))
  ? readdirSync(path.join(resources, 'bin'))
  : []
check(sidecars.some((entry) => entry.startsWith('maximal-core')), 'maximal-core sidecar is packaged')
for (const asset of ['tray/tray.png', 'tray/trayTemplate.png', 'tray/trayTemplate@2x.png']) {
  check(existsSync(path.join(resources, asset)), `${asset} is packaged`)
}

function extract(inner) {
  return extractFile(asar, path.join(...inner.split('/'))).toString('utf8')
}

const rendererHtml = listedPaths.has('.vite/renderer/main_window/index.html')
  ? extract('.vite/renderer/main_window/index.html')
  : ''
const contentSecurityPolicy = rendererHtml
  .match(/<meta\b[^>]*http-equiv\s*=\s*["']content-security-policy["'][^>]*>/i)?.[0]
  ?.match(/content\s*=\s*(["'])(.*?)\1/is)?.[2]

console.log('\nnative terminal')
for (const { name, ok } of terminalPackageChecks({
  packedFiles: listing,
  unpackedFiles,
  platform: process.platform,
  arch: process.arch,
  contentSecurityPolicy,
})) {
  check(ok, name)
}

const IO = {
  basename: (target) => path.basename(target),
  realpath: (target) => {
    try {
      return realpathSync(target)
    } catch {
      return target
    }
  },
  sep: path.sep,
  join: (...parts) => path.join(...parts),
  readPackageJson: (dir) => {
    const file = path.join(dir, 'package.json')
    return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : undefined
  },
}

const workspaceRoot = (() => {
  let dir = ROOT
  for (;;) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) return ROOT
    dir = parent
  }
})()
const resolution = { boundary: workspaceRoot }
const nodeModules = path.join(ROOT, 'node_modules')
const closure = externalClosure(IO, nodeModules, EXTERNAL_MODULES, resolution)
const hoisted = hoistedDependencies(IO, nodeModules, EXTERNAL_MODULES, resolution)

const scopeEntries = closure.filter(({ name }) => name.startsWith('@node-llama-cpp/'))
const installed = scopeEntries.map(({ name }) => name.slice('@node-llama-cpp/'.length))
const backends = parseLlamaBackends(process.env[LLAMA_BACKENDS_VARIABLE])
const plan = llamaPackagePlan(installed, process.platform, process.arch, backends)
const kept = plan.filter((entry) => entry.keep).map((entry) => entry.name)
const dropped = plan.filter((entry) => !entry.keep)
const prebuilds = scopeEntries.map(({ name, dir }) => ({
  name: name.slice('@node-llama-cpp/'.length),
  files: readdirSync(dir, { recursive: true, encoding: 'utf8' }),
}))
const workerPath = `.vite/build/${LLAMA_WORKER_FILENAME}`
const workerSource = listedPaths.has(workerPath) ? extract(workerPath) : ''

console.log('\nnode-llama-cpp')
console.log(
  `  ${String(plan.length)} prebuild package(s) installed, ${String(kept.length)} shipped: ${kept.join(', ') || 'none'}`,
)
for (const { name, ok } of llamaPackageChecks({
  packedFiles: [...listedPaths],
  unpackedFiles,
  platform: process.platform,
  arch: process.arch,
  backends,
  prebuilds,
  workerSource,
})) {
  check(ok, name)
}

console.log('\nnative dependency closure')
check(
  closure.length > 0,
  closure.length > 0
    ? `the external modules reach ${String(closure.length)} package(s), ${String(hoisted.length)} hoisted`
    : 'nothing to check: the external modules reach 0 packages',
)
const platformPlan = platformPackagePlan(
  closure.map(({ dir, path: placement }) => {
    const json = IO.readPackageJson(dir) ?? {}
    return { path: placement, os: json.os, cpu: json.cpu }
  }),
  process.platform,
  process.arch,
)
const droppedLlamaPaths = new Set(
  dropped.map((entry) => `${LLAMA_SCOPE}/${entry.name}`),
)
const expected = platformPlan
  .filter((entry) => entry.keep && !droppedLlamaPaths.has(entry.path))
  .map((entry) => entry.path)
const missing = expected.filter((placement) => !listedPaths.has(placement))
check(
  missing.length === 0,
  missing.length === 0
    ? `all ${String(expected.length)} runnable closure placements are packed`
    : `${String(missing.length)} closure placements are missing, first ${missing[0]}`,
)

const packedManifests = [...listedPaths].filter(
  (entry) => entry.startsWith('node_modules/') && entry.endsWith('/package.json'),
)
check(packedManifests.length > 0, `${String(packedManifests.length)} packed manifests were read`)
const foreign = platformPackagePlan(
  packedManifests.map((manifest) => {
    const json = JSON.parse(extract(manifest))
    return { path: path.posix.dirname(manifest), os: json.os, cpu: json.cpu }
  }),
  process.platform,
  process.arch,
).filter((entry) => !entry.keep)
check(
  foreign.length === 0,
  foreign.length === 0
    ? `all packed packages run on ${process.platform}-${process.arch}`
    : `${String(foreign.length)} packed packages cannot run here, first ${foreign[0]?.path ?? ''}`,
)

if (failures.length > 0) {
  console.error(`\n${String(failures.length)} packaging check(s) failed.`)
  process.exit(1)
}
console.log('\nAll client packaging checks passed.')
