import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';

import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { VitePlugin } from '@electron-forge/plugin-vite';
import type { ForgeConfig } from '@electron-forge/shared-types';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

import { PACKAGE_FUSES, RUNTIME_ICONS, LLAMA_BACKENDS_VARIABLE, bundleIcon, hoistedDependencies, llamaPackagePlan, parseLlamaBackends } from './scripts/package-contract.mjs';

/**
 * The external native modules, and the packages npm hoisted out of them.
 *
 * `EXTERNAL_MODULES` is the list the Vite configs keep out of the bundle. The
 * closure is derived at build time rather than written down, because a
 * dependency that moves between an upgrade's nested and hoisted positions
 * would otherwise vanish from the package with everything still green. See
 * `hoistedDependencies`, and issue #133 for the load failure it fixes.
 */
const EXTERNAL_MODULES = ['node-pty', 'node-llama-cpp'];

const NODE_MODULES = path.resolve('node_modules');

const HOISTED = hoistedDependencies(
  {
    join: (...parts: string[]) => path.join(...parts),
    readPackageJson: (dir: string) => {
      const file = path.join(dir, 'package.json');
      if (!existsSync(file)) return undefined;
      return JSON.parse(readFileSync(file, 'utf8')) as { dependencies?: Record<string, string> };
    },
  },
  NODE_MODULES,
  EXTERNAL_MODULES,
);

/**
 * Where the application icons come from.
 *
 * `STUFFBUCKET_ICON_DIR` points at a directory of a consumer's own icons, so a
 * fork brands its build without editing this file. `src/main/native/icons.ts`
 * reads the same variable at run time, so one value covers both the bundle icon
 * and the dock icon of an unpackaged run.
 *
 * The directory must carry the names below. A missing bundle icon is silent —
 * packager logs a warning and ships the Electron default — so it is checked
 * here instead.
 */
const ICON_DIR = path.resolve(process.env['STUFFBUCKET_ICON_DIR'] ?? 'build/icons');

const BUNDLE_ICON = bundleIcon(process.platform);

for (const file of [BUNDLE_ICON, ...RUNTIME_ICONS]) {
  if (!existsSync(path.join(ICON_DIR, file))) {
    throw new Error(
      `Icon directory ${ICON_DIR} has no ${file}. ` +
        'Run `npm run icons`, or point STUFFBUCKET_ICON_DIR at a complete set.',
    );
  }
}

/**
 * Drop the prebuilds this build cannot use.
 *
 * Microsoft publishes every platform in one package, so the split is ours to
 * write (their issue #864). `packagerConfig.ignore` cannot do it: the predicate
 * is handed a path and not the target, so a `--platform` build for another host
 * would keep this machine's prebuild. This hook is handed both.
 *
 * It throws rather than skipping. A layout change upstream would otherwise ship
 * every platform, or none, and both build cleanly.
 */
function prunePtyPrebuilds(buildPath: string, platform: string, arch: string): void {
  const module = path.join(buildPath, 'node_modules', 'node-pty');
  const prebuilds = path.join(module, 'prebuilds');
  if (!existsSync(prebuilds)) {
    throw new Error(`node-pty has no prebuilds directory at ${prebuilds}.`);
  }

  const host = platform === 'mas' ? 'darwin' : platform;
  const wanted = new Set(
    (arch === 'universal' ? ['x64', 'arm64'] : [arch]).map((each) => `${host}-${each}`),
  );

  const present = readdirSync(prebuilds);
  if (!present.some((entry) => wanted.has(entry))) {
    throw new Error(
      `node-pty ships no prebuild for ${[...wanted].join(' or ')}. ` +
        `Found: ${present.join(', ')}.`,
    );
  }

  for (const entry of present) {
    if (!wanted.has(entry)) rmSync(path.join(prebuilds, entry), { recursive: true, force: true });
  }

  // Install-time inputs. `third_party` alone is 23 MB of Windows conpty
  // binaries, and `node_modules` holds only the `node-addon-api` C++ headers
  // the prebuilds were compiled against.
  for (const entry of ['src', 'third_party', 'scripts', 'typings', 'node_modules', 'binding.gyp']) {
    rmSync(path.join(module, entry), { recursive: true, force: true });
  }
}

