import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { RootScanResult } from '@maximal/project-catalog'

import { DesktopProjectCatalog } from './project-catalog'

let catalog: DesktopProjectCatalog | undefined

afterEach(() => {
  catalog?.close()
  catalog = undefined
})

describe('DesktopProjectCatalog', () => {
  it('persists discovered projects and applies explicit subtree trust', async () => {
    const userData = await mkdtemp(join(tmpdir(), 'desktop-project-catalog-'))
    const rootPath = join(userData, 'workspace')
    const childPath = join(rootPath, 'application')
    await mkdir(childPath, { recursive: true })
    await writeFile(join(childPath, 'package.json'), '{}')
    catalog = await DesktopProjectCatalog.open(userData)

    const root = catalog.addRoot(rootPath)
    await catalog.refresh(root.id)

    expect(catalog.projects().map(({ path, trusted }) => ({ path, trusted }))).toEqual([
      { path: childPath, trusted: false },
      { path: rootPath, trusted: false },
    ])

    catalog.updateRoot(root.id, { trusted: true })
    expect(catalog.projects().map(({ path, trusted }) => ({ path, trusted }))).toEqual([
      { path: childPath, trusted: false },
      { path: rootPath, trusted: true },
    ])

    catalog.updateRoot(root.id, { trustSubtrees: true })
    expect(catalog.projects().every(({ trusted }) => trusted)).toBe(true)
    expect(catalog.isTrustedPath(childPath)).toBe(true)
    expect(catalog.isTrustedPath(join(rootPath, 'unknown'))).toBe(false)
  })

  it('retains last-known projects after partial or failed scans and removes them after a complete scan', async () => {
    const userData = await mkdtemp(join(tmpdir(), 'desktop-project-catalog-'))
    const rootPath = join(userData, 'workspace')
    const projectPath = join(rootPath, 'application')
    const project = {
      path: projectPath,
      canonicalPath: projectPath,
      name: 'application',
      kind: 'folder' as const,
      availability: 'available' as const,
      remotes: [],
      markers: ['package.json'],
    }
    const outcomes: Array<RootScanResult | Error> = [
      { projects: [project], issues: [], state: 'complete', visitedEntries: 2 },
      {
        projects: [],
        issues: [{
          path: rootPath,
          operation: 'read',
          code: 'EACCES',
          message: 'denied',
        }],
        state: 'partial',
        visitedEntries: 1,
      },
      new Error('scanner failed'),
      { projects: [], issues: [], state: 'complete', visitedEntries: 1 },
    ]
    catalog = await DesktopProjectCatalog.open(userData, async () => {
      const outcome = outcomes.shift()
      if (outcome instanceof Error) throw outcome
      if (!outcome) throw new Error('Unexpected scan')
      return outcome
    })
    const root = catalog.addRoot(rootPath)

    await catalog.refresh(root.id)
    expect(catalog.projects()).toHaveLength(1)
    await catalog.refresh(root.id)
    expect(catalog.projects()).toHaveLength(1)
    await expect(catalog.refresh(root.id)).rejects.toThrow('scanner failed')
    expect(catalog.projects()).toHaveLength(1)
    await catalog.refresh(root.id)
    expect(catalog.projects()).toHaveLength(0)
  })

  it('removes only projects no longer sourced by another root', async () => {
    const userData = await mkdtemp(join(tmpdir(), 'desktop-project-catalog-'))
    const sharedPath = join(userData, 'shared')
    catalog = await DesktopProjectCatalog.open(userData, async (path) => ({
      projects: [{
        path: sharedPath,
        canonicalPath: sharedPath,
        name: 'shared',
        kind: 'folder',
        availability: 'available',
        remotes: [],
        markers: [],
      }],
      issues: [],
      state: 'complete',
      visitedEntries: path.length,
    }))
    const first = catalog.addRoot(join(userData, 'first'))
    const second = catalog.addRoot(join(userData, 'second'))
    await catalog.refresh()

    catalog.removeRoot(first.id)
    expect(catalog.projects()).toHaveLength(1)
    catalog.removeRoot(second.id)
    expect(catalog.projects()).toHaveLength(0)
  })
})
