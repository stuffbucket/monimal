import { describe, expect, it } from 'vitest'

import {
  cloudModelObservations,
  localModelObservations,
} from './model-inventory'

describe('model inventory observations', () => {
  it('preserves cloud tokenizer and operation metadata', () => {
    const observations = cloudModelObservations(
      [
        {
          id: 'embedding-model',
          name: 'Embedding Model',
          vendor: 'Provider',
          provider: 'provider',
          location: 'cloud',
          family: 'embedding',
          type: 'embeddings',
          preview: false,
          context_window_tokens: 8192,
          max_output_tokens: null,
          operations: ['embeddings'],
          tokenizer: { id: 'o200k_base' },
          evidence: {
            endpoints: ['/v1/embeddings'],
            limits: {
              context_tokens: 8192,
              embedding_max_inputs: 2048,
            },
            pricing: {
              default: { input_amount: 20 },
              unit: {
                currency: null,
                tokens_per_batch: 1_000_000,
              },
            },
            provider_details: {
              kind: 'github-copilot',
              legacy_billing: {
                is_premium: false,
                multiplier: 0,
              },
              version: 'embedding-model-1',
            },
            selection: {
              default: false,
              fallback: false,
              preview: false,
              selectable: false,
            },
          },
          capabilities: {
            vision: false,
            image_generation: false,
            video_generation: false,
            tool_calls: false,
            streaming: false,
            reasoning: false,
          },
        },
      ],
      new Map(),
    )

    expect(observations[0]?.operations).toEqual(['embeddings'])
    expect(observations[0]?.tokenizer).toEqual({ id: 'o200k_base' })
    expect(observations[0]?.limits).toMatchObject({
      contextTokens: 8192,
      embeddingMaxInputs: 2048,
    })
    expect(observations[0]?.evidence).toMatchObject({
      endpoints: ['/v1/embeddings'],
      pricing: {
        default: { inputAmount: 20 },
        unit: { currency: null, tokensPerBatch: 1_000_000 },
      },
      providerDetails: {
        kind: 'github-copilot',
        legacyBilling: { isPremium: false, multiplier: 0 },
        version: 'embedding-model-1',
      },
      selection: { selectable: false },
    })
  })

  it('preserves local tokenizer and future systemone metadata', () => {
    const observations = localModelObservations([
      {
        capabilities: { input: ['text'], output: ['text'] },
        context: { contextWindow: 4096 },
        displayName: 'Decision Model',
        expectedBytes: 1,
        format: 'gguf',
        key: 'decision-model',
        modelId: 'decision/model',
        operations: ['systemone'],
        publication: 'provider',
        state: 'ready',
        tokenizer: { id: 'decision-tokenizer' },
      },
    ])

    expect(observations[0]?.operations).toEqual(['systemone'])
    expect(observations[0]?.tokenizer).toEqual({ id: 'decision-tokenizer' })
  })
})
