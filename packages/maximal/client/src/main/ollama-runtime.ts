import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { access } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import type { OllamaRuntimeStatus } from '../shared/bridge-types.js'

interface CommandResult {
  stdout: string
}

interface OllamaRuntimeDependencies {
  platform: NodeJS.Platform
  environment: NodeJS.ProcessEnv
  home: string
  fetch: typeof globalThis.fetch
  access(path: string): Promise<void>
  execFile(file: string, args: string[]): Promise<CommandResult>
  spawn(file: string, args: string[]): ChildProcess
  readContextLength(path: string): number | null
  writeContextLength(path: string, value: number): void
}

function execute(file: string, args: string[]): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { encoding: 'utf8' }, (error, stdout) => {
      if (error) reject(new Error(`Failed to execute ${file}`, { cause: error }))
      else resolve({ stdout })
    })
  })
}

const defaults: OllamaRuntimeDependencies = {
  platform: process.platform,
  environment: process.env,
  home: homedir(),
  fetch: globalThis.fetch,
  access,
  execFile: execute,
  spawn: (file, args) =>
    spawn(file, args, {
      detached: true,
      stdio: 'ignore',
    }),
  readContextLength: (path) => {
    const database = new DatabaseSync(path, { readOnly: true })
    try {
      const row = database
        .prepare('SELECT context_length FROM settings WHERE id = 1')
        .get() as { context_length?: unknown } | undefined
      return typeof row?.context_length === 'number' ? row.context_length : null
    } finally {
      database.close()
    }
  },
  writeContextLength: (path, value) => {
    const database = new DatabaseSync(path)
    try {
      const result = database
        .prepare('UPDATE settings SET context_length = ? WHERE id = 1')
        .run(value)
      if (result.changes !== 1) {
        throw new Error('Ollama desktop settings row was not found')
      }
    } finally {
      database.close()
    }
  },
}

