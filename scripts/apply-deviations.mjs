#!/usr/bin/env node
/**
 * Re-apply monimal's deviations to the copied packages.
 *
 * A re-sync replaces the packages wholesale, taking every local edit with it.
 * This puts them back, so the deviation set stays a reviewable list rather than
 * remembered hand-edits. Idempotent; prints what it changed.
 *
 * Written against `main` as of 2026-08-11, AFTER upstream retired the Tauri
 * shell and excavated the duplicated core (maximal#442). maximal now has no
 * `src/` of its own — it builds from maximal-core and carries the Electron
 * client in `client/`. Deviations written for the pre-excavation repo (removing
 * Tauri scripts, deleting shell-coupled tests, pinning @hono/zod-openapi in
 * maximal) are gone: they described a repo that no longer exists.
 *
 * `site/` is the GitHub Pages site, not a package. It stays inside maximal
 * exactly as upstream has it: not a workspace member, nothing depends on it,
 * and maximal's release script and tests reach it by relative path.
 *
 * Every change here is explained in SOURCES.md.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const changes = []
const note = (m) => changes.push(m)

const pkgPath = (name) => join(ROOT, 'packages', name, 'package.json')
const readPkg = (name) => JSON.parse(readFileSync(pkgPath(name), 'utf8'))
const writePkg = (name, json) =>
  writeFileSync(pkgPath(name), `${JSON.stringify(json, null, 2)}\n`)

/**
 * Set a key, optionally inserting it immediately before `before`.
 *
 * Position matters: these packages run `prettier-plugin-packagejson` through
 * eslint, which fails the lint task on out-of-order `scripts`. Appending is what
 * a naive edit does and is exactly what that rule catches. A blanket
 * alphabetical sort is also wrong — the rule groups lifecycle scripts
 * separately — so insert next to a known neighbour and leave the rest alone.
 *
 * Repairs an existing-but-misplaced key, so a re-run fixes rather than skips.
 */
function set(json, section, key, value, label, before) {
  json[section] ??= {}
  const keys = Object.keys(json[section])
  const misplaced =
    before !== undefined &&
    keys.includes(key) &&
    keys.indexOf(key) !== keys.indexOf(before) - 1
  if (json[section][key] === value && !misplaced) return

  if (before !== undefined && key in json[section]) delete json[section][key]

  if (before !== undefined && before in json[section]) {
    const rebuilt = {}
    for (const k of Object.keys(json[section])) {
      if (k === before) rebuilt[key] = value
      rebuilt[k] = json[section][k]
    }
    json[section] = rebuilt
  } else {
    json[section][key] = value
  }
  note(
    `${label}: ${section}.${key} = ${JSON.stringify(value)}` +
      (before ? ` (before ${before})` : ''),
  )
}

function drop(json, section, key, label) {
  if (!json[section] || !(key in json[section])) return
  delete json[section][key]
  note(`${label}: removed ${section}.${key}`)
}

/**
 * Git hooks: two packages installing competing hooks into one .git is wrong.
 *
 * `anchor` is the script key the kept-but-renamed `prepare:hooks` must sit
 * before — the packages have different script sets, so there is no single
 * neighbour that works for both, and a missing anchor silently appends (which
 * the package.json sort rule then fails on).
 */
function disableGitHooks(p, label, anchor) {
  const hooks = p.scripts?.prepare ?? p.scripts?.['prepare:hooks']
  if (hooks) {
    if (p.scripts.prepare) {
      delete p.scripts.prepare
      note(`${label}: prepare -> prepare:hooks (off the install path)`)
    }
    // A bare `simple-git-hooks` prepare has nothing worth keeping once the
    // dependency is gone; anything else is a real script, so keep it runnable.
    if (hooks !== 'simple-git-hooks') {
      if (anchor && !(anchor in p.scripts)) {
        throw new Error(`${label}: anchor script "${anchor}" not found`)
      }
      set(p, 'scripts', 'prepare:hooks', hooks, label, anchor)
    } else {
      delete p.scripts['prepare:hooks']
    }
  }
  drop(p, 'devDependencies', 'simple-git-hooks', label)
}

