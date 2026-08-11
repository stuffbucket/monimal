#!/usr/bin/env node
/**
 * Re-apply monimal's deviations to the copied packages.
 *
 * A re-sync overwrites the packages wholesale, taking every local edit with it.
 * This script puts them back, so a re-sync is `rsync` + this, and the deviation
 * set stays a reviewable list instead of remembered hand-edits.
 *
 * Idempotent: safe to run repeatedly. Prints what it changed.
 * Every change here is explained in SOURCES.md.
 */

import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const changes = []
const note = (m) => changes.push(m)

const pkgPath = (name) => join(ROOT, 'packages', name, 'package.json')
const readPkg = (name) => JSON.parse(readFileSync(pkgPath(name), 'utf8'))
const writePkg = (name, json) =>
  writeFileSync(pkgPath(name), `${JSON.stringify(json, null, 2)}\n`)

/**
 * Set a nested key, optionally inserting it immediately before `before`.
 *
 * Position matters: these packages run `prettier-plugin-packagejson` through
 * eslint, and it fails the lint task on out-of-order `scripts`. Appending is
 * what a naive edit does and is exactly what that rule catches. A blanket
 * alphabetical sort is also wrong — the rule groups lifecycle scripts
 * (`prepack`, `prepare`) separately — so insert next to a known neighbour and
 * leave every other key where upstream had it.
 *
 * Re-sorts even when the key already exists but sits in the wrong place, so a
 * re-run repairs a previously-appended key instead of reporting "nothing to do".
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

// ── maximal ────────────────────────────────────────────────────────────────
// The Tauri shell is not in this workspace, and one lockfile floats versions.
{
  const p = readPkg('maximal')

  // `prepare` ended with `cd shell && bun install`; with no shell/ that fails
  // the whole workspace install.
  set(p, 'scripts', 'prepare', 'bun run ensure:ui-embed', 'maximal')

  // No plain `test` script upstream; Turborepo needs one.
  set(p, 'scripts', 'test', 'bun test', 'maximal', 'test:ops')

  // 1.5.2 changes an inferred type and breaks setup-status-openapi. Upstream's
  // lockfile resolves 1.5.0; a workspace re-resolves and floats past it.
  set(p, 'dependencies', '@hono/zod-openapi', '1.5.0', 'maximal')

  // Two packages installing competing hooks into one .git is wrong.
  drop(p, 'devDependencies', 'simple-git-hooks', 'maximal')

  writePkg('maximal', p)
}

// Test files that import from, or read, the excluded Tauri shell.
const SHELL_COUPLED_TESTS = [
  // import ../shell/src/**
  'inline-state-client', 'project-slice', 'spa-router',
  'tauri-shell-bridge', 'usage-format', 'ws/live-feed-core',
  // read shell/** from disk at runtime
  'single-history-invariant', 'account-section', 'docs-reference-parity',
  'tauri-resources', 'i18n-catalog-parity', 'boot-status',
  'shell-sidecar-env-contract', 'ui-url-contract',
]

for (const t of SHELL_COUPLED_TESTS) {
  const f = join(ROOT, 'packages/maximal/tests', `${t}.test.ts`)
  if (existsSync(f)) {
    rmSync(f)
    note(`maximal: removed tests/${t}.test.ts (needs Tauri shell)`)
  }
}

// ── maximal-core ───────────────────────────────────────────────────────────
{
  const p = readPkg('maximal-core')

  // `prepare` installs git hooks. Keep it runnable, but off the install path.
  // Read through to an already-renamed key so a re-run still repairs its
  // position rather than treating the rename as done and leaving it appended.
  const hooks = p.scripts?.prepare ?? p.scripts?.['prepare:hooks']
  if (hooks) {
    if (p.scripts.prepare) {
      delete p.scripts.prepare
      note('maximal-core: prepare -> prepare:hooks (off the install path)')
    }
    set(p, 'scripts', 'prepare:hooks', hooks, 'maximal-core', 'release:check')
  }

  set(p, 'scripts', 'test', 'bun test', 'maximal-core', 'test:mutation')
  set(p, 'dependencies', '@hono/zod-openapi', '1.5.0', 'maximal-core')
  drop(p, 'devDependencies', 'simple-git-hooks', 'maximal-core')

  writePkg('maximal-core', p)
}

// ── maximal-electron ───────────────────────────────────────────────────────
{
  const p = readPkg('maximal-electron')

  // Imported by src/main/native/{agent,toolsets}.ts but never declared —
  // a phantom dependency hoisted in via @earendil-works/pi-agent-core.
  // Real bug upstream; declared here so the workspace does not depend on
  // hoisting luck.
  set(p, 'devDependencies', 'typebox', '1.3.7', 'maximal-electron')

  // No plain `build` script upstream; Turborepo needs one.
  set(p, 'scripts', 'build', 'npm run build:package', 'maximal-electron')

  writePkg('maximal-electron', p)
}

// ── report ─────────────────────────────────────────────────────────────────
if (changes.length === 0) {
  console.log('deviations: already applied, nothing to do')
} else {
  console.log(`deviations applied (${changes.length}):`)
  for (const c of changes) console.log(`  - ${c}`)
}
