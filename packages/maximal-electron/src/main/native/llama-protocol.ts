import type { ModelProgress } from '../../shared/ipc.js';

/**
 * The wire between the main process and the llama.cpp engine process, and the
 * decisions the main process makes when that process dies.
 *
 * The engine runs out of process because a native abort is not catchable. A
 * corrupt GGUF, an out-of-memory, or an unsupported quantisation ends in
 * `abort()` or a fault, and in the main process that took every window and
 * every terminal session with it. Issue #133.
 *
 * This module imports nothing that needs Electron, so it is mutation tested.
 * `llama-host.ts` owns the child, and `src/main/llama-worker.ts` is the child.
 */

/** A tool the engine may offer the model. Structured-clonable: no functions. */
export interface ToolOffer {
  name: string;
  description: string;
  /** JSON Schema. `grammar.ts` in the child decides whether it can be used. */
  parameters: unknown;
}

/** Main process to engine. */
export type EngineRequest =
  /** Load `node-llama-cpp` and say what it chose. The packaged self check. */
  | { kind: 'probe'; id: string }
  | { kind: 'ensure-model'; id: string; modelPath: string; url: string; minBytes: number }
  | { kind: 'cancel-download' }
  | {
      kind: 'run';
      id: string;
      modelPath: string;
      prompt: string;
      systemPrompt: string;
      maxTokens: number;
      contextSize: number;
      tools: ToolOffer[];
    }
  | { kind: 'abort' }
  | { kind: 'tool-result'; callId: string; text: string }
  /** The packaged self check. Proves supervision by dying on purpose. */
  | { kind: 'crash-on-purpose' };

/** Engine to main process. */
export type EngineEvent =
  /**
   * The engine's entry ran and its port is wired. Posted before any work, so
   * the absence of it separates a child that never started from one that
   * started and is slow.
   */
  | { kind: 'hello'; id: string; pid: number }
  /**
   * The engine read a request off the port. Posted before it acts on it, so
   * the absence of it separates a request that was never delivered from one
   * that was delivered and then hung.
   */
  | { kind: 'ack'; id: string; of: string }
  /** The engine loaded `node-llama-cpp`. `device` is whatever it chose. */
  | { kind: 'loaded'; id: string; device: string; ms: number }
  | { kind: 'progress'; id: string; progress: ModelProgress }
  | { kind: 'delta'; id: string; text: string }
  | { kind: 'tool-call'; id: string; callId: string; name: string; args: unknown }
  /** Tools with no expressible grammar. Named, never silently dropped. */
  | { kind: 'dropped'; id: string; names: string[] }
  | { kind: 'done'; id: string }
  | { kind: 'failed'; id: string; reason: string };

/* ------------------------------------------------------- reading the port */

/**
 * Read one message off the port, or nothing.
 *
 * A message that does not match is dropped rather than thrown. The port is the
 * seam to a process that is expected to die badly, and a half-written message
 * on the way down must not become an exception in the supervisor.
 */
export function parseEngineEvent(value: unknown): EngineEvent | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const message = value as Record<string, unknown>;
  if (typeof message.kind !== 'string') return undefined;
  if (typeof message.id !== 'string') return undefined;
  return message as unknown as EngineEvent;
}

/**
 * The id `hello` carries. It belongs to the engine rather than to any one
 * operation, so the supervisor intercepts it instead of routing it.
 */
export const ENGINE_LIFECYCLE = 'engine';

/* -------------------------------------------------------- how it went down */

/**
 * Signal numbers that mean native code faulted. `SIGBUS` differs by platform,
 * which is the reason this is a per-platform table rather than one constant.
 */
const POSIX_FAULTS: Readonly<Record<string, number>> = {
  SIGILL: 4,
  SIGTRAP: 5,
  SIGABRT: 6,
  SIGFPE: 8,
  SIGKILL: 9,
  SIGSEGV: 11,
};

const SIGBUS: Readonly<Record<string, number>> = { darwin: 10, linux: 7 };

