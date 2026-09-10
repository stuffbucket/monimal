import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { PluginBase } from '@electron-forge/plugin-base'
import { VitePlugin } from '@electron-forge/plugin-vite'
import type { ForgeConfig, StartOptions } from '@electron-forge/shared-types'

import {
  LLAMA_BACKENDS_VARIABLE,
  LLAMA_SOURCE_INPUTS,
  llamaPackagePlan,
  parseLlamaBackends,
} from '@stuffbucket/maximal-harness/packaging'

import {
  externalClosure,
  hoistedDependencies,
  platformPackagePlan,
} from './scripts/package-contract.mjs'

// This config NEVER signs, and must not learn how.
//
// stuffbucket/macos-builder runs the producer with its signing keychain LOCKED
// and SIGN_IDENTITY set to the ad-hoc identity "-", so a packager configured to
// sign fails with "No identity found for signing." That failure is the point:
// untrusted client code can never reach the Developer ID.
//
// The builder signs the finished bundle instead — `sign_walk = bun-runtime` in
// .macos-builder/config walks every nested code item deepest-first, then seals
// the outer bundle. See RELEASING.md.

/**
 * A staging base this build owns alone.
 *
 * Packager's default base is a constant -- `os.tmpdir()/electron-packager` --
 * wiped with `fs.remove` at the start of every run. The build directory inside
 * it is already unique via `mkdtemp`, so the wipe of the shared parent is the
 * whole problem: CI packages this application and maximal-electron at the same
 * time, and whichever starts second deletes the other's staging tree mid-pack.
 * asar then fails opening a file it had already stat'ed.
 *
 * Both applications must set this. One of them alone still leaves the other
 * wiping a directory it does not own.
 */
const PACKAGER_STAGING_BASE = mkdtempSync(path.join(os.tmpdir(), 'forge-maximal-client-'))
const EXTERNAL_MODULES = ['node-pty', 'node-llama-cpp']
const NODE_MODULES = path.resolve('node_modules')

const PACKAGE_IO = {
  basename: (target: string) => path.basename(target),
  realpath: (target: string) => {
    try {
      return realpathSync(target)
    } catch {
      return target
    }
  },
  sep: path.sep,
  join: (...parts: string[]) => path.join(...parts),
  readPackageJson: (dir: string) => {
    const file = path.join(dir, 'package.json')
    if (!existsSync(file)) return undefined
    return JSON.parse(readFileSync(file, 'utf8')) as {
      dependencies?: Record<string, string>
      optionalDependencies?: Record<string, string>
    }
  },
}

function workspaceRoot(): string {
  let dir = __dirname
  for (;;) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) return path.resolve(__dirname)
    dir = parent
  }
}

const RESOLUTION = { boundary: workspaceRoot() }
const HOISTED = hoistedDependencies(PACKAGE_IO, NODE_MODULES, EXTERNAL_MODULES, RESOLUTION)
const CLOSURE = externalClosure(PACKAGE_IO, NODE_MODULES, EXTERNAL_MODULES, RESOLUTION)

function copyExternalClosure(buildPath: string): void {
  for (const { name, dir, path: placement } of CLOSURE) {
    const destination = path.join(buildPath, placement)
    if (existsSync(destination)) continue
    if (!existsSync(dir)) throw new Error(`${name} resolved to ${dir}, which does not exist.`)
    mkdirSync(path.dirname(destination), { recursive: true })
    cpSync(dir, destination, { recursive: true, dereference: true })
  }

  const missing = CLOSURE.filter(({ path: placement }) => !existsSync(path.join(buildPath, placement)))
  if (missing.length > 0) {
    throw new Error(
      `${String(missing.length)} of ${String(CLOSURE.length)} closure entries did not reach the package, first ${missing[0]?.path ?? ''}.`,
    )
  }
}

function prunePtyPrebuilds(buildPath: string, platform: string, arch: string): void {
  const modulePath = path.join(buildPath, 'node_modules', 'node-pty')
  const prebuilds = path.join(modulePath, 'prebuilds')
  if (!existsSync(prebuilds)) throw new Error(`node-pty has no prebuilds directory at ${prebuilds}.`)

  const host = platform === 'mas' ? 'darwin' : platform
  const wanted = new Set(
    (arch === 'universal' ? ['x64', 'arm64'] : [arch]).map((each) => `${host}-${each}`),
  )
  const present = readdirSync(prebuilds)
  if (!present.some((entry) => wanted.has(entry))) {
    throw new Error(`node-pty ships no prebuild for ${[...wanted].join(' or ')}. Found: ${present.join(', ')}.`)
  }

  for (const entry of present) {
    if (!wanted.has(entry)) rmSync(path.join(prebuilds, entry), { recursive: true, force: true })
  }
  for (const entry of ['src', 'third_party', 'scripts', 'typings', 'node_modules', 'binding.gyp']) {
    rmSync(path.join(modulePath, entry), { recursive: true, force: true })
  }
}

