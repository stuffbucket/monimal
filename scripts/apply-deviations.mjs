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

// ── site ───────────────────────────────────────────────────────────────────
// The Astro site lives at maximal/site upstream and is a separate package here.
// Its `guide` collection globs `../docs/guide` — maximal's docs — which as a
// sibling resolves to nothing, and Astro then builds an empty guide with a zero
// exit code. Declaring the dependency fixes it and gives Turborepo a real edge.
{
  const p = readPkg('site')
  set(p, 'dependencies', '@stuffbucket/maximal', 'workspace:*', 'site')
  writePkg('site', p)

  const cfg = join(ROOT, 'packages/site/src/content.config.ts')
  if (existsSync(cfg)) {
    const before = readFileSync(cfg, 'utf8')
    const after = before.replace(
      /base:\s*"\.\.\/docs\/guide"/,
      'base: "./node_modules/@stuffbucket/maximal/docs/guide"',
    )
    if (after !== before) {
      writeFileSync(cfg, after)
      note('site: guide collection resolves through the workspace dependency')
    }
  }
}

// ── maximal -> site ────────────────────────────────────────────────────────
// The coupling runs both ways: maximal's release script and three tests import
// the site's updates-manifest library. Upstream both live in one repo so
// `../site/...` resolves; as siblings it is one level further out. This cannot
// be a package dependency — site already depends on maximal, and the reverse
// would be a cycle Turborepo rejects.
{
  const walk = (dir) => {
    const out = []
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const f = join(dir, e.name)
      if (e.isDirectory()) out.push(...walk(f))
      else if (/\.(ts|tsx|mts)$/.test(e.name)) out.push(f)
    }
    return out
  }

  // Lengthening `../site/` to `../../site/` changes import sort order, which
  // perfectionist/sort-imports then fails on. Fix it here rather than shelling
  // out to `eslint --fix`: this runs during a sync, when the packages have just
  // been replaced and node_modules does not exist yet, so eslint is not
  // available at the only moment it would be needed.
  const reorder = (src) =>
    src.replace(
      /(import \{[^}]*\} from "\.\.\/scripts\/[^"]*"\n)(import \{[^}]*\} from "\.\.\/\.\.\/site\/[^"]*"\n)/,
      '$2$1',
    )

  const touched = []
  for (const sub of ['tests', 'scripts']) {
    const dir = join(ROOT, 'packages/maximal', sub)
    if (!existsSync(dir)) continue
    for (const f of walk(dir)) {
      const before = readFileSync(f, 'utf8')
      const after = reorder(before.replace(/(["'])\.\.\/site\//g, '$1../../site/'))
      if (after !== before) {
        writeFileSync(f, after)
        touched.push(f)
      }
    }
  }
  if (touched.length) {
    note(`maximal: repointed ${touched.length} file(s) at ../../site/`)
    // Lengthening the specifier changes import sort order, which
    // perfectionist/sort-imports then fails on. Let eslint place them. Only the
    // rewritten files: whole directories made it exit non-zero on unrelated
    // pre-existing findings. Best-effort — before the first install there is no
    // eslint to run.
    // Run from inside the package: eslint resolves its flat config relative to
    // cwd, and invoking it from the workspace root picks up the wrong one (it
    // exits 0 having fixed nothing, which reads as success).
    const pkgDir = join(ROOT, 'packages/maximal')
    const res = spawnSync(
      'pnpm',
      ['exec', 'eslint', '--fix', ...touched.map((f) => f.replace(`${pkgDir}/`, ''))],
      { cwd: pkgDir, stdio: 'ignore' },
    )
    note(
      res.status === 0
        ? 'maximal: eslint --fix reordered the changed imports'
        : 'maximal: eslint --fix unavailable — run `pnpm run lint` to check',
    )
  }
}

// ── report ─────────────────────────────────────────────────────────────────
if (changes.length === 0) {
  console.log('deviations: already applied, nothing to do')
} else {
  console.log(`deviations applied (${changes.length}):`)
  for (const c of changes) console.log(`  - ${c}`)
}
