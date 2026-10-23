import type { ModelExecutionLocation } from "@maximal/maximal-model-contract"

import Schema from "@deepseek-ai/schemastery"
import {
  resolveConfig as resolveMessagesConfig,
  type ResolvedConfig as MessagesConfig,
} from "@maximal/anthropic-provider"

export interface VllmModelConfig {
  id: string
  targetId: string
  name?: string
  contextWindow?: number
}

export interface VllmInstanceConfig {
  provider: string
  displayName: string
  endpointId: string
  runnerId: string
  baseURL: string
  /** Execution location is explicit, never inferred from a tunnel URL. */
  location: ModelExecutionLocation
  authType: "none" | "authorization"
  apiKey?: string
  models: Array<VllmModelConfig>
}

export interface Config {
  instances: Array<VllmInstanceConfig>
}

const id = () => Schema.string().pattern(/^\S(?:.*\S)?$/)
const model = Schema.object({
  id: id().required(),
  targetId: id().required(),
  name: Schema.string().min(1),
  contextWindow: Schema.natural().min(1),
})

export const Config = Schema.object({
  instances: Schema.array(
    Schema.object({
      provider: Schema.string()
        .pattern(/^[A-Z0-9][\w.-]*$/i)
        .required(),
      displayName: Schema.string().min(1).required(),
      endpointId: id().required(),
      runnerId: id().required(),
      baseURL: Schema.string().required(),
      location: Schema.union(["device", "lan", "cloud"]).required(),
      authType: Schema.union(["none", "authorization"]).required(),
      apiKey: Schema.string().role("secret"),
      models: Schema.array(model).min(1).required(),
    }),
  )
    .min(1)
    .required(),
}) as Schema<Config>

export interface ResolvedConfig {
  readonly instances: ReadonlyArray<
    Readonly<Omit<VllmInstanceConfig, "models">> & {
      readonly models: ReadonlyArray<Readonly<VllmModelConfig>>
    }
  >
  readonly messages: MessagesConfig
}

function unique(values: ReadonlyArray<string>, label: string): void {
  if (new Set(values).size !== values.length) {
    throw new TypeError(`vllm: duplicate ${label}`)
  }
}

export function resolveConfig(value: Config): ResolvedConfig {
  let config: Config
  try {
    config = Config(value)
  } catch {
    // Schemas may include rejected values in their errors. Never expose keys.
    throw new TypeError("vllm: invalid connection configuration")
  }
  unique(
    config.instances.map(({ provider }) => provider),
    "provider",
  )
  unique(
    config.instances.map(({ endpointId }) => endpointId),
    "endpoint id",
  )
  unique(
    config.instances.map(({ runnerId }) => runnerId),
    "runner id",
  )
  unique(
    config.instances.flatMap(({ models }) =>
      models.map(({ targetId }) => targetId),
    ),
    "target id",
  )
  for (const instance of config.instances) {
    unique(
      instance.models.map(({ id }) => id),
      "served model id",
    )
  }
  const messages = resolveMessagesConfig({
    instances: config.instances.map((instance) => ({
      aliases: [instance.provider],
      displayName: instance.displayName,
      baseURL: instance.baseURL,
      authType: instance.authType,
      ...(instance.apiKey === undefined ? {} : { apiKey: instance.apiKey }),
      models: Object.fromEntries(
        instance.models.map((model) => [
          model.id,
          {
            ...(model.name === undefined ? {} : { name: model.name }),
            ...(model.contextWindow === undefined ?
              {}
            : { contextWindow: model.contextWindow }),
          },
        ]),
      ),
    })),
  })
  return {
    instances: Object.freeze(
      config.instances.map((instance) =>
        Object.freeze({
          ...instance,
          models: Object.freeze(
            instance.models.map((model) => Object.freeze({ ...model })),
          ),
        }),
      ),
    ),
    messages,
  }
}
