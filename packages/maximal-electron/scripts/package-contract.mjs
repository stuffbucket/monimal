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
 * `trayTemplate@2x.png` is never named in code: `nativeImage` finds a `@2x`
 * variant beside the file it was given. It still has to ship.
 */
export const RUNTIME_ICONS = [
  'icon.png',
  'tray.png',
  'trayTemplate.png',
  'trayTemplate@2x.png',
];

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

/* -------------------------------------------------- llama.cpp prebuilds */

/**
 * Which `@node-llama-cpp` prebuild packages a build may ship.
 *
 * `forge.config.ts` deletes the rest during `packageAfterCopy`, and
 * `scripts/verify-package.mjs` derives its per-library expectation from the
 * same plan, so the two cannot disagree about what a package should hold.
 *
 * The scope carries one package per target and backend. npm selects them by
 * the `os` and `cpu` fields alone, and several declare `cpu: ["arm64", "x64"]`
 * so one host can build for the other, so a `win32-x64` install also gets
 * `win-arm64` and a `linux-x64` install also gets `linux-arm64`. Neither can
 * ever load: `node-llama-cpp` resolves a package from `process.arch` at run
 * time. Issue #113.
 */

/** Package name prefix for a Forge platform. `mas` is a darwin build. */
const LLAMA_PLATFORM = { darwin: 'mac', mas: 'mac', win32: 'win', linux: 'linux' };

/**
 * Backends dropped unless the build asks for them.
 *
 * Each ships a discrete-GPU runtime of its own: on `win32-x64`, cuda is 505 MB
 * across two packages and vulkan is 94 MB, against 45 MB for the CPU package
 * the same build falls back to. `metal` is deliberately absent — it is the only
 * `mac-arm64` package, so dropping it would leave that target with no llama.cpp
 * at all rather than with a slower one.
 */
export const OPTIONAL_LLAMA_BACKENDS = ['cuda', 'vulkan'];

/** The variable that puts an optional backend back. */
export const LLAMA_BACKENDS_VARIABLE = 'STUFFBUCKET_LLAMA_BACKENDS';

/**
 * Read the opt-in list.
 *
 * An unknown name throws. Ignoring it would ship a CPU-only package to someone
 * who wrote `CUDA` and believes otherwise, and nothing later in the build says
 * a word about it.
 *
 * @param {string | undefined} value
 * @returns {string[]}
 */
