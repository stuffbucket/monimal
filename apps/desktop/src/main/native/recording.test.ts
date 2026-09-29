import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserWindow } from 'electron'

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  saveDialog: vi.fn(),
  errorBox: vi.fn(),
  mkdir: vi.fn(),
  openPath: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}))

vi.mock('@maximal/maximal-recording/main', () => ({
  startWindowRecording: mocks.start,
}))
vi.mock('electron', () => ({
  app: { getPath: () => '/home/test' },
  dialog: {
    showSaveDialog: mocks.saveDialog,
    showErrorBox: mocks.errorBox,
  },
  shell: { openPath: mocks.openPath },
}))
vi.mock('node:fs/promises', () => ({
  mkdir: mocks.mkdir,
}))
vi.mock('../main-logger.js', () => ({
  mainLogger: { info: mocks.info, error: mocks.error },
}))

import {
  createDesktopRecording,
  recordingsDirectory,
  revealRecordingsDirectory,
} from './recording.js'

function windowStub() {
  return {
    isDestroyed: () => false,
    webContents: {
      capturePage: async () => ({
        isEmpty: () => false,
        toPNG: () => Buffer.from('frame'),
      }),
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.mkdir.mockResolvedValue(undefined)
  mocks.openPath.mockResolvedValue('')
})

describe('desktop window recording', () => {
  it('asks for a host-owned destination and records only the selected window', async () => {
    const window = windowStub()
    const stop = vi.fn(async () => ({ output: '/tmp/demo.mp4', frames: 12 }))
    mocks.saveDialog.mockResolvedValue({ canceled: false, filePath: '/tmp/demo.mp4' })
    mocks.start.mockResolvedValue({ stop })
    const onChange = vi.fn()
    const recording = createDesktopRecording(() => window as BrowserWindow, onChange)

    await recording.toggle()
    expect(mocks.mkdir).toHaveBeenCalledWith('/home/test/.local/share/maximal/recordings', {
      recursive: true,
    })
    expect(mocks.saveDialog).toHaveBeenCalledWith(window, expect.objectContaining({
      defaultPath: expect.stringMatching(
        /^\/home\/test\/\.local\/share\/maximal\/recordings\/maximal-.*\.mp4$/,
      ) as unknown,
      filters: [{ name: 'MP4 video', extensions: ['mp4'] }],
    }))
    const options = mocks.start.mock.calls[0]?.[0] as {
      output: string
      captureFrame(): Promise<Uint8Array>
    }
    expect(options.output).toBe('/tmp/demo.mp4')
    expect(typeof options.captureFrame).toBe('function')
    expect(await options.captureFrame()).toEqual(Buffer.from('frame'))
    expect(recording.isRecording()).toBe(true)

    await recording.toggle()
    expect(stop).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledTimes(2)
    expect(recording.isRecording()).toBe(false)
  })

  it('reveals the fixed app-owned recordings directory', async () => {
    expect(recordingsDirectory({})).toBe(
      '/home/test/.local/share/maximal/recordings',
    )

    await revealRecordingsDirectory()

    expect(mocks.mkdir).toHaveBeenCalledWith(
      '/home/test/.local/share/maximal/recordings',
      { recursive: true },
    )
    expect(mocks.openPath).toHaveBeenCalledWith(
      '/home/test/.local/share/maximal/recordings',
    )
  })

  it('uses an absolute XDG data directory and ignores a relative one', () => {
    expect(recordingsDirectory({ XDG_DATA_HOME: '/xdg/data' })).toBe(
      '/xdg/data/maximal/recordings',
    )
    expect(recordingsDirectory({ XDG_DATA_HOME: 'relative' })).toBe(
      '/home/test/.local/share/maximal/recordings',
    )
  })

  it('reports a file-manager error when the recordings folder cannot open', async () => {
    mocks.openPath.mockResolvedValue('Finder unavailable')

    await expect(revealRecordingsDirectory()).rejects.toThrow(
      'Finder unavailable',
    )
  })

  it('does not start on cancellation or without a window', async () => {
    mocks.saveDialog.mockResolvedValue({ canceled: true })
    const recording = createDesktopRecording(() => windowStub() as BrowserWindow, vi.fn())
    await recording.toggle()
    expect(mocks.start).not.toHaveBeenCalled()

    await expect(createDesktopRecording(() => null, vi.fn()).toggle())
      .rejects.toThrow(/Open the main window/)
  })

  it('stops an active recording when its window closes', async () => {
    const window = windowStub()
    const stop = vi.fn(async () => ({ output: '/tmp/demo.mp4', frames: 1 }))
    mocks.saveDialog.mockResolvedValue({ canceled: false, filePath: '/tmp/demo.mp4' })
    mocks.start.mockResolvedValue({ stop })
    const recording = createDesktopRecording(() => window as BrowserWindow, vi.fn())
    await recording.toggle()
    recording.windowClosed(window as BrowserWindow)
    await recording.stop()
    expect(stop).toHaveBeenCalledOnce()
    expect(recording.isRecording()).toBe(false)
  })

  it('propagates a capture failure that occurs before the session is returned', async () => {
    const failure = new Error('Window capture failed')
    const stop = vi.fn(() => Promise.reject(failure))
    mocks.saveDialog.mockResolvedValue({ canceled: false, filePath: '/tmp/demo.mp4' })
    mocks.start.mockImplementation((options: { onError(error: Error): void }) => {
      options.onError(failure)
      return Promise.resolve({ stop })
    })
    const recording = createDesktopRecording(() => windowStub() as BrowserWindow, vi.fn())

    await expect(recording.toggle()).rejects.toThrow('Window capture failed')
    expect(stop).toHaveBeenCalledOnce()
    expect(recording.isRecording()).toBe(false)
    expect(mocks.errorBox).not.toHaveBeenCalled()
  })
})
