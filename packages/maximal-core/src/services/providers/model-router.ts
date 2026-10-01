import type { SystemOneLocalModel } from "@maximal/maximal-core-contract/settings"
import type { SystemOneSettingsResponse } from "@maximal/maximal-core-contract/settings"

import type { ProviderCatalogueModel } from "~/lib/live/resources"
import type { ProviderDispatcher } from "~/services/providers/provider-dispatcher"

import { getConfig } from "~/lib/config/config"
import { HTTPError } from "~/lib/errors/error"
import { reverseId } from "~/lib/models/anthropic-id-rewrite"
import { state } from "~/lib/runtime-state/state"
import { getSystemOneSettings } from "~/services/providers/system-one-settings"

const CATALOG_TTL_MS = 10_000

export type ModelRoute =
  | { readonly kind: "copilot" }
  | { readonly kind: "provider"; readonly provider: string }

export interface SystemOneModelRoute {
  readonly model: string
  readonly provider: string
}

interface ProviderModelRouterOptions {
  readonly now?: () => number
  readonly preferLocal?: () => boolean
  readonly systemOneSettings?: () => SystemOneSettingsResponse
}

const SYSTEM_ONE_CLOUD_MODELS = new Set([
  "jev-latest",
  "jev-preview",
  "jev-1.13.0",
])

function matchesProviderModel(
  model: ProviderCatalogueModel,
  requestedModel: string,
): boolean {
  if (model.id === requestedModel) return true
  if (requestedModel.includes(":")) return false
  if (model.provider !== "ollama" && model.provider !== "ollama-cloud") {
    return false
  }
  return model.id === `${requestedModel}:latest`
}

export class ProviderModelRouter {
  readonly #dispatcher: ProviderDispatcher
  readonly #now: () => number
  readonly #preferLocal: () => boolean
  readonly #systemOneSettings: () => SystemOneSettingsResponse
  #catalogue: ReadonlyArray<ProviderCatalogueModel> = []
  #expiresAt = 0
  #loading: Promise<ReadonlyArray<ProviderCatalogueModel>> | undefined

  constructor(
    dispatcher: ProviderDispatcher,
    options: ProviderModelRouterOptions = {},
  ) {
    this.#dispatcher = dispatcher
    this.#now = options.now ?? Date.now
    this.#preferLocal =
      options.preferLocal
      ?? (() => getConfig().ollama?.preferLocalModels ?? true)
    this.#systemOneSettings = options.systemOneSettings ?? getSystemOneSettings
  }

