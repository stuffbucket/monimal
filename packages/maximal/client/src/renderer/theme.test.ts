import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { SHELL_TERMINAL_PROPERTIES } from 'stuffbucket-electron/renderer'
import { shellVariableContract } from 'stuffbucket-electron/verify/shell-variables'

const require = createRequire(import.meta.url)
const SHELL_STYLES_PATH = require.resolve('stuffbucket-electron/renderer/styles.css')
const SHELL_STYLES = readFileSync(SHELL_STYLES_PATH, 'utf8')

function installedContract() {
  return shellVariableContract({
    stylesheets: [{ name: SHELL_STYLES_PATH, css: SHELL_STYLES }],
    runtimeProperties: Object.values(SHELL_TERMINAL_PROPERTIES),
  })
}

function definedThemeVariables(): Set<string> {
  const source = readFileSync(resolve(process.cwd(), 'src/renderer/theme.ts'), 'utf8')
  return new Set(
    [...source.matchAll(/^\s*(--shell-[a-z0-9-]+)\s*:/gm)].map((match) => match[1] ?? ''),
  )
}

describe('the stuffbucket-electron shell variable contract', () => {
  it('derives a non-empty contract from the installed package', () => {
    expect(SHELL_STYLES.length, `${SHELL_STYLES_PATH} resolved but was empty`).toBeGreaterThan(0)

    const contract = installedContract()

    expect(contract.required.length).toBeGreaterThan(0)
    expect(contract.fallback.length).toBeGreaterThan(0)
    expect(contract.runtime.length).toBeGreaterThan(0)
  })

  it('defines every variable the installed package requires without a fallback', () => {
    const required = installedContract().required
    const defined = definedThemeVariables()
    const missing = required.filter((name) => !defined.has(name))

    expect(
      missing,
      `theme.ts does not define required variables from ${SHELL_STYLES_PATH}: ${missing.join(', ')}`,
    ).toEqual([])
  })
})

/** Every `.ts`/`.tsx` under the renderer, so no stylesheet is missed. */
function rendererSources(): string[] {
  const walk = (directory: string, found: string[]): string[] => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) walk(path, found)
      else if (/\.tsx?$/.test(entry.name)) found.push(path)
    }
    return found
  }

  return walk(resolve(process.cwd(), 'src/renderer'), [])
}

/** Every `--shell-*` this application's own stylesheets read or declare. */
function usedShellVariables(): Map<string, string> {
  const found = new Map<string, string>()

  for (const path of rendererSources()) {
    const source = readFileSync(path, 'utf8')

    for (const block of source.matchAll(/= `([^`]*)`/g)) {
      const css = (block[1] ?? '').replaceAll(/\/\*[\s\S]*?\*\//g, '')
      if (!css.includes('{')) continue

      for (const pattern of [/\bvar\(\s*(--shell-[a-z0-9-]+)/g, /(--shell-[a-z0-9-]+)\s*:/g]) {
        for (const match of css.matchAll(pattern)) {
          const name = match[1] ?? ''
          if (!found.has(name)) found.set(name, path)
        }
      }
    }
  }

  return found
}

describe('the names this application writes in the shell namespace', () => {
  /*
   * The other direction of the check above, and the one the mistakes are in.
   *
   * A `--shell-*` the installed package does not publish resolves to nothing.
   * With a fallback it paints that fallback for ever and ignores the theme;
   * with none, an undefined custom property makes the whole declaration
   * invalid at computed-value time, so it is no border rather than a faint
   * one. Neither raises an error, which is why both survive.
   *
   * It is also a claim on the package's vocabulary. `--shell-success` was
   * defined here for a colour the package has no name for, so it read as part
   * of a contract it was not part of — and the day the package publishes that
   * name meaning something else, this application silently gets that meaning.
   * A colour of our own is `--maximal-*`, which is how Theia and Positron
   * layer a downstream product onto a workbench.
   *
   * `eslint/shell-contract.mjs` reports the same thing at the character.
   */
  it('reads a stylesheet from every renderer source', () => {
    // The floor. A walk that found nothing reports every name as published.
    const used = usedShellVariables()
    expect(rendererSources().length).toBeGreaterThan(20)
    expect(used.size).toBeGreaterThan(20)
    expect(used.has('--shell-space-2')).toBe(true)
  })

  it('are all names the installed package publishes', () => {
    const contract = installedContract()
    const published = new Set([
      ...contract.required,
      ...contract.fallback,
      ...contract.structural,
      ...contract.runtime,
    ])

    expect(published.size).toBeGreaterThan(30)

    const invented = [...usedShellVariables()]
      .filter(([name]) => !published.has(name))
      .map(([name, path]) => `${name} (${path.replace(process.cwd(), '.')})`)
      .sort()

    expect(invented).toEqual([])
  })
})
