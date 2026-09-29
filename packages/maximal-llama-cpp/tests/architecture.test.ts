import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const packageRoot = path.resolve(import.meta.dirname, '..')

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(file)
    return entry.name.endsWith('.ts') ? [file] : []
  })
}

describe('standalone package boundary', () => {
  it('owns its native runtime dependency without Maximal runtime dependencies', () => {
    const manifest = JSON.parse(
      readFileSync(path.join(packageRoot, 'package.json'), 'utf8'),
    ) as {
      dependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
      private?: boolean
      publishConfig?: { access?: string }
    }

    expect(manifest.private).not.toBe(true)
    expect(manifest.publishConfig?.access).toBe('public')
    expect(manifest.dependencies).toEqual({ 'node-llama-cpp': '3.20.0' })
    expect(manifest.peerDependencies).toEqual({ electron: '>=30.0.0' })
  })

  it('does not import another Maximal package', () => {
    const imports = sourceFiles(path.join(packageRoot, 'src')).flatMap((file) => {
      const source = readFileSync(file, 'utf8')
      return [...source.matchAll(/from\s+['"](@maximal\/[^'"]+)['"]/gu)].map(
        (match) => match[1],
      )
    })

    expect(imports).toEqual([])
  })

  it('loads node-llama-cpp only from the worker entry', () => {
    const imports = sourceFiles(path.join(packageRoot, 'src'))
      .filter((file) => readFileSync(file, 'utf8').includes("esmImport('node-llama-cpp')"))
      .map((file) => path.relative(packageRoot, file))

    expect(imports).toEqual([path.join('src', 'worker', 'index.ts')])
  })
})
