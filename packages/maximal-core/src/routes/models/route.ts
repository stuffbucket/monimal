import type {
  LocalModelCatalogEntry,
  LocalModelControl,
} from "@stuffbucket/maximal-provider-contract"

import { Hono } from "hono"

import { isVariantId } from "~/lib/models/anthropic-id-rewrite"
import { primeModelsCache } from "~/lib/models/refresh-models"
import { modelsCached, state } from "~/lib/runtime-state/state"

import {
  anthropicModelList,
  type AnthropicModel,
  type AnthropicModelList,
  openAiModelList,
  type OpenAiModel,
  type OpenAiModelList,
  prefersAnthropicModels,
} from "./wire-models"

const EPOCH_ISO = new Date(0).toISOString()

export interface ModelRoutesOptions {
  localModels?: () => LocalModelControl | undefined
}

function aggregateLocalModels(
  control: LocalModelControl | undefined,
): ReadonlyArray<LocalModelCatalogEntry> {
  if (control === undefined) return []
  try {
    return control
      .list()
      .models.filter(
        (model) => model.publication === "aggregate" && model.state === "ready",
      )
      .toSorted(
        (left, right) =>
          left.modelId.localeCompare(right.modelId)
          || left.key.localeCompare(right.key),
      )
  } catch {
    return []
  }
}

function localOpenAiModel(model: LocalModelCatalogEntry): OpenAiModel {
  return {
    id: model.modelId,
    object: "model",
    created: 0,
    owned_by: "local",
  }
}

function localAnthropicModel(model: LocalModelCatalogEntry): AnthropicModel {
  const inputs = new Set(model.capabilities.input)
  const outputs = new Set(model.capabilities.output)
  return {
    id: model.modelId,
    type: "model",
    display_name: model.displayName,
    created_at: EPOCH_ISO,
    max_input_tokens: model.context.contextWindow,
    max_tokens: model.context.maxOutputTokens ?? model.context.contextWindow,
    capabilities: {
      image_input: { supported: inputs.has("image") },
      pdf_input: { supported: inputs.has("pdf") },
      structured_outputs: {
        supported: outputs.has("json") || outputs.has("structured-output"),
      },
      thinking: {
        supported: outputs.has("reasoning") || outputs.has("thinking"),
      },
    },
  }
}

class ModelCatalogConflictError extends Error {}

function mergeById<T extends { readonly id: string }>(
  primary: ReadonlyArray<T>,
  additional: ReadonlyArray<T>,
): Array<T> {
  const merged = new Map<string, T>()
  for (const model of [...primary, ...additional]) {
    if (merged.has(model.id)) throw new ModelCatalogConflictError()
    merged.set(model.id, model)
  }
  return [...merged.values()].toSorted((left, right) =>
    left.id.localeCompare(right.id),
  )
}

function openAiAggregate(
  models: Parameters<typeof openAiModelList>[0],
  local: ReadonlyArray<LocalModelCatalogEntry>,
): OpenAiModelList {
  const upstream = openAiModelList(models)
  return {
    ...upstream,
    data: mergeById(
      upstream.data,
      local.map((model) => localOpenAiModel(model)),
    ),
  }
}

function anthropicAggregate(
  models: Parameters<typeof anthropicModelList>[0],
  local: ReadonlyArray<LocalModelCatalogEntry>,
): AnthropicModelList {
  const upstream = anthropicModelList(models)
  const data = mergeById(
    upstream.data,
    local.map((model) => localAnthropicModel(model)),
  )
  return {
    ...upstream,
    data,
    first_id: data[0]?.id ?? null,
    last_id: data.at(-1)?.id ?? null,
  }
}

export function createModelRoutes(options: ModelRoutesOptions = {}): Hono {
  const routes = new Hono()

  routes.get("/", async (c) => {
    // Recover an empty / never-primed catalog on demand. This is a rare
    // boot-time discovery request and the caller already awaits us, so a
    // blocking prime here is fine (no timer, no background loop). Best-effort:
    // primeModelsCache warns on failure and NEVER throws, so a Copilot /models
    // outage yields a valid empty 200 list rather than a 5xx — clients don't
    // hard-depend on the catalog, and it self-heals on the next request/activity
    // via the stale-refresh middleware. `modelsCached() === 0` (not `!state.models`)
    // so a primed-but-empty cache is retried too.
    if (modelsCached() === 0) {
      await primeModelsCache()
    }

    // Drop Copilot variant ids (`-high`, `-xhigh`, `-1m`, `-1m-internal`).
    // Anthropic exposes those as request-time parameters, not separate
    // ids; keeping them in the listing makes Claude Desktop's picker
    // show duplicate "Opus 4.7" entries. The handlers route the right
    // upstream variant when output_config.effort or the 1M-context beta
    // header is set.
    const models = (state.models?.data ?? []).filter(
      (model) => !isVariantId(model.id),
    )

    // Serve the shape the client's protocol expects. Anthropic clients
    // (Claude Desktop, the anthropic SDK) are detected via the
    // `anthropic-version` header / user-agent; everything else gets the
    // historical OpenAI default. Both shapes are built by explicit mappers
    // (`wire-models.ts`) so no raw Copilot field (billing, policy, …) leaks.
    try {
      const local = aggregateLocalModels(options.localModels?.())
      return c.json(
        prefersAnthropicModels(c.req.raw.headers) ?
          anthropicAggregate(models, local)
        : openAiAggregate(models, local),
      )
    } catch (error) {
      if (!(error instanceof ModelCatalogConflictError)) throw error
      return c.json(
        {
          error: {
            message: "Model catalog contains conflicting model IDs.",
            type: "model_catalog_conflict",
          },
        },
        409,
      )
    }
  })

  return routes
}

/** @internal Legacy standalone route instance. */
export const modelRoutes = createModelRoutes()
