/**
 * What "an export resolves" means, as functions over a package directory.
 *
 * `scripts/verify-exports.mjs` runs these against this repository's own build
 * and the tarball `npm pack` produces. `scripts/verify-git-install.mjs` runs
 * the same functions against a package installed by git ref, which is how
 * `stuffbucket/maximal` consumes this one. npm runs `prepare` for a git install
 * and `prepack` for a tarball, so a check that walks one path says nothing
 * about the other. Issue #83.
 *
 * `scripts/check-install.mjs` runs `missingTargets` inside a consumer's
 * install, where npm runs neither. Issue #100.
 *
 * Every function takes the package root as an argument, so the caller chooses
 * which copy is under test. That is the same reason `terminal-package.mjs`
 * takes its file lists rather than reading a directory.
 *
 * Plain ESM in `scripts/`, matching `terminal-package.mjs`: `dist/` is ESM
 * syntax in a package with no `"type": "module"`, so these run under plain
 * `node` and are not bundled.
 */

import { statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * @typedef {object} Check
 * @property {string} name
 * @property {boolean} ok
 */

/**
 * @typedef {object} ExportTarget
 * @property {string} subpath
 * @property {string} condition
 * @property {string} target
 */

/**
 * Every file an `exports` map names, one entry per condition.
 *
 * Read from the manifest rather than listed here. A hardcoded list means a new
 * entry in `exports` is unchecked until somebody remembers to add it, and an
 * export nothing verifies is one that can ship pointing at a file the build
 * does not produce.
 *
 * @param {Record<string, unknown> | undefined} exports
 * @returns {ExportTarget[]}
 */
export function exportTargets(exports) {
  return Object.entries(exports ?? {}).flatMap(([subpath, entry]) => {
    if (typeof entry === 'string') return [{ subpath, condition: 'default', target: entry }];
    if (entry === null || typeof entry !== 'object') return [];
    return Object.entries(entry)
      .filter(([, target]) => typeof target === 'string')
      .map(([condition, target]) => ({ subpath, condition, target: String(target) }));
  });
}

/**
 * Whether a package directory carries the file an export names.
 *
 * Non-empty, not merely present. A zero-byte file resolves, and a build
 * interrupted part way through leaves one.
 *
 * @param {string} root
 * @param {string} target
 * @returns {boolean}
 */
export function targetPresent(root, target) {
  try {
    return statSync(path.join(root, target)).size > 0;
  } catch {
    return false;
  }
}

/**
 * The first line `scripts/check-install.mjs` prints when it refuses an install.
 *
 * `scripts/verify-git-install.mjs` greps a failed install for it. "npm exited
 * non-zero" is true of a network error as well, so the marker is what tells the
 * two apart.
 */
export const INSTALLED_WITHOUT_BUILD = 'installed without a build step';

/**
 * A package name flattened to the shape npm uses in a file name.
 *
 * A scoped name is a path, and every place one is interpolated into a file
 * name, a URL, or a `git archive --prefix` has to flatten it first. Three did
 * not, and one of them printed a 404 URL to a consumer whose install had just
 * failed.
 *
 * @param {string} name
 * @returns {string}
 */
export function packedName(name) {
  return name.replace('@', '').replace('/', '-');
}

/**
 * The file name `npm pack` writes for a package.
 *
 * @param {string} name
 * @param {string} version
 * @returns {string}
 */
export function packedTarballName(name, version) {
  return `${packedName(name)}-${version}.tgz`;
}

/**
 * Every distinct file an `exports` map names. One entry per file rather than
 * per condition, because `types` and `default` often name the same one.
 *
 * @param {Record<string, unknown> | undefined} exports
 * @returns {string[]}
 */
export function declaredTargets(exports) {
  return [...new Set(exportTargets(exports).map(({ target }) => target))];
}

/**
 * Export targets a package directory does not carry.
 *
 * `scripts/check-install.mjs` runs this from inside a consumer's
 * `node_modules` at `postinstall`, which is the only lifecycle hook npm runs
 * for all three install forms. Issue #100.
 *
 * @param {string} root
 * @param {Record<string, unknown> | undefined} exports
 * @returns {string[]}
 */
export function missingTargets(root, exports) {
  return declaredTargets(exports).filter((target) => !targetPresent(root, target));
}

/** The component surface `./renderer` promises a consumer. */
export const RENDERER_SURFACE = [
  'Banner',
  'Button',
  'Callout',
  'Canvas',
  'Card',
  'Checkbox',
  'Dialog',
  'EMPHASIS_LABELS',
  'EmptyState',
  'Field',
  'FormField',
  'IconButton',
  'InspectorPanel',
  'Menu',
  'NavRail',
  'RadioGroup',
  'Row',
  'SHELL_TERMINAL_PROPERTIES',
  'STATUS_LABELS',
  'Select',
  'ShellLayout',
  'StatusChip',
  'Switch',
  'TAB_EMPHASIS',
  'TAB_ICON_NAMES',
  'TabBar',
  'TerminalTabs',
  'TerminalView',
  'TextInput',
  'Textarea',
  'TitleBar',
  'Toolbar',
  'ViewModeSwitch',
  'adornmentLabel',
  'createTerminalTransport',
  'detachedSessions',
  'getTabPanelId',
  'getTabTriggerId',
  'readTerminalTheme',
  'tabSlot',
  'useShellTabs',
  'useThemePreference',
];

/** The names `./verify` exposes. `terminal-package.mjs` defines them. */
export const VERIFY_SURFACE = [
  'TERMINAL_CONTENT_SECURITY_POLICY',
  'contentSecurityPolicyChecks',
  'terminalNativeFiles',
  'terminalPackageChecks',
  'terminalPrebuildDirectory',
];

/** The names `./main` promises a consumer. Issue #15. */
export const MAIN_SURFACE = [
  'runMain',
  'RUN_MAIN_OPTIONS_VERSION',
  'RunMainOptions',
  'MainContext',
  'MainRuntime',
];

/** The names `./preload` promises a consumer. Issue #17. */
export const PRELOAD_SURFACE = [
  'exposeBridge',
  'createBridge',
  'capabilityArguments',
  'BRIDGE_CAPABILITIES',
  'CAPABILITY_CHANNELS',
  'Bridge',
  'BridgeCapability',
  'BridgeDeclaration',
  'Envelope',
  'ExposeBridgeOptions',
];

/**
 * Whether a declaration promises what its subpath says it does.
 *
 * Names read out of the declaration rather than an import: `run-main.js` and
 * `bridge.js` both import `electron`, which plain `node` cannot load. The
 * declaration is what a consumer's `tsc` reads, so checking it checks what
 * breaks them.
 *
 * @param {string} packageRoot
 * @param {unknown} declaration
 * @param {string} subpath
 * @param {readonly string[]} names
 * @returns {Promise<{ checks: Check[] }>}
 */
export async function declarationSurfaceChecks(packageRoot, declaration, subpath, names) {
  /** @type {Check[]} */
  const checks = [];
  const declared = typeof declaration === 'string';
  checks.push({ name: `the manifest declares a ${subpath} export`, ok: declared });
  if (!declared) return { checks };

  let source;
  try {
    source = await readFile(path.join(packageRoot, declaration), 'utf8');
  } catch {
    // The floor. An unreadable declaration would report every name below as
    // missing, which is a different failure from a name that was dropped.
    checks.push({ name: `${declaration} can be read`, ok: false });
    return { checks };
  }
  checks.push({ name: `${declaration} can be read`, ok: true });

  for (const name of names) {
    checks.push({
      name: `the ${subpath} declaration names ${name}`,
      ok: new RegExp(`\\b${name}\\b`).test(source),
    });
  }
  return { checks };
}

/**
 * @param {string} packageRoot
 * @param {unknown} declaration
 * @returns {Promise<{ checks: Check[] }>}
 */
export async function mainSurfaceChecks(packageRoot, declaration) {
  return declarationSurfaceChecks(packageRoot, declaration, './main', MAIN_SURFACE);
}

/**
 * @param {string} packageRoot
 * @param {unknown} declaration
 * @returns {Promise<{ checks: Check[] }>}
 */
export async function preloadSurfaceChecks(packageRoot, declaration) {
  return declarationSurfaceChecks(packageRoot, declaration, './preload', PRELOAD_SURFACE);
}

/**
 * Names a built entry re-exports, sorted.
 *
 * @param {string} source
 * @returns {string[]}
 */
export function reExportedNames(source) {
  return [...source.matchAll(/export\s*\{([^}]+)}\s*from/g)]
    .flatMap((match) =>
      (match[1] ?? '')
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean),
    )
    .sort();
}

