import type { AgentTool } from '@earendil-works/pi-agent-core'
import type { TSchema } from 'typebox'

import type { ToolRisk } from './approval.js'

export interface RiskyTool {
  tool: AgentTool<TSchema, unknown>
  risk: ToolRisk
}

export interface Toolset {
  id: string
  build: () => RiskyTool[]
}

const registry = new Map<string, Toolset>()

export function registerToolset(toolset: Toolset): () => void {
  registry.set(toolset.id, toolset)
  return () => {
    if (registry.get(toolset.id) === toolset) registry.delete(toolset.id)
  }
}

export function buildToolsetTools(ids: readonly string[]): RiskyTool[] {
  return ids.flatMap((id) => registry.get(id)?.build() ?? [])
}
