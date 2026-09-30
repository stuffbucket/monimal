import type {
  CanonicalModel,
  ModelCatalog,
  ModelCatalogProvider,
  ProviderOffering,
} from "./schema.ts"

import { ModelCatalogSchema } from "./schema.ts"

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

export interface ModelCatalogIndex {
  readonly catalog: ModelCatalogSnapshot
  canonicalModel(id: string): CanonicalModelSnapshot | undefined
  offering(
    providerId: string,
    modelId: string,
  ): ProviderOfferingSnapshot | undefined
  provider(id: string): ModelCatalogProviderSnapshot | undefined
}

function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (value === null || typeof value !== "object") {
    return value as DeepReadonly<T>
  }
  for (const nested of Object.values(value)) deepFreeze(nested)
  return Object.freeze(value) as DeepReadonly<T>
}

export function createModelCatalogIndex(input: unknown): ModelCatalogIndex {
  const catalog = deepFreeze(ModelCatalogSchema.parse(input))
  const models = new Map(catalog.models.map((model) => [model.id, model]))
  const providers = new Map(
    catalog.providers.map((provider) => [provider.id, provider]),
  )
  const offerings = new Map(
    catalog.offerings.map((offering) => [
      offeringKey(offering.providerId, offering.modelId),
      offering,
    ]),
  )
  return Object.freeze({
    catalog,
    canonicalModel: (id: string) => models.get(id),
    offering: (providerId: string, modelId: string) =>
      offerings.get(offeringKey(providerId, modelId)),
    provider: (id: string) => providers.get(id),
  })
}

export function parseModelCatalogJson(json: string): ModelCatalogIndex {
  return createModelCatalogIndex(JSON.parse(json) as unknown)
}
