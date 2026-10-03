import { mkdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';

import type {} from 'electron';

import { LLAMA_CONFIG, LLAMA_COPY } from '../constants.js';
import { ENGINE_LIFECYCLE } from '../host/llama-protocol.js';
import type { EngineEvent, EngineRequest } from '../host/llama-protocol.js';
import type { ModelRunnerMessage } from '../runner-contract.js';
import { toGrammarSchema } from './grammar.js';

/**
 * The llama.cpp engine process.
 *
 * Everything that loads `node-llama-cpp` is in this file and in no other, so
 * there is one loading path rather than two. It runs as an Electron
 * `utilityProcess`, forked by `native/llama-host.ts`, and it is expected to die
 * badly: a corrupt GGUF or an out-of-memory ends in a native fault that no
 * `try` can catch. The supervisor turns that into a sentence. Issue #133.
 *
 * The two things `docs/agent.md` says must stay shared survive the boundary.
 * The approval gate stays in the main process — a tool call becomes a
 * `tool-call` message and waits for the answer — and so does the sink, because
 * a token is posted as it is produced rather than accumulated here.
 *
 * `node-llama-cpp` is ESM only while this bundle is CommonJS, and Rollup
 * rewrites a plain dynamic import into `require`, which cannot load it. The
 * `Function` constructor hides the import from the bundler.
 */

type EsmImport = (specifier: string) => Promise<Record<string, unknown>>;
// eslint-disable-next-line @typescript-eslint/no-implied-eval -- Rollup must not rewrite this dynamic import.
const esmImport = new Function('s', 'return import(s)') as unknown as EsmImport;

function post(event: EngineEvent): void {
  process.parentPort.postMessage(event);
}

/* ------------------------------------------------------------ the library */

let llamaModule: Record<string, unknown> | undefined;

/**
 * How long the ESM import of `node-llama-cpp` may take.
 *
 * Loading a JavaScript module graph is milliseconds of work. This is not a
 * budget for it, it is a bound on a hang: an `import()` that never settles
 * would otherwise be indistinguishable from an engine that is merely busy, and
 * the user would watch a spinner forever. Deliberately far below the check's
 * own limit, and far above anything a real load costs, so a failure here means
 * the import and not a slow machine. Issue #133.
 */
async function library(): Promise<Record<string, unknown>> {
  if (llamaModule) return llamaModule;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const bound = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(
            LLAMA_COPY.engine.importTimeout(
              LLAMA_CONFIG.engine.importTimeoutMs,
            ),
          ),
        ),
      LLAMA_CONFIG.engine.importTimeoutMs,
    );
  });

  try {
    llamaModule = await Promise.race([esmImport('node-llama-cpp'), bound]);
    return llamaModule;
  } finally {
    clearTimeout(timer);
  }
}

interface LoadedModel {
  dispose: () => Promise<void>;
  tokenizer: {
    (text: string, specialTokens?: boolean, options?: 'trimLeadingSpace'): unknown[];
  };
  createContext: (options: { contextSize: number }) => Promise<{
    getSequence: () => {
      clearHistory: () => Promise<void>;
      evaluateWithMetadata: (
        tokens: unknown[],
        metadata: { probabilities: true },
        options: {
          temperature: number;
          minP: number;
          topK: number;
          topP: number;
          tokenBias: TokenBias;
        },
      ) => AsyncGenerator<{
        token: unknown;
        probabilities: Map<unknown, number>;
      }>;
    };
    dispose: () => Promise<void>;
  }>;
}

interface RenderedContext {
  contextText: {
    tokenize: (tokenizer: LoadedModel['tokenizer']) => unknown[];
  };
}

interface ChatWrapper {
  generateContextState: (options: {
    chatHistory: ReadonlyArray<
      | { type: 'system'; text: string }
      | { type: 'user'; text: string }
      | { type: 'model'; response: string[] }
    >;
  }) => RenderedContext;
}

interface TokenBias {
  set: (token: unknown, bias: { logit: number }) => TokenBias;
}

interface TokenBiasConstructor {
  for: (model: LoadedModel) => TokenBias;
}

interface ChatSessionCtor {
  new (options: { contextSequence: unknown; systemPrompt: string }): {
    prompt: (text: string, options: Record<string, unknown>) => Promise<string>;
  };
}

