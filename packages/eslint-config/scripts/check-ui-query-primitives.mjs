#!/usr/bin/env node

/**
 * Prevent renderer controls from rebuilding a query cache out of effects,
 * component state, browser storage, or module Maps.
 *
 * The allowlist is debt, not an exception list: new identities fail, and
 * removed identities also fail until their baseline entries are deleted.
 * Output uses file:line:column diagnostics so editors and CI problem matchers
 * can attach every failure to its owner.
 */

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

const QUERY_ROOTS = ['capabilities.', 'window.maximal.']
const STORAGE_ROOTS = new Set(['localStorage', 'sessionStorage'])
const EVENT_METHODS = new Set(['onChange', 'onOpenLicenses', 'subscribe'])
const NON_QUERY_CALLS = new Set(['window.maximal.terminal.frameId'])

export const allowedAdhocUiQueries = new Map([
  [
    'packages/maximal-client/src/renderer/appearance.ts',
    [
      'browser-storage:localStorage',
      'browser-storage:localStorage',
    ],
  ],
  [
    'packages/maximal-client/src/renderer/settings/general/useGeneralDesktopSettings.ts',
    [
      'effect-fetch:useGeneralDesktopSettings:capabilities.general.desktopSettings,capabilities.general.systemNotificationStatus',
    ],
  ],
  [
    'packages/maximal-client/src/renderer/settings/accounts/useOllamaAccounts.ts',
    [
      'effect-fetch:useOllamaAccounts:capabilities.ollamaRuntime.preferences,capabilities.ollamaSettings.get',
      'effect-fetch:useOllamaAccounts:capabilities.ollamaAccounts.list',
      'effect-fetch:useOllamaAccounts:capabilities.ollamaRuntime.status',
    ],
  ],
  [
    'packages/maximal-client/src/renderer/settings/cloud-model-providers.ts',
    [
      'effect-fetch:useCloudModelProviders:capabilities.accounts.list,capabilities.ollamaAccounts.list,capabilities.ollamaRuntime.preferences,capabilities.ollamaSettings.get',
    ],
  ],
  [
    'packages/maximal-client/src/renderer/settings/local-models/useOllamaProvider.ts',
    [
      'effect-fetch:useOllamaProvider:capabilities.ollamaSettings.get',
      'effect-fetch:useOllamaProvider:capabilities.ollamaRuntime.status',
    ],
  ],
  [
    'packages/maximal-client/src/renderer/settings/useModelProviderRegistry.ts',
    [
      'module-cache:inventoryCache',
      'effect-fetch:useModelProviderRegistry:capabilities.localModels.list,capabilities.models.list,capabilities.models.refresh',
    ],
  ],
  [
    'packages/maximal-client/src/renderer/useTerminalTabs.ts',
    [
      'effect-fetch:useTerminalTabs:window.maximal.browser.list',
    ],
  ],
])

function visit(value, callback) {
  if (value === null || typeof value !== 'object') return
  if (Array.isArray(value)) {
    for (const entry of value) visit(entry, callback)
    return
  }
  callback(value)
  for (const [key, child] of Object.entries(value)) {
    if (
      key !== 'loc'
      && key !== 'range'
      && key !== 'tokens'
      && key !== 'comments'
    ) {
      visit(child, callback)
    }
  }
}

function memberPath(node) {
  if (node?.type === 'Identifier') return node.name
  if (
    node?.type !== 'MemberExpression'
    || node.computed
    || node.property?.type !== 'Identifier'
  ) {
    return undefined
  }
  const object = memberPath(node.object)
  return object === undefined ? undefined : `${object}.${node.property.name}`
}

function functionBody(node) {
  if (
    node?.type === 'ArrowFunctionExpression'
    || node?.type === 'FunctionExpression'
    || node?.type === 'FunctionDeclaration'
  ) {
    return node.body
  }
  if (
    node?.type === 'CallExpression'
    && node.callee?.type === 'Identifier'
    && node.callee.name === 'useCallback'
  ) {
    return functionBody(node.arguments?.[0])
  }
  return undefined
}

