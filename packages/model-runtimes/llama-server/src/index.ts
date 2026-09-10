import type { Context } from "@deepseek-ai/cordis"

import { LlamaServerActivation } from "./activation.ts"
import {
  Config as ConfigSchema,
  type Config as LlamaServerConfig,
  resolveConfig,
} from "./config.ts"

export const name = "llama-server"
export const inject = ["llm", "localModels"]
export const Config = ConfigSchema
export type Config = LlamaServerConfig

export function apply(ctx: Context, configValue: LlamaServerConfig): void {
  const activation = new LlamaServerActivation({
    config: resolveConfig(configValue),
    registrar: ctx.llm,
    registry: ctx.localModels,
  })
  ctx.effect(() => {
    activation.start()
    return () => activation.dispose()
  }, "provision and claim llama.cpp model runners")
}

export const llamaServerBackendDescriptor = Object.freeze({
  id: "llama-server",
  modelFormat: "gguf",
  transport: "http",
} as const)

export type LlamaServerBackendDescriptor = typeof llamaServerBackendDescriptor

export { LlamaServerActivation } from "./activation.ts"
export type {
  ActivationDependencies,
  ActivationOptions,
  AdapterRegistrar,
  AssignedModelRegistry,
} from "./activation.ts"
export { LlamaServerAdapter } from "./adapter.ts"
export type { AdapterDependencies, LlamaServerTransport } from "./adapter.ts"
export {
  claimAssignedModels,
  llamaServerRunnerDescriptor,
  releaseClaimedModels,
} from "./claims.ts"
export type { ClaimedModel, LocalModelClaimer } from "./claims.ts"
export type { ResolvedConfig } from "./config.ts"
export { resolveConfig } from "./config.ts"
export { serializeOpenAiRequest } from "./openai.ts"
export type { OpenAiChatRequest } from "./openai.ts"
export {
  acquireLockedRuntime,
  packageLockedRuntime,
  readRuntimeLock,
  requireRuntimeEntry,
  runtimeTarget,
  validateRuntimeLock,
  verifyLockedRuntime,
} from "./runtime-lock.ts"
export type {
  AcquireRuntimeOptions,
  PackageRuntimeOptions,
  RuntimeLock,
  RuntimeLockEntry,
  RuntimeTarget,
} from "./runtime-lock.ts"
export { parseOpenAiSse, translateOpenAiSse } from "./sse.ts"
export type { OpenAiSseEvent } from "./sse.ts"
export { LlamaServerProcessError, LlamaServerSupervisor } from "./supervisor.ts"
export type {
  ProcessSpawn,
  SupervisedProcess,
  SupervisorConfig,
  SupervisorDependencies,
} from "./supervisor.ts"
