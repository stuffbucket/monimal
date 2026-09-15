/**
 * What `forge.config.ts` builds into the package, and `scripts/verify-package.mjs`
 * checks arrived.
 *
 * Each list used to exist twice, with AGENTS.md asking for the copies to be
 * changed together. A review convention is not a mechanism: a seventh fuse
 * added to the plugin and not to the checker stays unverified with the run
 * still green. Issue #92.
 *
 * Plain ESM rather than TypeScript, because the checker runs under plain
 * `node`. `package-contract.d.mts` types it for `forge.config.ts`.
 */

/**
 * Fuse names, with the value the packaged binary must carry.
 *
 * Keyed by name rather than by `FuseV1Options`, so the checker can put the name
 * in its message and this module can stay free of an import.
 */
export const PACKAGE_FUSES = {
  RunAsNode: false,
  EnableCookieEncryption: true,
  EnableNodeOptionsEnvironmentVariable: false,
  EnableNodeCliInspectArguments: false,
  EnableEmbeddedAsarIntegrityValidation: true,
  OnlyLoadAppFromAsar: true,
};

/**
 * Icons the main process loads at run time, rather than the bundle carrying
 * them. They land beside `app.asar`, which is where `src/main/native/icons.ts`
 * looks.
 *
 * `tray@2x.png` is never named in code: `nativeImage` finds a `@2x`
 * variant beside the file it was given. It still has to ship.
 */
export const RUNTIME_ICONS = ['icon.png', 'tray.png', 'tray@2x.png'];

/**
 * The icon packager embeds in the bundle, by the platform being built for.
 *
 * macOS reads an `icns`, Windows an `ico`, and every other target the png.
 * `forge.config.ts` checks the chosen file is present, because a missing one is
 * silent: packager logs a warning and ships the Electron default.
 *
 * Here rather than in `forge.config.ts` so all three answers are unit tested. A
 * `win32` build has never run on a developer machine here, and the CI job that
 * runs it proves the file exists rather than that this picked the right name.
 *
 * @param {string} platform A Node `process.platform` value.
 * @returns {string}
 */
export function bundleIcon(platform) {
  if (platform === 'darwin') return 'icon.icns';
  if (platform === 'win32') return 'icon.ico';
  return 'icon.png';
}

/* ------------------------------------------------ platform-locked packages */

/**
 * The `process.platform` a Forge target runs on.
 *
 * `mas` is the Mac App Store build of a darwin application, so a package
 * declaring `"os": ["darwin"]` runs there. Every other Forge platform name is
 * already a `process.platform` value.
 */
const TARGET_PLATFORM = { mas: 'darwin' };

/**
 * npm's own `os`/`cpu` rule, which is not "is the value in the list".
 *
 * A list may hold exclusions, written `!win32`. If every entry is an
 * exclusion, anything not named matches; if any entry is an inclusion, the
 * value has to be one of them. `any` matches everything. Reimplemented rather
 * than depended on: this module loads under plain `node` with no imports, for
 * `verify-package.mjs`.
 *
 * @param {readonly string[] | string | undefined} list
 * @param {string} value
 * @returns {boolean}
 */
export function admitsTarget(list, value) {
  if (list === undefined) return true;
  const entries = typeof list === 'string' ? [list] : [...list];
  if (entries.length === 0) return true;
  if (entries.length === 1 && entries[0] === 'any') return true;

  let excluded = 0;
  let included = false;
  for (const entry of entries) {
    if (entry.startsWith('!')) {
      excluded += 1;
      if (entry.slice(1) === value) return false;
    } else if (entry === value) {
      included = true;
    }
  }
  return excluded === entries.length || included;
}

/**
 * @typedef {object} PlatformPackage
 * @property {string} path Bundle-relative directory, used in the message.
 * @property {readonly string[] | string} [os]
 * @property {readonly string[] | string} [cpu]
 */

/**
 * @typedef {object} PlatformPackageDecision
 * @property {string} path
 * @property {boolean} keep
 * @property {string} reason
 */

/**
 * Decide which copied packages this target can actually run.
 *
 * A package that ships a prebuilt binary per platform is published as a scope
 * of siblings, each declaring the one `os` and `cpu` it holds a binary for,
 * and the installer places whichever matches the machine doing the installing.
 * That machine is not the target: `--platform=win32` built here copied
 * `@reflink/reflink-darwin-arm64` -- a Mach-O `.node` -- into a Windows
 * bundle, where the only thing that could happen is a load failure.
 *
 * This reads the fields npm publishes, so it needs no knowledge of any
 * package: it caught `@reflink/reflink-*` on the day it was written, which was
 * the second instance of a shape that had already cost issue #113.
 *
 * Dropping is right whether or not the dependency was optional. A package
 * whose own manifest excludes the target cannot load there, so shipping it
 * trades a missing optional feature for a crash. The build says what it
 * dropped, so a required one is visible rather than inferred.
 *
 * Sorted by path, so the build log and the check read alike.
 *
 * @param {readonly PlatformPackage[]} packages
 * @param {string} platform A Forge platform name.
 * @param {string} arch A Forge arch name; `universal` means both macOS slices.
 * @returns {PlatformPackageDecision[]}
 */
