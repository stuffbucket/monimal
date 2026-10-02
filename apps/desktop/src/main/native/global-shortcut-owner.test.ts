import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { GlobalShortcutOwner } from './global-shortcut-owner'

const directories: string[] = []

function testDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'maximal-shortcut-owner-'))
  directories.push(directory)
  return directory
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('GlobalShortcutOwner', () => {
  it('gives the newest live instance ownership and falls back when it stops', () => {
    const directory = testDirectory()
    const live = new Set([101, 202])
    const first = new GlobalShortcutOwner({
      directory,
      registration: { id: 'first', pid: 101, startedAt: 1 },
      processIsAlive: (pid) => live.has(pid),
    })
    const second = new GlobalShortcutOwner({
      directory,
      registration: { id: 'second', pid: 202, startedAt: 2 },
      processIsAlive: (pid) => live.has(pid),
    })

    first.start()
    expect(first.isOwner()).toBe(true)
    second.start()
    expect(first.isOwner()).toBe(false)
    expect(second.isOwner()).toBe(true)

    second.stop()
    live.delete(202)
    expect(first.isOwner()).toBe(true)
  })

  it('ignores and removes malformed and dead registrations', () => {
    const directory = testDirectory()
    const owner = new GlobalShortcutOwner({
      directory,
      registration: { id: 'current', pid: 101, startedAt: 1 },
      processIsAlive: (pid) => pid === 101,
    })
    owner.start()
    writeFileSync(join(directory, 'invalid.json'), '{')
    writeFileSync(
      join(directory, 'dead.json'),
      JSON.stringify({ id: 'dead', pid: 202, startedAt: 2 }),
    )

    expect(owner.isOwner()).toBe(true)
  })

  it('starts and stops idempotently', () => {
    const owner = new GlobalShortcutOwner({
      directory: testDirectory(),
      registration: { id: 'current', pid: 101, startedAt: 1 },
      processIsAlive: () => true,
    })

    owner.start()
    owner.start()
    expect(owner.isOwner()).toBe(true)
    owner.stop()
    owner.stop()
    expect(owner.isOwner()).toBe(false)
  })
})
