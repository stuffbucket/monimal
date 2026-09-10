import type { Context } from "@deepseek-ai/cordis"

import {
  Config as ConfigSchema,
  type Config as RegistryConfig,
} from "./config.ts"
import { LocalModelRegistry } from "./registry.ts"

export const name = "local-model-registry"
export const inject: ReadonlyArray<string> = []
export const Config = ConfigSchema
export type Config = RegistryConfig

export function apply(ctx: Context, config: RegistryConfig = {}): void {
  new LocalModelRegistry(ctx, config.suiteDataRoot)
}

declare module "@deepseek-ai/cordis" {
  interface Context {
    localModels: LocalModelRegistry
  }
}

export { resolveLocalModelsPath, resolveStuffbucketDataRoot } from "./paths.ts"
export type { StuffbucketPathOptions } from "./paths.ts"
export { LocalModelRegistry } from "./registry.ts"
export type {
  LocalModelFileSignature,
  LocalModelLease,
  LocalModelManifest,
  LocalModelRegistrationDispose,
  LocalModelRunnerDescriptor,
  LocalModelSource,
} from "./types.ts"
export type {
  LocalModelCapabilities,
  LocalModelCatalogEntry,
  LocalModelCatalogListener,
  LocalModelCatalogSnapshot,
  LocalModelContextLimits,
  LocalModelControl,
  LocalModelProgressListener,
  LocalModelProvisionPhase,
  LocalModelProvisionProgress,
  LocalModelPublication,
  LocalModelState,
} from "@stuffbucket/maximal-model-contract"
