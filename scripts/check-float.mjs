#!/usr/bin/env node
/**
 * Fail when a dependency resolves to a different version here than upstream.
 *
 * A workspace has one root lockfile, so the per-package lockfiles stop applying
 * and everything re-resolves to the newest semver-compatible version. That has
 * broken this spike three times -- @hono/zod-openapi twice (a changed inferred
 * type failed typecheck in two packages) and prettier once (changed union
 * formatting produced 20 lint errors in untouched files). Each cost a debugging
 * detour before the cause was obvious.
 *
 * This compares what monimal resolved against what the source repo resolved,
 * using each side's installed node_modules as the source of truth -- no lockfile
 * parsing, and it reflects what the toolchain will actually load.
 *
 *   node scripts/check-float.mjs          report drift, exit 1 if any
 *   node scripts/check-float.mjs --warn   report drift, always exit 0
 *
 * Requires the source repos to have node_modules installed.
 */

import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SB = process.env.SB ?? join(homedir(), 'github/stuffbucket')
const warnOnly = process.argv.includes('--warn')

// package dir -> [source repo, subdir within it]
const PACKAGES = {
  maximal: ['maximal', ''],
  'maximal-core': ['maximal-core', ''],
  'maximal-electron': ['maximal-electron', ''],
  site: ['maximal', 'site'],
}

/**
 * Transitive tools that are not declared anywhere but decide build output or
 * lint results. prettier is the reason this list exists: it arrives through
 * @echristian/eslint-config, so nothing declares it and nothing pins it.
 */
const WATCHLIST = ['prettier', 'typescript', 'eslint', 'vite', 'vitest']

const version = (base, dep) => {
  for (const dir of [join(base, 'node_modules', dep), join(ROOT, 'node_modules', dep)]) {
    const f = join(dir, 'package.json')
    if (existsSync(f)) {
      try {
        return JSON.parse(readFileSync(f, 'utf8')).version
      } catch {
        /* unreadable, treat as absent */
      }
    }
  }
  return undefined
}

const drift = []
const skipped = []

for (const [pkg, [repo, sub]] of Object.entries(PACKAGES)) {
  const here = join(ROOT, 'packages', pkg)
  const there = join(SB, repo, sub)

  if (!existsSync(join(here, 'package.json'))) continue
  if (!existsSync(join(there, 'node_modules'))) {
    skipped.push(`${pkg}: no node_modules in ${there.replace(homedir(), '~')}`)
    continue
  }

  const manifest = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8'))
  const declared = Object.keys({
    ...manifest.dependencies,
    ...manifest.devDependencies,
  })

  for (const dep of new Set([...declared, ...WATCHLIST])) {
    const a = version(here, dep)
    const b = version(there, dep)
    if (a && b && a !== b) {
      drift.push({ pkg, dep, here: a, there: b, watched: !declared.includes(dep) })
    }
  }
}

for (const s of skipped) console.log(`  skipped ${s}`)

if (drift.length === 0) {
  console.log('no dependency float: every resolved version matches upstream')
  process.exit(0)
}

console.log(`dependency float (${drift.length}):\n`)
const width = Math.max(...drift.map((d) => d.dep.length))
for (const d of drift) {
  console.log(
    `  ${d.pkg.padEnd(18)} ${d.dep.padEnd(width)}  here ${d.here.padEnd(12)} upstream ${d.there}` +
      (d.watched ? '   [transitive]' : ''),
  )
}
console.log(
  '\nPin the ones that matter. A declared dependency pins in its own package.json;' +
    '\na transitive one needs a root `pnpm.overrides` entry.',
)

process.exit(warnOnly ? 0 : 1)
