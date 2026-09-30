import { execFile } from 'node:child_process'
import { access } from 'node:fs/promises'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'

import type {
  TerminalFontAxis,
  TerminalFontCatalog,
} from '@maximal/maximal-client/shared/host'

import { NERD_FONT_ASSETS } from './nerd-font-catalog.js'
import { discoverFontVariationAxes } from './font-variations.js'

interface Dependencies {
  platform: NodeJS.Platform
  environment: NodeJS.ProcessEnv
  home: string
  access(path: string): Promise<void>
  execFile(file: string, args: string[]): Promise<string>
  discoverAxes(families: readonly string[]): Promise<Record<string, TerminalFontAxis[]>>
}

function execute(file: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, timeout: 20_000 },
      (error, stdout) => {
        if (error) reject(new Error(`Failed to execute ${file}`, { cause: error }))
        else resolve(stdout)
      },
    )
  })
}

const defaults: Dependencies = {
  platform: process.platform,
  environment: process.env,
  home: homedir(),
  access,
  execFile: execute,
  discoverAxes: discoverFontVariationAxes,
}

export function parseGhosttyNerdFonts(stdout: string): string[] {
  return parseGhosttyNerdFontCatalog(stdout).fonts
}

const NERD_FONT_FAMILY =
  /\bNerd Font(?:\s+(?:Mono|Propo))?\b|\bNF(?:\s+(?:Mono|Propo))?\b/iu
const SYSTEM_MONOSPACED_FAMILY =
  /^(?:Andale Mono|Cascadia (?:Code|Mono)|Consolas|Courier Prime|DejaVu Sans Mono|IBM Plex Mono|Liberation Mono|Menlo|Monaco|Noto Sans Mono|SF Mono|Source Code Pro|Ubuntu Mono)$/iu
const FACE_WEIGHTS: Array<[RegExp, number]> = [
  [/\b(?:thin|hairline)\b/iu, 100],
  [/\b(?:extra|ultra)[ -]?light\b/iu, 200],
  [/\blight\b/iu, 300],
  [/\b(?:regular|book|normal)\b/iu, 400],
  [/\bretina\b/iu, 450],
  [/\bmedium\b/iu, 500],
  [/\b(?:semi|demi)[ -]?bold\b/iu, 600],
  [/\b(?:extra|ultra)[ -]?bold\b/iu, 800],
  [/\bbold\b/iu, 700],
  [/\b(?:black|heavy)\b/iu, 900],
]

function faceWeight(face: string): number | undefined {
  return FACE_WEIGHTS.find(([pattern]) => pattern.test(face))?.[1]
}

export function parseGhosttyNerdFontCatalog(stdout: string): {
  fonts: string[]
  fontWeights: Record<string, number[]>
} {
  const weights = new Map<string, Set<number>>()
  let family: string | undefined
  for (const line of stdout.split(/\r?\n/u)) {
    if (line === '') continue
    if (!/^\s/u.test(line)) {
      const candidate = line.trim()
      family = NERD_FONT_FAMILY.test(candidate)
        || SYSTEM_MONOSPACED_FAMILY.test(candidate)
        ? candidate
        : undefined
      if (family !== undefined && !weights.has(family)) {
        weights.set(family, new Set())
      }
      continue
    }
    if (family === undefined) continue
    const weight = faceWeight(line) ?? (
      /\bitalic\b/iu.test(line) ? undefined : 400
    )
    if (weight !== undefined) weights.get(family)?.add(weight)
  }
  const fonts = [...weights.keys()].sort((left, right) =>
    left.localeCompare(right))
  return {
    fonts,
    fontWeights: Object.fromEntries(fonts.map((font) => [
      font,
      [...(weights.get(font) ?? [])].sort((left, right) => left - right),
    ])),
  }
}

function downloadableFonts(
  installedFonts: readonly string[],
  platform: NodeJS.Platform,
) {
  if (platform !== 'darwin') return []
  const installed = new Set(installedFonts)
  return NERD_FONT_ASSETS.map(({
    id,
    label,
    family,
    downloadSize,
    license,
    sourceUrl,
  }) => ({
    id,
    label,
    family,
    downloadSize,
    license,
    sourceUrl,
    installed: installed.has(family),
  }))
}

function executableCandidates(dependencies: Dependencies): string[] {
  const candidates: string[] = []
  if (dependencies.platform === 'darwin') {
    candidates.push(
      '/Applications/Ghostty.app/Contents/MacOS/ghostty',
      join(
        dependencies.home,
        'Applications',
        'Ghostty.app',
        'Contents',
        'MacOS',
        'ghostty',
      ),
    )
  } else if (dependencies.platform === 'linux') {
    candidates.push(
      '/usr/bin/ghostty',
      '/usr/local/bin/ghostty',
      '/opt/ghostty/bin/ghostty',
    )
  }
  for (const directory of (dependencies.environment.PATH ?? '').split(delimiter)) {
    if (directory !== '') candidates.push(join(directory, 'ghostty'))
  }
  return [...new Set(candidates)]
}

export async function listGhosttyNerdFonts(
  overrides: Partial<Dependencies> = {},
): Promise<TerminalFontCatalog> {
  const dependencies = { ...defaults, ...overrides }
  let executable: string | undefined
  for (const candidate of executableCandidates(dependencies)) {
    try {
      await dependencies.access(candidate)
      executable = candidate
      break
    } catch {
      continue
    }

  }
  if (executable === undefined) {
    return {
      status: 'unavailable',
      fonts: [],
      downloads: downloadableFonts([], dependencies.platform),
      message: 'The terminal application is not installed, so its local font catalog is unavailable.',
    }
  }

  try {
    const { fonts, fontWeights } = parseGhosttyNerdFontCatalog(
      await dependencies.execFile(executable, ['+list-fonts']),
    )
    let fontAxes: Record<string, TerminalFontAxis[]> = {}
    let fontAxesMessage: string | undefined
    if (overrides.discoverAxes !== undefined || overrides.execFile === undefined) {
      try {
        fontAxes = await dependencies.discoverAxes(fonts)
      } catch (error) {
        fontAxesMessage = error instanceof Error
          ? `Variable font axes could not be inspected: ${error.message}`
          : 'Variable font axes could not be inspected.'
      }
    }
    return {
      status: 'available',
      fonts,
      fontWeights,
      fontAxes,
      ...(fontAxesMessage === undefined ? {} : { fontAxesMessage }),
      downloads: downloadableFonts(fonts, dependencies.platform),
      ghosttyPath: executable,
    }
  } catch (error) {
    throw new Error('The terminal could not list the fonts installed on this host.', {
      cause: error,
    })
  }
}

export async function waitForGhosttyNerdFont(
  family: string,
  options: {
    attempts?: number
    delay?: (milliseconds: number) => Promise<void>
    list?: () => Promise<TerminalFontCatalog>
  } = {},
): Promise<TerminalFontCatalog> {
  const attempts = options.attempts ?? 20
  const delay = options.delay ?? ((milliseconds: number) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)))
  const list = options.list ?? (() => listGhosttyNerdFonts())
  let catalog = await list()
  for (let attempt = 1; attempt < attempts; attempt += 1) {
    if (catalog.status === 'available' && catalog.fonts.includes(family)) {
      return catalog
    }
    await delay(250)
    catalog = await list()
  }
  return catalog
}
