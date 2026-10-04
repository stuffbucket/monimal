import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { SHELL_TERMINAL_PROPERTIES } from '@maximal/maximal-terminal/renderer'
import { shellVariableContract } from '@maximal/maximal-electron/verify/shell-variables'

import { DEFAULT_APPEARANCE } from './appearance'
import { paletteTokens } from './color/palette'

const require = createRequire(import.meta.url)
const SHELL_STYLES_PATH = require.resolve('@maximal/maximal-electron/renderer/styles.css')
const SHELL_STYLES = readFileSync(SHELL_STYLES_PATH, 'utf8')

function installedContract() {
  return shellVariableContract({
    stylesheets: [{ name: SHELL_STYLES_PATH, css: SHELL_STYLES }],
    runtimeProperties: Object.values(SHELL_TERMINAL_PROPERTIES),
  })
}

function definedThemeVariables(): Set<string> {
  const source = readFileSync(resolve(import.meta.dirname, 'theme.ts'), 'utf8')
  const palette = paletteTokens(DEFAULT_APPEARANCE.colors)
  return new Set([
    ...[
      ...source.matchAll(/^\s*(--(?:shell|maximal-color)-[a-z0-9-]+)\s*:/gm),
      ...source.matchAll(/\bstyle\.setProperty\(\s*['"](--shell-[a-z0-9-]+)['"]/g),
    ].map((match) => match[1] ?? ''),
    ...Object.keys(palette.light),
    ...Object.keys(palette.dark),
  ])
}

interface Rgb {
  red: number
  green: number
  blue: number
}

/* The default theme's values in one mode: theme.ts aliases over the generated palette. */
function themeValues(mode: 'light' | 'dark'): Map<string, string> {
  const source = readFileSync(resolve(import.meta.dirname, 'theme.ts'), 'utf8')
  const values = new Map<string, string>(Object.entries(paletteTokens(DEFAULT_APPEARANCE.colors)[mode]))
  for (const match of source.matchAll(
    /^\s*(--(?:shell|maximal-color)-[a-z0-9-]+)\s*:\s*([^;]+);/gm,
  )) {
    const name = match[1] ?? ''
    if (!values.has(name)) values.set(name, (match[2] ?? '').trim())
  }
  // Follow `var(--x)` aliases, which is how the palette derives its roles.
  const resolved = new Map<string, string>()
  for (const [name, value] of values) {
    let current = value
    for (let depth = 0; depth < 8; depth += 1) {
      const alias = /^var\((--[a-z0-9-]+)\)$/.exec(current)?.[1]
      const next = alias === undefined ? undefined : values.get(alias)
      if (next === undefined) break
      current = next
    }
    resolved.set(name, current)
  }
  return resolved
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

function blend(foreground: Rgb, background: Rgb, alpha: number): Rgb {
  const channel = (front: number, behind: number) =>
    Math.round(front * alpha + behind * (1 - alpha))
  return {
    red: channel(foreground.red, background.red),
    green: channel(foreground.green, background.green),
    blue: channel(foreground.blue, background.blue),
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

describe('the @maximal/maximal-electron shell variable contract', () => {
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

describe.each(['light', 'dark'] as const)('switch non-text contrast in %s mode', (mode) => {
  it('keeps both states and their boundaries above 3:1 on the canvas', () => {
    const values = themeValues(mode)
    const value = (name: string) => {
      const found = values.get(name)
      if (found === undefined) throw new Error(`${name} is not defined by the theme`)
      return found
    }
    const canvas = hex(value('--maximal-color-bg-secondary'))
    const offTrack = blend(hex(value('--maximal-color-text-secondary')), canvas, 0.2)
    const accent = hex(value('--maximal-color-bg-brand'))

    const relationships = [
      ['off track boundary', hex(value('--maximal-color-text-secondary')), canvas],
      ['off thumb', hex(value('--maximal-color-text-default')), offTrack],
      ['on track', accent, canvas],
      ['on thumb', hex(value('--maximal-color-text-onbrand')), accent],
      ['on and off states', accent, offTrack],
    ] as const

    for (const [name, foreground, background] of relationships) {
      expect(contrast(foreground, background), name).toBeGreaterThanOrEqual(3)
    }
  })
})

describe.each(['light', 'dark'] as const)('default theme contrast in %s mode', (mode) => {
  it('keeps secondary text and strong boundaries comfortably distinguishable', () => {
    const values = themeValues(mode)
    const value = (name: string) => {
      const found = values.get(name)
      if (found === undefined) throw new Error(`${name} is not defined by the theme`)
      return found
    }

    expect(
      contrast(hex(value('--maximal-color-text-secondary')), hex(value('--maximal-color-bg-default'))),
      'muted text',
    ).toBeGreaterThanOrEqual(7)
    expect(
      contrast(hex(value('--maximal-color-text-tertiary')), hex(value('--maximal-color-bg-default'))),
      'subtle text',
    ).toBeGreaterThanOrEqual(7)
    expect(
      contrast(hex(value('--maximal-color-border-strong')), hex(value('--maximal-color-bg-secondary'))),
      'strong control boundary',
    ).toBeGreaterThanOrEqual(3)
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

  return walk(import.meta.dirname, [])
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
