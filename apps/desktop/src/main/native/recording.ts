import { isAbsolute, join } from 'node:path'
import { mkdir } from 'node:fs/promises'

import { startWindowRecording, type RecordingSession } from '@maximal/maximal-recording/main'
import { app, dialog, shell, type BrowserWindow } from 'electron'

import { mainLogger } from '../main-logger.js'

export interface DesktopRecording {
  isRecording(): boolean
  toggle(): Promise<void>
  stop(): Promise<void>
  windowClosed(window: BrowserWindow): void
}

export function recordingsDirectory(
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const configured = environment['XDG_DATA_HOME']
  const dataHome =
    configured && isAbsolute(configured)
      ? configured
      : join(app.getPath('home'), '.local', 'share')
  return join(dataHome, 'maximal', 'recordings')
}

export async function revealRecordingsDirectory(): Promise<void> {
  const directory = recordingsDirectory()
  await mkdir(directory, { recursive: true })
  const error = await shell.openPath(directory)
  if (error) throw new Error(error)
}

/** Desktop owns the consent dialog, destination, and selected window. */
export function createDesktopRecording(
  currentWindow: () => BrowserWindow | null,
  onChange: () => void,
): DesktopRecording {
  let active: { window: BrowserWindow; session: RecordingSession } | null = null
  let starting: Promise<void> | null = null
  let finalizing: Promise<void> | null = null

  const stopActive = (): Promise<void> => {
    if (finalizing !== null) return finalizing
    if (active === null) return Promise.resolve()
    const { session } = active
    active = null
    finalizing = session.stop().then((result) => {
      mainLogger.info({ frames: result.frames }, 'Window recording saved')
    }).finally(() => {
      finalizing = null
      onChange()
    })
    return finalizing
  }

  const start = async (): Promise<void> => {
    const window = currentWindow()
    if (window === null || window.isDestroyed()) {
      throw new Error('Open the main window before recording it.')
    }
    const directory = recordingsDirectory()
    await mkdir(directory, { recursive: true })
    const { canceled, filePath } = await dialog.showSaveDialog(window, {
      title: 'Record Maximal window',
      defaultPath: join(directory, `maximal-${new Date().toISOString().replaceAll(':', '-')}.mp4`),
      filters: [{ name: 'MP4 video', extensions: ['mp4'] }],
    })
    if (canceled || !filePath) return
    if (window.isDestroyed()) throw new Error('The window closed before recording could start.')

    let captureFailure: Error | undefined
    const session = await startWindowRecording({
      output: filePath,
      captureFrame: async () => {
        if (window.isDestroyed()) throw new Error('The recorded window has closed.')
        const image = await window.webContents.capturePage()
        if (image.isEmpty()) throw new Error('The recorded window returned an empty frame.')
        return image.toPNG()
      },
      onError: (error) => {
        captureFailure = error
        mainLogger.error({ errorName: error.name }, 'Window recording failed')
        if (active?.window !== window) return
        void stopActive().catch((failure: unknown) => {
          const message = failure instanceof Error ? failure.message : String(failure)
          dialog.showErrorBox('Recording failed', message)
        })
      },
    })
    active = { window, session }
    if (captureFailure) await stopActive()
  }

  const beginStart = (): Promise<void> => {
    const pending = start().finally(() => {
      starting = null
      if (active === null) onChange()
    })
    starting = pending
    onChange()
    return pending
  }

  const stop = (): Promise<void> => {
    if (finalizing !== null) return finalizing
    if (starting !== null) return starting.then(stop)
    return stopActive()
  }

  const toggle = (): Promise<void> => {
    if (starting !== null) return starting
    if (finalizing !== null) return finalizing
    return active === null ? beginStart() : stopActive()
  }

  return {
    isRecording: () => starting !== null || active !== null || finalizing !== null,
    toggle,
    stop,
    windowClosed: (window) => {
      if (active?.window !== window) return
      void stop().catch((error: unknown) => {
        mainLogger.error({ errorName: error instanceof Error ? error.name : 'unknown' }, 'Window recording failed to stop')
        dialog.showErrorBox('Recording failed', error instanceof Error ? error.message : String(error))
      })
    },
  }
}
