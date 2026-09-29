#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import console from 'node:console'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import tseslint from 'typescript-eslint'

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
)

const STYLE_KINDS = ['injectors', 'inlineAttributes', 'literalTags']

export const allowedAdhocStyles = new Map([
  ['apps/desktop/src/main/windows/splash-window.ts', { literalTags: 1 }],
  [
    'apps/desktop/src/renderer/workspace/TerminalProfileIcon.tsx',
    { inlineAttributes: 1 },
  ],
  ['packages/maximal-client/src/renderer/base.ts', { injectors: 1 }],
  [
    'packages/maximal-client/src/renderer/settings/accounts/CopilotPlanDetails.tsx',
    { inlineAttributes: 6 },
  ],
  [
    'packages/maximal-client/src/renderer/settings/settings-styles.ts',
    { injectors: 1 },
  ],
  ['packages/maximal-client/src/renderer/theme.ts', { injectors: 1 }],
  [
    'packages/maximal-client/src/renderer/workspace-map/WorkspaceMap.tsx',
    { inlineAttributes: 2 },
  ],
  [
    'packages/maximal-context-window/src/ContextWindowSessionPanel.tsx',
    { inlineAttributes: 3 },
  ],
  [
    'packages/maximal-data-visualization/src/primitives.tsx',
    { inlineAttributes: 2 },
  ],
  [
    'packages/maximal-electron/src/renderer/components/Profile.tsx',
    { inlineAttributes: 1 },
  ],
  [
    'packages/maximal-electron/src/renderer/components/TabBar.tsx',
    { inlineAttributes: 1 },
  ],
  [
    'packages/maximal-electron/src/renderer/components/controls/Fields.tsx',
    { inlineAttributes: 2 },
  ],
  [
    'packages/maximal-electron/src/renderer/components/settings/ModelCards.tsx',
    { inlineAttributes: 1 },
  ],
  [
    'packages/maximal-electron/src/renderer/lib/component-styles.ts',
    { injectors: 2 },
  ],
  [
    'packages/maximal-harness/src/renderer/Overlay.tsx',
    { inlineAttributes: 1 },
  ],
])

export function findAdhocStyles(source, filePath = 'source.ts') {
  const { ast: tree } = tseslint.parser.parseForESLint(source, {
    filePath,
    loc: true,
  })
  const found = {
    injectors: [],
    inlineAttributes: [],
    literalTags: [],
  }
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
      found.injectors.push(value.loc.start.line)
    }
    if (
      value.type === 'JSXAttribute' &&
      value.name?.type === 'JSXIdentifier' &&
      value.name.name === 'style'
    ) {
      found.inlineAttributes.push(value.loc.start.line)
    }
    if (
      value.type === 'JSXOpeningElement' &&
      value.name?.type === 'JSXIdentifier' &&
      value.name.name === 'style'
    ) {
      found.literalTags.push(value.loc.start.line)
    }
    if (value.type === 'TemplateElement') {
      const raw = value.value?.raw ?? ''
      for (const match of raw.matchAll(/<style(?:\s|>)/giu)) {
        const offset = match.index ?? 0
        const precedingLines = raw.slice(0, offset).match(/\n/gu)?.length ?? 0
        found.literalTags.push(value.loc.start.line + precedingLines)
      }
    }
    for (const [key, child] of Object.entries(value)) {
      if (
        key !== 'loc' &&
        key !== 'range' &&
        key !== 'tokens' &&
        key !== 'comments'
      )
        visit(child)
    }
  }
  visit(tree)
  return found
}

export function findStyleInjectors(source, filePath = 'source.ts') {
  return findAdhocStyles(source, filePath).injectors
}

export function sourceFiles(repositoryRoot) {
  return execFileSync(
    'git',
    [
      'ls-files',
      '--cached',
      '--others',
      '--exclude-standard',
      '-z',
      '--',
      ':(glob)apps/**/src/**',
      ':(glob)packages/**/src/**',
    ],
    { cwd: repositoryRoot, encoding: 'utf8' },
  )
    .split('\0')
    .filter(Boolean)
    .filter((file) => /\.(?:js|mjs|ts|tsx)$/.test(file))
    .filter((file) => !/\.(?:stories|test|spec)\.[cm]?[jt]sx?$/.test(file))
    .filter((file) => existsSync(path.join(repositoryRoot, file)))
    .sort()
}

export function checkInjectors(repositoryRoot = root) {
  const found = new Map()
  for (const file of sourceFiles(repositoryRoot)) {
    const absolutePath = path.join(repositoryRoot, file)
    const styles = findAdhocStyles(
      readFileSync(absolutePath, 'utf8'),
      absolutePath,
    )
    if (STYLE_KINDS.some((kind) => styles[kind].length > 0))
      found.set(file, styles)
  }

  const failures = []
  for (const [file, styles] of found) {
    const expected = allowedAdhocStyles.get(file) ?? {}
    for (const kind of STYLE_KINDS) {
      const count = styles[kind].length
      if ((expected[kind] ?? 0) !== count) {
        failures.push(
          `${file} ${kind}: expected ${expected[kind] ?? 0}, found ${count}`,
        )
      }
    }
  }
  for (const [file, expected] of allowedAdhocStyles) {
    if (found.has(file)) continue
    for (const kind of STYLE_KINDS) {
      if ((expected[kind] ?? 0) > 0)
        failures.push(`${file} ${kind}: expected ${expected[kind]}, found 0`)
    }
  }
  return { failures, found }
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const { failures, found } = checkInjectors()
  for (const [file, styles] of found) {
    for (const kind of STYLE_KINDS) {
      if (styles[kind].length > 0)
        console.log(`${file} ${kind}:${styles[kind].join(',')}`)
    }
  }
  if (failures.length > 0) {
    for (const failure of failures) console.error(`ad hoc style: ${failure}`)
    process.exitCode = 1
  }
}
