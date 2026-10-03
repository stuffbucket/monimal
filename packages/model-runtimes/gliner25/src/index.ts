import type { Context } from "@deepseek-ai/cordis"
import type { SystemOneService } from "@maximal/maximal-models"

import { MAXIMAL_GLINER25_PROVIDER_ID } from "@maximal/maximal-model-catalog"
import { handleSystemOneDecisionRequest } from "@maximal/maximal-provider-decision-model"
import { Gliner25Provider } from "@maximal/maximal-provider-gliner25"

import {
  Config as ConfigSchema,
  resolveConfig,
  type Config as Gliner25Config,
} from "./config.ts"

export const Config = ConfigSchema
export type Config = Gliner25Config
export const name = "maximal-runtime-gliner25"
export const inject = ["systemOne"]

interface Gliner25Context extends Context {
  readonly systemOne: SystemOneService
}

export function apply(ctx: Gliner25Context, config: Gliner25Config): void {
  const resolved = resolveConfig(config)
  const provider = new Gliner25Provider(resolved.providerOptions)
  const registration = ctx.systemOne.registerProvider({
    id: MAXIMAL_GLINER25_PROVIDER_ID,
    name: "Local GLiNER2.5",
    models: resolved.models,
    handle: (request) => handleSystemOneDecisionRequest(request, provider),
  })
  ctx.effect(
    () => registration.dispose.bind(registration),
    "unregister GLiNER2.5 System One provider",
  )
}

export {
  GLINER25_MODELS,
  resolveConfig,
  type ResolvedConfig,
} from "./config.ts"