// ── maximal ────────────────────────────────────────────────────────────────
{
  const p = readPkg('maximal')

  // THE SEAM. Upstream pins `github:stuffbucket/maximal-core#v0.1.1` while core
  // is 0.6.3 — five minors of drift, and the whole reason a workspace exists.
  // maximal's build/dev/start all run out of
  // node_modules/@stuffbucket/maximal-core/src, so the link is load-bearing:
  // this really does build the published CLI against current core.
  set(p, 'dependencies', '@stuffbucket/maximal-core', 'workspace:*', 'maximal')

  // No plain `test` script upstream; Turborepo needs one.
  set(p, 'scripts', 'test', 'bun test', 'maximal', 'typecheck')

  disableGitHooks(p, 'maximal')
  writePkg('maximal', p)
}

// ── maximal-core ───────────────────────────────────────────────────────────
{
  const p = readPkg('maximal-core')

  set(p, 'scripts', 'test', 'bun test', 'maximal-core', 'test:mutation')

  // `build` produces the standalone sidecar bundle (dist/main.js) and nothing
  // else. The library surface consumers import — the five subpath exports in
  // the `exports` map — lives at dist/lib/*.d.ts and comes from a SEPARATE
  // script, `build:lib` (tsup). Upstream never wires the two together because
  // it ships dist/lib COMMITTED, force-added past its own .gitignore, so a
  // git-install consumer gets prebuilt files without running a build.
  //
  // That arrangement does not survive being copied into a workspace. sync.sh
  // brings the built files across, but packages/maximal-core/.gitignore comes
  // with them, so git ignores dist/ here and the lib is never committed. A
  // local checkout typechecks against the synced files while a fresh clone —
  // i.e. CI — fails TS2307 on all five subpaths.
  //
  // Building it is the monorepo answer: the source is right here, so generate
  // dist/lib rather than commit a 7.4MB artifact that every re-sync re-dirties.
  // turbo's `build` already declares `outputs: ["dist/**"]` and `typecheck`
  // dependsOn `^build`, so wiring it into `build` is the whole fix. tsup runs
  // with `clean: false`, so it will not wipe the sidecar bundle beside it.
  set(
    p,
    'scripts',
    'build',
    'bun scripts/ops/build-bundle.ts && bun run build:lib',
    'maximal-core',
  )

  // 1.5.2 changes an inferred type and breaks tests/setup-status-openapi.
  // Upstream's lockfile resolves 1.5.0; one workspace lockfile floats past it.
  set(p, 'dependencies', '@hono/zod-openapi', '1.5.0', 'maximal-core')

  disableGitHooks(p, 'maximal-core', 'release:check')
  writePkg('maximal-core', p)
}

// ── maximal-electron ───────────────────────────────────────────────────────
{
  const p = readPkg('maximal-electron')

  // Imported by src/main/native/{agent,toolsets}.ts but never declared — a
  // phantom dependency that npm's flat node_modules supplied via
  // @earendil-works/pi-agent-core. Real bug upstream.
  set(p, 'devDependencies', 'typebox', '1.3.7', 'maximal-electron')

  // No plain `build` script upstream; Turborepo needs one.
  set(p, 'scripts', 'build', 'npm run build:package', 'maximal-electron')

  writePkg('maximal-electron', p)
}

