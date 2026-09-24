import type { AgentApproval } from '@stuffbucket/maximal-harness'
import { loadApplicationSettings } from './application-settings.js'

export interface AgentPreferences {
  approval: AgentApproval
  codingTools: boolean
  cwd: string
  toolsetIds: readonly string[]
}

export function loadAgentPreferences(userDataDirectory: string): AgentPreferences {
  const { settings } = loadApplicationSettings(userDataDirectory)
  return {
    approval: settings.agentApproval,
    codingTools: settings.agentTools,
    cwd: settings.agentCwd,
    toolsetIds: settings.agentToolsets,
  }
}
