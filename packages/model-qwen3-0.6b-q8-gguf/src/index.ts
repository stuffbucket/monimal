import type { Context } from "@deepseek-ai/cordis"

import {
  Config as ConfigSchema,
  type Config as ModelConfig,
  resolvePublication,
} from "./config.ts"
import { createManifest } from "./manifest.ts"
import { Qwen3ModelSource } from "./source.ts"

export const name = "model-qwen3-0.6b-q8-gguf"
export const inject: ReadonlyArray<string> = ["localModels"]
export const Config = ConfigSchema
export type Config = ModelConfig

export function apply(ctx: Context, config: ModelConfig): void {
  ctx.effect(
    () =>
      ctx.localModels.registerModel(
        createManifest(resolvePublication(config)),
        new Qwen3ModelSource(),
      ),
    "register Qwen3 0.6B Q8_0 local model",
  )
}

export {
  DEFAULT_PUBLICATION,
  PUBLICATIONS,
  resolvePublication,
} from "./config.ts"
export { createManifest, QWEN3_0_6B_Q8_0_ARTIFACT } from "./manifest.ts"
export { Qwen3ModelSource } from "./source.ts"
export type { Fetch, SourceOptions } from "./source.ts"
