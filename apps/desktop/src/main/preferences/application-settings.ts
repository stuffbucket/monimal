import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'

import {
  getJsonDocumentStore,
  getSettingsStore,
  loadSettings,
} from '@maximal/maximal-settings'
import { TMUX_SESSION_PREFIX_PATTERN } from '@maximal/maximal-terminal'
import { z } from 'zod'

const applicationSettingsSchema = z.object({
  assistantOverlayCandy: z.boolean(),
  agentApproval: z.enum(['all', 'writes', 'none']),
  agentTools: z.boolean(),
  agentCwd: z.string().min(1),
  agentModel: z.string().min(1).optional(),
  agentToolsets: z.array(z.string()),
  terminalDiagnostics: z.boolean(),
  terminalSessionPrefix: z.string().regex(TMUX_SESSION_PREFIX_PATTERN),
  terminalTmuxStatus: z.enum(['off', 'on', 'inherit']),
  ollamaStartOnLaunch: z.boolean(),
})
type ApplicationSettings = z.infer<typeof applicationSettingsSchema>

const applicationSettingsPersistence = {
  assistantOverlayCandy: 'user',
  agentApproval: 'user',
  agentTools: 'user',
  agentCwd: 'user',
  agentModel: 'user',
  agentToolsets: 'user',
  terminalDiagnostics: 'user',
  terminalSessionPrefix: 'user',
  terminalTmuxStatus: 'user',
  ollamaStartOnLaunch: 'user',
} as const
const reportListenerError = (error: unknown): never => {
  throw error
}

export interface ApplicationSettingsContext {
  environment?: Readonly<Record<string, string | undefined>>
  argv?: readonly string[]
  cwd?: string
  homeDirectory?: string
  projectTrusted?: boolean
}

function applicationSettingsDefaults(
  userDataDirectory: string,
  context: ApplicationSettingsContext,
): ApplicationSettings {
  const homeDirectory = context.homeDirectory ?? homedir()
  let legacy: Record<string, unknown>
  try {
    legacy = getJsonDocumentStore({
      namespace: 'maximal-legacy-preferences',
      filePath: join(userDataDirectory, 'preferences.json'),
    }).read() ?? {}
  } catch {
    legacy = {}
  }
  const defaults = z.object({
    assistantOverlayCandy: applicationSettingsSchema.shape.assistantOverlayCandy.catch(true),
    agentApproval: applicationSettingsSchema.shape.agentApproval.catch('writes'),
    agentTools: applicationSettingsSchema.shape.agentTools.catch(true),
    agentCwd: applicationSettingsSchema.shape.agentCwd.catch(homeDirectory),
    agentModel: applicationSettingsSchema.shape.agentModel.catch(undefined),
    agentToolsets: z.array(z.unknown())
      .transform((values) => values.filter((value): value is string => typeof value === 'string'))
      .catch(['app']),
    terminalDiagnostics: applicationSettingsSchema.shape.terminalDiagnostics.catch(false),
    terminalSessionPrefix: applicationSettingsSchema.shape.terminalSessionPrefix.catch('maximal'),
    terminalTmuxStatus: applicationSettingsSchema.shape.terminalTmuxStatus.catch('off'),
    ollamaStartOnLaunch: applicationSettingsSchema.shape.ollamaStartOnLaunch.catch(false),
  }).parse(legacy)
  return defaults
}

function applicationSettingsOptions(
  userDataDirectory: string,
  context: ApplicationSettingsContext = {},
) {
  const homeDirectory = context.homeDirectory ?? homedir()
  return {
    applicationName: 'maximal', environmentPrefix: 'MAXIMAL',
    schema: applicationSettingsSchema,
    defaults: applicationSettingsDefaults(userDataDirectory, context),
    project: context.projectTrusted === true,
    environment: context.environment ?? process.env,
    argv: context.argv ?? process.argv.slice(1),
    cwd: context.cwd ?? process.cwd(), homeDirectory,
  }
}

function applicationSettingsStore(userDataDirectory: string) {
  return getSettingsStore<ApplicationSettings>({
    ...applicationSettingsOptions(userDataDirectory),
    instanceId: `desktop-${createHash('sha256').update(userDataDirectory).digest('hex')}`,
    persistence: applicationSettingsPersistence,
    onListenerError: reportListenerError,
  })
}

export function loadApplicationSettings(
  userDataDirectory: string,
  context: ApplicationSettingsContext = {},
) {
  return loadSettings(applicationSettingsOptions(userDataDirectory, context))
}

export async function setOllamaStartOnLaunch(
  userDataDirectory: string,
  enabled: boolean,
): Promise<boolean> {
  const store = applicationSettingsStore(userDataDirectory)
  try {
    return (await store.create('ollamaStartOnLaunch', enabled))
      .settings.ollamaStartOnLaunch
  } catch (error) {
    if (
      !(error instanceof Error)
      || error.message !== 'Setting already exists in its configured layer: ollamaStartOnLaunch'
    ) {
      throw error
    }

    return (await store.update('ollamaStartOnLaunch', enabled))
      .settings.ollamaStartOnLaunch
  }
}

export async function setAssistantOverlayPreferences(
  userDataDirectory: string,
  update: {
    candy?: boolean
    approval?: ApplicationSettings['agentApproval']
  },
): Promise<Pick<ApplicationSettings, 'assistantOverlayCandy' | 'agentApproval'>> {
  const store = applicationSettingsStore(userDataDirectory)
  let settings = store.getSnapshot().settings
  for (const [key, value] of [
    ['assistantOverlayCandy', update.candy],
    ['agentApproval', update.approval],
  ] as const) {
    if (value === undefined) continue
    try {
      settings = (await store.create(key, value)).settings
    } catch (error) {
      if (
        !(error instanceof Error)
        || error.message !== `Setting already exists in its configured layer: ${key}`
      ) {
        throw error
      }
      settings = (await store.update(key, value)).settings
    }
  }
  return {
    assistantOverlayCandy: settings.assistantOverlayCandy,
    agentApproval: settings.agentApproval,
  }
}