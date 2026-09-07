import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { VitePlugin } from '@electron-forge/plugin-vite'
import type { ForgeConfig } from '@electron-forge/shared-types'

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

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
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
    extraResource: ['resources/bin'],
  },
  makers: [], // the private macos-builder packages the .dmg; we only build the .app
  plugins: [
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
