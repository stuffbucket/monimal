import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'

import {
  getJsonDocumentStore,
  getSettingsStore,
  loadSettings,
} from '@maximal/maximal-settings'
import {
  MATERIAL_PRESET_VALUES,
  type PersistedMaterialPreference,
} from '@maximal/maximal-client/shared/host'
import { TMUX_SESSION_PREFIX_PATTERN } from '@maximal/maximal-terminal'
import { z } from 'zod'

const materialTimezones = new Set([
  'UTC',
  ...Intl.supportedValuesOf('timeZone'),
])

const applicationSettingsSchema = z.object({
  agentApproval: z.enum(['all', 'writes', 'none']),
  agentTools: z.boolean(),
  agentCwd: z.string().min(1),
  agentModel: z.string().min(1).optional(),
  agentToolsets: z.array(z.string()),
  terminalDiagnostics: z.boolean(),
  terminalSessionPrefix: z.string().regex(TMUX_SESSION_PREFIX_PATTERN),
  terminalTmuxStatus: z.enum(['off', 'on', 'inherit']),
  ollamaStartOnLaunch: z.boolean(),
  vibrancyEnabled: z.boolean(),
  backgroundEffectsEnabled: z.boolean(),
  reducedMotionEnabled: z.boolean(),
  materialPreset: z.enum(MATERIAL_PRESET_VALUES),
  materialQuality: z.enum(['battery', 'balanced', 'high']),
  materialStrength: z.number().min(0.25).max(1),
  materialMotion: z.number().min(0).max(1),
  materialLighting: z.enum(['fixed', 'timezone']),
  materialTimezone: z.string().refine((value) => materialTimezones.has(value)),
})
type ApplicationSettings = z.infer<typeof applicationSettingsSchema>

const applicationSettingsPersistence = {
  agentApproval: 'user',
  agentTools: 'user',
  agentCwd: 'user',
  agentModel: 'user',
  agentToolsets: 'user',
  terminalDiagnostics: 'user',
  terminalSessionPrefix: 'user',
  terminalTmuxStatus: 'user',
  ollamaStartOnLaunch: 'user',
  vibrancyEnabled: 'user',
  backgroundEffectsEnabled: 'user',
  reducedMotionEnabled: 'user',
  materialPreset: 'user',
  materialQuality: 'user',
  materialStrength: 'user',
  materialMotion: 'user',
  materialLighting: 'user',
  materialTimezone: 'user',
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
    vibrancyEnabled: applicationSettingsSchema.shape.vibrancyEnabled.catch(false),
    backgroundEffectsEnabled: applicationSettingsSchema.shape.backgroundEffectsEnabled.catch(false),
    reducedMotionEnabled: applicationSettingsSchema.shape.reducedMotionEnabled.catch(false),
    materialPreset: applicationSettingsSchema.shape.materialPreset.catch('clouds'),
    materialQuality: applicationSettingsSchema.shape.materialQuality.catch('balanced'),
    materialStrength: applicationSettingsSchema.shape.materialStrength.catch(0.75),
    materialMotion: applicationSettingsSchema.shape.materialMotion.catch(0.5),
    materialLighting: applicationSettingsSchema.shape.materialLighting.catch('fixed'),
    materialTimezone: applicationSettingsSchema.shape.materialTimezone.catch(
      Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    ),
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

export async function setVibrancyEnabled(
  userDataDirectory: string,
  enabled: boolean,
): Promise<boolean> {
  const store = applicationSettingsStore(userDataDirectory)
  try {
    return (await store.create('vibrancyEnabled', enabled))
      .settings.vibrancyEnabled
  } catch (error) {
    if (
      !(error instanceof Error)
      || error.message !== 'Setting already exists in its configured layer: vibrancyEnabled'
    ) {
      throw error
    }
    return (await store.update('vibrancyEnabled', enabled))
      .settings.vibrancyEnabled
  }
}

export async function setBackgroundEffectsEnabled(
  userDataDirectory: string,
  enabled: boolean,
): Promise<boolean> {
  const store = applicationSettingsStore(userDataDirectory)
  try {
    return (await store.create('backgroundEffectsEnabled', enabled))
      .settings.backgroundEffectsEnabled
  } catch (error) {
    if (
      !(error instanceof Error)
      || error.message !== 'Setting already exists in its configured layer: backgroundEffectsEnabled'
    ) {
      throw error
    }
    return (await store.update('backgroundEffectsEnabled', enabled))
      .settings.backgroundEffectsEnabled
  }
}

export async function setReducedMotionEnabled(
  userDataDirectory: string,
  enabled: boolean,
): Promise<boolean> {
  const store = applicationSettingsStore(userDataDirectory)
  try {
    return (await store.create('reducedMotionEnabled', enabled))
      .settings.reducedMotionEnabled
  } catch (error) {
    if (
      !(error instanceof Error)
      || error.message !== 'Setting already exists in its configured layer: reducedMotionEnabled'
    ) {
      throw error
    }
    return (await store.update('reducedMotionEnabled', enabled))
      .settings.reducedMotionEnabled
  }
}

export async function setMaterialPreference(
  userDataDirectory: string,
  input: unknown,
): Promise<PersistedMaterialPreference> {
  const preference = z.object({
    preset: applicationSettingsSchema.shape.materialPreset,
    quality: applicationSettingsSchema.shape.materialQuality,
    strength: applicationSettingsSchema.shape.materialStrength,
    motion: applicationSettingsSchema.shape.materialMotion,
    lighting: applicationSettingsSchema.shape.materialLighting,
    timezone: applicationSettingsSchema.shape.materialTimezone,
  }).parse(input)
  const store = applicationSettingsStore(userDataDirectory)
  const settings = [
    ['materialPreset', preference.preset],
    ['materialQuality', preference.quality],
    ['materialStrength', preference.strength],
    ['materialMotion', preference.motion],
    ['materialLighting', preference.lighting],
    ['materialTimezone', preference.timezone],
  ] as const
  for (const [settingPath, value] of settings) {
    try {
      await store.create(settingPath, value)
    } catch (error) {
      if (
        !(error instanceof Error)
        || error.message !== `Setting already exists in its configured layer: ${settingPath}`
      ) {
        throw error
      }
      await store.update(settingPath, value)
    }
  }
  return materialPreferenceFrom(store.getSnapshot().settings)
}

export function materialPreferenceFrom(
  settings: ApplicationSettings,
): PersistedMaterialPreference {
  return {
    preset: settings.materialPreset,
    quality: settings.materialQuality,
    strength: settings.materialStrength,
    motion: settings.materialMotion,
    lighting: settings.materialLighting,
    timezone: settings.materialTimezone,
  }
}