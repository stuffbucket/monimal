#!/usr/bin/env node

import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import console from 'node:console'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export function exportTargets(exports) {
  return Object.values(exports ?? {}).flatMap((entry) => {
    if (typeof entry === 'string') return [entry]
    if (entry === null || typeof entry !== 'object') return []
    return Object.values(entry).filter((target) => typeof target === 'string')
  })
}

export function relativeImports(source) {
  const imports = []
  for (const match of source.matchAll(/(?:from\s*|import\s*)["'](\.{1,2}\/[^"']+)["']/g)) {
    if (match[1]) imports.push(match[1])
  }
  return imports
}

export function missingArtifacts(packageRoot, exports) {
  const missing = new Set()
  const pending = [...new Set(exportTargets(exports))]
  const visited = new Set()

  while (pending.length > 0) {
    const target = pending.pop()
    if (!target || visited.has(target)) continue
    visited.add(target)
    const file = path.resolve(packageRoot, target)
    if (!existsSync(file) || statSync(file).size === 0) {
      missing.add(target)
      continue
    }
    if (!file.endsWith('.js')) continue
    for (const specifier of relativeImports(readFileSync(file, 'utf8'))) {
      pending.push(path.relative(packageRoot, path.resolve(path.dirname(file), specifier)))
    }
  }
  return [...missing].sort()
}

export function verifyExports(packageRoot = root) {
  const manifest = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'))
  return missingArtifacts(packageRoot, manifest.exports)
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const missing = verifyExports()
  if (missing.length > 0) {
    for (const target of missing) console.error(`missing export artifact: ${target}`)
    process.exitCode = 1
  }
}