/**
 * `lib/` holds this application's own things — the bridge, the sample data, the
 * palette — so reaching one from the export means the package carries the
 * application with it. The exceptions are contracts: types and pure functions a
 * consumer implements against, with no import of their own.
 *
 * An allowlist rather than a dropped rule. `TerminalView` used to be forbidden
 * outright because it imported `bridge.js`; it now takes a transport as a
 * value, and this is what keeps it that way — re-adding that import puts
 * `lib/bridge.js` in the graph and fails here.
 */
const CONTRACTS = [
  /(?:^|\/)lib\/terminal-transport(?:\.js)?$/,
  /(?:^|\/)lib\/tab-adornment(?:\.js)?$/,
  /(?:^|\/)lib\/terminal-sessions(?:\.js)?$/,
  /(?:^|\/)lib\/useShellTabs(?:\.js)?$/,
  /(?:^|\/)lib\/useThemePreference(?:\.js)?$/,
];
const APPLICATION_ONLY = [
  /(?:^|\/)App(?:\.js)?$/,
  /(?:^|\/)lib\//,
  /(?:^|\/)native\//,
  /demo/i,
  /fixture/i,
  /\.stories\./,
];

/**
 * Whether a module a consumer reaches through an export is generic.
 *
 * @param {string} relativePath
 * @returns {boolean}
 */
