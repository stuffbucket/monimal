import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  CRASH_LIMIT,
  CRASH_WINDOW_MS,
  ENGINE_LIFECYCLE,
  LLAMA_CHECK_FAILED,
  LLAMA_CHECK_FLAG,
  LLAMA_CHECK_OK,
  LLAMA_NO_LIBRARY,
  describeEngineExit,
  describeEngineWait,
  engineCheckTimeoutMs,
  exhaustedMessage,
  faultName,
  llamaCheckLine,
  llamaCheckRequested,
  mayRestart,
  parseEngineEvent,
  recentCrashes,
} from '../src/main/native/llama-protocol.js';

/**
 * The engine boundary, from the main process side.
 *
 * The engine is expected to die badly. Everything here is about what the
 * supervisor does with a number it is handed after that has happened, so the
 * cases are the numbers a real fault produces rather than a happy path.
 */

describe('faultName', () => {
  it('names the POSIX signals a native abort produces', () => {
    expect(faultName(6, 'darwin')).toBe('SIGABRT');
    expect(faultName(11, 'darwin')).toBe('SIGSEGV');
    expect(faultName(8, 'darwin')).toBe('SIGFPE');
    expect(faultName(4, 'darwin')).toBe('SIGILL');
    expect(faultName(5, 'darwin')).toBe('SIGTRAP');
    expect(faultName(9, 'darwin')).toBe('SIGKILL');
  });

  it('knows SIGBUS is a different number on each platform', () => {
    // Reproduced against a real llama.cpp mapping fault, which is signal 10 on
    // macOS and 7 on Linux. One constant would name the wrong fault on one of
    // them, which is worse than saying nothing.
    expect(faultName(10, 'darwin')).toBe('SIGBUS');
    expect(faultName(7, 'linux')).toBe('SIGBUS');
    expect(faultName(7, 'darwin')).toBeUndefined();
    expect(faultName(10, 'linux')).toBeUndefined();
  });

  it('has no SIGBUS number for a platform it does not know', () => {
    expect(faultName(10, 'freebsd')).toBeUndefined();
    expect(faultName(7, 'freebsd')).toBeUndefined();
    expect(faultName(6, 'freebsd')).toBe('SIGABRT');
  });

  it('reads a Windows status code instead of a signal', () => {
    expect(faultName(0xc0000005, 'win32')).toBe('access violation');
    expect(faultName(0xc0000374, 'win32')).toBe('heap corruption');
    expect(faultName(0xc0000409, 'win32')).toBe('stack buffer overrun');
    expect(faultName(0xc000001d, 'win32')).toBe('illegal instruction');
  });

  it('names the one Windows code that is not a status code', () => {
    // `node::ExitCode::kAbort`. Node defines `ABORT_NO_BACKTRACE()` as
    // `_exit(134)` on Windows, so `process.abort()` exits cleanly there and
    // Electron reported 134 on `windows-latest`. Issue #156.
    expect(faultName(134, 'win32')).toBe('SIGABRT');
    expect(faultName(134, 'darwin')).toBeUndefined();
  });

  it('names an unlisted Windows status code by its number', () => {
    expect(faultName(0xc0000006, 'win32')).toBe('native fault 0xc0000006');
    expect(faultName(0xc0000000, 'win32')).toBe('native fault 0xc0000000');
  });

  it('does not read a Windows signal number as a fault', () => {
    // On Windows 6 and 11 are ordinary exit codes, not signals.
    expect(faultName(6, 'win32')).toBeUndefined();
    expect(faultName(11, 'win32')).toBeUndefined();
    expect(faultName(0xbfffffff, 'win32')).toBeUndefined();
  });

  it('treats an ordinary exit code as no fault', () => {
    expect(faultName(0, 'darwin')).toBeUndefined();
    expect(faultName(1, 'darwin')).toBeUndefined();
    expect(faultName(2, 'darwin')).toBeUndefined();
    expect(faultName(3, 'darwin')).toBeUndefined();
    expect(faultName(12, 'darwin')).toBeUndefined();
  });
});

describe('describeEngineExit', () => {
  it('says nothing alarming about a clean stop', () => {
    expect(describeEngineExit(0, 'darwin')).toBe('The model engine stopped.');
  });

  it('names the fault, and says the application is unaffected', () => {
    const message = describeEngineExit(6, 'darwin');
    expect(message).toContain('SIGABRT');
    expect(message).toContain('Nothing else was affected');
    // The two things a user can act on, both named, and the one instruction.
    expect(message).toContain('corrupt');
    expect(message).toContain('memory');
    expect(message).toContain('Delete the downloaded weights and try again.');
  });

  it('reports a code it cannot name as a code', () => {
    const message = describeEngineExit(1, 'darwin');
    expect(message).toContain('exited with code 1');
    expect(message).toContain('Nothing else was affected');
    expect(message).not.toContain('native code');
  });

  it('keeps the fault message and the plain one apart', () => {
    expect(describeEngineExit(11, 'darwin')).not.toBe(describeEngineExit(1, 'darwin'));
    expect(describeEngineExit(11, 'darwin')).toContain('native code');
  });
});