/**
 * Windows reports a status code rather than a signal.
 *
 * 134 is not one. It is `node::ExitCode::kAbort`, and on Windows Node defines
 * `ABORT_NO_BACKTRACE()` as `_exit(134)` rather than as `abort()`, so
 * `process.abort()` there is a clean exit and raises nothing. Nothing faults,
 * so Crashpad records nothing; the engine's self check uses `process.crash()`
 * instead. Issue #156. The entry stays because a fatal error inside Node still
 * ends the child this way.
 *
 * A Windows code here also depends on Crashpad running: the same fault reports
 * `0xC0000005` with the handler installed and `0xffff7003` without it.
 */
const WINDOWS_FAULTS: Readonly<Record<number, string>> = {
  134: 'SIGABRT',
  0xc0000005: 'access violation',
  0xc0000374: 'heap corruption',
  0xc0000409: 'stack buffer overrun',
  0xc000001d: 'illegal instruction',
};

/**
 * The name of the fault that killed the engine, or undefined for an ordinary
 * exit.
 *
 * Electron reports a POSIX signal death as the bare signal number, which is
 * indistinguishable from `process.exit(11)`. The engine therefore never exits
 * deliberately with anything but zero, so a non-zero code in this range is a
 * fault.
 */
export function faultName(code: number, platform: string): string | undefined {
  if (platform === 'win32') {
    const named = WINDOWS_FAULTS[code];
    if (named) return named;
    return code >= 0xc0000000 ? `native fault 0x${code.toString(16)}` : undefined;
  }

  // `code` is a number, so an unknown platform's absent entry never matches.
  if (code === SIGBUS[platform]) return 'SIGBUS';
  for (const [name, number] of Object.entries(POSIX_FAULTS)) {
    if (code === number) return name;
  }
  return undefined;
}

/**
 * What to tell the user when the engine process ends.
 *
 * The whole point of the boundary is that the application survives, so the
 * message says both halves: what died, and that nothing else did. A crash the
 * user cannot see is only marginally better than one that takes the app.
 */
export function describeEngineExit(code: number, platform: string): string {
  if (code === 0) return 'The model engine stopped.';

  const fault = faultName(code, platform);
  if (fault === undefined) {
    return `The model engine exited with code ${String(code)}. Nothing else was affected.`;
  }
  return (
    `The model engine crashed in native code (${fault}). Nothing else was affected. ` +
    'The model file may be corrupt, or the machine may have run out of memory. ' +
    'Delete the downloaded weights and try again.'
  );
}

/* ---------------------------------------------------------- restart budget */
/** How long a crash counts against the budget. */
export const CRASH_WINDOW_MS = 60_000;

/** Crashes allowed inside that window before the engine stops being restarted. */
export const CRASH_LIMIT = 3;

/** Crash times still inside the window, oldest first. */
export function recentCrashes(times: readonly number[], now: number): number[] {
  return times.filter((at) => now - at < CRASH_WINDOW_MS);
}

/**
 * May the engine be started again?
 *
 * A start only ever follows a request the user made, so there is no timer and
 * no loop. The budget is what stops a model that crashes on load from
 * respawning a 1 GB process on every keystroke, and it is the difference
 * between a failure the user can read and a machine that grinds.
 */
export function mayRestart(times: readonly number[], now: number): boolean {
  return recentCrashes(times, now).length < CRASH_LIMIT;
}

/** What to say once the budget is spent. */
export function exhaustedMessage(last: string): string {
  return (
    `${last} It has crashed ${String(CRASH_LIMIT)} times, so it will not be ` +
    'started again until the application restarts.'
  );
}

/* --------------------------------------------------------- where it got to */

/**
 * How far the engine got, in order.
 *
 * A wait that ends in a timeout is otherwise undiagnosable, and the first
 * Windows run of the packaged self check ended in exactly that: `no answer in
 * 60000 ms`, which is consistent with a child that never forked, one whose
 * port never carried the request, and one that is merely slow. Naming the
 * phase separates the three. Issue #133.
 */
export type EnginePhase =
  /** `utilityProcess.fork` has not been called, or threw. */
  | 'not started'
  /** Electron says the process exists. Nothing has been heard from it. */
  | 'forked'
  /** Its entry ran and its port is wired: `hello` arrived. */
  | 'running'
  /** It read the request off the port: `ack` arrived. */
  | 'acknowledged'
  /** `getLlama()` returned and named a device. */
  | 'loaded';

