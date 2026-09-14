import { execFile } from 'node:child_process'
import { access } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import type { ClientInstallation } from '../shared/bridge-types.js'

interface Dependencies {
  platform: NodeJS.Platform
  environment: NodeJS.ProcessEnv
  home: string
  access(path: string): Promise<void>
  execFile(file: string, args: string[]): Promise<string>
}

function execute(file: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { encoding: 'utf8' }, (error, stdout) => {
      if (error) reject(new Error(`Failed to execute ${file}`, { cause: error }))
      else resolve(stdout)
    })
  })
}

const defaults: Dependencies = {
  platform: process.platform,
  environment: process.env,
  home: homedir(),
  access,
  execFile: execute,
}

async function commandPath(
  name: string,
  dependencies: Dependencies,
): Promise<string | null> {
  try {
    const command =
      dependencies.platform === 'win32' ? 'where.exe' : '/usr/bin/which'
    const stdout = await dependencies.execFile(command, [name])
    return stdout.split(/\r?\n/u).map((line) => line.trim()).find(Boolean) ?? null
  } catch {
    return null
  }
}

async function firstExisting(
  paths: readonly string[],
  dependencies: Dependencies,
): Promise<string | null> {
  for (const path of paths) {
    try {
      await dependencies.access(path)
      return path
    } catch {
      continue
    }
  }
  return null
}

function claudeDesktopConfigPath(dependencies: Dependencies): string {
  if (dependencies.platform === 'darwin') {
    return join(
      dependencies.home,
      'Library',
      'Application Support',
      'Claude',
      'claude_desktop_config.json',
    )
  }
  if (dependencies.platform === 'win32') {
    return join(
      dependencies.environment.APPDATA ?? join(dependencies.home, 'AppData', 'Roaming'),
      'Claude',
      'claude_desktop_config.json',
    )
  }
  return join(dependencies.home, '.config', 'Claude', 'claude_desktop_config.json')
}

export async function listClientInstallations(
  overrides: Partial<Dependencies> = {},
): Promise<ClientInstallation[]> {
  const dependencies = { ...defaults, ...overrides }
  const claudeDesktopCandidates =
    dependencies.platform === 'darwin'
      ? [
          '/Applications/Claude.app',
          join(dependencies.home, 'Applications', 'Claude.app'),
        ]
      : dependencies.platform === 'win32'
        ? [
            join(
              dependencies.environment.LOCALAPPDATA
                ?? join(dependencies.home, 'AppData', 'Local'),
              'Programs',
              'Claude',
              'Claude.exe',
            ),
          ]
        : []
  const [claudeCode, claudeDesktop, copilotCli] = await Promise.all([
    commandPath('claude', dependencies),
    firstExisting(claudeDesktopCandidates, dependencies),
    commandPath('copilot', dependencies),
  ])
  return [
    {
      id: 'claude-code',
      client_path: claudeCode,
      configuration_path: join(dependencies.home, '.claude', 'settings.json'),
    },
    {
      id: 'claude-desktop',
      client_path: claudeDesktop,
      configuration_path: claudeDesktopConfigPath(dependencies),
    },
    {
      id: 'copilot-cli',
      client_path: copilotCli,
      configuration_path: null,
    },
  ]
}
