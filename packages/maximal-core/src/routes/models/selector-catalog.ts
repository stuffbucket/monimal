import type {
  MaximalModelList,
  MaximalModelListEntry,
} from "@maximal/maximal-core-contract/control"
import type {
  LocalModelCatalogEntry,
  ModelExecutionTarget,
  ModelRuntimeCapabilities,
  ProviderModelDescriptor,
} from "@maximal/maximal-model-contract"

import type { Model } from "~/services/copilot/get-models"

import {
  copilotModelEvidence,
  copilotModelOperations,
} from "~/lib/live/model-evidence"
import { forwardId, reverseId } from "~/lib/models/anthropic-id-rewrite"

interface Sources {
  readonly copilot: ReadonlyArray<Model>
  readonly local: ReadonlyArray<LocalModelCatalogEntry>
  readonly providers: ReadonlyArray<ProviderModelDescriptor>
  readonly targets: ReadonlyArray<ModelExecutionTarget>
}

function tokens(value: number | null | undefined): number | null {
  return (
      value !== undefined
        && value !== null
        && Number.isSafeInteger(value)
        && value > 0
    ) ?
      value
    : null
}

function reasoningSupport(
  value: ModelRuntimeCapabilities | undefined,
): boolean | null {
  if (value?.adaptiveThinking === true) return true
  return value?.reasoningEffort === undefined ?
      null
    : value.reasoningEffort.length > 0
}

function capabilities(
  value: ModelRuntimeCapabilities | undefined,
): MaximalModelListEntry["capabilities"] {
  return {
    vision: value?.vision ?? null,
    tools: value?.toolCalls ?? null,
    // Adaptive thinking is only one form of reasoning. Its absence/false
    // value cannot negate a separately advertised reasoning-effort ladder.
    reasoning: reasoningSupport(value),
  }
}

function providerBasePath(provider: string): string | null {
  // Dot segments cannot name a provider through an HTTP URL.
  return provider === "." || provider === ".." ?
      null
    : `/${encodeURIComponent(provider)}/v1`
}

function providerEntry(
  model: ProviderModelDescriptor,
  targets: ReadonlyArray<ModelExecutionTarget>,
): MaximalModelListEntry {
  return {
    source: "provider",
    provider: model.provider,
    providerName: model.providerName,
    id: model.id,
    name: model.name,
    basePath: providerBasePath(model.provider),
    operations: model.operations === undefined ? null : [...model.operations],
    contextWindowTokens: tokens(
      model.evidence?.limits?.contextTokens ?? model.contextWindowTokens,
    ),
    maxOutputTokens: tokens(
      model.evidence?.limits?.outputTokens ?? model.maxOutputTokens,
    ),
    capabilities: capabilities(model.evidence?.capabilities),
    targets: targets
      .filter(
        (target) =>
          target.providerAccount.provider === model.provider
          && target.modelId === model.id,
      )
      .map((target) => ({
        id: target.id,
        location: target.location,
        availability: target.availability.state,
        lifecycle: target.lifecycle.state,
        contextWindowTokens: tokens(
          target.evidence.limits.effective?.contextTokens,
        ),
        maxOutputTokens: tokens(target.evidence.limits.effective?.outputTokens),
      }))
      .toSorted((left, right) => left.id.localeCompare(right.id)),
  }
}

/**
 * A selector reads configured model offerings, not metadata scan results. Only
 * explicit fields cross this public boundary: no credentials, upstream URLs,
 * runner paths, or self-reported discovery evidence. Unknown stays null.
 * Provider routes retain duplicate served IDs; aggregate-only entries with an
 * ID collision have no usable basePath rather than silently choosing a target.
 */
export function maximalModelList(sources: Sources): MaximalModelList {
  const providers = sources.providers.filter((model) => model.enabled !== false)
  const data: Array<MaximalModelListEntry> = [
    ...sources.copilot.map((model): MaximalModelListEntry => {
      const evidence = copilotModelEvidence(model)
      return {
        source: "copilot",
        provider: "github-copilot",
        providerName: "GitHub Copilot",
        id: forwardId(model.id),
        name: model.name,
        basePath: "/v1",
        operations: copilotModelOperations(model),
        contextWindowTokens: tokens(evidence.limits?.contextTokens),
        maxOutputTokens: tokens(evidence.limits?.outputTokens),
        capabilities: capabilities(evidence.capabilities),
        targets: [],
      }
    }),
    ...sources.local.map((model): MaximalModelListEntry => ({
      source: "local",
      provider: "local",
      providerName: "Local",
      id: model.modelId,
      name: model.displayName,
      basePath: "/v1",
      operations: ["messages"],
      contextWindowTokens: tokens(model.context.contextWindow),
      maxOutputTokens: tokens(model.context.maxOutputTokens),
      capabilities: {
        vision: model.capabilities.input.includes("image"),
        tools: null,
        reasoning: null,
      },
      targets: [],
    })),
    ...providers.map((model) => providerEntry(model, sources.targets)),
  ]
  return {
    schemaVersion: 1,
    data: data.map((entry) =>
      (
        entry.source !== "provider"
        && data.some(
          (other) =>
            other !== entry && reverseId(other.id) === reverseId(entry.id),
        )
      ) ?
        { ...entry, basePath: null }
      : entry,
    ),
  }
}
