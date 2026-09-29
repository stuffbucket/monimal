export const HARNESS_CONFIG = {
  approval: {
    maxSummaryCharacters: 200,
    timeoutMs: 45_000,
  },
  discovery: {
    defaultEndpoints: {
      maximal: 'http://localhost:4141',
      ollama: 'http://localhost:11434',
    },
    loopbackHosts: ['localhost', '127.0.0.1', '[::1]'],
    placeholderApiKey: 'supplied-by-local-backend',
    probeTimeoutMs: 1_500,
    providerPins: ['maximal', 'ollama', 'embedded'],
  },
  models: {
    maximal: {
      contextWindow: 200_000,
      maxTokens: 4_096,
    },
    ollama: {
      contextWindow: 32_000,
      maxTokens: 4_096,
    },
  },
  overlay: {
    bytesPerMegabyte: 1_000_000,
    inputRows: 2,
  },
} as const;

export const HARNESS_SYSTEM_PROMPT = [
  'You are a concise coding assistant in the Maximal desktop application.',
  'You have read, write, edit, and bash tools for the working directory.',
  'Use a tool only when it is needed to answer or act.',
  'Answer general questions directly and never run a destructive command unless asked.',
].join(' ');

export const HARNESS_COPY = {
  common: {
    cancelled: 'Cancelled.',
    denied: 'The user denied this tool call. Do not retry it.',
    done: 'Done.',
  },
  agent: {
    alreadyWorking: 'Already working on the previous request.',
    notConfigured: 'The agent harness has not been configured.',
    noBackend: 'No model backend is available.',
    noProviderAnswer: (provider: string) => `No ${provider} backend answered.`,
    modelNotDownloaded: (model: string) =>
      `The ${model} model has not been downloaded yet.`,
    modelUnavailable: (model: string) =>
      `The preferred model ${model} is not available.`,
    probing: 'Still looking for a model backend.',
  },
  embedded: {
    droppedTools: (names: readonly string[]) =>
      `Embedded run: no grammar for ${names.join(', ')}. Those tools were not offered.`,
    toolFailed: (reason: string) => `Tool failed: ${reason}`,
    toolUnavailable: (name: string) => `Tool failed: ${name} is not available.`,
  },
  overlay: {
    allow: 'Allow',
    allowAlways: (tool: string) => `Allow every ${tool}`,
    approvalHint: 'Enter to allow · Esc to deny',
    approvalStatus: (tool: string) => `Waiting for you to approve ${tool}`,
    deny: 'Deny',
    dismissHint: 'Enter to send · Esc to dismiss',
    download: 'Download',
    downloadPrompt: (model: string) =>
      `Download ${model} to answer without a proxy?`,
    downloadStarting: 'Starting…',
    downloadSummary: (approxMb: number) =>
      `About ${String(approxMb)} MB, once. It runs on this machine, so nothing leaves it and there is no key to paste.`,
    megabytes: (megabytes: number) => `${String(megabytes)} MB`,
    modelMissing: (model: string) => `${model} is not downloaded yet`,
    modelPickerLabel: 'Model',
    modelSelectionRequired: 'Choose an available model to continue.',
    probing: 'Looking for a local model…',
    requestFailed: 'The request could not be started.',
    runToolPrefix: 'Run',
    questionMark: '?',
    running: (tool: string) => `Running ${tool}…`,
    stopHint: 'Esc to stop',
    thinking: 'Thinking…',
    title: 'Ask the agent',
    tryAgain: 'Try again',
    waitingPlaceholder: 'Waiting for a local model…',
    readyPlaceholder: 'Ask anything…',
  },
} as const;