/**
 * What this process asks `getLlama()` for, and the reason it is written down.
 *
 * `node-llama-cpp` can compile llama.cpp from source when no prebuilt binary
 * loads, and inside Electron it already declines to: `defaultBuildOption` is
 * `"never"` there, against `"auto"` everywhere else. Passing it makes that an
 * argument this application chose rather than a default it happens to inherit.
 *
 * The packaging policy depends on it. Consumers may drop the 33 MB llama.cpp
 * source bundle and compiler tooling that only a from-source build reads, and
 * the verification export asserts both that they are gone and that this option
 * is still here. Change one and the other fails: a build this bundle cannot
 * perform must fail at load, not halfway through a compile.
 */
let loaded: { path: string; model: LoadedModel } | undefined;

/** Load the library and report the backend it chose, and what it cost. */
async function probe(id: string): Promise<string> {
  const started = Date.now();
  const nlc = await library();
  const getLlama = nlc.getLlama as (
    options: typeof LLAMA_CONFIG.engine.llamaOptions,
  ) => Promise<{ gpu: string | false }>;
  const llama = await getLlama(LLAMA_CONFIG.engine.llamaOptions);
  const device = llama.gpu === false ? 'cpu' : llama.gpu;
  // The number, not a round guess, is what a timeout on a platform nobody has
  // measured should be derived from. Issue #133.
  post({ kind: 'loaded', id, device, ms: Date.now() - started });
  return device;
}

/**
 * Load the weights, once.
 *
 * Loading costs seconds and holds a gigabyte, so it is cached for the life of
 * this process. The overlay is summoned briefly and often. There is
 * Switching paths explicitly disposes the previous model before loading the
 * next one so model selection cannot retain multiple sets of weights. Shutdown
 * still relies on process reclamation: beginning native async disposal while
 * Electron tears down the utility process can abort.
 */
async function model(modelPath: string, id: string): Promise<LoadedModel> {
  if (loaded?.path === modelPath) return loaded.model;

  if (loaded) {
    const previous = loaded;
    loaded = undefined;
    await previous.model.dispose();
  }
  await probe(id);
  const nlc = await library();
  const getLlama = nlc.getLlama as (
    options: typeof LLAMA_CONFIG.engine.llamaOptions,
  ) => Promise<{
    loadModel: (options: { modelPath: string }) => Promise<LoadedModel>;
  }>;

  const llama = await getLlama(LLAMA_CONFIG.engine.llamaOptions);
  const opened = await llama.loadModel({ modelPath });
  loaded = { path: modelPath, model: opened };
  return opened;
}

/* -------------------------------------------------------------- download */

let downloading: AbortController | undefined;

async function download(request: Extract<EngineRequest, { kind: 'ensure-model' }>): Promise<void> {
  const controller = new AbortController();
  downloading = controller;

  const target = request.modelPath;
  const directory = path.dirname(target);
  const partial = `${target}.part`;
  const id = request.id;

  try {
    await mkdir(directory, { recursive: true });

    const nlc = await library();
    const createModelDownloader = nlc.createModelDownloader as (
      options: Record<string, unknown>,
    ) => Promise<{
      totalSize: number;
      download: (options?: { signal?: AbortSignal }) => Promise<string>;
    }>;

    let total = 0;
    const downloader = await createModelDownloader({
      modelUri: request.url,
      dirPath: directory,
      fileName: path.basename(partial),
      // Keep a partial file on cancel so a retry resumes rather than restarts.
      deleteTempFileOnCancel: false,
      onProgress: ({ totalSize, downloadedSize }: { totalSize: number; downloadedSize: number }) => {
        total = totalSize;
        post({
          kind: 'progress',
          id,
          progress: { state: 'downloading', received: downloadedSize, total: totalSize },
        });
      },
    });

    post({
      kind: 'progress',
      id,
      progress: { state: 'downloading', received: 0, total: downloader.totalSize },
    });
    await downloader.download({ signal: controller.signal });

    // Only now does the file take its real name. Anything that dies before
    // this point leaves a `.part`, which the main process does not accept.
    const written = await stat(partial).catch(() => undefined);
    if (!written || written.size < request.minBytes) {
      throw new Error(
        `Downloaded ${String(written?.size ?? 0)} bytes of an expected ` +
          `${String(total || downloader.totalSize)}, which is too small to be the model.`,
      );
    }
    await rename(partial, target);

    post({ kind: 'progress', id, progress: { state: 'ready' } });
    post({ kind: 'done', id });
  } catch (error) {
    const aborted = controller.signal.aborted;
    const reason = aborted
      ? LLAMA_COPY.download.cancelled
      : describeDownloadFailure(error);

    // A failed attempt that is not a cancellation may have left a corrupt
    // partial. Clear it so a retry starts clean rather than resuming garbage.
    if (!aborted) await rm(partial, { force: true }).catch(() => undefined);

    post({ kind: 'progress', id, progress: { state: 'error', reason } });
    post({ kind: 'done', id });
  } finally {
    downloading = undefined;
  }
}