export function platformPackagePlan(packages, platform, arch) {
  const os = TARGET_PLATFORM[platform] ?? platform;
  // A universal build carries both slices, so a package holding a binary for
  // either one is still needed by half of it.
  const arches = arch === 'universal' ? ['x64', 'arm64'] : [arch];

  return [...packages]
    .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0))
    .map((entry) => {
      if (!admitsTarget(entry.os, os)) {
        return { path: entry.path, keep: false, reason: `declares os ${describe(entry.os)}, not ${os}` };
      }
      if (!arches.some((each) => admitsTarget(entry.cpu, each))) {
        return {
          path: entry.path,
          keep: false,
          reason: `declares cpu ${describe(entry.cpu)}, not ${arches.join(' or ')}`,
        };
      }
      return { path: entry.path, keep: true, reason: 'runs on this target' };
    });
}

/** @param {readonly string[] | string | undefined} list */
function describe(list) {
  if (list === undefined) return 'nothing';
  return (typeof list === 'string' ? [list] : list).join(', ');
}

/* ------------------------------------------- external module dependencies */

/**
 * The packages an external native module needs at run time, derived.
 *
 * `packagerConfig.prune` is off and the keep-list names directories, so a
 * dependency of a kept module that npm hoisted to the top level never reached
 * the package. The closure derives those placements instead of assuming a flat
 * install.
 *
 * Derived rather than listed, because a hand-list is the same defect one
 * upgrade later. Resolution follows Node's: nested first, then up the tree, so
 * a nested copy stays inside its own kept directory and only a hoisted one
 * becomes an entry here.
 *
 * Throws on a dependency it cannot resolve. A package that silently loses one
 * builds cleanly and fails at run time, which is the failure this exists for.
 *
 * @param {{
 *   readPackageJson: (dir: string) => {
 *     dependencies?: Record<string, string>,
 *     optionalDependencies?: Record<string, string>,
 *   } | undefined,
 *   join: (...parts: string[]) => string,
 *   basename: (path: string) => string,
 *   realpath: (path: string) => string,
 *   sep: string,
 * }} io
 * @param {string} nodeModules Absolute path of the top-level `node_modules`.
 * @param {readonly string[]} roots Module names whose closure is wanted.
 * @param {{ boundary?: string }} [options] `boundary` is the highest directory
 *   the walk may resolve in — the workspace root. It defaults to the project
 *   root, which is right only for an installer that puts every real file under
 *   it.
 * @returns {{ name: string, dir: string, path: string }[]} Every package the
 *   roots reach, with `path` the bundle-relative directory it belongs at.
 *   Sorted by `path`, so a parent always precedes what nests inside it.
 */
