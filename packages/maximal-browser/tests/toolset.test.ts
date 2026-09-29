import { describe, expect, it, vi } from 'vitest'

import { BrowserHost } from '../src/host/browser-host'
import { createBrowserToolset } from '../src/host/toolset'

function tool(
  host: BrowserHost,
  name: string,
) {
  const entry = createBrowserToolset(host).build().find((candidate) =>
    candidate.tool.name === name)
  if (!entry) throw new Error(`Missing browser tool ${name}`)
  return entry
}

describe('browser agent toolset', () => {
  it('offers the core browser loop with explicit risk classifications', () => {
    const host = new BrowserHost({ window: () => null, onEvent: vi.fn() })
    const entries = createBrowserToolset(host).build()
    const risks = Object.fromEntries(entries.map((entry) => [entry.tool.name, entry.risk]))

    expect(risks).toMatchObject({
      browser_list: 'safe',
      browser_open: 'mutating',
      browser_command: 'mutating',
      browser_close: 'mutating',
      browser_inspect: 'safe',
      browser_click: 'mutating',
      browser_type: 'mutating',
      browser_drag: 'mutating',
      browser_press: 'mutating',
      browser_wait: 'safe',
      browser_scroll: 'safe',
      browser_screenshot: 'safe',
    })
  })

  it('formats inspect results as stable reference lines', async () => {
    const host = new BrowserHost({ window: () => null, onEvent: vi.fn() })
    vi.spyOn(host, 'inspect').mockResolvedValue({
      url: 'https://example.com/',
      title: 'Example',
      text: 'Welcome',
      elements: [{
        ref: 'e1',
        role: 'button',
        name: 'Continue',
        disabled: false,
      }],
    })

    const result = await tool(host, 'browser_inspect').tool.execute(
      'call-1',
      { id: 'session-1' },
    )

    const content = result.content[0]
    expect(content?.type).toBe('text')
    if (content?.type !== 'text') throw new Error('Expected browser inspection text')
    expect(content.text).toContain('[e1] button "Continue"')
  })

  it('returns screenshots as model image content', async () => {
    const host = new BrowserHost({ window: () => null, onEvent: vi.fn() })
    vi.spyOn(host, 'screenshot').mockResolvedValue({
      data: 'cG5n',
      mimeType: 'image/png',
    })

    const result = await tool(host, 'browser_screenshot').tool.execute(
      'call-1',
      { id: 'session-1' },
    )

    expect(result.content).toContainEqual({
      type: 'image',
      data: 'cG5n',
      mimeType: 'image/png',
    })
  })
})
