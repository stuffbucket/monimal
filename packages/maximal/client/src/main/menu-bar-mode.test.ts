import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  appGetPath,
  appState,
  browserWindows,
  createFromPath,
  dockHide,
  dockShow,
  existsSync,
  imageIsEmpty,
  imageResize,
  imageSetTemplate,
  randomUUID,
  readFile,
  trayConstruct,
  trayDestroy,
  trayOn,
  traySetToolTip,
  writeFile,
} = vi.hoisted(() => {
  const dockHide = vi.fn(() => Promise.resolve())
  const dockShow = vi.fn(() => Promise.resolve())
  return {
    appGetPath: vi.fn(() => '/profile'),
    appState: {
      isPackaged: false,
      dock: { hide: dockHide, show: dockShow } as
        | { hide: typeof dockHide; show: typeof dockShow }
        | undefined,
    },
    browserWindows: [] as Array<{ setSkipTaskbar: ReturnType<typeof vi.fn> }>,
    createFromPath: vi.fn(),
    dockHide,
    dockShow,
    existsSync: vi.fn(() => true),
    imageIsEmpty: vi.fn(() => false),
    imageResize: vi.fn(),
    imageSetTemplate: vi.fn(),
    randomUUID: vi.fn(() => 'attempt-1'),
    readFile: vi.fn<() => Promise<string>>(() =>
      Promise.reject(new Error('missing')),
    ),
    trayConstruct: vi.fn(),
    trayDestroy: vi.fn(),
    trayOn: vi.fn(),
    traySetToolTip: vi.fn(),
    writeFile: vi.fn(() => Promise.resolve()),
  }
})

vi.mock('node:crypto', () => ({ randomUUID }))
vi.mock('node:fs', () => ({ existsSync }))
vi.mock('node:fs/promises', () => ({ readFile, writeFile }))
vi.mock('electron', () => {
  const image = {
    isEmpty: imageIsEmpty,
    resize: imageResize,
    setTemplateImage: imageSetTemplate,
  }
  imageResize.mockReturnValue(image)
  createFromPath.mockReturnValue(image)

  return {
    app: {
      get isPackaged() {
        return appState.isPackaged
      },
      getAppPath: () => '/app',
      getPath: appGetPath,
      get dock() {
        return appState.dock
      },
    },
    BrowserWindow: { getAllWindows: () => browserWindows },
    nativeImage: { createFromPath },
    Tray: class {
      constructor(value: unknown) {
        trayConstruct(value)
      }

      setToolTip(value: string): void {
        traySetToolTip(value)
      }

      on(event: string, listener: () => void): void {
        trayOn(event, listener)
      }

      destroy(): void {
        trayDestroy()
      }
    },
  }
})

const { MenuBarModeController } = await import('./menu-bar-mode.js')

const realPlatform = process.platform

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', {
    value: platform,
    configurable: true,
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-08T12:00:00Z'))
  setPlatform('darwin')
  Object.defineProperty(process, 'resourcesPath', {
    value: '/bundle',
    configurable: true,
  })
  appState.isPackaged = false
  appState.dock = { hide: dockHide, show: dockShow }
  browserWindows.length = 0
  vi.clearAllMocks()
  existsSync.mockReturnValue(true)
  imageIsEmpty.mockReturnValue(false)
  randomUUID.mockReturnValue('attempt-1')
  readFile.mockRejectedValue(new Error('missing'))
  writeFile.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.useRealTimers()
  setPlatform(realPlatform)
})