/**
 * Drop the llama.cpp backends this build cannot use, and the GPU ones it was
 * not asked for.
 *
 * `@node-llama-cpp` is a scope of one package per target and backend, and npm
 * installs by `os` and `cpu`, which are wider than a single build: a
 * `win32-x64` install carries `win-arm64` and 505 MB of CUDA. The plan is in
 * `scripts/package-contract.mjs`, which `scripts/verify-package.mjs` reads
 * too, so what is dropped here is what the check stops expecting. Issue #113.
 */
function pruneLlamaBackends(buildPath: string, platform: string, arch: string): void {
  const scope = path.join(buildPath, 'node_modules', '@node-llama-cpp');
  if (!existsSync(scope)) {
    throw new Error(`@node-llama-cpp has no prebuild packages at ${scope}.`);
  }

  const plan = llamaPackagePlan(
    readdirSync(scope),
    platform,
    arch,
    parseLlamaBackends(process.env[LLAMA_BACKENDS_VARIABLE]),
  );

  const kept = plan.filter((entry) => entry.keep);
  if (kept.length === 0) {
    throw new Error(
      `@node-llama-cpp ships nothing usable by ${platform}-${arch}. ` +
        `Found: ${plan.map((entry) => entry.name).join(', ')}.`,
    );
  }

  for (const entry of plan) {
    if (!entry.keep) rmSync(path.join(scope, entry.name), { recursive: true, force: true });
  }

  // A dropped GPU backend is a behaviour change for whoever installs this
  // package, not an implementation detail, so the build says it out loud.
  const dropped = plan.filter((entry) => !entry.keep);
  if (dropped.length > 0) {
    console.warn(
      `@node-llama-cpp: kept ${kept.map((entry) => entry.name).join(', ')}; dropped ` +
        `${dropped.map((entry) => `${entry.name} (${entry.reason})`).join(', ')}. ` +
        `Set ${LLAMA_BACKENDS_VARIABLE} to keep a GPU backend.`,
    );
  }
}

