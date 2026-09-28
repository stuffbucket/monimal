import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { LLAMA_CONFIG } from '../src/constants.js'
import {
  configureModel,
  listEmbeddedModels,
  modelPath,
  selectEmbeddedModel,
} from '../src/host/llama.js'

const directories: string[] = []
const originalOverride = process.env.STUFFBUCKET_MODEL_PATH

async function modelsDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'maximal-llama-models-'))
  directories.push(directory)
  configureModel({ directory })
  delete process.env.STUFFBUCKET_MODEL_PATH
  return directory
}

afterEach(async () => {
  if (originalOverride === undefined) delete process.env.STUFFBUCKET_MODEL_PATH
  else process.env.STUFFBUCKET_MODEL_PATH = originalOverride
  await Promise.all(
    directories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  )
})

describe('embedded model inventory', () => {
  it('lists downloaded GGUF files and selects one by exact file name', async () => {
    const directory = await modelsDirectory()
    await Promise.all([
      writeFile(path.join(directory, 'zeta.gguf'), 'z'),
      writeFile(path.join(directory, 'Alpha.GGUF'), 'a'),
      writeFile(path.join(directory, 'notes.txt'), 'ignored'),
    ])

    expect(listEmbeddedModels()).toEqual([
      { fileName: 'Alpha.GGUF', label: 'Alpha' },
      { fileName: 'zeta.gguf', label: 'zeta' },
    ])

    selectEmbeddedModel('zeta.gguf')
    expect(modelPath()).toBe(path.join(directory, 'zeta.gguf'))
  })

  it('rejects a model that is not in the configured directory', async () => {
    await modelsDirectory()

    expect(() => selectEmbeddedModel('../outside.gguf')).toThrow(
      'Local model "../outside.gguf" is not available.',
    )
  })

  it('uses an explicit support override as the only available model', async () => {
    const directory = await modelsDirectory()
    const override = path.join(directory, 'support.gguf')
    await writeFile(override, 'model')
    process.env.STUFFBUCKET_MODEL_PATH = override

    expect(listEmbeddedModels()).toEqual([
      { fileName: 'support.gguf', label: 'support' },
    ])
    expect(modelPath()).toBe(override)
  })

  it('uses the small-model 8k context budget', () => {
    expect(LLAMA_CONFIG.model.contextSize).toBe(8_192)
  })
})
