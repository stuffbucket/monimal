import { getJsonDocumentStore, loadSettings } from '@stuffbucket/maximal-settings'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'

const applicationSettingsSchema = z.object({
  agentApproval: z.enum(['all', 'writes', 'none']),
  agentTools: z.boolean(),
  agentCwd: z.string().min(1),
  agentToolsets: z.array(z.string()),
  terminalDiagnostics: z.boolean(),
})

export interface ApplicationSettingsContext {
  environment?: Readonly<Record<string, string | undefined>>
  argv?: readonly string[]
  cwd?: string
  homeDirectory?: string
  projectTrusted?: boolean
}

export function loadApplicationSettings(userDataDirectory: string, context: ApplicationSettingsContext = {}) {
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
    agentToolsets: z.array(z.unknown())
      .transform((values) => values.filter((value): value is string => typeof value === 'string'))
      .catch(['app']),
    terminalDiagnostics: applicationSettingsSchema.shape.terminalDiagnostics.catch(false),
  }).parse(legacy)
  return loadSettings({
    applicationName: 'maximal', environmentPrefix: 'MAXIMAL',
    schema: applicationSettingsSchema, defaults,
    project: context.projectTrusted === true,
    environment: context.environment ?? process.env,
    argv: context.argv ?? process.argv.slice(1),
    cwd: context.cwd ?? process.cwd(), homeDirectory,
  })
}