const PHASE_DETAIL: Readonly<Record<EnginePhase, string>> = {
  'not started': 'the engine process was never forked',
  forked: 'the engine process started but its entry never ran',
  running:
    'the engine started and never read the request off its port, so the ' +
    'request never reached it',
  acknowledged:
    'the engine read the request and never named a device, so loading ' +
    'llama.cpp is where it stopped',
  loaded: 'the engine had loaded llama.cpp and did not answer',
};

/**
 * The timeout message, naming what it was waiting on and for how long.
 *
 * The elapsed time is separate from the limit because they stop being the same
 * number the moment anyone raises the limit for one platform. Whoever reads a
 * Windows log next needs both to calibrate.
 */
export function describeEngineWait(phase: EnginePhase, ms: number): string {
  return `no answer in ${String(ms)} ms: ${PHASE_DETAIL[phase]} (phase ${phase})`;
}

/* ------------------------------------------------------ the packaged check */

/**
 * The second half of the packaged self check, beside `--self-check=terminal`.
 *
 * `docs/architecture.md` said "nothing exercises the packaged llama.cpp", and
 * `verify:package` only reads names out of the archive listing. This launches
 * the installed binary, forks the engine, and makes it load the library from
 * `app.asar.unpacked` through a `utilityProcess` — which is the resolution
 * question moving the engine out of process created — and then kills it in
 * native code to prove the application survives.
 *
 * `scripts/smoke-packaged.mjs` runs under plain node and cannot import this
 * module, so it holds its own copies of these strings.
 * `tests/llama-protocol.test.ts` asserts they match.
 */
export const LLAMA_CHECK_FLAG = '--self-check=llama';
export const LLAMA_CHECK_OK = 'self-check llama: ok';
export const LLAMA_CHECK_FAILED = 'self-check llama: failed';

/**
 * The failure that means the engine started and could not load the library.
 *
 * The negative control needs this and not merely a failure. Removing the wait
 * on `app.whenReady()` once made both the real run and the control die at the
 * fork with the same message, and the control's two assertions passed on it —
 * the "failed for the wrong reason" case `.claude/skills/write-a-check` ends
 * on. Naming the branch is what tells the two apart.
 */
export const LLAMA_NO_LIBRARY = 'did not load llama.cpp';

export type LlamaCheckResult =
  | { ok: true; device: string; loadMs: number; releasedBy: string; survived: string }
  | { ok: false; reason: string };

export function llamaCheckRequested(argv: readonly string[]): boolean {
  return argv.includes(LLAMA_CHECK_FLAG);
}

/**
 * How long the packaged check waits for the engine to load llama.cpp.
 *
 * macOS is measured: `getLlama()` costs 0.4 s warm and 9.3 s on a cold Metal
 * shader cache, so 60 s is ample.
 *
 * Windows gets longer because it takes a path macOS never does. It tests a
 * prebuilt binary before loading it, and that test forks `process.execPath`
 * and waits five minutes for an answer the packaged binary does not give. A
 * build that ships a GPU backend still takes that fork, which is why the
 * ceiling stays generous rather than coming down to the `loadMs` a default
 * build now reports. Issue #149.
 */
export function engineCheckTimeoutMs(platform: string): number {
  return platform === 'win32' ? 180_000 : 60_000;
}

/**
 * The one line the driver reads.
 *
 * A pass names the backend, what loading cost, and what released the request
 * queue. `released-by` is there because the queue is flushed by whichever of
 * `spawn` and `hello` arrives first, and those may differ by platform: without
 * it, one platform could pass through a path the other never takes and nothing
 * would say so. "ok" alone would also be printed by a check that forked
 * nothing.
 */
export function llamaCheckLine(result: LlamaCheckResult): string {
  if (!result.ok) return `${LLAMA_CHECK_FAILED}: ${result.reason}`;
  return (
    `${LLAMA_CHECK_OK} device=${result.device} loadMs=${String(result.loadMs)} ` +
    `released-by=${result.releasedBy} survived=${result.survived}`
  );
}
