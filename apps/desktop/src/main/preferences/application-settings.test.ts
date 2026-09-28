import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { loadApplicationSettings } from './application-settings'

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
      terminalTmuxStatus: 'inherit',
    })
    expect(snapshot.origins.agentTools).toBe('MAXIMAL_AGENT_TOOLS')
    expect(snapshot.origins.agentApproval).toBe('cli')
    expect(snapshot.origins.terminalTmuxStatus).toBe('MAXIMAL_TERMINAL_TMUX_STATUS')
    expect(snapshot.files).toEqual([])
  })

  it('does not expose the fixed terminal identity as an application setting', async () => {
    const directory = await fixture()
    await writeFile(join(directory, 'preferences.json'), JSON.stringify({
      terminalSessionPrefix: 'legacy',
    }))
    const snapshot = loadApplicationSettings(directory, {
      homeDirectory: directory,
      cwd: directory,
      environment: { MAXIMAL_TERMINAL_SESSION_PREFIX: 'override' },
      argv: [],
    })

    expect('terminalSessionPrefix' in snapshot.settings).toBe(false)
    expect('terminalSessionPrefix' in snapshot.origins).toBe(false)
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
