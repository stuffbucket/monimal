import { cpSync, existsSync, mkdirSync, mkdtempSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'

import { PluginBase } from '@electron-forge/plugin-base'
import { VitePlugin } from '@electron-forge/plugin-vite'
import type { ForgeConfig, StartOptions } from '@electron-forge/shared-types'

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
const require = createRequire(import.meta.url)

function copyTerminalDependencies(buildPath: string): void {
  for (const name of ['node-pty', 'node-addon-api']) {
    const source = path.dirname(require.resolve(`${name}/package.json`))
    const destination = path.join(buildPath, 'node_modules', name)
    mkdirSync(path.dirname(destination), { recursive: true })
    cpSync(source, destination, { recursive: true, dereference: true })
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

  override async startLogic(_opts: StartOptions): Promise<string | false> {
    return process.env.MAXIMAL_DEV_ELECTRON ?? false
  }
}

const config: ForgeConfig = {
  packagerConfig: {
    asar: {
      unpack: '**/node_modules/node-pty/**',
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
    packageAfterCopy: (_config, buildPath) => {
      copyTerminalDependencies(buildPath)
      return Promise.resolve()
    },
  },
  makers: [], // the private macos-builder packages the .dmg; we only build the .app
  plugins: [
    new DevBundlePlugin({}),
    new VitePlugin({
      build: [
        { entry: 'src/main/index.ts', config: 'vite.main.config.ts', target: 'main' },
        { entry: 'src/preload/index.ts', config: 'vite.preload.config.ts', target: 'preload' },
      ],
      renderer: [{ name: 'main_window', config: 'vite.renderer.config.ts' }],
    }),
  ],
}

export default config