function declaredName(node) {
  if (node?.type === 'FunctionDeclaration') return node.id?.name
  if (node?.type === 'VariableDeclarator' && node.id?.type === 'Identifier') {
    return node.id.name
  }
  return undefined
}

function containingFunctionName(node, parents) {
  for (let index = parents.length - 1; index >= 0; index -= 1) {
    const parent = parents[index]
    if (parent.type === 'FunctionDeclaration' && parent.id?.name) {
      return parent.id.name
    }
    if (
      (parent.type === 'ArrowFunctionExpression'
        || parent.type === 'FunctionExpression')
      && parents[index - 1]?.type === 'VariableDeclarator'
      && parents[index - 1].id?.type === 'Identifier'
    ) {
      return parents[index - 1].id.name
    }
  }
  return '<module>'
}

function collectFunctionSummary(body, stateSetters, helperSummaries, active = new Set()) {
  const sources = new Set()
  const setters = new Set()
  const helperCalls = new Set()

  visit(body, (node) => {
    if (node.type !== 'CallExpression') return
    const pathName = memberPath(node.callee)
    if (pathName !== undefined) {
      const method = pathName.split('.').at(-1)
      if (
        !EVENT_METHODS.has(method)
        && !/^on[A-Z]/u.test(method ?? '')
        && !NON_QUERY_CALLS.has(pathName)
        && QUERY_ROOTS.some((queryRoot) => pathName.startsWith(queryRoot))
      ) {
        sources.add(pathName)
      }
      const rootName = pathName.split('.')[0]
      if (STORAGE_ROOTS.has(rootName)) sources.add(rootName)
    }
    for (const argument of node.arguments ?? []) {
      if (argument?.type !== 'Identifier') continue
      if (stateSetters.has(argument.name)) setters.add(argument.name)
      if (helperSummaries.has(argument.name)) helperCalls.add(argument.name)
    }
    if (node.callee?.type !== 'Identifier') return
    if (stateSetters.has(node.callee.name)) setters.add(node.callee.name)
    if (helperSummaries.has(node.callee.name)) helperCalls.add(node.callee.name)
  })

  for (const helperName of helperCalls) {
    if (active.has(helperName)) continue
    const helper = helperSummaries.get(helperName)
    if (helper === undefined) continue
    active.add(helperName)
    const nested = collectFunctionSummary(
      helper,
      stateSetters,
      helperSummaries,
      active,
    )
    active.delete(helperName)
    for (const source of nested.sources) sources.add(source)
    for (const setter of nested.setters) setters.add(setter)
  }

  return { sources, setters }
}