describe('parseEngineEvent', () => {
  it('reads a message off the port', () => {
    expect(parseEngineEvent({ kind: 'delta', id: 'a', text: 'hi' })).toEqual({
      kind: 'delta',
      id: 'a',
      text: 'hi',
    });
  });

  it('drops anything that is not a message', () => {
    // The port is the seam to a process that is expected to die badly. A
    // half-written message on the way down must not become an exception.
    expect(parseEngineEvent(undefined)).toBeUndefined();
    expect(parseEngineEvent(null)).toBeUndefined();
    expect(parseEngineEvent('delta')).toBeUndefined();
    expect(parseEngineEvent(42)).toBeUndefined();
    expect(parseEngineEvent([])).toBeUndefined();
    expect(parseEngineEvent({})).toBeUndefined();
    expect(parseEngineEvent({ kind: 7, id: 'a' })).toBeUndefined();
    expect(parseEngineEvent({ kind: 'delta' })).toBeUndefined();
    expect(parseEngineEvent({ kind: 'delta', id: 7 })).toBeUndefined();
  });

  it('accepts an array only through the object test, never as one', () => {
    expect(parseEngineEvent(['kind', 'id'])).toBeUndefined();
  });
});

describe('the restart budget', () => {
  const now = 1_000_000;

  it('forgets a crash older than the window', () => {
    expect(recentCrashes([now - CRASH_WINDOW_MS - 1], now)).toEqual([]);
    expect(recentCrashes([now - CRASH_WINDOW_MS], now)).toEqual([]);
    expect(recentCrashes([now - CRASH_WINDOW_MS + 1], now)).toEqual([
      now - CRASH_WINDOW_MS + 1,
    ]);
    expect(recentCrashes([now], now)).toEqual([now]);
  });

  it('keeps every crash inside the window, in order', () => {
    const times = [now - 3, now - 2, now - 1];
    expect(recentCrashes(times, now)).toEqual(times);
  });

  it('is empty for a process that has never crashed', () => {
    expect(recentCrashes([], now)).toEqual([]);
  });

  it('allows a restart until the budget is spent', () => {
    expect(mayRestart([], now)).toBe(true);
    expect(mayRestart([now, now], now)).toBe(true);
    expect(mayRestart(Array.from({ length: CRASH_LIMIT }, () => now), now)).toBe(false);
    expect(mayRestart(Array.from({ length: CRASH_LIMIT + 1 }, () => now), now)).toBe(false);
  });

  it('lets an old crash stop counting', () => {
    const stale = Array.from({ length: CRASH_LIMIT }, () => now - CRASH_WINDOW_MS - 1);
    expect(mayRestart(stale, now)).toBe(true);
  });

  it('says why it stopped, and that a restart fixes it', () => {
    const message = exhaustedMessage('The model engine crashed.');
    expect(message).toContain('The model engine crashed.');
    expect(message).toContain(String(CRASH_LIMIT));
    expect(message).toContain('restarts');
  });
});

describe('describeEngineWait', () => {
  /**
   * The first Windows run of the packaged self check ended in `no answer in
   * 60000 ms`, which is consistent with a child that never forked, one whose
   * port never carried the request, and one that is merely slow. Every phase
   * has to read differently or the message is worth nothing.
   */
  const phases = ['not started', 'forked', 'running', 'acknowledged', 'loaded'] as const;

  it('says something different for every phase', () => {
    const said = phases.map((phase) => describeEngineWait(phase, 60_000));
    expect(new Set(said).size).toBe(phases.length);
  });

  it('names the phase and the wait in each', () => {
    for (const phase of phases) {
      const message = describeEngineWait(phase, 60_000);
      expect(message, phase).toContain('60000 ms');
      expect(message, phase).toContain(`phase ${phase}`);
    }
  });

  it('separates a child that never started from one that never answered', () => {
    expect(describeEngineWait('not started', 1)).toContain('never forked');
    expect(describeEngineWait('forked', 1)).toContain('entry never ran');
    expect(describeEngineWait('loaded', 1)).toContain('had loaded llama.cpp');
  });

  it('tells a request that never arrived from one that arrived and hung', () => {
    // The distinction two wrong diagnoses turned on. `running` means the child
    // never read the request; `acknowledged` means it did and stopped later.
    expect(describeEngineWait('running', 1)).toContain('never read the request off its port');
    expect(describeEngineWait('running', 1)).toContain('never reached it');
    expect(describeEngineWait('acknowledged', 1)).toContain('read the request');
    expect(describeEngineWait('acknowledged', 1)).toContain('loading llama.cpp');
  });

  it('reports the milliseconds it was given', () => {
    expect(describeEngineWait('forked', 5)).toContain('5 ms');
    expect(describeEngineWait('forked', 5)).not.toContain('60000');
  });
});