/** Turn a network failure into something a person can act on. */
function describeDownloadFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|fetch failed/i.test(message)) {
    return LLAMA_COPY.download.hostUnavailable;
  }
  if (/ENOSPC/i.test(message)) return LLAMA_COPY.download.diskFull;
  return LLAMA_COPY.download.failed(message);
}

/* ------------------------------------------------------------------- run */

let running: AbortController | undefined;

/** Tool calls waiting on the main process for a result. */
const awaiting = new Map<string, (text: string) => void>();
let nextCall = 0;

/** Ask the main process to gate and run one tool call, and wait for the text. */
function callTool(id: string, name: string, args: unknown): Promise<string> {
  return new Promise((resolve) => {
    nextCall += 1;
    const callId = `${id}-${String(nextCall)}`;
    awaiting.set(callId, resolve);
    post({ kind: 'tool-call', id, callId, name, args });
  });
}

async function run(request: Extract<EngineRequest, { kind: 'run' }>): Promise<void> {
  const id = request.id;
  if (running) {
    post({ kind: 'failed', id, reason: 'The llama.cpp runner is busy.' });
    return;
  }
  const controller = new AbortController();
  running = controller;

  try {
    const nlc = await library();
    const opened = await model(request.modelPath, id);

    const defineFunction = nlc.defineChatSessionFunction as (
      definition: Record<string, unknown>,
    ) => unknown;
    const LlamaChatSession = nlc.LlamaChatSession as ChatSessionCtor;

    const context = await opened.createContext({ contextSize: request.contextSize });

    try {
      const functions: Record<string, unknown> = {};
      const dropped: string[] = [];

      for (const tool of request.tools) {
        // llama.cpp constrains sampling to the tool's grammar, which is most of
        // why a model this small can call tools at all. A schema it cannot
        // express means the tool is dropped, not passed through unconstrained.
        const params = toGrammarSchema(tool.parameters);
        if (!params) {
          dropped.push(tool.name);
          continue;
        }

        functions[tool.name] = defineFunction({
          description: tool.description,
          params,
          handler: async (args: unknown) => {
            if (controller.signal.aborted) return LLAMA_COPY.common.cancelled;
            return callTool(id, tool.name, args);
          },
        });
      }

      // Not silent. A dropped tool is the difference between "the model chose
      // not to" and "the model was never offered it".
      if (dropped.length > 0) post({ kind: 'dropped', id, names: dropped });

      const session = new LlamaChatSession({
        contextSequence: context.getSequence(),
        systemPrompt: request.systemPrompt,
      });

      await session.prompt(request.prompt, {
        functions,
        maxTokens: request.maxTokens,
        signal: controller.signal,
        stopOnAbortSignal: true,
        onTextChunk: (text: string) => post({ kind: 'delta', id, text }),
      });
      post({ kind: 'done', id });
    } finally {
      await context.dispose().catch(() => undefined);
    }
  } catch (error) {
    post({
      kind: 'failed',
      id,
      reason: error instanceof Error ? error.message : String(error),
    });
  } finally {
    running = undefined;
    // Nothing is coming back for a call whose run has ended.
    for (const settle of [...awaiting.values()]) {
      settle(LLAMA_COPY.common.cancelled);
    }
    awaiting.clear();
  }
}

function chatHistory(
  messages: ReadonlyArray<ModelRunnerMessage>,
  systemPrompt?: string,
): ReadonlyArray<
  | { type: 'system'; text: string }
  | { type: 'user'; text: string }
  | { type: 'model'; response: string[] }
> {
  const history: Array<
    | { type: 'system'; text: string }
    | { type: 'user'; text: string }
    | { type: 'model'; response: string[] }
  > = []
  if (systemPrompt) history.push({ type: 'system', text: systemPrompt })
  for (const message of messages) {
    if (message.role === 'assistant') {
      history.push({ type: 'model', response: [message.content] })
    } else {
      history.push({ type: message.role, text: message.content })
    }
  }
  return history
}