export function isGeneric(relativePath) {
  return (
    CONTRACTS.some((pattern) => pattern.test(relativePath)) ||
    !APPLICATION_ONLY.some((pattern) => pattern.test(relativePath))
  );
}

/** Relative specifiers a module imports. */
export function relativeImports(source) {
  return [...source.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)]
    .map((match) => match[1])
    .filter((specifier) => specifier !== undefined);
}

/**
 * Anchored, and requiring `from`, because a specifier read out of anything but
 * an import is a package that does not exist. Two produced exactly that: a
 * JSDoc line in `TabBar.js` contrasting "reaches the edge" with "overflows it",
 * and `export const SHELL_TERMINAL_PROPERTIES = ['--shell-terminal-background',
 * …]`. `[^'"\n]` rather than `[^'"]`, or the run crosses a line break and
 * pairs a `from` with a string several lines below it.
 *
 * `relativeImports` needs none of this: a specifier it accepts starts with a
 * dot, and prose does not.
 */
const PACKAGE_IMPORTS = [
  /^(?:import|export)[^'"\n]*\bfrom\s*['"]([^'"]+)['"]/gm,
  /^import\s*['"]([^'"]+)['"]/gm,
  /\b(?:import|require)\(\s*['"]([^'"]+)['"]/g,
];

/**
 * Packages a module imports, by package name rather than by specifier.
 *
 * @param {string} source
 * @returns {string[]}
 */
export function importedPackages(source) {
  const found = new Set();
  for (const pattern of PACKAGE_IMPORTS) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier === undefined) continue;
      if (specifier.startsWith('.') || specifier.startsWith('node:')) continue;
      found.add(specifier.split('/').slice(0, specifier.startsWith('@') ? 2 : 1).join('/'));
    }
  }
  return [...found].sort();
}

/**
 * What a consumer installs, asked of one package directory.
 *
 * npm resolves dependencies per package, not per export, so one `dependencies`
 * entry reaches every consumer of every entry point. `./host` used to install
 * `node-llama-cpp`, `node-pty` and six Radix packages for a module that imports
 * `electron` alone. Issue #31.
 *
 * Optional peers are the only npm mechanism that installs nothing.
 * `optionalDependencies` install by default, and npm 7 and later auto-installs
 * a peer that is not marked optional.
 *
 * Returns the walk as well as the checks. `scripts/peer-table.mjs` judges the
 * table in `README.md` against the same map, so the prose and the checks above
 * cannot be measuring two different import graphs. Issue #121.
 *
 * @param {string} root
 * @param {Record<string, any>} manifest
 * @returns {Promise<{ checks: Check[], reached: Map<string, string[]> }>}
 */
