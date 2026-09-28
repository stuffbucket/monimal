import type { AgentApproval } from '@maximal/maximal-harness'
import { loadApplicationSettings } from '../preferences/application-settings.js'

export interface HarnessOptions {
  approval: AgentApproval
  codingTools: boolean
  cwd: string
  toolsetIds: readonly string[]
}

export function loadHarnessOptions(userDataDirectory: string): HarnessOptions {
  const { settings } = loadApplicationSettings(userDataDirectory)
  return {
    approval: settings.agentApproval,
    codingTools: settings.agentTools,
    cwd: settings.agentCwd,
    toolsetIds: settings.agentToolsets,
  }
}
