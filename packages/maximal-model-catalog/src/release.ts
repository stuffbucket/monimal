export const MODEL_CATALOG_REPOSITORY = "stuffbucket/model-catalog"
export const MODEL_CATALOG_DEFAULT_ASSET = "maximal-model-catalog-v1.json"
export const MODEL_CATALOG_MAX_BYTES = 64 * 1024 * 1024

const TAG = /^catalog-v[1-9]\d*\.\d{4}\.\d{2}\.\d{2}\.\d+$/u
const ASSET = /^[a-zA-Z0-9][\w.-]{0,127}$/u
const SHA256 = /^[a-f0-9]{64}$/u

export interface ModelCatalogReleasePin {
  readonly tag: string
  readonly sha256: string
  readonly asset?: string
}

export interface ResolvedModelCatalogReleasePin {
  readonly tag: string
  readonly sha256: string
  readonly asset: string
}

export function resolveModelCatalogReleasePin(
  pin: ModelCatalogReleasePin,
): ResolvedModelCatalogReleasePin {
  const asset = pin.asset ?? MODEL_CATALOG_DEFAULT_ASSET
  if (!TAG.test(pin.tag)) {
    throw new TypeError(`Invalid model catalog release tag "${pin.tag}".`)
  }
  if (!ASSET.test(asset)) {
    throw new TypeError(`Invalid model catalog asset name "${asset}".`)
  }
  if (!SHA256.test(pin.sha256)) {
    throw new TypeError(
      "Model catalog SHA-256 must be 64 lowercase hex digits.",
    )
  }
  return Object.freeze({ asset, sha256: pin.sha256, tag: pin.tag })
}

export function modelCatalogReleaseUrl(pin: ModelCatalogReleasePin): URL {
  const resolved = resolveModelCatalogReleasePin(pin)
  return new URL(
    `https://github.com/${MODEL_CATALOG_REPOSITORY}/releases/download/`
      + `${encodeURIComponent(resolved.tag)}/${encodeURIComponent(resolved.asset)}`,
  )
}
