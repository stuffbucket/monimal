import type { ProviderGateway } from "@stuffbucket/maximal-provider-contract"

export interface ProviderPluginConfig {
  readonly enabled?: boolean
  readonly config?: unknown
}

export interface ProviderCompatibilityModelConfig {
  readonly temperature?: number
  readonly topP?: number
  readonly topK?: number
}

/**
 * A validated compatibility-provider entry. Missing `type` means `anthropic`
 * and missing `enabled` means enabled, matching Core's legacy semantics.
 * Consumers must reject any explicit type they do not support.
 */
export interface ProviderCompatibilityConfig {
  readonly type?: string
  readonly enabled?: boolean
  readonly baseUrl?: string
  readonly apiKey?: string
  readonly authType?: "authorization" | "x-api-key"
  readonly models?: Readonly<Record<string, ProviderCompatibilityModelConfig>>
  readonly adjustInputTokens?: boolean
}

export type ProviderHostConfigFailureReason =
  | "parse"
  | "read"
  | "unknown"
  | "validation"

export type ProviderHostConfigStatus =
  | { readonly state: "ready" }
  | {
      readonly state: "error"
      /** Bounded classification only; raw errors and config contents stay in Core. */
      readonly reason: ProviderHostConfigFailureReason
    }

export interface ProviderHostConfigSnapshot {
  readonly appDataDirectory: string
  readonly defaultProfileDirectory: string
  readonly configStatus: ProviderHostConfigStatus
  readonly providerHost: {
    readonly mode: "legacy" | "dsh"
    readonly profileDirectory?: string
  }
  readonly providers: Readonly<Record<string, ProviderCompatibilityConfig>>
  readonly providerPlugins?: Readonly<Record<string, ProviderPluginConfig>>
}

export type ProviderHostConfigListener = (
  snapshot: ProviderHostConfigSnapshot,
) => void

export interface ProviderHostConfigSource {
  getSnapshot(): ProviderHostConfigSnapshot
  subscribe(listener: ProviderHostConfigListener): () => void
  dispose(): Promise<void>
}

export interface ProviderGatewayFactoryContext {
  config: ProviderHostConfigSnapshot
  configSource: ProviderHostConfigSource
}

export type ProviderGatewayFactory = (
  context: ProviderGatewayFactoryContext,
) => ProviderGateway | Promise<ProviderGateway>
