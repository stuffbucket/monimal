import type { Context } from "@deepseek-ai/cordis"

import { AnthropicAdapter } from "./adapter.ts"
import { type Config as ConfigShape, resolveConfig } from "./config.ts"

export { AnthropicAdapter } from "./adapter.ts"
export {
  type AnthropicReasoningEffort,
  AUTH_TYPES,
  type AuthType,
  Config,
  type InstanceConfig,
  type ModelConfig,
  type ModelDefaults,
  REASONING_EFFORTS,
  resolveConfig,
  type ResolvedConfig,
  type ResolvedInstanceConfig,
} from "./config.ts"

export type AnthropicProviderConfig = ConfigShape

export const name = "anthropic-provider"
export const inject = ["llm"]

function lifecycleEffect(controller: AbortController): () => () => void {
  return () => () => controller.abort()
}

export function apply(ctx: Context, config: ConfigShape): void {
  const resolved = resolveConfig(config)
  const lifecycle = new AbortController()
  ctx.effect(
    lifecycleEffect(lifecycle),
    "anthropic-provider lifecycle cancellation",
  )
  const adapter = new AnthropicAdapter(resolved, lifecycle.signal)
  const aliases = resolved.instances.flatMap((instance) => [
    ...instance.aliases,
  ])
  ctx.llm.registerAdapter(aliases, adapter)
}