describe('the lifecycle id', () => {
  it('is not a value any operation would choose', () => {
    // Operations key on a `randomUUID`, so this cannot collide with one.
    expect(ENGINE_LIFECYCLE).toBe('engine');
  });
});

describe('engineCheckTimeoutMs', () => {
  it('gives Windows longer, because nothing has measured it there', () => {
    expect(engineCheckTimeoutMs('win32')).toBe(180_000);
  });

  it('leaves the measured platforms at the value that fits them', () => {
    // getLlama() is 0.4 s warm and 9.3 s on a cold Metal shader cache.
    expect(engineCheckTimeoutMs('darwin')).toBe(60_000);
    expect(engineCheckTimeoutMs('linux')).toBe(60_000);
  });

  it('is longer on Windows than anywhere else', () => {
    expect(engineCheckTimeoutMs('win32')).toBeGreaterThan(engineCheckTimeoutMs('darwin'));
  });
});

describe('the packaged llama check', () => {
  /**
   * Pinned to their literal value. They are the interface between a shipped
   * binary and a driver that runs under plain node and cannot import this
   * module. Every other test here reads them through the constant, so nothing
   * else notices what they say.
   */
  it('uses the argument strings the driver passes', () => {
    expect(LLAMA_CHECK_FLAG).toBe('--self-check=llama');
    expect(LLAMA_CHECK_OK).toBe('self-check llama: ok');
    expect(LLAMA_CHECK_FAILED).toBe('self-check llama: failed');
    expect(LLAMA_NO_LIBRARY).toBe('did not load llama.cpp');
  });

  it('answers only to the flag', () => {
    expect(llamaCheckRequested(['/Stuffbucket', LLAMA_CHECK_FLAG])).toBe(true);
    expect(llamaCheckRequested(['/Stuffbucket'])).toBe(false);
    expect(llamaCheckRequested(['--self-check=terminal'])).toBe(false);
    expect(llamaCheckRequested([])).toBe(false);
  });

  it('names the backend, the cost, what released the queue, and the crash', () => {
    // "ok" alone would also be printed by a check that forked nothing, and the
    // cost is the only measurement anyone has of a platform they cannot run.
    expect(
      llamaCheckLine({
        ok: true,
        device: 'metal',
        loadMs: 418,
        releasedBy: 'spawn',
        survived: 'SIGABRT',
      }),
    ).toBe(`${LLAMA_CHECK_OK} device=metal loadMs=418 released-by=spawn survived=SIGABRT`);
  });

  it('says why it failed', () => {
    expect(llamaCheckLine({ ok: false, reason: 'no engine' })).toBe(
      `${LLAMA_CHECK_FAILED}: no engine`,
    );
  });

  it('keeps the two lines apart', () => {
    const pass = llamaCheckLine({
      ok: true,
      device: 'cpu',
      loadMs: 1,
      releasedBy: 'hello',
      survived: 'x',
    });
    expect(pass.startsWith(LLAMA_CHECK_FAILED)).toBe(false);
    expect(llamaCheckLine({ ok: false, reason: 'x' }).startsWith(LLAMA_CHECK_OK)).toBe(false);
  });
});

/**
 * The driver runs under plain node and cannot import this module, so it holds
 * its own copy of these strings. Drift would launch the application with an
 * argument it ignores, and the check would pass on a build that forked nothing.
 */
describe('the driver and the application agree', () => {
  const driver = readFileSync(new URL('../scripts/smoke-packaged.mjs', import.meta.url), 'utf8');

  it('finds the driver, so an empty read cannot pass', () => {
    expect(driver.length).toBeGreaterThan(0);
  });

  for (const value of [
    LLAMA_CHECK_FLAG,
    LLAMA_CHECK_OK,
    LLAMA_CHECK_FAILED,
    LLAMA_NO_LIBRARY,
  ]) {
    it(`scripts/smoke-packaged.mjs names ${value}`, () => {
      expect(driver).toContain(value);
    });
  }
});
