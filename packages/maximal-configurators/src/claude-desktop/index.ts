import {
  BUILTIN_CONFIGURATOR_TARGETS,
  type ConfiguratorHost,
  type ConfiguratorMetadata,
  type ConfiguratorPlugin,
  type ManagedFieldPatch,
} from "@stuffbucket/maximal-core/configurator-host"

import { defineConfigurator } from "../configurator.ts"

export const claudeDesktopMetadata = Object.freeze({
  id: "claude-desktop",
  name: "Claude Desktop",
  targetId: BUILTIN_CONFIGURATOR_TARGETS.claudeDesktop,
  credentialBinding: {
    kind: "native-field",
    path: ["inferenceGatewayApiKey"],
  },
} satisfies ConfiguratorMetadata)

export function claudeDesktopGatewayFields(
  baseUrl: string,
  credential: string,
  workspaceDirectory: string,
): ReadonlyArray<ManagedFieldPatch> {
  return [
    { path: ["inferenceProvider"], value: "gateway" },
    { path: ["inferenceGatewayBaseUrl"], value: baseUrl },
    { path: ["inferenceGatewayApiKey"], value: credential },
    { path: ["inferenceGatewayAuthScheme"], value: "bearer" },
    { path: ["disableDeploymentModeChooser"], value: true },
    { path: ["coworkEgressAllowedHosts"], value: ["*"] },
    { path: ["allowedWorkspaceFolders"], value: [workspaceDirectory] },
    { path: ["disableEssentialTelemetry"], value: true },
    { path: ["disableNonessentialTelemetry"], value: true },
    { path: ["disableNonessentialServices"], value: false },
    { path: ["disableAutoUpdates"], value: false },
    { path: ["isLocalDevMcpEnabled"], value: true },
    { path: ["isDesktopExtensionEnabled"], value: true },
    { path: ["isDesktopExtensionDirectoryEnabled"], value: true },
    { path: ["isDesktopExtensionSignatureRequired"], value: false },
    { path: ["isClaudeCodeForDesktopEnabled"], value: true },
  ]
}

export function createClaudeDesktopConfigurator(
  host: ConfiguratorHost,
): ConfiguratorPlugin {
  return defineConfigurator(
    claudeDesktopMetadata,
    (material) => {
      if (!material.workspaceDirectory) {
        throw new Error("Claude Desktop requires a workspace directory")
      }
      return claudeDesktopGatewayFields(
        material.baseUrl,
        material.credential ?? "",
        material.workspaceDirectory,
      )
    },
    host,
  )
}
