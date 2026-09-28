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
    maximalModel: 'claude-haiku-4-5',
    ollamaPreferredModels: [
      'qwen3:4b',
      'qwen3:1.7b',
      'qwen2.5:7b',
      'lfm2.5:1.2b',
      'qwen3:0.6b',
    ],
    placeholderApiKey: 'supplied-by-local-backend',
    probeTimeoutMs: 1_500,
    providerPins: ['maximal', 'ollama', 'embedded'],
  },
  models: {
    embedded: {
      approxMb: 610,
      contextSize: 4_096,
      file: 'Qwen3-0.6B-Q8_0.gguf',
      label: 'Qwen3 0.6B',
      maxTokens: 800,
      minBytes: 100_000_000,
      url: 'https://huggingface.co/Qwen/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q8_0.gguf',
    },
    maximal: {
      contextWindow: 200_000,
      maxTokens: 4_096,
    },
    ollama: {
      contextWindow: 32_000,
      maxTokens: 4_096,
    },
  },
  engine: {
    checkTimeoutMs: {
      default: 60_000,
      win32: 180_000,
    },
    crashLimit: 3,
    crashWindowMs: 60_000,
    importTimeoutMs: 30_000,
    lifecycleId: 'engine',
    llamaOptions: { build: 'never' },
    serviceName: 'llama',
  },
  overlay: {
    bytesPerMegabyte: 1_000_000,
    inputRows: 2,
  },
} as const;

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
    probing: 'Still looking for a model backend.',
  },
  embedded: {
    droppedTools: (names: readonly string[]) =>
      `Embedded run: no grammar for ${names.join(', ')}. Those tools were not offered.`,
    toolFailed: (reason: string) => `Tool failed: ${reason}`,
    toolUnavailable: (name: string) => `Tool failed: ${name} is not available.`,
  },
  engine: {
    cleanStop: 'The model engine stopped.',
    configureWhileRunning: 'Cannot reconfigure the llama host while it is running.',
    exhausted: (last: string, crashLimit: number) =>
      `${last} It has crashed ${String(crashLimit)} times, so it will not be ` +
      'started again until the application restarts.',
    exited: (code: number) =>
      `The model engine exited with code ${String(code)}. Nothing else was affected.`,
    crashed: (fault: string) =>
      `The model engine crashed in native code (${fault}). Nothing else was affected. ` +
      'The model file may be corrupt, or the machine may have run out of memory. ' +
      'Delete the downloaded weights and try again.',
    importTimeout: (ms: number) =>
      `loading node-llama-cpp did not complete in ${String(ms)} ms.`,
    modelDirectoryNotConfigured: 'The harness model directory has not been configured.',
    workerPathNotConfigured: 'The llama worker path has not been configured.',
  },
  download: {
    cancelled: 'Download cancelled.',
    diskFull: 'Not enough disk space for the model.',
    failed: (reason: string) => `Download failed: ${reason}`,
    hostUnavailable:
      'Could not reach the model host. Check your network connection, then try again.',
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
  selfCheck: {
    failed: 'self-check llama: failed',
    flag: '--self-check=llama',
    noLibrary: 'did not load llama.cpp',
    ok: 'self-check llama: ok',
  },
} as const;

export const ENGINE_PHASE_DETAIL = {
  'not started': 'the engine process was never forked',
  forked: 'the engine process started but its entry never ran',
  running:
    'the engine started and never read the request off its port, so the ' +
    'request never reached it',
  acknowledged:
    'the engine read the request and never named a device, so loading ' +
    'llama.cpp is where it stopped',
  loaded: 'the engine had loaded llama.cpp and did not answer',
} as const;

export const POSIX_ENGINE_FAULTS: Readonly<Record<string, number>> = {
  SIGILL: 4,
  SIGTRAP: 5,
  SIGABRT: 6,
  SIGFPE: 8,
  SIGKILL: 9,
  SIGSEGV: 11,
};

export const SIGBUS_BY_PLATFORM: Readonly<Record<string, number>> = {
  darwin: 10,
  linux: 7,
};

export const WINDOWS_ENGINE_FAULTS: Readonly<Record<number, string>> = {
  134: 'SIGABRT',
  0xc0000005: 'access violation',
  0xc0000374: 'heap corruption',
  0xc0000409: 'stack buffer overrun',
  0xc000001d: 'illegal instruction',
};
