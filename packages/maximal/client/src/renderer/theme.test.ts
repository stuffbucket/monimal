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

interface Rgb {
  red: number
  green: number
  blue: number
}

function themeValues(): Map<string, string> {
  const source = readFileSync(resolve(process.cwd(), 'src/renderer/theme.ts'), 'utf8')
  return new Map(
    [...source.matchAll(/^\s*(--shell-[a-z0-9-]+)\s*:\s*([^;]+);/gm)].map(
      (match) => [match[1] ?? '', (match[2] ?? '').trim()],
    ),
  )
}

function hex(value: string): Rgb {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value)
  if (match === null) throw new Error(`${value} is not an opaque hex colour`)
  return {
    red: Number.parseInt(match[1] ?? '', 16),
    green: Number.parseInt(match[2] ?? '', 16),
    blue: Number.parseInt(match[3] ?? '', 16),
  }
}

function composite(value: string, background: Rgb): Rgb {
  const match = /^rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\)$/.exec(value)
  if (match === null) throw new Error(`${value} is not an rgb colour with alpha`)
  const alpha = Number(match[4])
  const channel = (foreground: number, behind: number) =>
    Math.round(foreground * alpha + behind * (1 - alpha))
  return {
    red: channel(Number(match[1]), background.red),
    green: channel(Number(match[2]), background.green),
    blue: channel(Number(match[3]), background.blue),
  }
}

function contrast(first: Rgb, second: Rgb): number {
  const luminance = ({ red, green, blue }: Rgb) => {
    const channel = (value: number) => {
      const scaled = value / 255
      return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue)
  }
  const values = [luminance(first), luminance(second)]
  return (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05)
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

describe('switch non-text contrast', () => {
  it('keeps both states and their boundaries above 3:1 on the canvas', () => {
    const values = themeValues()
    const value = (name: string) => {
      const found = values.get(name)
      if (found === undefined) throw new Error(`${name} is not defined by the theme`)
      return found
    }
    const canvas = hex(value('--shell-canvas'))
    const offTrack = composite(value('--shell-active'), canvas)
    const accent = hex(value('--shell-accent'))

    const relationships = [
      ['off track boundary', hex(value('--shell-text-muted')), canvas],
      ['off thumb', hex(value('--shell-text')), offTrack],
      ['on track', accent, canvas],
      ['on thumb', hex(value('--shell-accent-contrast')), accent],
      ['on and off states', accent, offTrack],
    ] as const

    for (const [name, foreground, background] of relationships) {
      expect(contrast(foreground, background), name).toBeGreaterThanOrEqual(3)
    }
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
