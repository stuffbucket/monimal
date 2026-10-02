import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'

import {
  getNamedJsonDocumentStore,
  getSettingsStore,
  loadSettings,
} from '@maximal/maximal-settings'
import {
  MATERIAL_PRESET_VALUES,
  type PersistedMaterialPreference,
  TERMINAL_THICKEN_DEFAULT,
  type TerminalTypographySettings,
  WORKBAR_ITEM_IDS,
  type WorkbarItemId,
  type WorkbarLayout,
} from '@maximal/maximal-client/shared/host'
import {
  DEFAULT_TERMINAL_PALETTE_SETTINGS,
  type TerminalPaletteSettings,
} from '@maximal/maximal-terminal/renderer'
import { TMUX_SESSION_PREFIX_PATTERN } from '@maximal/maximal-terminal'
import { z } from 'zod'

const materialTimezones = new Set([
  'UTC',
  ...Intl.supportedValuesOf('timeZone'),
])
const terminalColourSchema = z.string().regex(/^#[0-9a-f]{6}$/iu)
const terminalPaletteSchema = z.object({
  background: terminalColourSchema,
  foreground: terminalColourSchema,
  cursor: terminalColourSchema,
  selectionBackground: terminalColourSchema,
  black: terminalColourSchema,
  red: terminalColourSchema,
  green: terminalColourSchema,
  yellow: terminalColourSchema,
  blue: terminalColourSchema,
  magenta: terminalColourSchema,
  cyan: terminalColourSchema,
  white: terminalColourSchema,
  brightBlack: terminalColourSchema,
  brightRed: terminalColourSchema,
  brightGreen: terminalColourSchema,
  brightYellow: terminalColourSchema,
  brightBlue: terminalColourSchema,
  brightMagenta: terminalColourSchema,
  brightCyan: terminalColourSchema,
  brightWhite: terminalColourSchema,
})
export const terminalPaletteSettingsSchema: z.ZodType<TerminalPaletteSettings> =
  z.object({
    mode: z.enum(['auto', 'light', 'dark']),
    light: terminalPaletteSchema,
    dark: terminalPaletteSchema,
    minimumContrast: z.number().multipleOf(0.25).min(1).max(21),
    effects: z.object({
      opacity: z.number().multipleOf(0.01).min(0).max(1),
      blur: z.number().int().min(0).max(64),
      tint: terminalColourSchema,
      tintAmount: z.number().multipleOf(0.01).min(0).max(1),
      tone: z.number().multipleOf(0.01).min(-1).max(1),
      blendMode: z.enum([
        'normal',
        'multiply',
        'screen',
        'overlay',
        'darken',
        'lighten',
      ]),
      stamp: z.boolean(),
      compensate: z.boolean(),
    }),
  })

export const terminalTypographySettingsSchema = z.object({
  fontFamily: z.string().trim().min(1).max(256),
  fontSize: z.number().multipleOf(0.25).min(1).max(255),
  fontWeight: z.number().int().multipleOf(25).min(50).max(1000),
  fontVariations: z.record(
    z.string().regex(/^[\x20-\x7e]{4}$/u),
    z.number().finite().min(-10_000).max(10_000),
  ).default({}),
  cellHeight: z.number().multipleOf(0.1).min(-50).max(100),
  tracking: z.number().multipleOf(0.1).min(-20).max(50).default(0),
  baseline: z.number().multipleOf(0.1).min(-20).max(20).default(0),
  thicken: z.boolean().default(false),
  thickenStrength: z.number().int().min(0).max(100)
    .default(TERMINAL_THICKEN_DEFAULT),
  ligatures: z.boolean(),
  fontFeatures: z.record(
    z.string().regex(/^[\x20-\x7e]{4}$/u),
    z.boolean(),
  ).default({}),
  palette: terminalPaletteSettingsSchema
    .default(DEFAULT_TERMINAL_PALETTE_SETTINGS),
}).transform((value) => ({
  ...value,
  thicken: value.thicken && value.thickenStrength > 0,
  thickenStrength: value.thicken ? value.thickenStrength : 0,
}))

const workbarItemIdSchema = z.enum(WORKBAR_ITEM_IDS)
const workbarItemIds = new Set<string>(WORKBAR_ITEM_IDS)

export const workbarLayoutUpdateSchema = z.object({
  order: z.array(workbarItemIdSchema)
    .length(WORKBAR_ITEM_IDS.length)
    .refine((ids) => new Set(ids).size === WORKBAR_ITEM_IDS.length),
  visible: z.array(workbarItemIdSchema)
    .refine((ids) => new Set(ids).size === ids.length),
}).transform((value) => value)

export const workbarLayoutSchema: z.ZodType<WorkbarLayout> = z.object({
  order: z.array(z.string()),
  visible: z.array(z.string()),
}).transform((value) => {
  const order = [...new Set(value.order)]
    .filter((id): id is WorkbarItemId => workbarItemIds.has(id))
  const present = new Set(order)
  order.push(...WORKBAR_ITEM_IDS.filter((id) => !present.has(id)))
  return {
    order,
    visible: [...new Set(value.visible)]
      .filter((id): id is WorkbarItemId => workbarItemIds.has(id)),
  }
})

const applicationSettingsSchema = z.object({
  agentApproval: z.enum(['all', 'writes', 'none']),
  agentTools: z.boolean(),
  agentCwd: z.string().min(1),
  agentModel: z.string().min(1).optional(),
  agentToolsets: z.array(z.string()),
  terminalDiagnostics: z.boolean(),
  terminalSessionPrefix: z.string().regex(TMUX_SESSION_PREFIX_PATTERN),
  terminalTmuxStatus: z.enum(['off', 'on', 'inherit']),
  terminalTypography: terminalTypographySettingsSchema.transform((value) => value),
  workbarLayout: workbarLayoutSchema,
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
  terminalTypography: 'user',
  workbarLayout: 'user',
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
    legacy = getNamedJsonDocumentStore({
      namespace: 'maximal-legacy-preferences',
      directoryPath: userDataDirectory,
      documentName: 'preferences',
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
    terminalTypography: terminalTypographySettingsSchema.catch({
      fontFamily: 'ui-monospace',
      fontSize: 13,
      fontWeight: 400,
      fontVariations: {},
      cellHeight: 0,
      tracking: 0,
      baseline: 0,
      thicken: false,
      thickenStrength: 0,
      ligatures: true,
      fontFeatures: {},
      palette: DEFAULT_TERMINAL_PALETTE_SETTINGS,
    }),
    workbarLayout: workbarLayoutSchema.catch({
      order: [...WORKBAR_ITEM_IDS],
      visible: [...WORKBAR_ITEM_IDS],
    }),
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
    userFile: join(userDataDirectory, 'settings.json'),
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

export async function setTerminalTypography(
  userDataDirectory: string,
  settings: TerminalTypographySettings,
): Promise<TerminalTypographySettings> {
  const value = terminalTypographySettingsSchema.parse(settings)
  const store = applicationSettingsStore(userDataDirectory)
  try {
    return (await store.create('terminalTypography', value))
      .settings.terminalTypography
  } catch (error) {
    if (
      !(error instanceof Error)
      || error.message !== 'Setting already exists in its configured layer: terminalTypography'
    ) {
      throw error
    }
    return (await store.update('terminalTypography', value))
      .settings.terminalTypography
  }
}

export async function setWorkbarLayout(
  userDataDirectory: string,
  layout: WorkbarLayout,
): Promise<WorkbarLayout> {
  const value = workbarLayoutUpdateSchema.parse(layout)
  const store = applicationSettingsStore(userDataDirectory)
  try {
    return (await store.create('workbarLayout', value)).settings.workbarLayout
  } catch (error) {
    if (
      !(error instanceof Error)
      || error.message !== 'Setting already exists in its configured layer: workbarLayout'
    ) {
      throw error
    }
    return (await store.update('workbarLayout', value)).settings.workbarLayout
  }
}