async function scoreTokenCandidates(
  request: Extract<EngineRequest, { kind: 'score-token-candidates' }>,
): Promise<void> {
  if (running) {
    post({
      kind: 'failed',
      id: request.id,
      reason: 'The llama.cpp runner is busy.',
    })
    return
  }
  const controller = new AbortController()
  running = controller

  try {
    const nlc = await library()
    const opened = await model(request.modelPath, request.id)
    const resolveChatWrapper = nlc.resolveChatWrapper as (
      model: LoadedModel,
    ) => ChatWrapper
    const TokenBias = nlc.TokenBias as TokenBiasConstructor
    const wrapper = resolveChatWrapper(opened)
    const context = await opened.createContext({
      contextSize: request.contextSize,
    })

    try {
      const sequence = context.getSequence()
      const rows: number[][] = []
      let inputTokens = 0
      for (const row of request.rows) {
        if (controller.signal.aborted) throw controller.signal.reason
        const candidateTokens = row.candidates.map((candidate) => {
          const tokens = opened.tokenizer(
            candidate,
            false,
            'trimLeadingSpace',
          )
          if (tokens.length !== 1) {
            throw new Error(
              `Candidate ${JSON.stringify(candidate)} tokenized to `
                + `${String(tokens.length)} tokens; exactly one is required.`,
            )
          }
          return tokens[0]
        })
        const rendered = wrapper.generateContextState({
          chatHistory: chatHistory(row.messages, request.systemPrompt),
        })
        const promptTokens = rendered.contextText.tokenize(opened.tokenizer)
        inputTokens += promptTokens.length
        // Equal bias plus top-k isolates the candidate set without changing
        // relative candidate logits.
        const tokenBias = TokenBias.for(opened)
        for (const token of candidateTokens) {
          tokenBias.set(token, { logit: 100 })
        }
        const evaluation = sequence.evaluateWithMetadata(
          promptTokens,
          { probabilities: true },
          {
            temperature: 1,
            minP: 0,
            topK: candidateTokens.length,
            topP: 1,
            tokenBias,
          },
        )
        const first = await evaluation.next()
        if (first.done) {
          throw new Error('The llama.cpp scorer returned no token metadata.')
        }
        rows.push(
          candidateTokens.map(
            (token) => first.value.probabilities.get(token) ?? 0,
          ),
        )
        await sequence.clearHistory()
      }
      post({
        kind: 'candidate-scores',
        id: request.id,
        probabilities: rows,
        inputTokens,
        outputTokens: request.rows.length,
      })
    } finally {
      await context.dispose().catch(() => undefined)
    }
  } catch (error) {
    post({
      kind: 'failed',
      id: request.id,
      reason: error instanceof Error ? error.message : String(error),
    })
  } finally {
    running = undefined
  }
}

/* --------------------------------------------------------------- the port */

function handle(request: EngineRequest): void {
  // Before anything it might block on. Its absence is what tells the
  // supervisor the request never arrived, rather than arrived and hung.
  if (request.kind !== 'crash-on-purpose') {
    post({ kind: 'ack', id: ENGINE_LIFECYCLE, of: request.kind });
  }

  switch (request.kind) {
    case 'probe':
      void probe(request.id).then(
        () => post({ kind: 'done', id: request.id }),
        (error: unknown) =>
          post({
            kind: 'failed',
            id: request.id,
            reason: error instanceof Error ? error.message : String(error),
          }),
      );
      return;
    case 'ensure-model':
      void download(request);
      return;
    case 'cancel-download':
      downloading?.abort();
      return;
    case 'run':
      void run(request);
      return;
    case 'score-token-candidates':
      void scoreTokenCandidates(request);
      return;
    case 'abort':
      running?.abort();
      return;
    case 'tool-result': {
      const settle = awaiting.get(request.callId);
      awaiting.delete(request.callId);
      settle?.(request.text);
      return;
    }
    case 'crash-on-purpose':
      // The packaged self check, and the one thing no `try` in this file could
      // catch. `process.crash()` writes through a null pointer, so it faults on
      // every platform. Not `process.abort()`: Node defines that as
      // `_exit(134)` on Windows, which is a clean exit and no crash at all.
      // Issue #156.
      process.crash();
  }
}

process.parentPort.on('message', (event: { data: unknown }) => {
  handle(event.data as EngineRequest);
});

// Last, and before any work. The supervisor uses its absence to tell a child
// that never started from one that started and is slow, which is the only
// thing that makes a timeout diagnosable. Issue #133.
post({ kind: 'hello', id: ENGINE_LIFECYCLE, pid: process.pid });
