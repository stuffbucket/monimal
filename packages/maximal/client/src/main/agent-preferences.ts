import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import type { AgentApproval } from '@stuffbucket/maximal-harness'

export interface AgentPreferences {
  approval: AgentApproval
  codingTools: boolean
  cwd: string
  toolsetIds: readonly string[]
}

const DEFAULT_AGENT_PREFERENCES: AgentPreferences = {
  approval: 'writes',
  codingTools: true,
  cwd: homedir(),
  toolsetIds: ['app'],
}

function approvalOf(value: unknown): AgentApproval {
  return value === 'all' || value === 'writes' || value === 'none'
    ? value
    : DEFAULT_AGENT_PREFERENCES.approval
}

export function loadAgentPreferences(userDataDirectory: string): AgentPreferences {
  let input: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(
      readFileSync(join(userDataDirectory, 'preferences.json'), 'utf8'),
    )
    input = typeof parsed === 'object' && parsed !== null
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    input = {}
  }

  return {
    approval: approvalOf(input.agentApproval),
    codingTools: typeof input.agentTools === 'boolean'
      ? input.agentTools
      : DEFAULT_AGENT_PREFERENCES.codingTools,
    cwd: typeof input.agentCwd === 'string' && input.agentCwd.length > 0
      ? input.agentCwd
      : DEFAULT_AGENT_PREFERENCES.cwd,
    toolsetIds: Array.isArray(input.agentToolsets)
      ? input.agentToolsets.filter((id): id is string => typeof id === 'string')
      : DEFAULT_AGENT_PREFERENCES.toolsetIds,
  }
}