const config: ForgeConfig = {
  packagerConfig: {
    /**
     * Packager's own production-only walk, off.
     *
     * It reads `dependencies` to decide what survives, and this package
     * declares none: a consumer importing `./host` would otherwise install
     * `node-llama-cpp` for a file that imports `electron` alone (issue #31).
     * The `ignore` predicate below is already an explicit keep-list, so it
     * decides what reaches the package instead.
     */
    prune: false,

    /**
     * Native code cannot be loaded from inside an asar, so it is unpacked
     * beside it. `OnlyLoadAppFromAsar` still applies to app code.
     *
     * `*.node` alone is not enough. `node-llama-cpp` ships its llama.cpp
     * backends as `.dylib` and `.so` files next to the addon, and those are
     * `dlopen`ed at run time. Left inside the archive they fail to load, and
     * the failure looks like a model that will not start rather than a
     * packaging fault. Both native scopes are unpacked whole, because their
     * own documentation says the directory layout is load-bearing.
     *
     * `node-pty` has the same shape. It `execvp`s `spawn-helper` beside
     * `pty.node`, at a path it rewrites from `app.asar` to
     * `app.asar.unpacked`, so a `*.node` glob leaves it in the archive and
     * every shell fails to start. Its whole prebuild tree is unpacked.
     */
    asar: {
      unpack:
        '{**/*.node,**/node_modules/node-pty/prebuilds/**,**/node_modules/@node-llama-cpp/**,**/node_modules/node-llama-cpp/**}',
    },

    /**
     * Which files reach the package.
     *
     * Forge's Vite plugin normally sets this to "keep only `/.vite`", because
     * it assumes every dependency is bundled. That assumption breaks for a
     * native module: `node-pty` stays external (see `vite.main.config.ts`), so
     * it has to be copied in as real files.
     *
     * The plugin defers to an `ignore` set here, so this replaces its default
     * rather than fighting it. Keep it narrow: a wrong prefix silently ships
     * the whole `node_modules` tree.
     *
     * `node-llama-cpp` keeps its prebuilt binaries in a separate scope, which
     * is why a whole scope is kept rather than a single directory. Both it and
     * `node-pty` carry every platform at once, and the two prune hooks below
     * drop what this build cannot use.
     */
    ignore: (file: string) => {
      if (!file) return false;
      if (file === '/package.json') return false;

      // The capture fixture is built beside the product's renderer so the
      // recording tools can drive it, and dropped here so a user never
      // installs it. `scripts/verify-package.mjs` asserts it is absent.
      if (file.startsWith('/.vite/renderer/demo_window')) return true;

      const keep = [
        '/.vite',
        '/node_modules/node-pty',
        '/node_modules/node-llama-cpp',
        '/node_modules/@node-llama-cpp',
        // Everything those two reach that npm hoisted out of them. Without
        // this, `node-llama-cpp` cannot load at all in a packaged build.
        ...HOISTED.map((name) => `/node_modules/${name}`),
      ];
      return !keep.some(
        (prefix) =>
          // Inside a kept path, or a directory on the way to one. Packager
          // will not descend into a directory it has been told to ignore.
          file.startsWith(prefix) || prefix.startsWith(`${file}/`),
      );
    },
    name: 'Stuffbucket',
    executableName: process.platform === 'linux' ? 'stuffbucket' : 'Stuffbucket',
    appBundleId: 'co.stuffbucket.electron',
    appCategoryType: 'public.app-category.developer-tools',
    icon: path.join(ICON_DIR, 'icon'),
    // Icons the main process loads itself. They land beside `app.asar`, in
    // `Contents/Resources` (macOS) or `resources` (Windows and Linux). Copied
    // as files rather than as their directory, so a consumer's directory can
    // be called anything.
    extraResource: RUNTIME_ICONS.map((file) => path.join(ICON_DIR, file)),
    // No osxSign and no osxNotarize. stuffbucket/macos-runner owns the entire
    // sign, package, notarize, and staple tail. See docs/signing.md.
  },
  rebuildConfig: {},
  hooks: {
    packageAfterCopy: (_forgeConfig, buildPath, _electronVersion, platform, arch) => {
      prunePtyPrebuilds(buildPath, platform, arch);
      pruneLlamaBackends(buildPath, platform, arch);
      return Promise.resolve();
    },
  },
  // No makers. This repository ships a library tarball, not an installer, and
  // the MSI and dmg that used to be built here are gone; see `docs/release.md`.
  // `npm run package` is what CI runs and what `scripts/verify-package.mjs`
  // inspects. A fork that distributes an application adds its own maker.
  makers: [],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/main/index.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        // The llama.cpp engine, forked as a `utilityProcess`. A separate
        // bundle because it is a separate process; `target: 'main'` because
        // it is Node, not a preload. Issue #133.
        {
          entry: 'src/main/llama-worker.ts',
          config: 'vite.worker.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload/index.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        { name: 'main_window', config: 'vite.renderer.config.ts' },
        // The capture fixture. Built alongside, excluded from the package by
        // the `ignore` predicate above. `STUFFBUCKET_SKIP_FIXTURE` drops it
        // where nothing drives it; see docs/testing.md.
        ...(process.env.STUFFBUCKET_SKIP_FIXTURE
          ? []
          : [{ name: 'demo_window', config: 'vite.demo.config.ts' }]),
      ],
    }),
    // Fuses harden the packaged binary. Changing any value here invalidates an
    // existing signature, so a change must go through a fresh signed build.
    // The values are in `scripts/package-contract.mjs`, which
    // `scripts/verify-package.mjs` reads back off the built binary.
    new FusesPlugin({
      version: FuseVersion.V1,
      ...Object.fromEntries(
        Object.entries(PACKAGE_FUSES).map(([name, enabled]) => [
          FuseV1Options[name as keyof typeof FuseV1Options],
          enabled,
        ]),
      ),
    }),
  ],
};

export default config;