// ── maximal/client ─────────────────────────────────────────────────────────
// The Electron app. It is the one thing here that consumes BOTH libraries, so
// it is where the workspace either earns its keep or does not:
//
//     {maximal-core, maximal-electron} -> maximal/client
//
// Upstream it reaches both over git: maximal-core#v0.6.3 (current) and
// maximal-electron#2f1a06c (50 commits behind). Both become workspace links.
//
// The electron dependency is declared under the key `stuffbucket-electron`
// while the package's real name is `@stuffbucket/maximal-electron`, and the
// source imports `stuffbucket-electron/renderer` etc. A git dependency does not
// care what the target calls itself; a workspace link does. pnpm's aliased
// workspace protocol keeps the import specifier working against the real
// package: `workspace:@stuffbucket/maximal-electron@*`.
{
  const p = readPkg('maximal/client')
  set(p, 'dependencies', '@stuffbucket/maximal-core', 'workspace:*', 'client')
  set(
    p,
    'dependencies',
    'stuffbucket-electron',
    'workspace:@stuffbucket/maximal-electron@*',
    'client',
  )
  writePkg('maximal/client', p)

  // Second phantom dependency, same class as maximal-electron's typebox:
  // client/tsconfig.json sets `"types": ["node"]` but nothing declares
  // @types/node. npm's flat node_modules supplied it transitively; pnpm's
  // isolated layout does not, and typecheck fails with TS2688. Matched to
  // maximal-electron's version. Real bug upstream.
  set(p, 'devDependencies', '@types/node', '^22.10.0', 'client')

  // Third phantom dependency: forge.config.ts imports @electron/packager for
  // its types, but only @electron-forge/* are declared. Same npm-flat-hoisting
  // story as the other two. Version matched to what Forge 7.11.2 pulls in.
  set(p, 'devDependencies', '@electron/packager', '^18.4.0', 'client')

  // `test` is bare `vitest`, i.e. watch mode. It happens to exit under Turbo
  // because vitest sees a non-TTY, but relying on that is a hang waiting for a
  // CI change. `test:run` is the same suite, explicitly single-shot.
  set(p, 'scripts', 'test', 'vitest run', 'client')

  // No plain `build` upstream, so Turbo had nothing to run — but `package`
  // needs the compiled core sidecar at resources/bin, and without it Forge
  // fails late with `ENOENT: resources/bin`. Mapping build -> build:core puts
  // the sidecar on the task graph, where it correctly depends on maximal-core.
  set(p, 'scripts', 'build', 'bun scripts/build-core.ts', 'client', 'build:core')

  writePkg('maximal/client', p)

  // Renderer bundling: resolve React and Radix from THIS package.
  //
  // stuffbucket-electron ships no runtime dependencies — React and Radix are
  // devDependencies plus optional peers, so a published or git install brings
  // only dist/ and the consumer supplies them. A workspace link is different:
  // it symlinks the whole source directory, node_modules included, so the
  // bundler walks into that package's own devDependency copies, whose
  // transitive deps are not reachable from there.
  //
  // NECESSARY BUT NOT SUFFICIENT. This stops the bundler resolving into
  // maximal-electron's tree, and the failure moves to the client's own Radix
  // copies — where Rolldown still cannot follow a symlinked package's
  // transitive deps under pnpm's isolated layout. `electron-forge package` does
  // not yet succeed from this workspace. See README, "Packaging".
  const cfg = join(ROOT, 'packages/maximal/client/vite.renderer.config.ts')
  if (existsSync(cfg)) {
    const before = readFileSync(cfg, 'utf8')
    if (!before.includes('dedupe:')) {
      const after = before.replace(
        /(\n\s*plugins: \[react\(\)\],)/,
        `$1
  resolve: {
    // See scripts/apply-deviations.mjs — needed because maximal-electron is a
    // workspace link here, not a published install.
    dedupe: [
      'react',
      'react-dom',
      'react-resizable-panels',
      '@radix-ui/react-collapsible',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-radio-group',
      '@radix-ui/react-tabs',
      '@radix-ui/react-tooltip',
      '@radix-ui/react-visually-hidden',
    ],
  },`,
      )
      if (after !== before) {
        writeFileSync(cfg, after)
        note('client: renderer dedupes react/radix to this package')
      }
    }
  }
}

// ── report ─────────────────────────────────────────────────────────────────
if (changes.length === 0) {
  console.log('deviations: already applied, nothing to do')
} else {
  console.log(`deviations applied (${changes.length}):`)
  for (const c of changes) console.log(`  - ${c}`)
}
