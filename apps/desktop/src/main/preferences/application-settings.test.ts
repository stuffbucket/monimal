import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_TERMINAL_PALETTE_SETTINGS } from '@maximal/maximal-terminal/renderer'

import {
  loadApplicationSettings,
  setBackgroundEffectsEnabled,
  setMaterialPreference,
  setReducedMotionEnabled,
  setVibrancyEnabled,
  setTerminalTypography,
  setWorkbarLayout,
  workbarLayoutSchema,
} from './application-settings'

const directories: string[] = []

async function fixture(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'maximal-application-settings-'))
  directories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  )
})

describe('loadApplicationSettings', () => {
  it('does not adopt project approval policy without explicit workspace trust', async () => {
    const directory = await fixture()
    await mkdir(join(directory, '.maximal'))
    await writeFile(join(directory, '.maximal', 'settings.json'), JSON.stringify({ agentApproval: 'none' }))
    const context = { cwd: directory, homeDirectory: directory, environment: {}, argv: [] }
    expect(loadApplicationSettings(directory, context).settings.agentApproval).toBe('writes')
    expect(loadApplicationSettings(directory, { ...context, projectTrusted: true }).settings.agentApproval).toBe('none')
  })

  it('layers canonical environment and CLI values without saving them', async () => {
    const directory = await fixture()
    const snapshot = loadApplicationSettings(directory, {
      homeDirectory: directory, cwd: directory,
      environment: {
        MAXIMAL_AGENT_TOOLS: 'false',
        MAXIMAL_TERMINAL_DIAGNOSTICS: 'true',
        MAXIMAL_TERMINAL_TMUX_STATUS: 'inherit',
      },
      argv: ['--setting=agentApproval=all'],
    })
    expect(snapshot.settings).toMatchObject({
      agentTools: false,
      agentApproval: 'all',
      terminalDiagnostics: true,
      terminalSessionPrefix: 'maximal',
      terminalTmuxStatus: 'inherit',
    })
    expect(snapshot.origins.agentTools).toBe('MAXIMAL_AGENT_TOOLS')
    expect(snapshot.origins.agentApproval).toBe('cli')
    expect(snapshot.origins.terminalTmuxStatus).toBe('MAXIMAL_TERMINAL_TMUX_STATUS')
    expect(snapshot.files).toEqual([])
  })

  it('names tmux sessions from a setting, keeping the default when the legacy value is unusable', async () => {
    const directory = await fixture()
    await writeFile(join(directory, 'preferences.json'), JSON.stringify({ terminalSessionPrefix: 'bad prefix' }))
    const context = { homeDirectory: directory, cwd: directory, argv: [] }
    expect(loadApplicationSettings(directory, { ...context, environment: {} }).settings.terminalSessionPrefix)
      .toBe('maximal')
    expect(loadApplicationSettings(directory, {
      ...context, environment: { MAXIMAL_TERMINAL_SESSION_PREFIX: 'work' },
    }).settings.terminalSessionPrefix).toBe('work')
  })

  it('loads the preferred agent model from application settings', async () => {
    const directory = await fixture()
    await writeFile(
      join(directory, 'preferences.json'),
      JSON.stringify({ agentModel: 'embedded:tiny.gguf' }),
    )
    const context = {
      homeDirectory: directory,
      cwd: directory,
      environment: {},
      argv: [],
    }

    expect(loadApplicationSettings(directory, context).settings.agentModel)
      .toBe('embedded:tiny.gguf')
  })

  it('loads vibrancy disabled by default and migrates a saved preference', async () => {
    const directory = await fixture()
    const context = {
      homeDirectory: directory,
      cwd: directory,
      environment: {},
      argv: [],
    }

    expect(loadApplicationSettings(directory, context).settings.vibrancyEnabled)
      .toBe(false)
    expect(loadApplicationSettings(directory, context).settings.backgroundEffectsEnabled)
      .toBe(false)
    expect(loadApplicationSettings(directory, context).settings.reducedMotionEnabled)
      .toBe(false)
    expect(loadApplicationSettings(directory, context).settings)
      .toMatchObject({
        materialPreset: 'clouds',
        materialQuality: 'balanced',
        materialLighting: 'fixed',
      })

    await writeFile(
      join(directory, 'preferences.json'),
      JSON.stringify({ vibrancyEnabled: true }),
    )

    expect(loadApplicationSettings(directory, context).settings.vibrancyEnabled)
      .toBe(true)
  })

  it('persists vibrancy changes in the user settings layer', async () => {
    const directory = await fixture()
    const material = {
      preset: 'water',
      quality: 'high',
      strength: 1,
      motion: 0.25,
      lighting: 'timezone',
      timezone: 'America/Los_Angeles',
    } as const

    await setVibrancyEnabled(directory, true)
    await setBackgroundEffectsEnabled(directory, true)
    await setReducedMotionEnabled(directory, true)
    await expect(setMaterialPreference(directory, material))
      .resolves.toEqual(material)
    expect(loadApplicationSettings(directory).settings).toMatchObject({
      vibrancyEnabled: true,
      backgroundEffectsEnabled: true,
      reducedMotionEnabled: true,
      materialPreset: 'water',
      materialQuality: 'high',
      materialStrength: 1,
      materialMotion: 0.25,
      materialLighting: 'timezone',
      materialTimezone: 'America/Los_Angeles',
    })
    await expect(setMaterialPreference(directory, {
      ...material,
      strength: 2,
    })).rejects.toThrow()
    await expect(setMaterialPreference(directory, {
      ...material,
      timezone: 'Invalid/Timezone',
    })).rejects.toThrow()

    await setVibrancyEnabled(directory, false)
    expect(loadApplicationSettings(directory).settings.vibrancyEnabled)
      .toBe(false)
  })

  it('validates terminal typography from legacy preferences', async () => {
    const directory = await fixture()
    await writeFile(
      join(directory, 'preferences.json'),
      JSON.stringify({
        terminalTypography: {
          fontFamily: 'JetBrainsMono Nerd Font',
          fontSize: 14.25,
          fontWeight: 550,
          fontVariations: {},
          cellHeight: 10,
          tracking: 0,
          baseline: 0,
          thicken: false,
          thickenStrength: 50,
          ligatures: false,
        },
      }),
    )
    const context = {
      homeDirectory: directory,
      cwd: directory,
      environment: {},
      argv: [],
    }

    expect(loadApplicationSettings(directory, context).settings.terminalTypography)
      .toEqual({
        fontFamily: 'JetBrainsMono Nerd Font',
        fontSize: 14.25,
        fontWeight: 550,
        fontVariations: {},
        cellHeight: 10,
        tracking: 0,
        baseline: 0,
        thicken: false,
        thickenStrength: 0,
        ligatures: false,
        fontFeatures: {},
        palette: DEFAULT_TERMINAL_PALETTE_SETTINGS,
      })

    await writeFile(
      join(directory, 'preferences.json'),
      JSON.stringify({ terminalTypography: { fontSize: 0 } }),
    )
    expect(loadApplicationSettings(directory, context).settings.terminalTypography)
      .toEqual({
        fontFamily: 'ui-monospace',
        fontSize: 13,
        fontWeight: 400,
        fontVariations: {},
        cellHeight: 0,
        tracking: 0,
        baseline: 0,
        thicken: false,
        thickenStrength: 0,
        ligatures: true,
        fontFeatures: {},
        palette: DEFAULT_TERMINAL_PALETTE_SETTINGS,
      })
  })

  it('rejects tmux shell text instead of treating it as a status policy', async () => {
    const directory = await fixture()

    expect(() => loadApplicationSettings(directory, {
      homeDirectory: directory,
      cwd: directory,
      environment: { MAXIMAL_TERMINAL_TMUX_STATUS: 'off; run-shell bad' },
      argv: [],
    })).toThrow(/MAXIMAL_TERMINAL_TMUX_STATUS/)
  })

  it('persists terminal typography through the application settings store', async () => {
    const directory = await fixture()
    const settings = {
      fontFamily: 'Hack Nerd Font Mono',
      fontSize: 15,
      fontWeight: 525,
      fontVariations: { GRAD: 50 },
      cellHeight: 10.1,
      tracking: 5.2,
      baseline: -10.3,
      thicken: true,
      thickenStrength: 75,
      ligatures: false,
      fontFeatures: { calt: false, liga: false, zero: true },
      palette: DEFAULT_TERMINAL_PALETTE_SETTINGS,
    }

    await expect(setTerminalTypography(directory, settings)).resolves.toEqual(settings)
    await expect(setTerminalTypography(directory, {
      ...settings,
      fontSize: 16.25,
    })).resolves.toMatchObject({ fontSize: 16.25 })
    await expect(setTerminalTypography(directory, {
      ...settings,
      fontWeight: 50,
    })).resolves.toMatchObject({ fontWeight: 50 })
    await expect(setTerminalTypography(directory, {
      ...settings,
      fontWeight: 1000,
    })).resolves.toMatchObject({ fontWeight: 1000 })
    await expect(setTerminalTypography(directory, {
      ...settings,
      fontWeight: 512,
    })).rejects.toThrow()
    await expect(setTerminalTypography(directory, {
      ...settings,
      fontWeight: 25,
    })).rejects.toThrow()
    await expect(setTerminalTypography(directory, {
      ...settings,
      fontWeight: 1025,
    })).rejects.toThrow()
    await expect(setTerminalTypography(directory, {
      ...settings,
      fontVariations: { invalid: 1 },
    })).rejects.toThrow()
    await expect(setTerminalTypography(directory, {
      ...settings,
      tracking: 5.25,
    })).rejects.toThrow()
    await expect(setTerminalTypography(directory, {
      ...settings,
      palette: {
        ...settings.palette,
        dark: { ...settings.palette.dark, background: 'black' },
      },
    })).rejects.toThrow()
    await expect(setTerminalTypography(directory, {
      ...settings,
      palette: {
        ...settings.palette,
        effects: { ...settings.palette.effects, opacity: 1.1 },
      },
    })).rejects.toThrow()
  })

  it('persists and validates workbar layout through the application settings store', async () => {
    const directory = await fixture()
    const layout = {
      order: ['projects', 'home', 'overview', 'traffic', 'terminals', 'browsers'] as const,
      visible: ['projects', 'home', 'terminals'] as const,
    }

    await expect(setWorkbarLayout(directory, {
      order: [...layout.order],
      visible: [...layout.visible],
    })).resolves.toEqual(layout)
    expect(loadApplicationSettings(directory).settings.workbarLayout).toEqual(layout)
    await expect(setWorkbarLayout(directory, {
      order: ['home', 'home', 'overview', 'traffic', 'terminals', 'browsers'],
      visible: ['home'],
    })).rejects.toThrow()
  })

  it('normalizes stale persisted workbar layouts without losing user order', () => {
    expect(workbarLayoutSchema.parse({
      order: ['projects', 'removed', 'projects', 'home'],
      visible: ['projects', 'removed', 'projects'],
    })).toEqual({
      order: ['projects', 'home', 'overview', 'traffic', 'terminals', 'browsers'],
      visible: ['projects'],
    })
  })
})
