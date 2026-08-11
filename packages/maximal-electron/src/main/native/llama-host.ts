import path from 'node:path';

import { app, utilityProcess, type UtilityProcess } from 'electron';

import {
  describeEngineExit,
  exhaustedMessage,
  mayRestart,
  parseEngineEvent,
  type EngineEvent,
  type EnginePhase,
  type EngineRequest,
} from './llama-protocol.js';

/**
 * Supervise the llama.cpp engine process.
 *
 * The engine is an Electron `utilityProcess`: a Node child with a message port
 * and a lifetime this process controls. Everything that touches
 * `node-llama-cpp` lives there and nowhere else, so a native abort ends one
 * child instead of the application. Issue #133.
 *
 * `utilityProcess` rather than `child_process` for two reasons that matter
 * here. It is a Chromium child, so it appears in the task manager, dies with
 * the application, and cannot be orphaned by a main process that crashes. And
 * its port is a `MessagePortMain`, which posts structured clones without a
 * JSON round trip, so a token is a message rather than a line of a protocol
 * this repository would then own.
 */

/**
 * The engine, and whether its port is usable yet.
 *
 * **A request posted before the child is listening is lost on Windows.** macOS
 * delivers it, which is why the first Windows run of the packaged self check
 * was the thing that found it: the child said `hello`, and then waited for a
 * `probe` that had already been thrown away. With the prebuild scope moved
 * aside the same run timed out identically, where a child that had received
 * the request would have failed in milliseconds — that asymmetry is what
 * identified the direction. Issue #133.
 *
 * **Readiness is the child's `hello`, not the `spawn` event.** `spawn` says the
 * process exists, which is not the same as its port being able to receive, and
 * holding the queue on `spawn` alone turned an occasional loss into a
 * deterministic hang on Windows. `hello` is the child's own first act after it
 * registers its message handler, so it is proof rather than a hint. Either
 * signal releases the queue, whichever arrives first.
 */
interface Engine {
  process: UtilityProcess;
  /** The queue has been flushed. Requests go straight out from here on. */
  ready: boolean;
  /** Requests made before that, in order. */
  queue: EngineRequest[];
  sawSpawn: boolean;
  sawHello: boolean;
  /** Which signal released the queue, for the failure message. */
  releasedBy: string;
}

let child: Engine | undefined;
let crashes: number[] = [];
let lastFailure = '';

/**
 * Which signal released the last engine's queue.
 *
 * Module level, not on the record, because the record is gone by the time a
 * failure is reported: the engine's death is what settles the operation, and
 * `onExit` clears `child` first. Reading it off the record printed
 * `released-by=nothing` over a run that had plainly delivered its request.
 */
let releasedBy = 'nothing';

/**
 * How far the engine got. Read by the packaged self check, so a wait that ends
 * in a timeout says which of the three ways it can hang happened.
 */
let phase: EnginePhase = 'not started';

export function enginePhase(): EnginePhase {
  return phase;
}

type Listener = (event: EngineEvent) => void;

/** One entry per outstanding operation, keyed by the id the caller chose. */
const listeners = new Map<string, Listener>();

/**
 * Where the engine bundle is.
 *
 * Beside the main bundle, in `.vite/build`, packaged and unpackaged alike.
 * Deriving it from `__dirname` rather than from `app.getAppPath()` keeps the
 * two files together whatever the archive is called.
 */
function enginePath(): string {
  return path.join(__dirname, 'llama-worker.js');
}

/**
 * Release the queue, once, and record which signal did it.
 *
 * `engineStartup` reports it. That is the difference between a platform that
 * never emits `spawn` and a queue held for some other reason, and it goes in
 * the failure message rather than in a log line, so a working start stays
 * silent.
 */
function release(engine: Engine, why: string): void {
  if (engine.ready) return;
  engine.ready = true;
  engine.releasedBy = why;
  releasedBy = why;
  const waiting = engine.queue;
  engine.queue = [];
  for (const request of waiting) engine.process.postMessage(request);
}

/** Deliver to the operation that asked, once the lifecycle events are read. */
function fanOut(engine: Engine, event: EngineEvent): void {
  if (event.kind === 'hello') {
    if (phase === 'not started' || phase === 'forked') phase = 'running';
    engine.sawHello = true;
    release(engine, 'hello');
    return;
  }
  if (event.kind === 'ack') {
    if (phase === 'running') phase = 'acknowledged';
    return;
  }
  if (event.kind === 'loaded') phase = 'loaded';
  listeners.get(event.id)?.(event);
}

