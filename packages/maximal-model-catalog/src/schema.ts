import { z } from "zod"

const COMMIT = /^[a-f0-9]{40}$/u
const DIGEST = /^sha256:[a-f0-9]{64}$/u
const DATE = /^\d{4}-\d{2}-\d{2}$/u

function hasNoControlCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.codePointAt(index)
    if (codePoint === undefined || codePoint <= 31 || codePoint === 127) {
      return false
    }
  }
  return true
}

function isIsoDate(value: string): boolean {
  if (!DATE.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.valueOf()) && date.toISOString().startsWith(value)
}

const Identifier = z
  .string()
  .min(1)
  .max(512)
  .refine((value) => value.trim() === value, "Whitespace must be normalized.")
  .refine(hasNoControlCharacters, "Control characters are not allowed.")
const DisplayName = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => value.trim() === value, "Whitespace must be normalized.")
  .refine(hasNoControlCharacters, "Control characters are not allowed.")
const NullableDate = z
  .string()
  .refine(isIsoDate, "Invalid ISO date.")
  .nullable()
const NullableTokenLimit = z.number().int().min(0).max(100_000_000).nullable()
const NullablePrice = z.number().min(0).max(1_000_000).nullable()

export const ModelCatalogCapabilityStateSchema = z.enum([
  "supported",
  "unsupported",
  "unknown",
])
export type ModelCatalogCapabilityState = z.infer<
  typeof ModelCatalogCapabilityStateSchema
>

export const ModelCatalogCapabilitiesSchema = z
  .object({
    attachments: ModelCatalogCapabilityStateSchema,
    reasoning: ModelCatalogCapabilityStateSchema,
    structuredOutput: ModelCatalogCapabilityStateSchema,
    temperatureControl: ModelCatalogCapabilityStateSchema,
    toolCalls: ModelCatalogCapabilityStateSchema,
  })
  .strict()
export type ModelCatalogCapabilities = z.infer<
  typeof ModelCatalogCapabilitiesSchema
>

export const ModelCatalogModalitySchema = z.enum([
  "text",
  "audio",
  "image",
  "video",
  "pdf",
])
export type ModelCatalogModality = z.infer<typeof ModelCatalogModalitySchema>

export const ModelCatalogModalitiesSchema = z
  .object({
    input: z.array(ModelCatalogModalitySchema).max(5),
    output: z.array(ModelCatalogModalitySchema).max(5),
  })
  .strict()
export type ModelCatalogModalities = z.infer<
  typeof ModelCatalogModalitiesSchema
>

export const ModelCatalogLimitsSchema = z
  .object({
    contextTokens: NullableTokenLimit,
    inputTokens: NullableTokenLimit,
    outputTokens: NullableTokenLimit,
  })
  .strict()
export type ModelCatalogLimits = z.infer<typeof ModelCatalogLimitsSchema>

export const CanonicalModelSchema = z
  .object({
    id: Identifier,
    name: DisplayName,
    family: z
      .string()
      .max(256)
      .refine(hasNoControlCharacters, "Control characters are not allowed.")
      .nullable(),
    releaseDate: NullableDate,
    lastUpdated: NullableDate,
    knowledgeCutoff: NullableDate,
    modalities: ModelCatalogModalitiesSchema,
    limits: ModelCatalogLimitsSchema,
    capabilities: ModelCatalogCapabilitiesSchema,
    openWeights: ModelCatalogCapabilityStateSchema,
    license: z
      .string()
      .min(1)
      .max(256)
      .refine(hasNoControlCharacters, "Control characters are not allowed.")
      .nullable(),
  })
  .strict()
export type CanonicalModel = z.infer<typeof CanonicalModelSchema>

export const ModelCatalogProviderSchema = z
  .object({
    id: Identifier,
    name: DisplayName,
  })
  .strict()
export type ModelCatalogProvider = z.infer<typeof ModelCatalogProviderSchema>

