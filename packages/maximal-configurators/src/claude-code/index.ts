import {
  BUILTIN_CONFIGURATOR_TARGETS,
  type ConfiguratorHost,
  type ConfiguratorMetadata,
  type ConfiguratorPlugin,
  type ManagedFieldPatch,
} from "@stuffbucket/maximal-core/configurator-host"

import { defineConfigurator } from "../configurator.ts"

export const claudeCodeMetadata = Object.freeze({
  id: "claude-code",
  name: "Claude Code",
  targetId: BUILTIN_CONFIGURATOR_TARGETS.claudeCode,
  credentialBinding: {
    kind: "bearer-env",
    name: "ANTHROPIC_AUTH_TOKEN",
  },
} satisfies ConfiguratorMetadata)

export function claudeCodeFields(
  baseUrl: string,
  credential: string,
): ReadonlyArray<ManagedFieldPatch> {
  return [
    { path: ["env", "ANTHROPIC_BASE_URL"], value: baseUrl },
    { path: ["env", "ANTHROPIC_AUTH_TOKEN"], value: credential },
  ]
}

export function createClaudeCodeConfigurator(
  host: ConfiguratorHost,
): ConfiguratorPlugin {
  return defineConfigurator(
    claudeCodeMetadata,
    (material) => claudeCodeFields(material.baseUrl, material.credential ?? ""),
    host,
  )
}
