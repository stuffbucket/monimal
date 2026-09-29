import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  developmentCredentialHome,
  developmentUserDataPath,
} from './development-profile'

describe('development profile paths', () => {
  it('keeps repeated launches from one worktree in one profile', () => {
    const first = developmentUserDataPath('/profiles/Maximal', '/worktrees/feature/apps/desktop', undefined)
    const second = developmentUserDataPath('/profiles/Maximal', '/worktrees/feature/apps/desktop', undefined)

    expect(first).toBe(second)
    expect(first).toMatch(/^\/profiles\/Maximal-[0-9a-f]{8}$/u)
  })

  it('isolates different worktrees', () => {
    expect(
      developmentUserDataPath('/profiles/Maximal', '/worktrees/one/apps/desktop', undefined),
    ).not.toBe(
      developmentUserDataPath('/profiles/Maximal', '/worktrees/two/apps/desktop', undefined),
    )
  })

  it('accepts a stable explicit profile name and rejects paths', () => {
    expect(
      developmentUserDataPath('/profiles/Maximal', '/worktrees/one', 'shared-ui'),
    ).toBe('/profiles/Maximal-shared-ui')
    expect(() =>
      developmentUserDataPath('/profiles/Maximal', '/worktrees/one', '../shared'),
    ).toThrow('MAXIMAL_DEV_PROFILE')
  })

  it('shares one credential home outside worktree profiles', () => {
    expect(developmentCredentialHome('/profiles')).toBe(
      join('/profiles', 'Maximal-development-credentials'),
    )
  })
})