export const ModelCatalogPricingSchema = z
  .object({
    inputUsdPerMillion: NullablePrice,
    outputUsdPerMillion: NullablePrice,
    reasoningUsdPerMillion: NullablePrice,
    cacheReadUsdPerMillion: NullablePrice,
    cacheWriteUsdPerMillion: NullablePrice,
    audioInputUsdPerMillion: NullablePrice,
    audioOutputUsdPerMillion: NullablePrice,
  })
  .strict()
export type ModelCatalogPricing = z.infer<typeof ModelCatalogPricingSchema>

export const ProviderOfferingSchema = z
  .object({
    providerId: Identifier,
    modelId: Identifier,
    canonicalModelId: Identifier.nullable(),
    name: DisplayName,
    status: z.enum(["active", "alpha", "beta", "deprecated", "unknown"]),
    modalities: ModelCatalogModalitiesSchema,
    limits: ModelCatalogLimitsSchema,
    capabilities: ModelCatalogCapabilitiesSchema,
    pricing: ModelCatalogPricingSchema,
  })
  .strict()
export type ProviderOffering = z.infer<typeof ProviderOfferingSchema>

function duplicateValues(values: ReadonlyArray<string>): Set<string> {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value)
    seen.add(value)
  }
  return duplicates
}

function isSorted(values: ReadonlyArray<string>): boolean {
  for (let index = 1; index < values.length; index += 1) {
    const previous = values[index - 1]
    const current = values[index]
    if (previous === undefined || current === undefined) return false
    if (previous.localeCompare(current) >= 0) return false
  }
  return true
}

export const ModelCatalogSchema = z
  .object({
    schemaVersion: z.literal(1),
    source: z
      .object({
        repository: z.literal("anomalyco/models.dev"),
        commit: z.string().regex(COMMIT),
        digest: z.string().regex(DIGEST),
      })
      .strict(),
    models: z.array(CanonicalModelSchema).max(20_000),
    providers: z.array(ModelCatalogProviderSchema).max(5_000),
    offerings: z.array(ProviderOfferingSchema).max(100_000),
  })
  .strict()
  .superRefine((catalog, context) => {
    const modelIds = catalog.models.map(({ id }) => id)
    const providerIds = catalog.providers.map(({ id }) => id)
    const offeringIds = catalog.offerings.map(
      ({ modelId, providerId }) => `${providerId}\u0000${modelId}`,
    )
    for (const duplicate of duplicateValues(modelIds)) {
      context.addIssue({
        code: "custom",
        message: `Duplicate canonical model "${duplicate}".`,
        path: ["models"],
      })
    }
    for (const duplicate of duplicateValues(providerIds)) {
      context.addIssue({
        code: "custom",
        message: `Duplicate provider "${duplicate}".`,
        path: ["providers"],
      })
    }
    for (const duplicate of duplicateValues(offeringIds)) {
      const [providerId, modelId] = duplicate.split("\u0000")
      context.addIssue({
        code: "custom",
        message: `Duplicate offering "${providerId}/${modelId}".`,
        path: ["offerings"],
      })
    }
    if (!isSorted(modelIds)) {
      context.addIssue({
        code: "custom",
        message: "Canonical models must be sorted by id.",
        path: ["models"],
      })
    }
    if (!isSorted(providerIds)) {
      context.addIssue({
        code: "custom",
        message: "Providers must be sorted by id.",
        path: ["providers"],
      })
    }
    if (!isSorted(offeringIds)) {
      context.addIssue({
        code: "custom",
        message: "Offerings must be sorted by providerId and modelId.",
        path: ["offerings"],
      })
    }
    const models = new Set(modelIds)
    const providers = new Set(providerIds)
    for (const [index, offering] of catalog.offerings.entries()) {
      if (!providers.has(offering.providerId)) {
        context.addIssue({
          code: "custom",
          message: `Unknown provider "${offering.providerId}".`,
          path: ["offerings", index, "providerId"],
        })
      }
      if (
        offering.canonicalModelId !== null
        && !models.has(offering.canonicalModelId)
      ) {
        context.addIssue({
          code: "custom",
          message: `Unknown canonical model "${offering.canonicalModelId}".`,
          path: ["offerings", index, "canonicalModelId"],
        })
      }
    }
  })
export type ModelCatalog = z.infer<typeof ModelCatalogSchema>
