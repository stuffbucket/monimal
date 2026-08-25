import type { Context } from "@deepseek-ai/cordis"

import { OmlxAdapter } from "./adapter.ts"
import { Config as ConfigSchema, type Config as OmlxConfig } from "./config.ts"

export const Config = ConfigSchema
export { OmlxAdapter } from "./adapter.ts"
export type Config = OmlxConfig

export const name = "omlx"
export const inject = ["llm"]

function disposeAdapter(adapter: OmlxAdapter): void {
  adapter.dispose()
}

export function apply(ctx: Context, config: OmlxConfig): void {
  const adapter = new OmlxAdapter(config)
  ctx.effect(
    () => disposeAdapter.bind(undefined, adapter),
    "dispose oMLX adapter requests",
  )
  ctx.llm.registerAdapter(Object.keys(config.instances), adapter)
}

export const omlxBackendDescriptor = Object.freeze({
  id: "omlx",
  modelFormat: "mlx",
  transport: "http",
} as const)

export type OmlxBackendDescriptor = typeof omlxBackendDescriptor

export type {
  OmlxInstanceConfig,
  OmlxModelDefaults,
  ResolvedOmlxInstance,
  ResolvedOmlxInstances,
} from "./config.ts"
export { normalizeBaseUrl, resolveConfig } from "./config.ts"
