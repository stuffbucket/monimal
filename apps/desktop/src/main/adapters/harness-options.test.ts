import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { loadHarnessOptions } from './harness-options'

const directories: string[] = []

function isolatedContext(directory: string) {
  return {
    argv: [],
    cwd: directory,
    environment: { XDG_CONFIG_HOME: directory },
    homeDirectory: homedir(),
  }
}

async function fixture(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'maximal-harness-options-'))
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

describe('loadHarnessOptions', () => {
  it('uses the existing safe defaults when no preference file exists', async () => {
    const directory = await fixture()

    expect(loadHarnessOptions(directory, isolatedContext(directory))).toEqual({
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
        agentModel: 'embedded:tiny.gguf',
        agentTools: false,
        agentToolsets: ['app', 'github', 3],
        menuBarOnly: true,
      }),
    )

    expect(loadHarnessOptions(directory, isolatedContext(directory))).toEqual({
      approval: 'all',
      codingTools: false,
      cwd: '/workspace/project',
      preferredModel: 'embedded:tiny.gguf',
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

    expect(loadHarnessOptions(directory, isolatedContext(directory))).toEqual({
      approval: 'writes',
      codingTools: true,
      cwd: homedir(),
      toolsetIds: ['app'],
    })
  })
})
