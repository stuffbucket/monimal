import type {
  ApiClient,
  Endpoint,
  ModelCard,
} from '../src/renderer/lib/settings.js';

/**
 * Sample settings content.
 *
 * Enough data to make layout problems visible without defining application
 * policy or carrying credentials.
 */

export const SAMPLE_MODELS: ModelCard[] = [
  {
    id: 'claude-sonnet-4-5',
    name: 'Claude Sonnet 4.5',
    kind: 'chat',
    contextWindowTokens: 200_000,
    maxOutputTokens: 64_000,
    capabilities: {
      vision: true,
      toolCalls: true,
      streaming: true,
      reasoning: true,
    },
  },
  {
    id: 'claude-haiku-4-5',
    name: 'Claude Haiku 4.5',
    kind: 'chat',
    contextWindowTokens: 200_000,
    maxOutputTokens: 32_000,
    capabilities: {
      vision: true,
      toolCalls: true,
      streaming: true,
      reasoning: false,
    },
  },
  {
    id: 'qwen3-0.6b',
    name: 'Qwen3 0.6B (embedded)',
    kind: 'chat',
    preview: true,
    contextWindowTokens: 32_768,
    maxOutputTokens: 4_096,
    capabilities: {
      vision: false,
      toolCalls: true,
      streaming: true,
      reasoning: false,
    },
  },
  {
    id: 'text-embedding-3-small',
    name: 'Text embedding 3 small',
    kind: 'embeddings',
    contextWindowTokens: 8_191,
    capabilities: {
      vision: false,
      toolCalls: false,
      streaming: false,
      reasoning: false,
    },
  },
];

export const SAMPLE_ENDPOINT: Endpoint = {
  baseUrl: 'http://127.0.0.1:4141',
  routes: [
    { method: 'POST', path: '/v1/messages', label: 'Anthropic messages' },
    { method: 'POST', path: '/v1/chat/completions', label: 'OpenAI chat' },
    { method: 'POST', path: '/v1/responses', label: 'OpenAI responses' },
    { method: 'GET', path: '/v1/models', label: 'Models' },
  ],
};

export const SAMPLE_CLIENTS: ApiClient[] = [
  {
    id: 'client-1',
    label: 'Claude Code',
    key: 'example-not-a-real-key',
    enabled: true,
  },
  {
    id: 'client-2',
    label: 'Raycast',
    key: 'example-not-a-real-key-two',
    enabled: false,
  },
];
