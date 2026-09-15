import type { ProviderCatalogueModel } from "~/lib/live/resources"
import type { ProviderDispatcher } from "~/services/providers/provider-dispatcher"

import { getConfig } from "~/lib/config/config"
import { HTTPError } from "~/lib/errors/error"
import { reverseId } from "~/lib/models/anthropic-id-rewrite"
import { state } from "~/lib/runtime-state/state"

const CATALOG_TTL_MS = 10_000

export type ModelRoute =
  | { readonly kind: "copilot" }
  | { readonly kind: "provider"; readonly provider: string }

export class ProviderModelRouter {
  readonly #dispatcher: ProviderDispatcher
  readonly #now: () => number
  readonly #preferLocal: () => boolean
  #catalogue: ReadonlyArray<ProviderCatalogueModel> = []
  #expiresAt = 0
  #loading: Promise<ReadonlyArray<ProviderCatalogueModel>> | undefined

  constructor(
    dispatcher: ProviderDispatcher,
    now: () => number = Date.now,
    preferLocal: () => boolean = () =>
      getConfig().ollama?.preferLocalModels ?? true,
  ) {
    this.#dispatcher = dispatcher
    this.#now = now
    this.#preferLocal = preferLocal
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
    const models = await this.listProviderModels()
    return models.filter((model) => {
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
  }

  async resolve(requestedModel: string): Promise<ModelRoute> {
    const modelId = reverseId(requestedModel)
    const providers = new Set(
      (await this.listProviderModels())
        .filter((model) => model.id === modelId)
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
