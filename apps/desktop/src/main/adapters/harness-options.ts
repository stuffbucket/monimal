import type { AgentApproval } from '@maximal/maximal-harness'
import {
  loadApplicationSettings,
  type ApplicationSettingsContext,
} from '../preferences/application-settings.js'

export interface HarnessOptions {
  approval: AgentApproval
  codingTools: boolean
  cwd: string
  preferredModel?: string
  toolsetIds: readonly string[]
}

export function loadHarnessOptions(
  userDataDirectory: string,
  context: ApplicationSettingsContext = {},
): HarnessOptions {
  const { settings } = loadApplicationSettings(userDataDirectory, context)
  return {
    approval: settings.agentApproval,
    codingTools: settings.agentTools,
    cwd: settings.agentCwd,
    ...(settings.agentModel === undefined
      ? {}
      : { preferredModel: settings.agentModel }),
    toolsetIds: settings.agentToolsets,
  }
}
