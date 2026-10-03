import type {
  CanonicalModel,
  ModelCatalog,
  ModelCatalogProvider,
  ModelCatalogSupplement,
  ProviderOffering,
} from "./schema.ts"

import { ModelCatalogSchema, ModelCatalogSupplementSchema } from "./schema.ts"

const offeringKey = (providerId: string, modelId: string): string =>
  `${providerId}\u0000${modelId}`

export type DeepReadonly<T> =
  T extends (...arguments_: Array<never>) => unknown ? T
  : T extends ReadonlyArray<infer Item> ? ReadonlyArray<DeepReadonly<Item>>
  : T extends object ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
  : T

export type ModelCatalogSnapshot = DeepReadonly<ModelCatalog>
export type CanonicalModelSnapshot = DeepReadonly<CanonicalModel>
export type ModelCatalogProviderSnapshot = DeepReadonly<ModelCatalogProvider>
export type ProviderOfferingSnapshot = DeepReadonly<ProviderOffering>

export interface ModelCatalogLookup {
  canonicalModel(id: string): CanonicalModelSnapshot | undefined
  offering(
    providerId: string,
    modelId: string,
  ): ProviderOfferingSnapshot | undefined
  provider(id: string): ModelCatalogProviderSnapshot | undefined
}

export interface ModelCatalogIndex extends ModelCatalogLookup {
  readonly catalog: ModelCatalogSnapshot
}

export interface ModelCatalogSupplementIndex extends ModelCatalogLookup {
  readonly supplement: DeepReadonly<ModelCatalogSupplement>
}

function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (value === null || typeof value !== "object") {
    return value as DeepReadonly<T>
  }
  for (const nested of Object.values(value)) deepFreeze(nested)
  return Object.freeze(value) as DeepReadonly<T>
}

function lookupFor(
  content: DeepReadonly<ModelCatalogSupplement>,
): ModelCatalogLookup {
  const models = new Map(content.models.map((model) => [model.id, model]))
  const providers = new Map(
    content.providers.map((provider) => [provider.id, provider]),
  )
  const offerings = new Map(
    content.offerings.map((offering) => [
      offeringKey(offering.providerId, offering.modelId),
      offering,
    ]),
  )
  return Object.freeze({
    canonicalModel: (id: string) => models.get(id),
    offering: (providerId: string, modelId: string) =>
      offerings.get(offeringKey(providerId, modelId)),
    provider: (id: string) => providers.get(id),
  })
}

export function createModelCatalogIndex(input: unknown): ModelCatalogIndex {
  const catalog = deepFreeze(ModelCatalogSchema.parse(input))
  return Object.freeze({ catalog, ...lookupFor(catalog) })
}

export function createModelCatalogSupplementIndex(
  input: unknown,
): ModelCatalogSupplementIndex {
  const supplement = deepFreeze(ModelCatalogSupplementSchema.parse(input))
  return Object.freeze({ supplement, ...lookupFor(supplement) })
}

export function parseModelCatalogJson(json: string): ModelCatalogIndex {
  return createModelCatalogIndex(JSON.parse(json))
}
