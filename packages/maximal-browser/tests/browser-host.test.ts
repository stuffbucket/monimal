import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { BrowserEvent } from '../src/contract'

const { FakeView, views } = vi.hoisted(() => {
  type Listener = (...args: unknown[]) => void

  class FakeWebContents {
    navigationHistory = {
      canGoBack: () => false,
      canGoForward: () => false,
      goBack: vi.fn(),
      goForward: vi.fn(),
    }
    setWindowOpenHandler = vi.fn()
    close = vi.fn()
    reload = vi.fn()
    executeJavaScript = vi.fn<(script: string) => Promise<unknown>>(async () => 'page text')
    sendInputEvent = vi.fn()
    capturePage = vi.fn(async () => ({
      toPNG: () => Buffer.from('png'),
    }))
    insertCSS = vi.fn(async () => 'css-key')
    removeInsertedCSS = vi.fn(async () => {})
    listeners = new Map<string, Listener[]>()
    url = ''
    title = ''

    on(event: string, listener: Listener): this {
      this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener])
      return this
    }

    emit(event: string, ...args: unknown[]): void {
      for (const listener of this.listeners.get(event) ?? []) listener(...args)
    }

    async loadURL(url: string): Promise<void> {
      this.url = url
      this.title = new URL(url).hostname
      this.emit('did-navigate')
      this.emit('page-title-updated')
    }

    getURL(): string {
      return this.url
    }

    getTitle(): string {
      return this.title
    }
  }

  class FakeViewClass {
    webContents = new FakeWebContents()
    setBounds = vi.fn()

    constructor() {
      views.push(this)
    }
  }

  const views: FakeViewClass[] = []
  return { FakeView: FakeViewClass, views }
})

vi.mock('electron', () => ({
  BrowserWindow: class {},
  WebContentsView: FakeView,
}))

import { BrowserHost } from '../src/host/browser-host'

describe('BrowserHost', () => {
  beforeEach(() => views.splice(0))

  it('opens normalized HTTPS sessions and publishes their ownership', async () => {
    const events: BrowserEvent[] = []
    const host = new BrowserHost({ window: () => null, onEvent: (event) => events.push(event) })

    const session = await host.open('example.com/docs', 'agent')

    expect(session).toEqual(expect.objectContaining({
      url: 'https://example.com/docs',
      title: 'example.com',
      owner: 'agent',
      control: 'agent-exclusive',
      terminalSessionIds: [],
    }))
    expect(host.list()).toEqual([session])
    expect(events.some((event) =>
      event.type === 'opened' && event.session.owner === 'agent')).toBe(true)
  })

  it('rejects schemes that should not run in the shared browser', async () => {
    const host = new BrowserHost({ window: () => null, onEvent: vi.fn() })
    await expect(host.open('file:///etc/passwd', 'user')).rejects.toThrow(
      'Browser tabs support only HTTP and HTTPS URLs.',
    )
  })

  it('reads page text through the isolated guest contents', async () => {
    const host = new BrowserHost({ window: () => null, onEvent: vi.fn() })
    const session = await host.open('https://example.com', 'agent')
    await expect(host.read(session.id)).resolves.toBe('page text')
  })

  it('returns structured page snapshots for agent references', async () => {
    const host = new BrowserHost({ window: () => null, onEvent: vi.fn() })
    const session = await host.open('https://example.com', 'agent')
    views[0]?.webContents.executeJavaScript.mockResolvedValueOnce({
      url: session.url,
      title: 'Example',
      text: 'Welcome',
      elements: [{ ref: 'e1', role: 'button', name: 'Continue', disabled: false }],
    })

    await expect(host.inspect(session.id)).resolves.toEqual(expect.objectContaining({
      text: 'Welcome',
      elements: [expect.objectContaining({ ref: 'e1', name: 'Continue' })],
    }))
  })

  it('requires generated element references for page actions', async () => {
    const host = new BrowserHost({ window: () => null, onEvent: vi.fn() })
    const session = await host.open('https://example.com', 'agent')

    await expect(host.click(session.id, 'button.submit')).rejects.toThrow(
      'Invalid browser element reference',
    )
    expect(views[0]?.webContents.executeJavaScript).not.toHaveBeenCalled()
  })

  it('sends bounded keyboard input to the page', async () => {
    const host = new BrowserHost({ window: () => null, onEvent: vi.fn() })
    const session = await host.open('https://example.com', 'agent')

    host.press(session.id, 'Enter')

    expect(views[0]?.webContents.sendInputEvent).toHaveBeenNthCalledWith(
      1,
      { type: 'keyDown', keyCode: 'Enter' },
    )
    expect(views[0]?.webContents.sendInputEvent).toHaveBeenNthCalledWith(
      2,
      { type: 'keyUp', keyCode: 'Enter' },
    )
    expect(() => host.press(session.id, 'Control+L')).toThrow('Unsupported browser key')
  })

  it('waits for visible text and captures a PNG screenshot', async () => {
    const host = new BrowserHost({ window: () => null, onEvent: vi.fn() })
    const session = await host.open('https://example.com', 'agent')
    views[0]?.webContents.executeJavaScript.mockResolvedValueOnce(true)

    await expect(host.wait(session.id, { text: 'Ready', timeoutMs: 1 })).resolves.toBeUndefined()
    await expect(host.screenshot(session.id)).resolves.toEqual({
      data: Buffer.from('png').toString('base64'),
      mimeType: 'image/png',
    })
  })

  it('associates new browsers with the active terminal split', async () => {
    const host = new BrowserHost({ window: () => null, onEvent: vi.fn() })
    host.setTerminalContext(['primary', 'split', 'primary'])

    const session = await host.open('https://example.com', 'agent')

    expect(session.terminalSessionIds).toEqual(['primary', 'split'])
  })

  it('starts agent browsers in exclusive mode and can release control', async () => {
    const host = new BrowserHost({ window: () => null, onEvent: vi.fn() })
    const session = await host.open('https://example.com', 'agent')

    expect(views[0]?.webContents.insertCSS).toHaveBeenCalledWith(
      'html, html * { pointer-events: none !important; }',
    )
    await expect(host.setControl(session.id, 'user')).resolves.toEqual(
      expect.objectContaining({ control: 'user' }),
    )
    expect(views[0]?.webContents.removeInsertedCSS).toHaveBeenCalledWith('css-key')
  })
})
