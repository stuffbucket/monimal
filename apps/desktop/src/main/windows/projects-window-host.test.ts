import { BrowserWindow, webFrameMain, type IpcMainInvokeEvent, type WebFrameMain } from 'electron'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

import { BRIDGE_CHANNELS } from '../../shared/bridge-channels.js'
import { PROJECTS_WINDOW_STATE_MAX_LENGTH, ProjectsWindowHost } from './projects-window-host.js'

const { handle, fromWebContents, frameFromId, createWindow, waitReady, warn, error } = vi.hoisted(() => ({
  handle: vi.fn<(channel: string, listener: (event: IpcMainInvokeEvent, input?: unknown) => unknown) => void>(),
  fromWebContents: vi.fn(),
  frameFromId: vi.fn<() => Pick<WebFrameMain, 'url'>>(() => ({ url: '' })),
  createWindow: vi.fn(),
  waitReady: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}))

vi.mock('electron', () => ({
  BrowserWindow: class {
    static fromWebContents = fromWebContents
  },
  webFrameMain: { fromId: frameFromId },
  ipcMain: { handle },
}))
vi.mock('@maximal/maximal-electron/host', () => ({
  createHostWindow: createWindow,
  waitForHostWindowReady: waitReady,
}))
vi.mock('../main-logger.js', () => ({ mainLogger: { warn, error } }))

const rendererUrl = 'https://renderer.invalid/'

function fakeFrame(id: number) {
  const frame = webFrameMain.fromId(1, id)
  if (!frame) throw new Error(`Missing frame fixture: ${id}`)
  return Object.assign(frame, { url: rendererUrl })
}

function fakeWindow(id: number) {
  let destroyed = false
  let url = rendererUrl
  const closed: (() => void)[] = []
  const mainFrame = fakeFrame(id)
  const window = Object.assign(new BrowserWindow({ show: false }), {
    id,
    isDestroyed: () => destroyed,
    webContents: {
      mainFrame,
      getURL: () => url,
      send: vi.fn(),
    },
    on: vi.fn((event: string, listener: () => void) => {
      if (event === 'closed') closed.push(listener)
    }),
    close: vi.fn(() => {
      destroyed = true
      closed.forEach((listener) => listener())
    }),
    destroy: vi.fn(() => {
      destroyed = true
      closed.forEach((listener) => listener())
    }),
    show: vi.fn(),
    navigate: (next: string) => {
      url = next
      mainFrame.url = next
    },
  })
  return window
}

type TestWindow = ReturnType<typeof fakeWindow>
const eventFor = (window: TestWindow): IpcMainInvokeEvent => ({
  frameId: window.id,
  processId: 1,
  type: 'frame',
  preventDefault: vi.fn(),
  defaultPrevented: false,
  sender: window.webContents,
  senderFrame: window.webContents.mainFrame,
})

function handler(channel: string) {
  const registered = handle.mock.calls.find(([name]) => name === channel)?.[1]
  if (!registered) throw new Error(`Missing handler: ${channel}`)
  return registered
}

