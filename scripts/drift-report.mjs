#!/usr/bin/env node
/**
 * Report how far maximal/src and maximal-core/src have diverged.
 *
 * The two carry the same engine. `docs/maximal-core-integration.md` calls for
 * excavating maximal/src so maximal-core is the only copy; this quantifies what
 * that would cost and, more usefully, what the delay is already costing.
 *
 * Files that share a path but differ are the interesting ones: each is a change
 * that landed in one copy and not the other. Sorted by how far apart they are.
 *
 *   pnpm run drift            summary + the 25 most-diverged files
 *   pnpm run drift --all      every diverging file
 *   pnpm run drift --md       markdown table, for pasting into a doc
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const A = join(ROOT, 'packages/maximal/src')
const B = join(ROOT, 'packages/maximal-core/src')
const all = process.argv.includes('--all')
const md = process.argv.includes('--md')

for (const d of [A, B]) {
  if (!existsSync(d)) {
    console.error(`missing ${relative(ROOT, d)} — run \`pnpm run sync\` first`)
    process.exit(1)
  }
}

const walk = (dir, base = dir) => {
  const out = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const f = join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(f, base))
    else if (e.name.endsWith('.ts')) out.push(relative(base, f))
  }
  return out
}

const inA = new Set(walk(A))
const inB = new Set(walk(B))
const shared = [...inA].filter((f) => inB.has(f)).sort()
const onlyA = [...inA].filter((f) => !inB.has(f))
const onlyB = [...inB].filter((f) => !inA.has(f))

/** Cheap line-level distance: symmetric difference of line multisets. */
const distance = (x, y) => {
  const count = (s) => {
    const m = new Map()
    for (const l of s.split('\n')) m.set(l, (m.get(l) ?? 0) + 1)
    return m
  }
  const ma = count(x)
  const mb = count(y)
  let d = 0
  for (const [l, n] of ma) d += Math.max(0, n - (mb.get(l) ?? 0))
  for (const [l, n] of mb) d += Math.max(0, n - (ma.get(l) ?? 0))
  return d
}

const identical = []
const diverged = []
for (const f of shared) {
  const x = readFileSync(join(A, f), 'utf8')
  const y = readFileSync(join(B, f), 'utf8')
  if (x === y) identical.push(f)
  else diverged.push({ f, lines: distance(x, y), a: x.split('\n').length })
}
diverged.sort((p, q) => q.lines - p.lines)

const totalDrift = diverged.reduce((n, d) => n + d.lines, 0)

if (md) {
  console.log('| file | differing lines |')
  console.log('| --- | --- |')
  for (const d of (all ? diverged : diverged.slice(0, 25))) {
    console.log(`| \`${d.f}\` | ${d.lines} |`)
  }
  process.exit(0)
}

console.log('maximal/src vs maximal-core/src\n')
console.log(`  files in maximal/src        ${inA.size}`)
console.log(`  files in maximal-core/src   ${inB.size}`)
console.log(`  shared paths                ${shared.length}`)
console.log(`    identical                 ${identical.length}`)
console.log(`    DIVERGED                  ${diverged.length}`)
console.log(`  only in maximal             ${onlyA.length}`)
console.log(`  only in maximal-core        ${onlyB.length}`)
console.log(`\n  total differing lines       ${totalDrift}`)

const show = all ? diverged : diverged.slice(0, 25)
console.log(`\nmost diverged (${show.length} of ${diverged.length}):\n`)
const w = Math.max(...show.map((d) => d.f.length))
for (const d of show) {
  console.log(`  ${d.f.padEnd(w)}  ${String(d.lines).padStart(5)} lines differ`)
}
if (!all && diverged.length > show.length) {
  console.log(`\n  ... ${diverged.length - show.length} more; use --all`)
}
