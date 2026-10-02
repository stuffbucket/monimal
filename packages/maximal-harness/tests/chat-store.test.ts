import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { createAssistantChatStore } from '../src/host/chat-store.js'

const directories: string[] = []

function store() {
  const directory = mkdtempSync(join(tmpdir(), 'maximal-chat-store-'))
  directories.push(directory)
  return createAssistantChatStore(join(directory, 'chats.sqlite'))
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('assistant chat store', () => {
  it('persists messages and searches titles and transcript content', () => {
    const chats = store()
    const alpha = chats.create('Alpha')
    const beta = chats.create('Beta')
    chats.append(alpha.id, 'user', 'Investigate the renderer bridge')
    chats.append(alpha.id, 'assistant', 'Bridge inspected')

    expect(chats.messages(alpha.id).map((message) => message.content)).toEqual([
      'Investigate the renderer bridge',
      'Bridge inspected',
    ])
    expect(chats.list({ search: 'renderer' }).chats.map((chat) => chat.id))
      .toEqual([alpha.id])
    expect(chats.list({ search: 'Beta' }).chats.map((chat) => chat.id))
      .toEqual([beta.id])
    chats.close()
  })

  it('updates status, attention, pinning, and open state', () => {
    const chats = store()
    const created = chats.create('Working chat')
    const changed = chats.update(created.id, {
      title: 'Renamed',
      status: 'archived',
      attention: 'notification',
      pinned: true,
    })

    expect(changed).toMatchObject({
      title: 'Renamed',
      status: 'archived',
      attention: 'notification',
      pinned: true,
    })
    expect(chats.list({ status: 'active' }).total).toBe(0)
    expect(chats.list({ status: 'archived' }).total).toBe(1)
    expect(chats.open(created.id).attention).toBe('read')
    chats.close()
  })

  it('removes messages with a deleted chat', () => {
    const chats = store()
    const created = chats.create()
    chats.append(created.id, 'system', 'Context')
    chats.remove(created.id)

    expect(chats.list().total).toBe(0)
    expect(() => chats.messages(created.id)).toThrow('does not exist')
    chats.close()
  })

  it('persists structured agent state', () => {
    const chats = store()
    const created = chats.create()
    chats.saveAgentState(created.id, {
      version: 1,
      messages: [{
        role: 'user',
        content: 'Continue this chat',
        timestamp: 1,
      }],
    })

    expect(chats.loadAgentState(created.id)).toEqual({
      version: 1,
      messages: [{
        role: 'user',
        content: 'Continue this chat',
        timestamp: 1,
      }],
    })
    chats.close()
  })

  it('enforces renewable single-owner chat leases', () => {
    const chats = store()
    const created = chats.create()

    expect(chats.acquire(created.id, 'terminal-1', 30_000)).toBe(true)
    expect(chats.acquire(created.id, 'terminal-2', 30_000)).toBe(false)
    expect(chats.renew(created.id, 'terminal-1', 30_000)).toBe(true)
    chats.release(created.id, 'terminal-2')
    expect(chats.acquire(created.id, 'terminal-2', 30_000)).toBe(false)
    chats.release(created.id, 'terminal-1')
    expect(chats.acquire(created.id, 'terminal-2', 30_000)).toBe(true)
    chats.close()
  })

  it('keeps at most 500 unpinned chats', () => {
    const chats = store()
    for (let index = 0; index < 501; index += 1) {
      chats.create(`Chat ${index}`)
    }

    expect(chats.list({ limit: 500 }).total).toBe(500)
    expect(chats.list({ limit: 500 }).chats).toHaveLength(500)
    chats.close()
  })
})
