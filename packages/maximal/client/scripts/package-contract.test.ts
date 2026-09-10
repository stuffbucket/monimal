import { describe, expect, it } from 'vitest'

import { externalClosure, platformPackagePlan } from './package-contract.mjs'

const keeps = <T extends { keep: boolean }>(plan: T[]) => plan.filter((entry) => entry.keep)

describe('platform package selection', () => {
  const darwinArm = {
    path: 'node_modules/@reflink/reflink-darwin-arm64',
    os: ['darwin'],
    cpu: ['arm64'],
  }

  it('drops packages that cannot run on the target', () => {
    const [decision] = platformPackagePlan([darwinArm], 'win32', 'x64')
    expect(decision).toMatchObject({ keep: false, reason: 'declares os darwin, not win32' })
  })

  it('keeps either architecture needed by a universal build', () => {
    const darwinX64 = {
      path: 'node_modules/@reflink/reflink-darwin-x64',
      os: ['darwin'],
      cpu: ['x64'],
    }
    expect(
      keeps(platformPackagePlan([darwinArm, darwinX64], 'darwin', 'universal')).map(
        (entry) => entry.path,
      ),
    ).toEqual([darwinArm.path, darwinX64.path])
  })

  it('honors npm exclusion lists', () => {
    const [kept] = platformPackagePlan(
      [{ path: 'node_modules/example', os: ['!win32'] }],
      'linux',
      'x64',
    )
    const [dropped] = platformPackagePlan(
      [{ path: 'node_modules/example', os: ['!win32'] }],
      'win32',
      'x64',
    )
    expect(kept?.keep).toBe(true)
    expect(dropped?.keep).toBe(false)
  })
})

type Package = {
  dependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
}

function fakeIo(tree: Record<string, Package>, links: Record<string, string> = {}) {
  const realpath = (target: string) => {
    let current = target
    for (let step = 0; step < 16; step += 1) {
      const hit = Object.entries(links).find(
        ([link]) => current === link || current.startsWith(`${link}/`),
      )
      if (!hit) return current
      current = hit[1] + current.slice(hit[0].length)
    }
    return current
  }

  return {
    sep: '/',
    basename: (target: string) => target.split('/').filter(Boolean).at(-1) ?? '',
    realpath,
    join: (...parts: string[]) => {
      const output: string[] = []
      for (const part of parts.join('/').split('/')) {
        if (!part || part === '.') continue
        if (part === '..') output.pop()
        else output.push(part)
      }
      return `/${output.join('/')}`
    },
    readPackageJson: (dir: string) => tree[realpath(dir)],
  }
}

describe('external native dependency closure', () => {
  it('follows pnpm links and installed optional prebuilds', () => {
    const store = '/ws/node_modules/.pnpm/node-llama-cpp@3/node_modules'
    const io = fakeIo(
      {
        [`${store}/node-llama-cpp`]: {
          dependencies: { 'fs-extra': '^11' },
          optionalDependencies: {
            '@node-llama-cpp/mac-arm64-metal': '^3',
            '@node-llama-cpp/win-x64': '^3',
          },
        },
        [`${store}/fs-extra`]: {},
        [`${store}/@node-llama-cpp/mac-arm64-metal`]: {},
      },
      { '/ws/app/node_modules/node-llama-cpp': `${store}/node-llama-cpp` },
    )

    expect(
      externalClosure(io, '/ws/app/node_modules', ['node-llama-cpp'], { boundary: '/ws' }).map(
        (entry) => entry.name,
      ),
    ).toEqual(['@node-llama-cpp/mac-arm64-metal', 'fs-extra'])
  })

  it('nests conflicting versions instead of flattening them', () => {
    const io = fakeIo({
      '/ws/app/node_modules/root': { dependencies: { alpha: '^1', beta: '^1' } },
      '/ws/app/node_modules/alpha': { dependencies: { shared: '^1' } },
      '/ws/app/node_modules/alpha/node_modules/shared': {},
      '/ws/app/node_modules/beta': { dependencies: { shared: '^2' } },
      '/ws/app/node_modules/beta/node_modules/shared': {},
    })

    const shared = externalClosure(io, '/ws/app/node_modules', ['root'], {
      boundary: '/ws',
    }).filter((entry) => entry.name === 'shared')
    expect(shared).toHaveLength(2)
    expect(shared.some((entry) => entry.path === 'node_modules/shared')).toBe(true)
    expect(shared.some((entry) => entry.path.includes('/node_modules/shared'))).toBe(true)
  })

  it('throws when a required dependency cannot resolve', () => {
    const io = fakeIo({
      '/ws/app/node_modules/node-pty': { dependencies: { 'node-addon-api': '^8' } },
    })
    expect(() =>
      externalClosure(io, '/ws/app/node_modules', ['node-pty'], { boundary: '/ws' }),
    ).toThrow(/node-pty depends on node-addon-api/)
  })
})