describe('Projects native window transfer', () => {
  let workspace: TestWindow
  let detached: TestWindow
  let foreign: TestWindow
  let loadRenderer: Mock<(window: BrowserWindow, query: URLSearchParams) => Promise<void>>
  let focusWindow: Mock<(window: BrowserWindow) => void>
  let openWorkspaceSettings: Mock<() => void>

  beforeEach(() => {
    vi.clearAllMocks()
    workspace = fakeWindow(1)
    detached = fakeWindow(2)
    foreign = fakeWindow(3)
    fromWebContents.mockImplementation((contents: unknown) =>
      [workspace, detached, foreign].find((window) => window.webContents === contents))
    createWindow.mockReturnValue(detached)
    waitReady.mockResolvedValue(true)
    loadRenderer = vi.fn<(window: BrowserWindow, query: URLSearchParams) => Promise<void>>(async () => undefined)
    focusWindow = vi.fn()
    openWorkspaceSettings = vi.fn()
    new ProjectsWindowHost({
      preloadPath: '/app/preload.js',
      workspaceWindow: () => workspace,
      isRendererUrl: (url) => url === rendererUrl,
      loadRenderer,
      configureWindow: vi.fn(),
      focusWindow,
      openWorkspaceSettings,
    }).registerIpc()
  })

  const request = { x: 25, y: -50, state: 'opaque renderer state' }
  const redock = { sourceFrameId: '2', targetFrameId: '1', state: 'updated state' }

  const undock = (window: TestWindow, input: unknown = request) =>
    handler(BRIDGE_CHANNELS.projectsUndockWindow)(eventFor(window), input)
  const dock = (window: TestWindow, input: unknown = redock) =>
    handler(BRIDGE_CHANNELS.projectsRedockWindow)(eventFor(window), input)
  const state = (window: TestWindow) =>
    handler(BRIDGE_CHANNELS.projectsWindowState)(eventFor(window))

  it('registers only the Projects transfer invoke channels', () => {
    expect(handle.mock.calls.map(([channel]) => channel)).toEqual([
      BRIDGE_CHANNELS.projectsUndockWindow,
      BRIDGE_CHANNELS.projectsRedockWindow,
      BRIDGE_CHANNELS.projectsWindowState,
      BRIDGE_CHANNELS.projectsOpenWorkspaceSettings,
    ])
  })

  it('delegates ready dedicated Projects settings to the workspace without closing either window', async () => {
    await undock(workspace)
    expect(handler(BRIDGE_CHANNELS.projectsOpenWorkspaceSettings)(eventFor(detached))).toBeUndefined()
    expect(openWorkspaceSettings).toHaveBeenCalledOnce()
    expect(state(detached)).toBe(request.state)
    expect(workspace.close).not.toHaveBeenCalled()
    expect(detached.close).not.toHaveBeenCalled()
  })

  it('rejects settings requests outside the ready dedicated Projects window scope', async () => {
    const open = handler(BRIDGE_CHANNELS.projectsOpenWorkspaceSettings)
    for (const window of [workspace, detached, foreign]) {
      expect(() => open(eventFor(window))).toThrow('Unauthorized Projects workspace settings sender')
    }
    loadRenderer.mockImplementation(async () => {
      expect(() => open(eventFor(detached))).toThrow('Unauthorized Projects workspace settings sender')
    })
    await undock(workspace)
    detached.navigate('https://foreign.invalid/')
    expect(() => open(eventFor(detached))).toThrow('Unauthorized Projects workspace settings sender')
    detached.close()
    expect(() => open(eventFor(detached))).toThrow('Unauthorized Projects workspace settings sender')
    expect(openWorkspaceSettings).not.toHaveBeenCalled()
  })

  it('stages state before loading and resolves success only after renderer readiness', async () => {
    let ready: (value: boolean) => void = () => { throw new Error('Missing ready callback') }
    waitReady.mockImplementation(() => new Promise<boolean>((resolve) => { ready = resolve }))
    loadRenderer.mockImplementation(async () => {
      expect(state(detached)).toBe(request.state)
    })
    const result = undock(workspace)
    await Promise.resolve()
    expect(detached.show).not.toHaveBeenCalled()
    expect(workspace.close).not.toHaveBeenCalled()
    expect(dock(workspace)).toBe(false)
    expect(createWindow).toHaveBeenCalledWith(expect.objectContaining({
      preloadPath: '/app/preload.js', x: 25, y: -50, showWhenReady: false,
    }))
    expect(loadRenderer.mock.calls[0]?.[1].get('projectsWindow')).toBe('true')
    expect(waitReady.mock.invocationCallOrder[0]).toBeLessThan(loadRenderer.mock.invocationCallOrder[0])
    ready(true)
    await expect(result).resolves.toBe(true)
    expect(detached.show).toHaveBeenCalledOnce()
    expect(focusWindow).toHaveBeenCalledWith(detached)
    expect(workspace.close).not.toHaveBeenCalled()
  })

  it('returns state only to the registered detached sender and removes it on close', async () => {
    await undock(workspace)
    expect(state(workspace)).toBeUndefined()
    expect(state(foreign)).toBeUndefined()
    expect(state(detached)).toBe(request.state)
    detached.close()
    expect(state(detached)).toBeUndefined()
  })

  it('redocks current opaque state only to the receiving owner and closes only its registered source', async () => {
    await undock(workspace)
    expect(dock(workspace)).toBe(true)
    expect(workspace.webContents.send).toHaveBeenCalledExactlyOnceWith(
      BRIDGE_CHANNELS.projectsWindowRedocked, redock.state,
    )
    expect(detached.webContents.send).not.toHaveBeenCalled()
    expect(detached.close).toHaveBeenCalledOnce()
    expect(workspace.close).not.toHaveBeenCalled()
    expect(state(detached)).toBeUndefined()
    expect(dock(workspace)).toBe(false)
  })

  it('rejects unknown/main/terminal sources, foreign targets, owner mismatches and self transfers', async () => {
    await undock(workspace)
    for (const input of [
      { ...redock, sourceFrameId: '1' },
      { ...redock, sourceFrameId: '3' },
      { ...redock, sourceFrameId: '999' },
      { ...redock, targetFrameId: '3' },
      { ...redock, targetFrameId: '2' },
    ]) expect(dock(workspace, input)).toBe(false)
    expect(dock(foreign)).toBe(false)
    expect(dock(detached, { ...redock, targetFrameId: '2' })).toBe(false)
    expect(workspace.webContents.send).not.toHaveBeenCalled()
    expect(workspace.close).not.toHaveBeenCalled()
    expect(detached.close).not.toHaveBeenCalled()
    expect(foreign.close).not.toHaveBeenCalled()
  })

  it('rejects foreign senders, cross-origin frames and subframes without creating windows', async () => {
    await expect(undock(foreign)).resolves.toBe(false)
    const subframe: IpcMainInvokeEvent = {
      ...eventFor(workspace),
      senderFrame: fakeFrame(4),
    }
    await expect(handler(BRIDGE_CHANNELS.projectsUndockWindow)(
      subframe, request,
    )).resolves.toBe(false)
    workspace.navigate('https://foreign.invalid/')
    await expect(undock(workspace)).resolves.toBe(false)
    expect(createWindow).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
  })

  it('rejects redocking a navigated source or target and restricts state fetch', async () => {
    await undock(workspace)
    detached.navigate('https://foreign.invalid/')
    expect(dock(workspace)).toBe(false)
    expect(state(detached)).toBeUndefined()
    detached.navigate(rendererUrl)
    workspace.navigate('https://foreign.invalid/')
    expect(dock(workspace)).toBe(false)
    expect(workspace.webContents.send).not.toHaveBeenCalled()
    expect(detached.close).not.toHaveBeenCalled()
  })

  it('validates finite positions, frame identities, and bounded nonempty opaque state', async () => {
    for (const input of [
      { ...request, x: Infinity }, { ...request, y: NaN },
      { ...request, state: '' }, { ...request, state: 1 },
      { ...request, state: 'a'.repeat(PROJECTS_WINDOW_STATE_MAX_LENGTH + 1) },
    ]) await expect(undock(workspace, input)).resolves.toBe(false)
    expect(createWindow).not.toHaveBeenCalled()
    await expect(undock(workspace, { ...request, state: 'a'.repeat(PROJECTS_WINDOW_STATE_MAX_LENGTH) })).resolves.toBe(true)
    for (const input of [
      { ...redock, sourceFrameId: '' }, { ...redock, targetFrameId: ' ' },
      { ...redock, state: '' }, { ...redock, state: 'a'.repeat(PROJECTS_WINDOW_STATE_MAX_LENGTH + 1) },
    ]) expect(dock(workspace, input)).toBe(false)
    expect(workspace.webContents.send).not.toHaveBeenCalled()
  })

  it('cleans failed readiness without closing the workspace', async () => {
    waitReady.mockResolvedValue(false)
    await expect(undock(workspace)).resolves.toBe(false)
    expect(detached.destroy).toHaveBeenCalledOnce()
    expect(state(detached)).toBeUndefined()
    expect(detached.show).not.toHaveBeenCalled()
    expect(workspace.close).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith('Projects window undock failed: renderer or owner not ready')
  })

  it('cleans a rejected load and logs its failure', async () => {
    loadRenderer.mockRejectedValue(new Error('failed load'))
    await expect(undock(workspace)).resolves.toBe(false)
    expect(detached.destroy).toHaveBeenCalledOnce()
    expect(state(detached)).toBeUndefined()
    expect(error).toHaveBeenCalledWith({ errorName: 'Error' }, 'Projects window undock failed to load')
  })

  it('cleans a window if its workspace owner closes during loading', async () => {
    loadRenderer.mockImplementation(async () => workspace.close())
    await expect(undock(workspace)).resolves.toBe(false)
    expect(detached.destroy).toHaveBeenCalledOnce()
    expect(detached.show).not.toHaveBeenCalled()
  })

  it('does not close or lose the source when sending state fails', async () => {
    await undock(workspace)
    workspace.webContents.send.mockImplementation(() => { throw new Error('send failed') })
    expect(dock(workspace)).toBe(false)
    expect(detached.close).not.toHaveBeenCalled()
    expect(state(detached)).toBe(request.state)
    expect(error).toHaveBeenCalledWith({ errorName: 'Error' }, 'Projects window redock failed')
  })
})
