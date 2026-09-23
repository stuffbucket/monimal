import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { missingArtifacts, relativeImports } from '../scripts/verify-exports.mjs'

let temporaryRoot: string | undefined

afterEach(async () => {
  if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true })
  temporaryRoot = undefined
})

describe('export artifacts', () => {
  it('keeps workspace builds non-destructive and verifies their output', () => {
    const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      scripts: Record<string, string>
    }

    expect(manifest.scripts.build).not.toContain('--clean')
    expect(manifest.scripts.build).toContain('node scripts/verify-exports.mjs')
  })

  it('reads generated relative imports', () => {
    expect(relativeImports(`import './side.js'; export { value } from "../chunk.js";`))
      .toEqual(['./side.js', '../chunk.js'])
  })

  it('reports a missing generated chunk behind an existing export', async () => {
    temporaryRoot = await mkdtemp(path.join(tmpdir(), 'maximal-harness-exports-'))
    mkdirSync(path.join(temporaryRoot, 'dist'), { recursive: true })
    writeFileSync(path.join(temporaryRoot, 'dist/index.js'), `export { value } from './chunk.js';`)

    expect(missingArtifacts(temporaryRoot, { '.': './dist/index.js' }))
      .toEqual(['dist/chunk.js'])
  })
})