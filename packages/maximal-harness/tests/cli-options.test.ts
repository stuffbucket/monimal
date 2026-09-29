import { describe, expect, it } from 'vitest'

import { parseAssistantCliOptions } from '../src/cli-options.js'

describe('assistant CLI options', () => {
  it('parses host and passthrough agent options', () => {
    expect(parseAssistantCliOptions([
      '--chat', 'chat-1',
      '--database', '/tmp/chats.sqlite',
      '--cwd', '/repo',
      '--approval', 'none',
      '--',
      '--model', 'maximal:opus',
      '--toolset', 'git,search',
      '--toolset', 'browser',
      '--no-coding-tools',
    ])).toEqual({
      chatId: 'chat-1',
      databasePath: '/tmp/chats.sqlite',
      cwd: '/repo',
      approval: 'none',
      codingTools: false,
      preferredModel: 'maximal:opus',
      toolsetIds: ['git', 'search', 'browser'],
    })
  })

  it('requires the host-owned chat arguments', () => {
    expect(() => parseAssistantCliOptions([])).toThrow('--chat is required')
    expect(() => parseAssistantCliOptions([
      '--chat', 'chat-1',
      '--database', '/tmp/chats.sqlite',
    ])).toThrow('--cwd is required')
  })

  it('rejects unsupported options', () => {
    const required = [
      '--chat', 'chat-1',
      '--database', '/tmp/chats.sqlite',
      '--cwd', '/repo',
    ]
    expect(() => parseAssistantCliOptions([...required, '--wat']))
      .toThrow('Unsupported agent option')
  })
})