function pruneLlamaBackends(buildPath: string, platform: string, arch: string): void {
  const scope = path.join(buildPath, 'node_modules', '@node-llama-cpp')
  if (!existsSync(scope)) throw new Error(`@node-llama-cpp has no prebuild packages at ${scope}.`)

  const plan = llamaPackagePlan(
    readdirSync(scope),
    platform,
    arch,
    parseLlamaBackends(process.env[LLAMA_BACKENDS_VARIABLE]),
  )
  const kept = plan.filter((entry) => entry.keep)
  if (kept.length === 0) {
    throw new Error(
      `@node-llama-cpp ships nothing usable by ${platform}-${arch}. Found: ${plan.map((entry) => entry.name).join(', ')}.`,
    )
  }

  for (const entry of plan) {
    if (!entry.keep) rmSync(path.join(scope, entry.name), { recursive: true, force: true })
  }

  const dropped = plan.filter((entry) => !entry.keep)
  if (dropped.length > 0) {
    console.warn(
      `@node-llama-cpp: kept ${kept.map((entry) => entry.name).join(', ')}; dropped ` +
        `${dropped.map((entry) => `${entry.name} (${entry.reason})`).join(', ')}. ` +
        `Set ${LLAMA_BACKENDS_VARIABLE} to keep a GPU backend.`,
    )
  }
}

function pruneLlamaSource(buildPath: string): void {
  for (const entry of LLAMA_SOURCE_INPUTS) {
    const target = path.join(buildPath, entry)
    if (!existsSync(target)) {
      throw new Error(`${entry} is not in the package. node-llama-cpp's layout has changed.`)
    }
    const { size } = statSync(target)
    rmSync(target, { recursive: true, force: true })
    console.warn(`llama source: dropped ${entry} (${String(Math.round(size / 1e6))} MB).`)
  }
}

function prunePlatformPackages(buildPath: string, platform: string, arch: string): void {
  const modules = path.join(buildPath, 'node_modules')
  if (!existsSync(modules)) throw new Error(`The bundle has no node_modules at ${modules}.`)

  const manifests = readdirSync(modules, { recursive: true, encoding: 'utf8' })
    .filter((entry) => path.basename(entry) === 'package.json')
    .map((entry) => path.join('node_modules', entry))
  if (manifests.length === 0) throw new Error(`No package manifests under ${modules}. Nothing was judged.`)

  const plan = platformPackagePlan(
    manifests.map((manifest) => {
      const json = JSON.parse(readFileSync(path.join(buildPath, manifest), 'utf8')) as {
        os?: string[]
        cpu?: string[]
      }
      return { path: path.dirname(manifest), os: json.os, cpu: json.cpu }
    }),
    platform,
    arch,
  )
  const dropped = plan.filter((entry) => !entry.keep)
  for (const entry of dropped) {
    rmSync(path.join(buildPath, entry.path), { recursive: true, force: true })
  }
  if (dropped.length > 0) {
    console.warn(
      `platform: dropped ${String(dropped.length)} of ${String(plan.length)} packed package(s) for ` +
        `${platform}-${arch}; ${dropped.map((entry) => `${entry.path} (${entry.reason})`).join(', ')}.`,
    )
  }
}

const REQUIRED_TRAY_ASSETS = [
  'resources/tray/tray.png',
  'resources/tray/trayTemplate.png',
  'resources/tray/trayTemplate@2x.png',
] as const

for (const asset of REQUIRED_TRAY_ASSETS) {
  if (!existsSync(path.resolve(asset))) {
    throw new Error(`Required runtime asset is missing: ${asset}`)
  }
}

/**
 * Start the named development bundle instead of the stock one.
 *
 * Forge resolves the Electron binary itself — `require()`ing the `electron`
 * package, which joins `ELECTRON_OVERRIDE_DIST_PATH` with a `path.txt` that
 * always ends in `Electron.app/Contents/MacOS/Electron`. That fixed `.app`
 * component is the problem: macOS takes a Dock tile's name from the bundle
 * DIRECTORY, so a bundle reachable only as `Electron.app` hovers as "Electron"
 * however its plist is written. `scripts/name-dev-bundle.mjs` has the evidence.
 *
 * Forge lets a plugin take the start command over, which is the supported way
 * past that, and this is the only plugin here that claims it — Forge throws if
 * two do, and `VitePlugin` does not.
 *
 * Returning `false` declines: no variable means `scripts/start.mjs` prepared no
 * bundle (any platform but macOS, or a dist that could not be had), and Forge
 * goes back to its own resolution rather than the run failing. Packaging never
 * reaches here; a packaged bundle is already `Maximal.app`.
 */
