export const LLAMA_CONFIG = {
  model: {
    approxMb: 610,
    contextSize: 8_192,
    file: 'Qwen3-0.6B-Q8_0.gguf',
    label: 'Qwen3 0.6B',
    maxTokens: 800,
    minBytes: 100_000_000,
    url: 'https://huggingface.co/Qwen/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q8_0.gguf',
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
} as const

export const LLAMA_COPY = {
  common: {
    cancelled: 'Cancelled.',
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
    modelDirectoryNotConfigured: 'The llama.cpp model directory has not been configured.',
    workerPathNotConfigured: 'The llama.cpp worker path has not been configured.',
  },
  download: {
    cancelled: 'Download cancelled.',
    diskFull: 'Not enough disk space for the model.',
    failed: (reason: string) => `Download failed: ${reason}`,
    hostUnavailable:
      'Could not reach the model host. Check your network connection, then try again.',
  },
  selfCheck: {
    failed: 'self-check llama: failed',
    flag: '--self-check=llama',
    noLibrary: 'did not load llama.cpp',
    ok: 'self-check llama: ok',
  },
} as const

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
} as const

export const POSIX_ENGINE_FAULTS: Readonly<Record<string, number>> = {
  SIGILL: 4,
  SIGTRAP: 5,
  SIGABRT: 6,
  SIGFPE: 8,
  SIGKILL: 9,
  SIGSEGV: 11,
}

export const SIGBUS_BY_PLATFORM: Readonly<Record<string, number>> = {
  darwin: 10,
  linux: 7,
}

export const WINDOWS_ENGINE_FAULTS: Readonly<Record<number, string>> = {
  134: 'SIGABRT',
  0xc0000005: 'access violation',
  0xc0000374: 'heap corruption',
  0xc0000409: 'stack buffer overrun',
  0xc000001d: 'illegal instruction',
}
