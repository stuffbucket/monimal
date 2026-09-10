import type {
  ConnectTargetResult,
  DisconnectTargetResult,
  ManagedFieldPatch,
  RuntimeIdentity,
} from "~/lib/host-config/types"

export type ConfiguratorId = string
export type ConfiguratorTargetId = string

export const BUILTIN_CONFIGURATOR_TARGETS = Object.freeze({
  claudeCode: "claude-code-settings",
  claudeDesktop: "claude-desktop-config-library",
  copilotCli: "copilot-cli-settings",
})

export type CredentialBinding =
  | { readonly kind: "bearer-env"; readonly name: string }
  | { readonly kind: "x-api-key-env"; readonly name: string }
  | { readonly kind: "native-field"; readonly path: ReadonlyArray<string> }
  | { readonly kind: "command-helper"; readonly path: ReadonlyArray<string> }
  | { readonly kind: "none" }

export interface ConfiguratorMetadata {
  readonly id: ConfiguratorId
  readonly name: string
  readonly targetId: ConfiguratorTargetId
  readonly credentialBinding: CredentialBinding
  readonly availability?: "available" | "coming-soon"
}

export type ConfiguratorConnectionStatus =
  | "available"
  | "not-installed"
  | "coming-soon"
  | "connected"
  | "owned-by-another-configurator"
  | "changed-externally"
  | "stale-recovery-required"
  | "recovery-required"

export type ConfiguratorAction = "connect" | "disconnect" | "reconnect"

export interface ConfiguratorOwnership {
  readonly configuratorId: ConfiguratorId
  readonly targetPath: string
  readonly runtime: RuntimeIdentity
}

export interface ConfiguratorRecovery {
  readonly preservedPaths: ReadonlyArray<ReadonlyArray<string>>
}

export interface ConfiguratorConnection {
  readonly status: ConfiguratorConnectionStatus
  readonly allowedActions: ReadonlyArray<ConfiguratorAction>
  readonly detail?: string
  readonly ownership?: ConfiguratorOwnership
  readonly recovery?: ConfiguratorRecovery
}

export interface ConfiguratorConnectionMaterial {
  readonly baseUrl: string
  readonly credential?: string
  readonly workspaceDirectory?: string
}

export interface ConfiguratorTargetPatch {
  readonly targetId: ConfiguratorTargetId
  readonly fields: ReadonlyArray<ManagedFieldPatch>
}

export type ConfiguratorPatchFactory = (
  material: ConfiguratorConnectionMaterial,
) => ConfiguratorTargetPatch

/**
 * Capability boundary supplied by Core. Configurators describe client fields;
 * Core owns paths, files, locks, credentials, process identity, and network IO.
 */
export interface ConfiguratorHost {
  targetInstalled(targetId: ConfiguratorTargetId): Promise<boolean>
  inspectTarget(
    configuratorId: ConfiguratorId,
    targetId: ConfiguratorTargetId,
  ): Promise<ConfiguratorConnection>
  connectTarget(
    metadata: ConfiguratorMetadata,
    patch: ConfiguratorPatchFactory,
  ): Promise<ConnectTargetResult>
  reconnectTarget(
    metadata: ConfiguratorMetadata,
    patch: ConfiguratorPatchFactory,
  ): Promise<ConnectTargetResult>
  disconnectTarget(
    configuratorId: ConfiguratorId,
    targetId: ConfiguratorTargetId,
  ): Promise<DisconnectTargetResult>
}

export interface ConfiguratorPlugin {
  readonly metadata: ConfiguratorMetadata
  connection(): Promise<ConfiguratorConnection>
  connect(): Promise<ConfiguratorConnection>
  reconnect(): Promise<ConfiguratorConnection>
  disconnect(): Promise<ConfiguratorConnection>
  dispose?(): void | Promise<void>
}

export type ConfiguratorSetFactory = (
  host: ConfiguratorHost,
) => ReadonlyArray<ConfiguratorPlugin>

export interface ConfiguratorRegistry {
  all(): ReadonlyArray<ConfiguratorPlugin>
  get(id: string): ConfiguratorPlugin | undefined
  dispose(): Promise<void>
}

export type ConfiguratorRuntimeFactory = (
  host: ConfiguratorHost,
) => Promise<ConfiguratorRegistry>

export type {
  ConnectTargetResult,
  ConnectTargetStatus,
  DisconnectTargetResult,
  DisconnectTargetStatus,
  InspectTargetResult,
  InspectTargetStatus,
  JsonObject,
  JsonScalar,
  JsonValue,
  ManagedFieldPatch,
  RuntimeIdentity,
  TargetClaim,
} from "~/lib/host-config/types"