class DevBundlePlugin extends PluginBase<Record<string, never>> {
  name = 'maximal-dev-bundle'

  override startLogic(_opts: StartOptions): Promise<string | false> {
    return Promise.resolve(process.env.MAXIMAL_DEV_ELECTRON ?? false)
  }
}

const config: ForgeConfig = {
  packagerConfig: {
    // Forge's production-dependency pruning cannot express the explicit native
    // closure below, especially when pnpm places it outside this package.
    prune: false,
    derefSymlinks: true,
    asar: {
      unpack:
        '{**/*.node,**/node_modules/node-pty/prebuilds/**,**/node_modules/@node-llama-cpp/**,**/node_modules/node-llama-cpp/**}',
    },
    ignore: (file: string) => {
      if (!file || file === '/package.json') return false
      const keep = [
        '/.vite',
        '/node_modules/node-pty',
        '/node_modules/node-llama-cpp',
        '/node_modules/@node-llama-cpp',
        ...HOISTED.map((name) => `/node_modules/${name}`),
      ]
      return !keep.some(
        (prefix) => file.startsWith(prefix) || prefix.startsWith(`${file}/`),
      )
    },
    // Never the shared default; see PACKAGER_STAGING_BASE.
    tmpdir: PACKAGER_STAGING_BASE,
    // The bundle's name, and the executable inside it. Absent, @electron/packager
    // falls back to `productName`, which happens to agree today — stating both
    // means a rename of the npm package cannot silently rename the app.
    name: 'Maximal',
    executableName: process.platform === 'linux' ? 'maximal' : 'Maximal',
    // Must EQUAL the approved builder policy's bundle_id_allowed
    // (co.stuffbucket.maximal); otherwise Electron defaults to a wrong
    // CFBundleIdentifier and the builder's per-repo policy gate rejects the build.
    appBundleId: 'co.stuffbucket.maximal',
    appCategoryType: 'public.app-category.developer-tools',
    // CFBundleVersion — the field macOS compares when it finds two copies of the
    // same bundle id, and therefore the one the UPGRADE path rides on. Apple
    // requires one to three period-separated integers, and LaunchServices' parse
    // stops at the first non-digit: left as the tag version, "0.5.0-rc.2" would
    // collapse to 0.5.0 and compare EQUAL to the final 0.5.0.
    //
    // `.macos-builder/build.sh` is the single owner of the value and derives it
    // from the tagged commit's date. Unset — a local `electron-forge package` —
    // @electron/packager falls back to appVersion, which is correct for a build
    // nothing ever upgrades from.
    buildVersion: process.env.MAXIMAL_BUILD_VERSION,
    icon: 'build/icon', // Forge appends the platform extension (.icns on macOS)
    // maximal-core ships as a compiled Bun sidecar under resources/bin and is
    // copied into the packaged app at Contents/Resources/bin — OUTSIDE the asar,
    // so it stays a real, spawnable, signable executable; the client spawns it.
    // Only the sidecar. The runtime PNG that `app.dock.setIcon` reads is
    // deliberately NOT shipped: a packaged bundle takes its icon from the
    // .icns Forge installs from `packagerConfig.icon`, so the dock is already
    // correct there and `applyDockIcon` leaves it alone. The PNG exists for
    // unpackaged runs only, where the bundle is stock Electron's.
    extraResource: ['resources/bin', 'resources/tray'],
  },
  hooks: {
    packageAfterCopy: (_config, buildPath, _electronVersion, platform, arch) => {
      copyExternalClosure(buildPath)
      prunePtyPrebuilds(buildPath, platform, arch)
      pruneLlamaBackends(buildPath, platform, arch)
      pruneLlamaSource(buildPath)
      prunePlatformPackages(buildPath, platform, arch)
      return Promise.resolve()
    },
  },
  makers: [], // the private macos-builder packages the .dmg; we only build the .app
  plugins: [
    new DevBundlePlugin({}),
    new VitePlugin({
      build: [
        { entry: 'src/main/index.ts', config: 'vite.main.config.ts', target: 'main' },
        { entry: 'src/main/llama-worker.ts', config: 'vite.worker.config.mts', target: 'main' },
        { entry: 'src/preload/index.ts', config: 'vite.preload.config.ts', target: 'preload' },
      ],
      renderer: [{ name: 'main_window', config: 'vite.renderer.config.ts' }],
    }),
  ],
}

export default config