function failAll(reason: string): void {
  for (const [id, listener] of [...listeners]) {
    listeners.delete(id);
    listener({ kind: 'failed', id, reason });
  }
}

function onExit(code: number): void {
  child = undefined;
  phase = 'not started';

  const reason = describeEngineExit(code, process.platform);
  if (code !== 0) {
    crashes.push(Date.now());
    lastFailure = reason;
    console.error(`llama engine: ${reason}`);
  }

  failAll(reason);
}

/**
 * Start the engine, or return the one already running.
 *
 * Throws rather than returning undefined when the budget is spent, so a caller
 * cannot carry on with no engine and a silent absence of tokens.
 */
function engine(): Engine {
  if (child) return child;

  if (!mayRestart(crashes, Date.now())) {
    throw new Error(exhaustedMessage(lastFailure));
  }

  const forked = utilityProcess.fork(enginePath(), [], {
    // Named, so a user looking at Activity Monitor or the Electron task
    // manager sees which child is holding a gigabyte of weights.
    serviceName: 'llama',
    stdio: 'pipe',
  });

  // The record exists before any handler is registered, and every handler
  // closes over it rather than over the module-level `child`. An earlier
  // version assigned `child` last, so a `spawn` that arrived before the
  // assignment read a stale value, took the guard's early exit, and left the
  // queue held forever. That is a hang, and it is invisible on a platform
  // where the event happens to arrive later. Issue #133.
  releasedBy = 'nothing';
  const record: Engine = {
    process: forked,
    ready: false,
    queue: [],
    sawSpawn: false,
    sawHello: false,
    releasedBy: 'nothing',
  };

  // node-llama-cpp writes the backend it chose, and every load failure, to
  // stderr. Dropping it would trade a crash for a silence.
  forked.stderr?.on('data', (chunk: Buffer) => {
    process.stderr.write(`[llama] ${chunk.toString()}`);
  });
  forked.stdout?.on('data', (chunk: Buffer) => {
    process.stdout.write(`[llama] ${chunk.toString()}`);
  });

  forked.on('message', (message: unknown) => {
    const event = parseEngineEvent(message);
    if (event) fanOut(record, event);
  });
  forked.on('spawn', () => {
    if (phase === 'not started') phase = 'forked';
    record.sawSpawn = true;
    release(record, 'spawn');
  });
  forked.on('exit', onExit);

  child = record;
  return record;
}

/**
 * Subscribe to one operation. Returns the unsubscribe.
 *
 * The caller picks the id and puts the same one on the request, which is what
 * lets a download and a turn be in flight at once without a second port.
 */
export function listen(id: string, listener: Listener): () => void {
  listeners.set(id, listener);
  return () => listeners.delete(id);
}

/**
 * Send one request. Starts the engine if it is not running.
 *
 * Held until the child is listening. Posting before then is silently dropped
 * on Windows, and a dropped request is a hang rather than an error: the caller
 * waits for an answer to something the engine never read.
 */
export function send(request: EngineRequest): void {
  const target = engine();
  if (!target.ready) {
    target.queue.push(request);
    return;
  }
  target.process.postMessage(request);
}

/**
 * What the supervisor saw of the engine's start, for a failure message.
 *
 * `spawn` and `hello` are separate facts. A platform that never emits the
 * first is a different problem from a child that never reaches the second, and
 * the phase alone cannot say which, because `hello` moves it past `forked`.
 */
export function engineReleasedBy(): string {
  return releasedBy;
}

export function engineStartup(): string {
  const running = child;
  if (!running) return 'no engine';
  return `spawn=${running.sawSpawn ? 'yes' : 'no'} hello=${
    running.sawHello ? 'yes' : 'no'
  } released-by=${running.releasedBy} queued=${String(running.queue.length)}`;
}

/** Stop the engine. It is started again by the next request. */
export function stopEngine(): void {
  const running = child;
  if (!running) return;
  child = undefined;
  phase = 'not started';
  listeners.clear();
  running.process.kill();
}

/** For tests and for the packaged self check: forget the crash history. */
export function resetEngineBudget(): void {
  crashes = [];
  lastFailure = '';
}

// Nothing outlives the application. `utilityProcess` children die with the
// main process, and this only makes the weights go earlier.
app.on('will-quit', stopEngine);
