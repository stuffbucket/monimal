import { randomUUID } from 'node:crypto';
import { writeSync } from 'node:fs';

import { app } from 'electron';

import {
  enginePhase,
  engineReleasedBy,
  engineStartup,
  listen,
  send,
} from './native/llama-host.js';
import {
  LLAMA_NO_LIBRARY,
  describeEngineWait,
  engineCheckTimeoutMs,
  llamaCheckLine,
  type LlamaCheckResult,
} from './native/llama-protocol.js';

/**
 * Prove the installed application runs llama.cpp out of process, and survives
 * it dying.
 *
 * Two things no other check covers. `verify:package` reads names out of the
 * archive listing, which catches a file that is absent and not one that is
 * present and unreachable — the defect #88 shipped for `spawn-helper`. And
 * nothing at all had ever loaded the packaged llama.cpp, which
 * `docs/architecture.md` said in as many words.
 *
 * So this forks the engine, makes it load the library out of
 * `app.asar.unpacked` from a `utilityProcess`, then makes it abort in native
 * code. A pass means the library resolved and the main process outlived the
 * abort. Issue #133.
 */

const TIMEOUT_MS = engineCheckTimeoutMs(process.platform);

function announce(result: LlamaCheckResult): number {
  // `app.exit` does not drain an asynchronous pipe, and the driver reads this
  // line. A synchronous write to the descriptor cannot be lost.
  writeSync(1, `${llamaCheckLine(result)}\n`);
  return result.ok ? 0 : 1;
}

export function runLlamaCheck(): void {
  // Answering a shell prompt is not being an application.
  if (process.platform === 'darwin') app.dock?.hide();

  let settled = false;
  let device: string | undefined;
  let loadMs = 0;
  const started = Date.now();

  function report(result: LlamaCheckResult): void {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    app.exit(announce(result));
  }

  const timer = setTimeout(() => {
    report({
      ok: false,
      reason: `${describeEngineWait(enginePhase(), Date.now() - started)} [${engineStartup()}]`,
    });
  }, TIMEOUT_MS);

  const id = randomUUID();

  listen(id, (event) => {
    if (event.kind === 'loaded') {
      device = event.device;
      loadMs = event.ms;
      return;
    }
    if (event.kind === 'failed') {
      // Reached twice: once if the library will not load, and once when the
      // engine is killed on purpose below. Which one it is depends on whether
      // a device was reported first.
      if (device === undefined) {
        report({ ok: false, reason: `the engine ${LLAMA_NO_LIBRARY}: ${event.reason}` });
        return;
      }
      report({ ok: true, device, loadMs, releasedBy: engineReleasedBy(), survived: event.reason });
      return;
    }
    if (event.kind === 'done') {
      // The library loaded. Now kill the engine in native code and require the
      // failure to come back as a sentence rather than as this process dying.
      send({ kind: 'crash-on-purpose' });
    }
  });

  // `utilityProcess.fork` throws before the app is ready. Nothing here takes
  // the single instance lock, so waiting costs only the ready event.
  void app.whenReady().then(() => {
    try {
      send({ kind: 'probe', id });
    } catch (error) {
      report({ ok: false, reason: `the engine would not start: ${String(error)}` });
    }
  });
}
