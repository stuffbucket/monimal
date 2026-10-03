import { createModelCatalogSupplementIndex } from "./catalog.ts"

const classificationCapabilities = Object.freeze({
  attachments: "unsupported",
  reasoning: "unsupported",
  structuredOutput: "supported",
  temperatureControl: "unsupported",
  toolCalls: "unsupported",
} as const)

const textClassification = Object.freeze({
  input: Object.freeze(["text"] as const),
  output: Object.freeze(["text"] as const),
})

const unknownLimits = Object.freeze({
  contextTokens: null,
  inputTokens: null,
  outputTokens: 0,
})

const localPricing = Object.freeze({
  inputUsdPerMillion: null,
  outputUsdPerMillion: null,
  reasoningUsdPerMillion: null,
  cacheReadUsdPerMillion: null,
  cacheWriteUsdPerMillion: null,
  audioInputUsdPerMillion: null,
  audioOutputUsdPerMillion: null,
})

export const MAXIMAL_GLINER25_PROVIDER_ID = "maximal-gliner25"

export const MAXIMAL_MODEL_CATALOG = createModelCatalogSupplementIndex({
  models: [
    {
      id: "fastino/GLiNER2.5-Decide",
      name: "GLiNER2.5 Decide 340M",
      family: "gliner25",
      releaseDate: null,
      lastUpdated: null,
      knowledgeCutoff: null,
      modalities: textClassification,
      limits: unknownLimits,
      capabilities: classificationCapabilities,
      openWeights: "supported",
      license: "Apache-2.0",
    },
    {
      id: "fastino/GLiNER2.5-Decide-1B",
      name: "GLiNER2.5 Decide 1B",
      family: "gliner25",
      releaseDate: null,
      lastUpdated: null,
      knowledgeCutoff: null,
      modalities: textClassification,
      limits: unknownLimits,
      capabilities: classificationCapabilities,
      openWeights: "supported",
      license: "Apache-2.0",
    },
    {
      id: "fastino/GLiNER2.5-multi-Decide",
      name: "GLiNER2.5 Multilingual Decide",
      family: "gliner25",
      releaseDate: null,
      lastUpdated: null,
      knowledgeCutoff: null,
      modalities: textClassification,
      limits: unknownLimits,
      capabilities: classificationCapabilities,
      openWeights: "supported",
      license: "Apache-2.0",
    },
  ],
  providers: [
    {
      id: MAXIMAL_GLINER25_PROVIDER_ID,
      name: "Maximal GLiNER2.5",
    },
  ],
  offerings: [
    {
      providerId: MAXIMAL_GLINER25_PROVIDER_ID,
      modelId: "gliner25:1b",
      canonicalModelId: "fastino/GLiNER2.5-Decide-1B",
      name: "GLiNER2.5 Decide 1B",
      status: "active",
      modalities: textClassification,
      limits: unknownLimits,
      capabilities: classificationCapabilities,
      pricing: localPricing,
    },
    {
      providerId: MAXIMAL_GLINER25_PROVIDER_ID,
      modelId: "gliner25:340m",
      canonicalModelId: "fastino/GLiNER2.5-Decide",
      name: "GLiNER2.5 Decide 340M",
      status: "active",
      modalities: textClassification,
      limits: unknownLimits,
      capabilities: classificationCapabilities,
      pricing: localPricing,
    },
    {
      providerId: MAXIMAL_GLINER25_PROVIDER_ID,
      modelId: "gliner25:multi",
      canonicalModelId: "fastino/GLiNER2.5-multi-Decide",
      name: "GLiNER2.5 Multilingual Decide",
      status: "active",
      modalities: textClassification,
      limits: unknownLimits,
      capabilities: classificationCapabilities,
      pricing: localPricing,
    },
  ],
})
