import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { _electron as electron, type ElectronApplication } from '@playwright/test'

import { relocatePackagedApp } from './relocate-app'

export interface RunningApp {
  app: ElectronApplication
  /** Root temp dir holding the relocated app copy; remove on teardown. */
  appRoot: string
  userDataDir: string
}

/**
 * Launch a freshly relocated copy of the packaged app (see
 * ./relocate-app.ts) via Playwright's Electron support, pointed at an
 * isolated `--user-data-dir` so it never touches a real user profile or
 * collides with a dev instance already running on this machine.
 */
export async function launchPackagedApp(
  env: Readonly<Record<string, string>> = {},
): Promise<RunningApp> {
  const { appPath, root: appRoot } = relocatePackagedApp()
  const userDataDir = mkdtempSync(join(tmpdir(), 'maximal-e2e-userdata-'))
  const executablePath = process.platform === 'darwin'
    ? join(appPath, 'Contents/MacOS/Maximal')
    : join(appPath, 'maximal')

  const inherited = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  )
  const app = await electron.launch({
    executablePath,
    args: [
      `--user-data-dir=${userDataDir}`,
      ...(process.env.MAXIMAL_DESKTOP_E2E_NO_SANDBOX === '1' ? ['--no-sandbox'] : []),
    ],
    env: { ...inherited, ...env },
  })
  const proc = app.process()
  proc.stdout?.resume()
  proc.stderr?.resume()

  return { app, appRoot, userDataDir }
}

export function cleanupPackagedApp(running: RunningApp): void {
  rmSync(running.appRoot, { recursive: true, force: true })
  rmSync(running.userDataDir, { recursive: true, force: true })
}
