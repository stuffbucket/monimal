import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { loadAgentPreferences } from './agent-preferences'

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
