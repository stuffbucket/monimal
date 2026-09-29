import type { AgentApproval } from '@maximal/maximal-harness'
import { loadApplicationSettings } from '../preferences/application-settings.js'

export interface HarnessOptions {
  approval: AgentApproval
  codingTools: boolean
  cwd: string
  preferredModel?: string
  toolsetIds: readonly string[]
}

export function loadHarnessOptions(userDataDirectory: string): HarnessOptions {
  const { settings } = loadApplicationSettings(userDataDirectory)
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
