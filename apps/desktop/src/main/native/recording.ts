import { join } from 'node:path'

import { startWindowRecording, type RecordingSession } from '@maximal/maximal-recording/main'
import { app, dialog, type BrowserWindow } from 'electron'

import { mainLogger } from '../main-logger.js'

export interface DesktopRecording {
  isRecording(): boolean
  toggle(): Promise<void>
  stop(): Promise<void>
  windowClosed(window: BrowserWindow): void
}

/** Desktop owns the consent dialog, destination, and selected window. */
export function createDesktopRecording(
  currentWindow: () => BrowserWindow | null,
  onChange: () => void,
): DesktopRecording {
  let active: { window: BrowserWindow; session: RecordingSession } | null = null
  let starting = false
  let finalizing: Promise<void> | null = null

  const stop = (): Promise<void> => {
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
    if (starting || active !== null || finalizing !== null) {
      throw new Error('A window recording is already starting, running, or being saved.')
    }
    const window = currentWindow()
    if (window === null || window.isDestroyed()) {
      throw new Error('Open the main window before recording it.')
    }
    starting = true
    try {
      const { canceled, filePath } = await dialog.showSaveDialog(window, {
        title: 'Record Maximal window',
        defaultPath: join(app.getPath('documents'), `maximal-${new Date().toISOString().replaceAll(':', '-')}.mp4`),
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
          void stop().catch((failure: unknown) => {
            const message = failure instanceof Error ? failure.message : String(failure)
            dialog.showErrorBox('Recording failed', message)
          })
        },
      })
      active = { window, session }
      onChange()
      if (captureFailure && active !== null) await stop()
    } finally {
      starting = false
    }
  }

  return {
    isRecording: () => active !== null || finalizing !== null,
    toggle: () => active === null ? start() : stop(),
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
