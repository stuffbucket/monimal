import type { ModelCatalog } from "../src/index.ts"

const capabilities = {
  attachments: "supported",
  reasoning: "supported",
  structuredOutput: "supported",
  temperatureControl: "unsupported",
  toolCalls: "supported",
} as const

export function catalogFixture(): ModelCatalog {
  return {
    schemaVersion: 1,
    source: {
      repository: "anomalyco/models.dev",
      commit: "1".repeat(40),
      digest: `sha256:${"2".repeat(64)}`,
    },
    models: [
      {
        id: "anthropic/claude-sonnet",
        name: "Claude Sonnet",
        family: "claude",
        releaseDate: "2026-09-28",
        lastUpdated: "2026-09-28",
        knowledgeCutoff: "2026-06-30",
        modalities: {
          input: ["text", "image"],
          output: ["text"],
        },
        limits: {
          contextTokens: 1_000_000,
          inputTokens: null,
          outputTokens: 128_000,
        },
        capabilities,
        openWeights: "unsupported",
        license: "Proprietary",
      },
    ],
    providers: [
      { id: "anthropic", name: "Anthropic" },
      { id: "ollama", name: "Ollama" },
    ],
    offerings: [
      {
        providerId: "anthropic",
        modelId: "claude-sonnet",
        canonicalModelId: "anthropic/claude-sonnet",
        name: "Claude Sonnet",
        status: "active",
        modalities: {
          input: ["text", "image"],
          output: ["text"],
        },
        limits: {
          contextTokens: 500_000,
          inputTokens: null,
          outputTokens: 64_000,
        },
        capabilities,
        pricing: {
          inputUsdPerMillion: 3,
          outputUsdPerMillion: 15,
          reasoningUsdPerMillion: null,
          cacheReadUsdPerMillion: 0.3,
          cacheWriteUsdPerMillion: 3.75,
          audioInputUsdPerMillion: null,
          audioOutputUsdPerMillion: null,
        },
      },
    ],
  }
}
