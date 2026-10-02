import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { getPath, handlers } = vi.hoisted(() => ({
  getPath: vi.fn(),
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
}))

vi.mock('electron', () => ({
  app: { getPath },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler)
    }),
  },
}))

import { BRIDGE_CHANNELS } from '../../shared/bridge-channels'
import { registerWorkbarIpc } from './workbar-ipc'

let directory: string

beforeEach(async () => {
  handlers.clear()
  directory = await mkdtemp(join(tmpdir(), 'maximal-workbar-ipc-'))
  getPath.mockReturnValue(directory)
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

describe('registerWorkbarIpc', () => {
  it('loads, persists, and broadcasts validated workbar layouts', async () => {
    const broadcast = vi.fn()
    registerWorkbarIpc(broadcast)
    const get = handlers.get(BRIDGE_CHANNELS.workbarGet)
    const update = handlers.get(BRIDGE_CHANNELS.workbarUpdate)
    const layout = {
      order: ['projects', 'home', 'overview', 'traffic', 'terminals', 'browsers'],
      visible: ['home', 'projects'],
    }

    expect(get?.({})).toMatchObject({
      order: ['home', 'projects', 'overview', 'traffic', 'terminals', 'browsers'],
    })
    await expect(update?.({}, layout)).resolves.toEqual(layout)
    expect(broadcast).toHaveBeenCalledWith(BRIDGE_CHANNELS.workbarChanged, layout)
    expect(get?.({})).toEqual(layout)
    await expect(update?.({}, {
      order: ['home', 'home'],
      visible: ['home'],
    })).rejects.toThrow()
  })
})
