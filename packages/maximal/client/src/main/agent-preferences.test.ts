import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { loadAgentPreferences } from './agent-preferences'
import { loadApplicationSettings } from './application-settings'

const directories: string[] = []

async function fixture(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'maximal-agent-preferences-'))
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

describe('loadAgentPreferences', () => {
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
      environment: { MAXIMAL_AGENT_TOOLS: 'false', MAXIMAL_TERMINAL_DIAGNOSTICS: 'true' },
      argv: ['--setting=agentApproval=all'],
    })
    expect(snapshot.settings).toMatchObject({ agentTools: false, agentApproval: 'all', terminalDiagnostics: true })
    expect(snapshot.origins.agentTools).toBe('MAXIMAL_AGENT_TOOLS')
    expect(snapshot.origins.agentApproval).toBe('cli')
    expect(snapshot.files).toEqual([])
  })
  it('uses the existing safe defaults when no preference file exists', async () => {
    const directory = await fixture()

    expect(loadAgentPreferences(directory)).toEqual({
      approval: 'writes',
      codingTools: true,
      cwd: homedir(),
      toolsetIds: ['app'],
    })
  })

  it('preserves the extracted harness policy preferences', async () => {
    const directory = await fixture()
    await writeFile(
      join(directory, 'preferences.json'),
      JSON.stringify({
        agentApproval: 'all',
        agentCwd: '/workspace/project',
        agentTools: false,
        agentToolsets: ['app', 'github', 3],
        menuBarOnly: true,
      }),
    )

    expect(loadAgentPreferences(directory)).toEqual({
      approval: 'all',
      codingTools: false,
      cwd: '/workspace/project',
      toolsetIds: ['app', 'github'],
    })
  })

  it('fails closed to safe policy values for malformed preferences', async () => {
    const directory = await fixture()
    await writeFile(
      join(directory, 'preferences.json'),
      JSON.stringify({
        agentApproval: 'invalid',
        agentCwd: 42,
        agentTools: 'yes',
        agentToolsets: 'all',
      }),
    )

    expect(loadAgentPreferences(directory)).toEqual({
      approval: 'writes',
      codingTools: true,
      cwd: homedir(),
      toolsetIds: ['app'],
    })
  })
})