export function externalClosure(io, nodeModules, roots, options = {}) {

  /*
   * The walk may not go above this.
   *
   * It used to be the project root, so a checkout inside another checkout
   * could not resolve against the outer tree. Then the realpath change made
   * that stop unreachable: under pnpm every real path lands in the
   * workspace's `node_modules/.pnpm`, which is *above* the project root, so
   * the condition guarding it was false for all 94 resolutions in this
   * repository and the only remaining bound was "is there a `node_modules`
   * segment anywhere in this path" — true for `/outer/node_modules/inner`,
   * and so no bound at all.
   *
   * A boundary cannot be derived from `nodeModules` alone, because where the
   * real files live depends on the installer. So the caller passes it: it is
   * the workspace root, and the caller is the one that knows.
   */
  const boundary = options.boundary ?? io.join(nodeModules, '..');
  const withinBoundary = (dir) => dir === boundary || dir.startsWith(boundary + io.sep);

  /**
   * Node's own algorithm, which this used to approximate and get wrong twice.
   *
   * **The realpath.** A package directory is often a symlink — pnpm makes
   * every one of them one — and Node resolves through it, because it works on
   * the real path unless started with `--preserve-symlinks`. Walking the link
   * path instead never enters the directory the dependencies are actually in.
   *
   * **A `node_modules` directory is itself a search root.** Node skips
   * appending `node_modules` to a directory already named that. It matters
   * because pnpm puts a package's dependencies *beside* it —
   * `.pnpm/node-pty@1.2.0-beta.15/node_modules/` holds both `node-pty` and its
   * `node-addon-api` — so the sibling is one hop up and nowhere else.
   *
   * Together those two made `npm run package` fail here with "node-pty depends
   * on node-addon-api, which is not installed" against an install where Node
   * resolves it fine.
   */
  const resolve = (fromDir, name) => {
    let dir = io.realpath(fromDir);

    for (;;) {
      const searchRoot = io.basename(dir) === 'node_modules' ? dir : io.join(dir, 'node_modules');
      const candidate = io.join(searchRoot, name);
      // Twice, deliberately: once on what was found and once on where the
      // walk goes next. Either alone holds the guard for the layouts tested,
      // and removing both fails three of them — so neither is dead code, and
      // a reader deleting "the redundant one" is removing a belt or a brace.
      if (io.readPackageJson(candidate) && withinBoundary(candidate)) return candidate;

      const parent = io.join(dir, '..');
      if (parent === dir) return undefined;
      if (!withinBoundary(parent)) return undefined;
      dir = parent;
    }
  };

  /*
   * Where each package goes in the bundle, as a path relative to it.
   *
   * This is the half the first attempt got wrong, and it was the whole point.
   * That version kept a `name -> directory` map, so when two packages in the
   * closure needed different versions of the same dependency, one silently
   * won. A native dependency closure may contain two versions of one package,
   * so placement cannot be keyed only by package name.
   *
   * So placement follows npm's rule rather than a map: a package goes to the
   * top level when nothing else of that name is there, and nests under the
   * package that asked for it when the top-level slot is taken by a different
   * directory. A second dependent of the same directory reuses the placement.
   */
  const placements = new Map();
  const visited = new Set();

  const place = (name, dir, parentPath) => {
    const top = `node_modules/${name}`;
    const existing = placements.get(top);
    if (existing === dir) return top;
    if (existing === undefined) {
      placements.set(top, dir);
      return top;
    }

    const nested = `${parentPath}/node_modules/${name}`;
    placements.set(nested, dir);
    return nested;
  };

  const walk = (dir, name, ownPath) => {
    // Keyed on the placement rather than the directory: one directory can be
    // reached at two placements, and a package graph may contain a cycle.
    if (visited.has(ownPath)) return;
    visited.add(ownPath);

    const json = io.readPackageJson(dir);
    if (!json) throw new Error(`${name} is not installed at ${dir}.`);

    for (const dependency of Object.keys(json.dependencies ?? {})) {
      const target = resolve(dir, dependency);
      if (!target) {
        throw new Error(`${name} depends on ${dependency}, which is not installed.`);
      }
      walk(target, dependency, place(dependency, target, ownPath));
    }

    /*
     * Optional dependencies commonly carry platform prebuilds. Absent is the
     * normal case, so a miss is skipped rather than thrown on — the opposite
     * of the rule above, and the reason they are walked separately.
     */
    for (const dependency of Object.keys(json.optionalDependencies ?? {})) {
      const target = resolve(dir, dependency);
      if (!target) continue;
      walk(target, dependency, place(dependency, target, ownPath));
    }
  };

  // The roots are already at the top level: `packagerConfig.ignore` keeps them
  // by prefix, so their placement is fixed before anything else is decided.
  for (const root of roots) {
    const dir = io.realpath(io.join(nodeModules, root));
    placements.set(`node_modules/${root}`, dir);
  }
  for (const root of roots) {
    walk(io.join(nodeModules, root), root, `node_modules/${root}`);
  }

  const rootPaths = new Set(roots.map((root) => `node_modules/${root}`));

  return [...placements]
    .filter(([placement]) => !rootPaths.has(placement))
    .map(([placement, dir]) => ({ name: placement.slice(placement.lastIndexOf('node_modules/') + 'node_modules/'.length), dir, path: placement }))
    .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
}

/**
 * The names of closure members a flat install hoisted to the top level.
 *
 * What `packagerConfig.ignore` can keep by prefix, which is only ever the
 * whole closure under npm. Under pnpm it is empty and
 * `externalClosure` is what the build has to use, because a store sibling has
 * no top-level path to name.
 *
 * @param {PackageContractIo} io
 * @param {string} nodeModules
 * @param {readonly string[]} roots
 * @returns {string[]}
 */
export function hoistedDependencies(io, nodeModules, roots, options = {}) {
  return externalClosure(io, nodeModules, roots, options)
    .filter(({ name, dir, path }) => path === `node_modules/${name}` && dir === io.join(nodeModules, name))
    .map(({ name }) => name);
}