  async listProviderModels(): Promise<ReadonlyArray<ProviderCatalogueModel>> {
    if (this.#now() < this.#expiresAt) return this.#catalogue
    this.#loading ??= this.#dispatcher.listModels().then((catalogue) => {
      this.#catalogue = catalogue
      this.#expiresAt = this.#now() + CATALOG_TTL_MS
      return catalogue
    })
    try {
      return await this.#loading
    } finally {
      this.#loading = undefined
    }
  }

  async listAdvertisedModels(): Promise<ReadonlyArray<ProviderCatalogueModel>> {
    const models = (await this.listProviderModels()).filter(
      (model) => model.enabled !== false,
    )
    const preferredModels = models.filter((model) => {
      const matches = models.filter((candidate) => candidate.id === model.id)
      const providers = new Set(matches.map((candidate) => candidate.provider))
      if (
        providers.size !== 2
        || !providers.has("ollama")
        || !providers.has("ollama-cloud")
      ) {
        return true
      }
      const preferred = this.#preferLocal() ? "ollama" : "ollama-cloud"
      return model.provider === preferred
    })
    const systemOne = this.#systemOneSettings()
    const rank = new Map(
      systemOne.model_order.map((model, index) => [model, index]),
    )
    const localProviders =
      systemOne.fallback_to_local ?
        [
          systemOne.local_provider,
          systemOne.local_provider === "maximal" ? "ollama" : "maximal",
        ]
      : [systemOne.local_provider]
    const selectedProviderByModel = new Map(
      systemOne.model_order.flatMap((model) => {
        const provider = localProviders.find((candidate) =>
          preferredModels.some(
            (offering) =>
              offering.id === model && offering.provider === candidate,
          ),
        )
        return provider === undefined ? [] : [[model, provider] as const]
      }),
    )
    return preferredModels
      .filter(
        (model) =>
          !rank.has(model.id as SystemOneLocalModel)
          || model.provider
            === selectedProviderByModel.get(model.id as SystemOneLocalModel),
      )
      .toSorted((left, right) => {
        const leftRank = rank.get(left.id as SystemOneLocalModel)
        const rightRank = rank.get(right.id as SystemOneLocalModel)
        if (leftRank !== undefined && rightRank !== undefined) {
          return leftRank - rightRank
        }
        if (leftRank !== undefined) return -1
        if (rightRank !== undefined) return 1
        return left.id.localeCompare(right.id)
      })
  }

  async resolveSystemOne(
    requestedModel: string,
  ): Promise<ReadonlyArray<SystemOneModelRoute>> {
    const settings = this.#systemOneSettings()
    const models = (await this.listProviderModels()).filter(
      (model) => model.enabled !== false,
    )
    const routes: Array<SystemOneModelRoute> = []
    const append = (model: string, provider: string): void => {
      if (
        routes.some(
          (candidate) =>
            candidate.model === model && candidate.provider === provider,
        )
      ) {
        return
      }
      if (
        models.some(
          (candidate) =>
            matchesProviderModel(candidate, model)
            && candidate.provider === provider
            && (candidate.operations === undefined
              || candidate.operations.includes("systemone")),
        )
      ) {
        routes.push({ model, provider })
      }
    }

    const localProviders =
      settings.fallback_to_local ?
        [
          settings.local_provider,
          settings.local_provider === "maximal" ? "ollama" : "maximal",
        ]
      : [settings.local_provider]

    const isCloudModel = SYSTEM_ONE_CLOUD_MODELS.has(requestedModel)
    const isLocalModel = settings.model_order.includes(
      requestedModel as SystemOneLocalModel,
    )
    if (isCloudModel) {
      append(requestedModel, "typesafe-jev")
    } else if (isLocalModel) {
      for (const provider of localProviders) append(requestedModel, provider)
    }

    if ((isCloudModel || isLocalModel) && settings.fallback_to_local) {
      for (const model of settings.model_order) {
        for (const provider of localProviders) append(model, provider)
      }
    }
    if (routes.length > 0) return routes

    const route = await this.resolve(requestedModel)
    return route.kind === "provider" ?
        [{ model: requestedModel, provider: route.provider }]
      : []
  }

  async resolve(requestedModel: string): Promise<ModelRoute> {
    const modelId = reverseId(requestedModel)
    const providers = new Set(
      (await this.listProviderModels())
        .filter(
          (model) =>
            model.enabled !== false && matchesProviderModel(model, modelId),
        )
        .map((model) => model.provider),
    )
    const copilot = (state.models?.data ?? []).some(
      (model) => model.id === modelId,
    )
    if (providers.size === 0 && copilot) return { kind: "copilot" }
    if (providers.size === 1 && !copilot) {
      return { kind: "provider", provider: [...providers][0] }
    }
    if (
      !copilot
      && providers.size === 2
      && providers.has("ollama")
      && providers.has("ollama-cloud")
    ) {
      return {
        kind: "provider",
        provider: this.#preferLocal() ? "ollama" : "ollama-cloud",
      }
    }
    if (providers.size === 0 && !state.githubToken) {
      return { kind: "copilot" }
    }
    if (providers.size === 0) {
      throw new HTTPError(
        `Model '${requestedModel}' is not advertised`,
        Response.json(
          {
            error: {
              message: `Model '${requestedModel}' is not available.`,
              type: "invalid_model",
            },
          },
          { status: 404 },
        ),
      )
    }
    throw new HTTPError(
      `Model '${requestedModel}' is advertised by more than one provider`,
      Response.json(
        {
          error: {
            message: `Model '${requestedModel}' is ambiguous; use a provider-qualified endpoint.`,
            type: "model_catalog_conflict",
          },
        },
        { status: 409 },
      ),
    )
  }
}
