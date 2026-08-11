import type {
  ApiClient,
  AppIntegration,
  DiagnosticGroup,
  Endpoint,
  ModelCard,
  UsageReport,
} from './settings.js';

/**
 * Sample settings content.
 *
 * The same standing as `lib/data.ts`: enough to make a layout problem visible,
 * and no more. A consumer replaces every one of these with their own values,
 * because the shell owns the surfaces and not what is on them.
 *
 * **There is no credential here.** `SAMPLE_ENDPOINT` deliberately carries no
 * key, and the sample client values say what they are. A key in this
 * repository is a defect, and this module is exactly where one would get
 * committed by accident.
 */

export const SAMPLE_MODELS: ModelCard[] = [
  {
    id: 'claude-sonnet-4-5',
    name: 'Claude Sonnet 4.5',
    kind: 'chat',
    contextWindowTokens: 200_000,
    maxOutputTokens: 64_000,
    capabilities: { vision: true, toolCalls: true, streaming: true, reasoning: true },
  },
  {
    id: 'claude-haiku-4-5',
    name: 'Claude Haiku 4.5',
    kind: 'chat',
    contextWindowTokens: 200_000,
    maxOutputTokens: 32_000,
    capabilities: { vision: true, toolCalls: true, streaming: true, reasoning: false },
  },
  {
    id: 'qwen3-0.6b',
    name: 'Qwen3 0.6B (embedded)',
    kind: 'chat',
    preview: true,
    contextWindowTokens: 32_768,
    maxOutputTokens: 4_096,
    capabilities: { vision: false, toolCalls: true, streaming: true, reasoning: false },
  },
  {
    id: 'text-embedding-3-small',
    name: 'Text embedding 3 small',
    kind: 'embeddings',
    contextWindowTokens: 8_191,
    capabilities: { vision: false, toolCalls: false, streaming: false, reasoning: false },
  },
];

/** No key. A consumer supplies one; this repository holds none. */
export const SAMPLE_ENDPOINT: Endpoint = {
  baseUrl: 'http://127.0.0.1:4141',
  routes: [
    { method: 'POST', path: '/v1/messages', label: 'Anthropic messages' },
    { method: 'POST', path: '/v1/chat/completions', label: 'OpenAI chat' },
    { method: 'POST', path: '/v1/responses', label: 'OpenAI responses' },
    { method: 'GET', path: '/v1/models', label: 'Models' },
  ],
};

/** The values say what they are, so nothing here reads as a secret. */
export const SAMPLE_CLIENTS: ApiClient[] = [
  { id: 'client-1', label: 'Claude Code', key: 'example-not-a-real-key', enabled: true },
  { id: 'client-2', label: 'Raycast', key: 'example-not-a-real-key-two', enabled: false },
];

export const SAMPLE_APPS: AppIntegration[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    status: 'ready',
    enabled: true,
    path: '~/.claude/settings.json',
  },
  {
    id: 'claude-desktop',
    name: 'Claude Desktop',
    status: 'not-installed',
    enabled: false,
    installCommand: 'brew install --cask claude',
  },
  {
    id: 'codex-cli',
    name: 'Codex CLI',
    status: 'coming-soon',
    enabled: false,
  },
];

/** What the shell is talking to, as opposed to what it is built from. */
export const SAMPLE_DIAGNOSTICS: DiagnosticGroup[] = [
  {
    id: 'connection',
    label: 'Connection',
    entries: [
      { label: 'Provider', value: 'Local proxy on localhost:4141', status: 'done' },
      { label: 'Models cached', value: '4' },
      { label: 'Rate limit', value: 'Unlimited' },
      { label: 'Web search', value: 'Built-in, no key' },
    ],
  },
];

/**
 * A period's worth of traffic, ending now.
 *
 * `nowMs` is an argument so the "3m ago" column moves with the clock while a
 * test can still pin it.
 */
export function sampleUsage(nowMs: number): UsageReport {
  return {
    totals: {
      input: 184_320,
      output: 41_984,
      cacheRead: 96_512,
      cacheCreation: 12_288,
      requests: 148,
      total: 335_104,
      nanoCost: 512_000_000,
    },
    byProvider: [
      {
        id: 'local-proxy',
        label: 'Local proxy',
        totals: {
          input: 150_000,
          output: 34_000,
          cacheRead: 90_000,
          cacheCreation: 10_000,
          requests: 118,
          total: 284_000,
          nanoCost: 448_000_000,
        },
      },
      {
        id: 'ollama',
        label: 'Ollama',
        totals: {
          input: 34_320,
          output: 7_984,
          cacheRead: 6_512,
          cacheCreation: 2_288,
          requests: 30,
          total: 51_104,
          nanoCost: 64_000_000,
        },
      },
    ],
    byModel: [
      {
        id: 'claude-sonnet-4-5',
        label: 'claude-sonnet-4-5',
        premium: true,
        totals: {
          input: 140_000,
          output: 30_000,
          cacheRead: 84_000,
          cacheCreation: 9_000,
          requests: 96,
          total: 263_000,
          nanoCost: 430_000_000,
        },
      },
      {
        id: 'claude-haiku-4-5',
        label: 'claude-haiku-4-5',
        totals: {
          input: 30_000,
          output: 9_000,
          cacheRead: 10_000,
          cacheCreation: 2_000,
          requests: 38,
          total: 51_000,
          nanoCost: 72_000_000,
        },
      },
      {
        id: 'qwen3-0.6b',
        label: 'qwen3-0.6b',
        totals: {
          input: 14_320,
          output: 2_984,
          cacheRead: 2_512,
          cacheCreation: 1_288,
          requests: 14,
          total: 21_104,
          nanoCost: 0,
        },
      },
    ],
    events: [
      {
        id: 'event-1',
        atMs: nowMs - 12_000,
        provider: 'Local proxy',
        model: 'claude-sonnet-4-5',
        endpoint: 'Messages',
        input: 4_812,
        output: 640,
        total: 5_452,
      },
      {
        id: 'event-2',
        atMs: nowMs - 240_000,
        provider: 'Local proxy',
        model: 'claude-haiku-4-5',
        endpoint: 'Chat',
        input: 1_204,
        output: 288,
        total: 1_492,
      },
      {
        id: 'event-3',
        atMs: nowMs - 5_400_000,
        provider: 'ollama',
        model: 'qwen3-0.6b',
        endpoint: 'Responses',
        input: 704,
        output: 96,
        total: 800,
      },
    ],
  };
}