export function parseLlamaBackends(value) {
  const wanted = (value ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  if (wanted.includes('all')) return [...OPTIONAL_LLAMA_BACKENDS];

  const unknown = wanted.filter((name) => !OPTIONAL_LLAMA_BACKENDS.includes(name));
  if (unknown.length > 0) {
    throw new Error(
      `${LLAMA_BACKENDS_VARIABLE} names ${unknown.join(', ')}. ` +
        `Valid names are ${OPTIONAL_LLAMA_BACKENDS.join(', ')}, or all.`,
    );
  }
  return wanted;
}

/**
 * Split a package name into the target it builds for.
 *
 * The shape is `<os>-<arch>[-<backend>]`, with a trailing `-ext` marking a
 * package that extends a backend rather than one of its own:
 * `win-x64-cuda-ext` holds the fallback `ggml-cuda.dll` that
 * `win-x64-cuda` falls back to, and `node-llama-cpp` reaches it only through
 * the cuda branch. So `-ext` belongs to the backend before it.
 *
 * @param {string} name
 * @returns {{os: string, arch: string, backend: string}}
 */
export function parseLlamaPackage(name) {
  const [os, arch, ...rest] = name.split('-');
  if (!os || !arch) {
    throw new Error(
      `@node-llama-cpp/${name} is not named <os>-<arch>[-<backend>]. ` +
        'The scope layout has changed and this build cannot tell what it ships.',
    );
  }
  const backend = (rest.at(-1) === 'ext' ? rest.slice(0, -1) : rest).join('-');
  return { os, arch, backend };
}

/**
 * @typedef {object} LlamaPackageDecision
 * @property {string} name
 * @property {boolean} keep
 * @property {string} reason
 */

/**
 * Decide, for every installed package, whether this build ships it.
 *
 * Returns a decision per package rather than a keep-set, so the caller can say
 * what it dropped and why. Sorted, so the build log and the check read alike.
 *
 * @param {readonly string[]} present
 * @param {string} platform
 * @param {string} arch
 * @param {readonly string[]} backends
 * @returns {LlamaPackageDecision[]}
 */
export function llamaPackagePlan(present, platform, arch, backends) {
  const os = LLAMA_PLATFORM[platform];
  if (os === undefined) {
    throw new Error(`No @node-llama-cpp package name is known for platform ${platform}.`);
  }

  const arches = new Set(arch === 'universal' ? ['x64', 'arm64'] : [arch]);
  const enabled = new Set(backends);

  return [...present].sort().map((name) => {
    const target = parseLlamaPackage(name);
    if (target.os !== os) {
      return { name, keep: false, reason: `builds for ${target.os}, not ${os}` };
    }
    if (!arches.has(target.arch)) {
      return {
        name,
        keep: false,
        reason: `builds for ${target.arch}, not ${[...arches].join(' or ')}`,
      };
    }
    if (OPTIONAL_LLAMA_BACKENDS.includes(target.backend) && !enabled.has(target.backend)) {
      return {
        name,
        keep: false,
        reason: `the ${target.backend} backend is not in ${LLAMA_BACKENDS_VARIABLE}`,
      };
    }
    return {
      name,
      keep: true,
      reason: target.backend === '' ? 'the CPU build for this target' : `the ${target.backend} backend`,
    };
  });
}

/* ------------------------------------------- external module dependencies */

/**
 * The packages an external native module needs at run time, derived.
 *
 * `packagerConfig.prune` is off and the keep-list names directories, so a
 * dependency of a kept module that npm hoisted to the top level never reached
 * the package. `node-llama-cpp` reaches `universalify` that way, through its
 * own nested `fs-extra`, and the packaged library therefore failed to load
 * with `Cannot find module 'universalify'`. Nothing saw it: `verify:package`
 * reads names out of the archive listing, `smoke:packaged` only opened a
 * shell, and `e2e/embedded.spec.ts` drives the unpackaged tree where every
 * hoisted package is still there. Issue #133.
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
 * @returns {{ name: string, dir: string }[]} Every package the roots reach
 *   that does not already travel inside one of them, sorted by name.
 */
export function externalClosure(io, nodeModules, roots) {
  const rootSet = new Set(roots);
  /** name -> the directory it really resolved to. */
  const kept = new Map();
  const visited = new Set();

  const projectRoot = io.join(nodeModules, '..');

  /** Whether a path is inside a `node_modules` tree, or is one. */
  const insideModules = (dir) =>
    io.basename(dir) === 'node_modules' || dir.split(io.sep).includes('node_modules');

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
   * resolves it fine. Nothing caught it: this function had no test, and the
   * `electron package` job in CI packages `packages/maximal/client`, whose
   * Forge config does not call this.
   *
   * **What bounds the walk.** It used to stop at the project root, so that a
   * checkout inside another checkout could not resolve against the outer tree.
   * A realpath legitimately leaves the project — pnpm's store belongs to the
   * workspace, above this package — so that stop now applies only while the
   * walk is still under the project root, and leaving every `node_modules`
   * tree is what ends it otherwise. Past that there is nothing but whatever
   * directory happens to enclose the checkout.
   */
  const resolve = (fromDir, name) => {
    let dir = io.realpath(fromDir);
    const underProject = dir === projectRoot || dir.startsWith(projectRoot + io.sep);

    for (;;) {
      const searchRoot = io.basename(dir) === 'node_modules' ? dir : io.join(dir, 'node_modules');
      const candidate = io.join(searchRoot, name);
      if (io.readPackageJson(candidate)) return candidate;

      if (underProject && dir === projectRoot) return undefined;

      const parent = io.join(dir, '..');
      if (parent === dir) return undefined;
      if (!insideModules(parent)) return undefined;
      dir = parent;
    }
  };

  const walk = (dir, name) => {
    if (visited.has(dir)) return;
    visited.add(dir);

    const json = io.readPackageJson(dir);
    if (!json) throw new Error(`${name} is not installed at ${dir}.`);

    for (const dependency of Object.keys(json.dependencies ?? {})) {
      const target = resolve(dir, dependency);
      if (!target) {
        throw new Error(`${name} depends on ${dependency}, which is not installed.`);
      }
      if (!rootSet.has(dependency)) kept.set(dependency, target);
      walk(target, dependency);
    }

    /*
     * Optional dependencies, which is how every package that ships prebuilt
     * binaries distributes them: `node-llama-cpp` declares fourteen
     * `@node-llama-cpp/*` platform builds and the installer places the one
     * that matches. Absent is the normal case, so a miss is skipped rather
     * than thrown on — the opposite of the rule above, and the reason they are
     * walked separately.
     *
     * This walked none of them and got away with it, because under a flat
     * install the platform build is hoisted to the top level and
     * `packagerConfig.ignore` keeps the whole `@node-llama-cpp` scope by
     * prefix without the closure ever mentioning it. Under pnpm there is no
     * top-level path to keep, so the bundle came out with no scope at all.
     */
    for (const dependency of Object.keys(json.optionalDependencies ?? {})) {
      const target = resolve(dir, dependency);
      if (!target) continue;
      if (!rootSet.has(dependency)) kept.set(dependency, target);
      walk(target, dependency);
    }
  };

  const rootDirs = roots.map((root) => io.realpath(io.join(nodeModules, root)));
  for (const root of roots) walk(io.join(nodeModules, root), root);

  /*
   * A dependency already inside a root's own directory travels with it, so it
   * is not a separate entry. That is the nested case under a flat install;
   * under pnpm nothing is nested and every entry is a sibling in the store,
   * which is why the closure has to carry where each one really is rather than
   * only its name.
   */
  return [...kept]
    .filter(([, dir]) => !rootDirs.some((rootDir) => dir.startsWith(rootDir + io.sep)))
    .map(([name, dir]) => ({ name, dir }))
    .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
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
export function hoistedDependencies(io, nodeModules, roots) {
  return externalClosure(io, nodeModules, roots)
    .filter(({ name, dir }) => dir === io.join(nodeModules, name))
    .map(({ name }) => name);
}