export async function dependencyContractChecks(root, manifest) {
  /** @type {Check[]} */
  const checks = [];
  const entries = exportTargets(manifest.exports).filter(
    ({ condition, target }) => condition === 'default' && /\.m?js$/.test(target),
  );

  /** @type {Map<string, string[]>} */
  const reached = new Map();
  for (const { subpath, target } of entries) {
    const packages = new Set();
    const visited = new Set();
    const pending = [path.join(root, target)];
    let read = 0;

    while (pending.length > 0) {
      const file = pending.pop();
      if (file === undefined || visited.has(file)) continue;
      visited.add(file);

      let source;
      try {
        source = await readFile(file, 'utf8');
      } catch {
        continue;
      }
      read += 1;

      for (const name of importedPackages(source)) packages.add(name);
      for (const specifier of relativeImports(source)) {
        pending.push(path.resolve(path.dirname(file), specifier));
      }
    }

    // The floor, per entry. Every claim below is about a set this walk
    // produced, so an entry point nothing could read would satisfy all of them
    // by contributing nothing.
    checks.push({ name: `${subpath} resolves to a module that can be read`, ok: read > 0 });
    reached.set(subpath, [...packages].sort());
  }

  checks.push({
    name: 'the manifest declares at least one JavaScript entry point',
    ok: entries.length > 0,
  });
  const imported = new Set([...reached.values()].flat());
  checks.push({ name: 'the entry points import at least one package', ok: imported.size > 0 });

  checks.push({
    name: 'the package declares no runtime dependencies',
    ok: Object.keys(manifest.dependencies ?? {}).length === 0,
  });
  checks.push({
    name: 'the package declares no optional dependencies, which npm installs by default',
    ok: Object.keys(manifest.optionalDependencies ?? {}).length === 0,
  });

  const peers = Object.keys(manifest.peerDependencies ?? {});
  for (const [subpath, packages] of reached) {
    for (const dependency of packages) {
      checks.push({
        name: `${subpath} imports ${dependency}, a declared peer`,
        ok: peers.includes(dependency),
      });
    }
  }

  // The headline of issue #31, as an equality. A subset check would pass on an
  // entry point that imports nothing at all.
  checks.push({
    name: './host imports electron and nothing else',
    ok: (reached.get('./host') ?? []).join(',') === 'electron',
  });

  for (const peer of peers) {
    checks.push({
      name: `${peer} is an optional peer, so a consumer installs it only when they need it`,
      ok: manifest.peerDependenciesMeta?.[peer]?.optional === true,
    });
    checks.push({
      name: `${peer} is a development dependency, so this repository builds against it`,
      ok: typeof manifest.devDependencies?.[peer] === 'string',
    });
  }

  return { checks, reached };
}

/**
 * Walk everything an entry point reaches and ask whether each module is
 * generic. Resolving an export is more than the file existing.
 *
 * A module that cannot be read is a failed check rather than a thrown error.
 * An install missing `dist/` reaches here, and the answer wanted there is
 * "this export does not resolve", not a stack trace.
 *
 * @param {string} root
 * @param {string} entry
 * @returns {Promise<{ checks: Check[], inspected: number }>}
 */
export async function moduleGraphChecks(root, entry) {
  /** @type {Check[]} */
  const checks = [];
  const visited = new Set();
  const pending = [entry];

  while (pending.length > 0) {
    const file = pending.pop();
    if (file === undefined || visited.has(file)) continue;
    visited.add(file);

    const relative = path.relative(root, file).split(path.sep).join('/');
    let source;
    try {
      source = await readFile(file, 'utf8');
    } catch {
      // Before the genericity question, not after it. A file that is not there
      // passes a test over its own name, and an `ok` line about a module the
      // install does not contain is the report reading backwards.
      checks.push({ name: `${relative} can be read`, ok: false });
      continue;
    }

    checks.push({ name: `${relative} is generic`, ok: isGeneric(relative) });

    for (const specifier of relativeImports(source)) {
      pending.push(path.resolve(path.dirname(file), specifier));
    }
  }

  /*
   * The floor, and it counts past one. The entry is in `visited` before
   * anything reads it, so a size of one means the file was unreadable or the
   * import pattern matched nothing — and a walk of nothing reports every
   * assertion over it as a pass. The renderer entry re-exports from nine
   * modules.
   */
  checks.push({ name: 'the import graph reaches past the entry', ok: visited.size > 1 });
  return { checks, inspected: visited.size };
}
