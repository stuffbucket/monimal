import { writeSync } from 'node:fs';

import { app } from 'electron';

import { TerminalHost } from '../host/terminal-host.js';

import { defaultShell } from './native/pty.js';
import {
  selfCheckCommand,
  selfCheckLine,
  selfCheckPassed,
  selfCheckToken,
  type SelfCheckResult,
} from './native/self-check.js';

/**
 * Prove the installed application can open a shell, then exit.
 *
 * This runs before `whenReady` and opens no window, so it needs no window
 * server. It goes through `TerminalHost`, which is the class the terminal
 * itself uses, so what it exercises is the product's own path into `node-pty`:
 * the addon and `spawn-helper` resolved out of `app.asar.unpacked`, and
 * `posix_spawn` from inside the bundle. That is the defect #88 shipped. On
 * Windows the same path resolves `conpty.node` out of `app.asar.unpacked`.
 */

const SESSION = 'self-check';
const TIMEOUT_MS = 30_000;

/** The one line the driver reads. Returns the exit code that goes with it. */
function announce(result: SelfCheckResult): number {
  // `app.exit` does not drain an asynchronous pipe, and the driver reads this
  // line. A synchronous write to the descriptor cannot be lost.
  writeSync(1, `${selfCheckLine(result)}\n`);
  return result.ok ? 0 : 1;
}

export function runSelfCheck(argv: readonly string[]): void {
  // Answering a shell prompt is not being an application. Without this the
  // check bounces in a developer's dock and takes the Command-Tab slot.
  if (process.platform === 'darwin') app.dock?.hide();

  const token = selfCheckToken(argv);
  if (token === undefined) {
    app.exit(announce({ ok: false, reason: 'no token, or one outside [0-9a-f]{16}' }));
    return;
  }

  let settled = false;
  let output = '';

  function report(result: SelfCheckResult): void {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    // Nothing kills the shell first. `pty.kill` races node-pty's exit callback
    // against the teardown of the Node environment, the addon throws a
    // Napi::Error into an environment that is gone, and the process aborts
    // with signal 6 after a passing line. Exiting closes the pty master, which
    // is what sends the shell its SIGHUP.
    app.exit(announce(result));
  }

  const host = new TerminalHost({
    homeDirectory: app.getPath('home'),
    defaultShell: defaultShell(),
    env: { TERM_PROGRAM: 'Stuffbucket' },
    emit: (_id, chunk) => {
      output += chunk;
      if (selfCheckPassed(output, token)) report({ ok: true, token });
    },
    onExit: (_id, exitCode) => {
      report({ ok: false, reason: `the shell exited with ${String(exitCode)}` });
    },
  });

  const timer = setTimeout(() => {
    report({ ok: false, reason: `no answer in ${String(TIMEOUT_MS)} ms` });
  }, TIMEOUT_MS);

  try {
    // Wide enough that the answer cannot wrap.
    host.spawn({ id: SESSION, cols: 200, rows: 24 });
    host.write(SESSION, selfCheckCommand(token, process.platform));
  } catch (error) {
    report({ ok: false, reason: `the shell did not start: ${String(error)}` });
  }
}
