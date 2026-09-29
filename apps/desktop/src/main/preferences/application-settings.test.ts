import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  loadApplicationSettings,
  setBackgroundEffectsEnabled,
  setReducedMotionEnabled,
  setVibrancyEnabled,
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

    await writeFile(
      join(directory, 'preferences.json'),
      JSON.stringify({ vibrancyEnabled: true }),
    )

    expect(loadApplicationSettings(directory, context).settings.vibrancyEnabled)
      .toBe(true)
  })

  it('persists vibrancy changes in the user settings layer', async () => {
    const directory = await fixture()

    await setVibrancyEnabled(directory, true)
    await setBackgroundEffectsEnabled(directory, true)
    await setReducedMotionEnabled(directory, true)
    expect(loadApplicationSettings(directory).settings).toMatchObject({
      vibrancyEnabled: true,
      backgroundEffectsEnabled: true,
      reducedMotionEnabled: true,
    })

    await setVibrancyEnabled(directory, false)
    expect(loadApplicationSettings(directory).settings.vibrancyEnabled)
      .toBe(false)
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
})
