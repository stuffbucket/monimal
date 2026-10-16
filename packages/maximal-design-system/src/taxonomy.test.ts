import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sourceRoot = new URL('./', import.meta.url)
const sourceFiles = readdirSync(sourceRoot, {
  encoding: 'utf8',
  recursive: true,
})

describe('source taxonomy', () => {
  it('keeps Storybook modules outside runtime source', () => {
    expect(sourceFiles.filter((file) => file.endsWith('.stories.tsx'))).toEqual([])
  })

  it('uses index modules only as barrels', () => {
    const indexFiles = sourceFiles.filter((file) => file.endsWith('index.ts'))

    expect(indexFiles.length).toBeGreaterThan(0)
    for (const file of indexFiles) {
      const statements = readFileSync(new URL(file, sourceRoot), 'utf8')
        .split('\n')
        .filter(Boolean)

      expect(
        statements.every((statement) => /^export \* from '.+'$/.test(statement)),
        `${file} must contain only barrel exports`,
      ).toBe(true)
    }
  })
})