describe('MenuBarModeController', () => {
  it('defaults to normal launcher presence when no preference exists', async () => {
    const controller = new MenuBarModeController(vi.fn())

    await controller.initialize()

    expect(controller.state()).toEqual({ enabled: false, pending: false })
    expect(controller.keepsAlive()).toBe(false)
    expect(trayConstruct).not.toHaveBeenCalled()
    expect(dockHide).not.toHaveBeenCalled()
  })

  it('reads a missing preference field as normal launcher mode', async () => {
    readFile.mockResolvedValue('{}')
    const controller = new MenuBarModeController(vi.fn())

    await controller.initialize()

    expect(appGetPath).toHaveBeenCalledWith('userData')
    expect(readFile).toHaveBeenCalledWith('/profile/preferences.json', 'utf8')
    expect(controller.state()).toEqual({ enabled: false, pending: false })
    expect(trayConstruct).not.toHaveBeenCalled()
  })

  it('creates the tray before provisionally hiding normal launcher presence', () => {
    const setSkipTaskbar = vi.fn()
    browserWindows.push({ setSkipTaskbar })
    const onActivate = vi.fn()
    const controller = new MenuBarModeController(onActivate)

    const attempt = controller.beginEnable()

    expect(attempt).toEqual({
      attemptId: 'attempt-1',
      deadlineMs: Date.now() + 15_000,
    })
    expect(trayConstruct.mock.invocationCallOrder[0]).toBeLessThan(
      dockHide.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    )
    expect(existsSync).toHaveBeenCalledWith(
      '/app/resources/tray/trayTemplate.png',
    )
    expect(createFromPath).toHaveBeenCalledWith(
      '/app/resources/tray/trayTemplate.png',
    )
    expect(imageResize).toHaveBeenCalledWith({ width: 18, height: 18 })
    expect(imageSetTemplate).toHaveBeenCalledWith(true)
    expect(traySetToolTip).toHaveBeenCalledWith('Maximal')
    expect(trayOn).toHaveBeenCalledWith('click', onActivate)
    expect(setSkipTaskbar).toHaveBeenCalledWith(false)
    expect(controller.state()).toEqual({ enabled: true, pending: true })
    expect(controller.keepsAlive()).toBe(false)
  })

  it('persists and keeps the app alive only after matching confirmation', async () => {
    const controller = new MenuBarModeController(vi.fn())
    const attempt = controller.beginEnable()

    await expect(controller.confirmEnable(attempt.attemptId)).resolves.toEqual({
      enabled: true,
      pending: false,
    })
    expect(writeFile).toHaveBeenCalledWith(
      '/profile/preferences.json',
      '{\n  "menuBarOnly": true\n}\n',
    )
    expect(controller.keepsAlive()).toBe(true)

    await vi.advanceTimersByTimeAsync(15_000)
    expect(controller.state()).toEqual({ enabled: true, pending: false })
    expect(dockShow).not.toHaveBeenCalled()
  })

  it('restores launcher presence when confirmation cannot be persisted', async () => {
    writeFile.mockRejectedValue(new Error('disk full'))
    const controller = new MenuBarModeController(vi.fn())
    const attempt = controller.beginEnable()

    await expect(controller.confirmEnable(attempt.attemptId)).rejects.toThrow(
      'disk full',
    )
    expect(controller.state()).toEqual({ enabled: false, pending: false })
    expect(controller.keepsAlive()).toBe(false)
    expect(dockShow).toHaveBeenCalledTimes(1)
    expect(trayDestroy).toHaveBeenCalledTimes(1)
  })

  it('reverts a provisional mode when cancelled', () => {
    const controller = new MenuBarModeController(vi.fn())
    const attempt = controller.beginEnable()

    expect(controller.cancelEnable(attempt.attemptId)).toEqual({
      enabled: false,
      pending: false,
    })
    expect(dockShow).toHaveBeenCalledTimes(1)
    expect(trayDestroy).toHaveBeenCalledTimes(1)
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('reverts a provisional mode when its deadline expires', async () => {
    const controller = new MenuBarModeController(vi.fn())
    controller.beginEnable()

    await vi.advanceTimersByTimeAsync(15_000)

    expect(controller.state()).toEqual({ enabled: false, pending: false })
    expect(dockShow).toHaveBeenCalledTimes(1)
    expect(trayDestroy).toHaveBeenCalledTimes(1)
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('rejects stale attempt IDs without changing the active attempt', async () => {
    const controller = new MenuBarModeController(vi.fn())
    controller.beginEnable()

    expect(() => controller.cancelEnable('stale')).toThrow(
      'Menu-bar-only confirmation is no longer active',
    )
    await expect(controller.confirmEnable('stale')).rejects.toThrow(
      'Menu-bar-only confirmation is no longer active',
    )
    expect(controller.state()).toEqual({ enabled: true, pending: true })
  })

  it('fails before hiding launcher presence when the tray cannot be created', () => {
    existsSync.mockReturnValue(false)
    const controller = new MenuBarModeController(vi.fn())

    expect(() => controller.beginEnable()).toThrow('Tray icon is missing')
    expect(controller.state()).toEqual({ enabled: false, pending: false })
    expect(dockHide).not.toHaveBeenCalled()
  })

  it('replaces an unconfirmed attempt and cancels its old deadline', () => {
    randomUUID
      .mockReturnValueOnce('attempt-1')
      .mockReturnValueOnce('attempt-2')
    const controller = new MenuBarModeController(vi.fn())

    controller.beginEnable()
    expect(controller.beginEnable()).toMatchObject({ attemptId: 'attempt-2' })

    expect(vi.getTimerCount()).toBe(1)
    expect(trayConstruct).toHaveBeenCalledTimes(2)
    expect(trayDestroy).toHaveBeenCalledTimes(1)
  })

  it('keeps confirmed launcher mode while a new confirmation is cancelled', async () => {
    const controller = new MenuBarModeController(vi.fn())
    const first = controller.beginEnable()
    await controller.confirmEnable(first.attemptId)
    vi.clearAllMocks()

    const second = controller.beginEnable()
    expect(dockHide).not.toHaveBeenCalled()
    expect(trayConstruct).not.toHaveBeenCalled()
    expect(controller.cancelEnable(second.attemptId)).toEqual({
      enabled: true,
      pending: false,
    })
    expect(controller.keepsAlive()).toBe(true)
    expect(dockShow).not.toHaveBeenCalled()
    expect(trayDestroy).not.toHaveBeenCalled()
  })

  it('cancels confirmation when launcher mode changes while persistence waits', async () => {
    let resolveWrite!: () => void
    writeFile.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveWrite = resolve
        }),
    )
    const controller = new MenuBarModeController(vi.fn())
    const attempt = controller.beginEnable()

    const confirmation = controller.confirmEnable(attempt.attemptId)
    await Promise.resolve()
    controller.cancelPending()
    resolveWrite()

    await expect(confirmation).rejects.toThrow(
      'Menu-bar-only confirmation was cancelled',
    )
    expect(writeFile).toHaveBeenNthCalledWith(
      2,
      '/profile/preferences.json',
      '{\n  "menuBarOnly": false\n}\n',
    )
    expect(controller.state()).toEqual({ enabled: false, pending: false })
    expect(controller.keepsAlive()).toBe(false)
  })

  it('disables confirmed mode and cancels a pending reconfirmation', async () => {
    const controller = new MenuBarModeController(vi.fn())
    const first = controller.beginEnable()
    await controller.confirmEnable(first.attemptId)
    controller.beginEnable()

    await expect(controller.disable()).resolves.toEqual({
      enabled: false,
      pending: false,
    })

    expect(vi.getTimerCount()).toBe(0)
    expect(controller.keepsAlive()).toBe(false)
    expect(writeFile).toHaveBeenLastCalledWith(
      '/profile/preferences.json',
      '{\n  "menuBarOnly": false\n}\n',
    )
    expect(dockShow).toHaveBeenCalledTimes(1)
    expect(trayDestroy).toHaveBeenCalledTimes(1)

    const retry = controller.beginEnable()
    controller.cancelEnable(retry.attemptId)
    expect(controller.state()).toEqual({ enabled: false, pending: false })
  })

  it('clears confirmed state after a later persistence failure', async () => {
    const controller = new MenuBarModeController(vi.fn())
    const first = controller.beginEnable()
    await controller.confirmEnable(first.attemptId)
    const second = controller.beginEnable()
    writeFile.mockRejectedValueOnce(new Error('disk full'))

    await expect(controller.confirmEnable(second.attemptId)).rejects.toThrow(
      'disk full',
    )
    const third = controller.beginEnable()
    controller.cancelEnable(third.attemptId)

    expect(controller.state()).toEqual({ enabled: false, pending: false })
    expect(controller.keepsAlive()).toBe(false)
  })

  it('cancels pending mode directly', () => {
    const controller = new MenuBarModeController(vi.fn())
    controller.beginEnable()

    controller.cancelPending()

    expect(controller.state()).toEqual({ enabled: false, pending: false })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('disposes active resources idempotently', () => {
    const controller = new MenuBarModeController(vi.fn())
    controller.beginEnable()

    controller.dispose()

    expect(vi.getTimerCount()).toBe(0)
    expect(trayDestroy).toHaveBeenCalledTimes(1)
    expect(() => controller.dispose()).not.toThrow()
    expect(trayDestroy).toHaveBeenCalledTimes(1)
  })

  it('rejects an attempt when none is pending with the domain error', () => {
    const controller = new MenuBarModeController(vi.fn())

    expect(() => controller.cancelEnable('stale')).toThrow(
      'Menu-bar-only confirmation is no longer active',
    )
  })

  it('uses the packaged tray location', () => {
    appState.isPackaged = true
    const controller = new MenuBarModeController(vi.fn())

    controller.beginEnable()

    expect(existsSync).toHaveBeenCalledWith(
      '/bundle/tray/trayTemplate.png',
    )
    expect(createFromPath).toHaveBeenCalledWith(
      '/bundle/tray/trayTemplate.png',
    )
  })

  it('rejects an unreadable tray image before changing launcher presence', () => {
    imageIsEmpty.mockReturnValue(true)
    const controller = new MenuBarModeController(vi.fn())

    expect(() => controller.beginEnable()).toThrow(
      'Tray icon is unreadable at /app/resources/tray/trayTemplate.png',
    )
    expect(imageResize).not.toHaveBeenCalled()
    expect(dockHide).not.toHaveBeenCalled()
  })

  it('tolerates an unavailable Dock API', () => {
    appState.dock = undefined
    const controller = new MenuBarModeController(vi.fn())

    const attempt = controller.beginEnable()
    expect(() => controller.cancelEnable(attempt.attemptId)).not.toThrow()
    expect(controller.state()).toEqual({ enabled: false, pending: false })
  })

  it('restores a confirmed preference at startup', async () => {
    readFile.mockResolvedValue('{"menuBarOnly":true}')
    const controller = new MenuBarModeController(vi.fn())

    await controller.initialize()

    expect(controller.state()).toEqual({ enabled: true, pending: false })
    expect(controller.keepsAlive()).toBe(true)
    expect(trayConstruct).toHaveBeenCalledTimes(1)
    expect(dockHide).toHaveBeenCalledTimes(1)
  })

  it('does not duplicate the tray if startup initialization is repeated', async () => {
    readFile.mockResolvedValue('{"menuBarOnly":true}')
    const controller = new MenuBarModeController(vi.fn())

    await controller.initialize()
    await controller.initialize()

    expect(trayConstruct).toHaveBeenCalledTimes(1)
  })

  it('repairs a persisted preference when startup tray creation fails', async () => {
    readFile.mockResolvedValue('{"menuBarOnly":true}')
    existsSync.mockReturnValue(false)
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const controller = new MenuBarModeController(vi.fn())

    await controller.initialize()

    expect(controller.state()).toEqual({ enabled: false, pending: false })
    expect(writeFile).toHaveBeenCalledWith(
      '/profile/preferences.json',
      '{\n  "menuBarOnly": false\n}\n',
    )
    expect(error).toHaveBeenCalledWith(
      '[maximal-client] could not restore menu-bar-only mode:',
      expect.any(Error),
    )
    error.mockRestore()
  })

  it('uses taskbar visibility rather than the Dock off macOS', () => {
    setPlatform('win32')
    const setSkipTaskbar = vi.fn()
    browserWindows.push({ setSkipTaskbar })
    const controller = new MenuBarModeController(vi.fn())

    const attempt = controller.beginEnable()
    expect(existsSync).toHaveBeenCalledWith('/app/resources/tray/tray.png')
    expect(setSkipTaskbar).toHaveBeenLastCalledWith(true)
    expect(imageSetTemplate).not.toHaveBeenCalled()
    expect(dockHide).not.toHaveBeenCalled()

    controller.cancelEnable(attempt.attemptId)
    expect(setSkipTaskbar).toHaveBeenLastCalledWith(false)
    expect(dockShow).not.toHaveBeenCalled()
  })
})