async function firstExisting(
  paths: readonly string[],
  dependencies: OllamaRuntimeDependencies,
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

function runtimePaths(dependencies: OllamaRuntimeDependencies): {
  serverConfigurationPath: string
  desktopSettingsPath: string | null
} {
  const serverConfigurationPath = join(dependencies.home, '.ollama', 'server.json')
  if (dependencies.platform === 'darwin') {
    return {
      serverConfigurationPath,
      desktopSettingsPath: join(
        dependencies.home,
        'Library',
        'Application Support',
        'Ollama',
        'db.sqlite',
      ),
    }
  }
  if (dependencies.platform === 'win32') {
    const appData =
      dependencies.environment.APPDATA
      ?? join(dependencies.home, 'AppData', 'Roaming')
    return {
      serverConfigurationPath,
      desktopSettingsPath: join(appData, 'Ollama', 'db.sqlite'),
    }
  }
  return { serverConfigurationPath, desktopSettingsPath: null }
}

async function effectiveEndpoint(
  dependencies: OllamaRuntimeDependencies,
): Promise<string> {
  let host = dependencies.environment.OLLAMA_HOST?.trim()
  if (!host && dependencies.platform === 'darwin') {
    try {
      host = (
        await dependencies.execFile('/bin/launchctl', ['getenv', 'OLLAMA_HOST'])
      ).stdout.trim()
    } catch {
      host = undefined
    }
  }
  if (!host) return 'http://127.0.0.1:11434'
  if (/^https?:\/\//u.test(host)) return host.replace(/\/$/u, '')
  return `http://${host.replace(/\/$/u, '')}`
}

async function contextLength(
  path: string | null,
  dependencies: OllamaRuntimeDependencies,
): Promise<number | null> {
  if (path === null) return null
  try {
    await dependencies.access(path)
    return dependencies.readContextLength(path)
  } catch {
    return null
  }
}

async function registeredApplication(
  dependencies: OllamaRuntimeDependencies,
): Promise<string | null> {
  if (dependencies.platform === 'darwin') {
    return firstExisting(
      [
        '/Applications/Ollama.app',
        join(dependencies.home, 'Applications', 'Ollama.app'),
      ],
      dependencies,
    )
  }

  if (dependencies.platform !== 'win32') return null
  const localAppData = dependencies.environment.LOCALAPPDATA
  if (!localAppData) return null
  for (const executable of [
    join(localAppData, 'Programs', 'Ollama', 'Ollama.exe'),
    join(localAppData, 'Programs', 'Ollama', 'ollama app.exe'),
  ]) {
    try {
      await dependencies.access(executable)
      return executable
    } catch {
      continue
    }
  }
  return null
}

async function commandPath(
  dependencies: OllamaRuntimeDependencies,
): Promise<string | null> {
  try {
    const command =
      dependencies.platform === 'win32' ? 'where.exe' : '/usr/bin/which'
    const result = await dependencies.execFile(command, ['ollama'])
    return result.stdout.split(/\r?\n/u).map((line) => line.trim()).find(Boolean) ?? null
  } catch {
    return null
  }
}

async function isRunning(
  dependencies: OllamaRuntimeDependencies,
  endpoint: string,
): Promise<boolean> {
  try {
    const response = await dependencies.fetch(
      `${endpoint}/api/version`,
      { signal: AbortSignal.timeout(1500) },
    )
    return response.ok
  } catch {
    return false
  }
}

export async function getOllamaRuntimeStatus(
  overrides: Partial<OllamaRuntimeDependencies> = {},
): Promise<OllamaRuntimeStatus> {
  const dependencies = { ...defaults, ...overrides }
  const paths = runtimePaths(dependencies)
  const [application, cliPath, endpoint, configuredContextLength] = await Promise.all([
    registeredApplication(dependencies),
    commandPath(dependencies),
    effectiveEndpoint(dependencies),
    contextLength(paths.desktopSettingsPath, dependencies),
  ])
  const running = await isRunning(dependencies, endpoint)
  const installation =
    application !== null ? 'application'
    : cliPath !== null ? 'cli'
    : 'none'
  return {
    installation,
    installed: installation !== 'none',
    running,
    can_launch: application !== null || (cliPath !== null && !running),
    can_manage: application !== null,
    application_path: application ?? cliPath,
    server_configuration_path: paths.serverConfigurationPath,
    desktop_settings_path: paths.desktopSettingsPath,
    endpoint,
    context_length: configuredContextLength,
  }
}

export async function launchOllama(
  overrides: Partial<OllamaRuntimeDependencies> = {},
): Promise<OllamaRuntimeStatus> {
  const dependencies = { ...defaults, ...overrides }
  const application = await registeredApplication(dependencies)
  if (application !== null) {
    if (dependencies.platform === 'darwin') {
      await dependencies.execFile('/usr/bin/open', [application])
    } else {
      await dependencies.execFile(application, [])
    }
  } else {
    const cliPath = await commandPath(dependencies)
    if (cliPath === null) throw new Error('Ollama is not installed')
    const child = dependencies.spawn(cliPath, ['serve'])
    await new Promise<void>((resolve, reject) => {
      child.once('spawn', resolve)
      child.once('error', reject)
    })
    child.unref()
  }
  return getOllamaRuntimeStatus(dependencies)
}

export async function updateOllamaContextLength(
  value: number,
  overrides: Partial<OllamaRuntimeDependencies> = {},
): Promise<OllamaRuntimeStatus> {
  if (!Number.isSafeInteger(value) || value < 512) {
    throw new Error('Ollama context length must be at least 512')
  }
  const dependencies = { ...defaults, ...overrides }
  const path = runtimePaths(dependencies).desktopSettingsPath
  if (path === null) {
    throw new Error('Ollama desktop context settings are unavailable')
  }
  await dependencies.access(path)
  dependencies.writeContextLength(path, value)
  return getOllamaRuntimeStatus(dependencies)
}