export function findAdhocUiQueries(source, filePath = 'source.tsx') {
  const { ast: tree } = tseslint.parser.parseForESLint(source, {
    filePath,
    loc: true,
    range: true,
  })
  const stateSetters = new Set()
  const helperSummaries = new Map()
  const findings = []

  visit(tree, (node) => {
    if (
      node.type === 'VariableDeclarator'
      && node.id?.type === 'ArrayPattern'
      && node.id.elements?.[1]?.type === 'Identifier'
      && node.init?.type === 'CallExpression'
      && node.init.callee?.type === 'Identifier'
      && node.init.callee.name === 'useState'
    ) {
      stateSetters.add(node.id.elements[1].name)
    }

    const name = declaredName(node)
    const body = node.type === 'VariableDeclarator'
      ? functionBody(node.init)
      : functionBody(node)
    if (name !== undefined && body !== undefined) helperSummaries.set(name, body)

    if (
      node.type === 'VariableDeclarator'
      && node.id?.type === 'Identifier'
      && /cache/iu.test(node.id.name)
      && node.init?.type === 'NewExpression'
      && node.init.callee?.type === 'Identifier'
      && (node.init.callee.name === 'Map' || node.init.callee.name === 'WeakMap')
    ) {
      findings.push({
        identity: `module-cache:${node.id.name}`,
        kind: 'module-cache',
        line: node.loc.start.line,
        column: node.loc.start.column + 1,
        detail: `${node.init.callee.name} cache "${node.id.name}"`,
      })
    }

    if (
      node.type === 'MemberExpression'
      && node.object?.type === 'Identifier'
      && STORAGE_ROOTS.has(node.object.name)
    ) {
      findings.push({
        identity: `browser-storage:${node.object.name}`,
        kind: 'browser-storage',
        line: node.loc.start.line,
        column: node.loc.start.column + 1,
        detail: `direct ${node.object.name} access`,
      })
    }
  })

  const parents = []
  const inspectEffects = (value) => {
    if (value === null || typeof value !== 'object') return
    if (Array.isArray(value)) {
      for (const entry of value) inspectEffects(entry)
      return
    }
    if (
      value.type === 'CallExpression'
      && value.callee?.type === 'Identifier'
      && value.callee.name === 'useEffect'
    ) {
      const body = functionBody(value.arguments?.[0])
      if (body !== undefined) {
        const summary = collectFunctionSummary(
          body,
          stateSetters,
          helperSummaries,
        )
        if (summary.sources.size > 0 && summary.setters.size > 0) {
          const owner = containingFunctionName(value, parents)
          const sources = [...summary.sources].sort()
          findings.push({
            identity: `effect-fetch:${owner}:${sources.join(',')}`,
            kind: 'effect-fetch',
            line: value.loc.start.line,
            column: value.loc.start.column + 1,
            detail:
              `useEffect mirrors ${sources.join(', ')} into React state`,
          })
        }
      }
    }
    parents.push(value)
    for (const [key, child] of Object.entries(value)) {
      if (
        key !== 'loc'
        && key !== 'range'
        && key !== 'tokens'
        && key !== 'comments'
      ) {
        inspectEffects(child)
      }
    }
    parents.pop()
  }
  inspectEffects(tree)

  return findings
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
      'packages/maximal-client/src/renderer',
    ],
    { cwd: repositoryRoot, encoding: 'utf8' },
  )
    .split('\0')
    .filter(Boolean)
    .filter((file) => /\.[cm]?[jt]sx?$/.test(file))
    .filter((file) => !/\.(?:stories|test|spec)\.[cm]?[jt]sx?$/.test(file))
    .filter((file) => existsSync(path.join(repositoryRoot, file)))
    .sort()
}

export function ratchetUiQueryFindings(
  found,
  allowedFindings = allowedAdhocUiQueries,
) {
  const failures = []
  for (const [file, findings] of found) {
    const allowed = [...(allowedFindings.get(file) ?? [])]
    for (const finding of findings) {
      const allowedIndex = allowed.indexOf(finding.identity)
      if (allowedIndex === -1) {
        failures.push({ file, ...finding, stale: false })
      } else {
        allowed.splice(allowedIndex, 1)
      }
    }
    for (const identity of allowed) {
      failures.push({
        file,
        identity,
        kind: 'stale-baseline',
        line: 1,
        column: 1,
        detail: `remove resolved baseline entry "${identity}"`,
        stale: true,
      })
    }
  }
  for (const [file, identities] of allowedFindings) {
    if (found.has(file)) continue
    for (const identity of identities) {
      failures.push({
        file,
        identity,
        kind: 'stale-baseline',
        line: 1,
        column: 1,
        detail: `remove resolved baseline entry "${identity}"`,
        stale: true,
      })
    }
  }
  return failures
}

export function checkUiQueryPrimitives(repositoryRoot = root) {
  const found = new Map()
  for (const file of sourceFiles(repositoryRoot)) {
    const absolutePath = path.join(repositoryRoot, file)
    const findings = findAdhocUiQueries(
      readFileSync(absolutePath, 'utf8'),
      absolutePath,
    )
    if (findings.length > 0) found.set(file, findings)
  }

  const failures = ratchetUiQueryFindings(found)
  return { failures, found }
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const { failures } = checkUiQueryPrimitives()
  for (const failure of failures) {
    console.error(
      `${failure.file}:${failure.line}:${failure.column}: error: `
      + `${failure.detail}; use TanStack Query for shared async state `
      + `[ui-query-primitives/${failure.kind}]`,
    )
  }
  if (failures.length > 0) process.exitCode = 1
}
