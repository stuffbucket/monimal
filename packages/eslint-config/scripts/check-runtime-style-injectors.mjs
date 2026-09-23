#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import console from 'node:console'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import tseslint from 'typescript-eslint'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

export const allowedInjectors = new Map([
  ['packages/maximal-electron/src/renderer/lib/component-styles.ts', 2],
  ['packages/maximal/client/src/renderer/base.ts', 1],
  ['packages/maximal/client/src/renderer/settings/settings-styles.ts', 1],
  ['packages/maximal/client/src/renderer/theme.ts', 1],
])

export function findStyleInjectors(source, filePath = 'source.ts') {
  const { ast: tree } = tseslint.parser.parseForESLint(source, { filePath, loc: true })
  const lines = []
  const visit = (value) => {
    if (value === null || typeof value !== 'object') return
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry)
      return
    }
    if (
      value.type === 'CallExpression' &&
      value.callee?.type === 'MemberExpression' &&
      value.callee.computed === false &&
      value.callee.property?.type === 'Identifier' &&
      value.callee.property.name === 'createElement' &&
      value.arguments?.[0]?.type === 'Literal' &&
      value.arguments[0].value === 'style'
    ) {
      lines.push(value.loc.start.line)
    }
    for (const [key, child] of Object.entries(value)) {
      if (key !== 'loc' && key !== 'range' && key !== 'tokens' && key !== 'comments') visit(child)
    }
  }
  visit(tree)
  return lines
}

export function sourceFiles(repositoryRoot) {
  return execFileSync('git', [
    'ls-files', '--cached', '--others', '--exclude-standard', '-z', '--',
    ':(glob)packages/**/src/**',
  ], { cwd: repositoryRoot, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
    .filter((file) => /\.(?:js|mjs|ts|tsx)$/.test(file))
    .filter((file) => !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file))
    .filter((file) => existsSync(path.join(repositoryRoot, file)))
    .sort()
}

export function checkInjectors(repositoryRoot = root) {
  const found = new Map()
  for (const file of sourceFiles(repositoryRoot)) {
    const absolutePath = path.join(repositoryRoot, file)
    const lines = findStyleInjectors(readFileSync(absolutePath, 'utf8'), absolutePath)
    if (lines.length > 0) found.set(file, lines)
  }

  const failures = []
  for (const [file, lines] of found) {
    const expected = allowedInjectors.get(file)
    if (expected !== lines.length) failures.push(`${file}: expected ${expected ?? 0}, found ${lines.length}`)
  }
  for (const [file, expected] of allowedInjectors) {
    if (!found.has(file)) failures.push(`${file}: expected ${expected}, found 0`)
  }
  return { failures, found }
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const { failures, found } = checkInjectors()
  for (const [file, lines] of found) console.log(`${file}:${lines.join(',')}`)
  if (failures.length > 0) {
    for (const failure of failures) console.error(`runtime style injector: ${failure}`)
    process.exitCode = 1
  }
}