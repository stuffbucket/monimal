#!/usr/bin/env node
/**
 * Launch the packaged application and make it open a shell.
 *
 * `verify-package.mjs` reads the archive listing. That catches a file that is
 * absent and not one that is present and unusable, which is how #88 shipped:
 * `spawn-helper` was in the package, inside `app.asar` where `posix_spawn`
 * could not reach it, and every check was green. Nothing had ever started the
 * artifact a user installs. Issue #89.
 *
 * Playwright cannot drive a packaged build, because `EnableNodeCliInspectArguments`
 * is fused off and must stay off. So the application answers for itself: it is
 * launched with `--self-check=terminal`, it spawns a shell through the same
 * `TerminalHost` the terminal uses, and it prints the result. See
 * `src/main/native/self-check.ts`.
 *
 * **It is launched from outside this repository.** `out/` is inside it, so a
 * package started in place resolves modules one directory up into the
 * repository's own `node_modules`. `scripts/packaged-app.mjs` copies it out
 * first and this check asserts nothing is left above it. Issue #149.
 *
 * macOS and Windows. The vehicle on Windows is the packaged directory rather
 * than an installed tree, because this repository ships no installer.
 */

import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, renameSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { scopedChecks } from './check-scope.mjs';
import {
  ancestors,
  countFiles,
  nodeModulesAbove,
  packagedApp,
  relocate,
} from './packaged-app.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Kept in step with `src/main/native/self-check.ts` by `tests/self-check.test.ts`. */
const FLAG = '--self-check=terminal';
const TOKEN_FLAG = '--self-check-token=';
const FAILED = 'self-check terminal: failed';

/**
 * The second check. Kept in step with `src/main/native/llama-protocol.ts` by
 * `tests/llama-protocol.test.ts`.
 */
const LLAMA_FLAG = '--self-check=llama';
const LLAMA_OK = 'self-check llama: ok';
const LLAMA_FAILED = 'self-check llama: failed';
const LLAMA_NO_LIBRARY = 'did not load llama.cpp';

const LAUNCH_TIMEOUT_MS = 90_000;

/**
 * The llama launches get their own, longer limit.
 *
 * The application times itself out and prints a line naming the phase it was
 * waiting in — `engineCheckTimeoutMs` in `src/main/native/llama-protocol.ts`,
 * which is 180 s on Windows. A driver that killed it at 90 s would replace
 * that diagnosis with `killed after 90000 ms`, which says nothing. This has to
 * stay above whatever the application allows itself. Issue #133.
 */
const LLAMA_LAUNCH_TIMEOUT_MS = 240_000;

const { check, summary } = scopedChecks();

/**
 * What the packaged application cannot open a shell without, per platform.
 *
 * On macOS that is `spawn-helper`, the file #88 left inside `app.asar`.
 *
 * On Windows it is `conpty.node`. `node-pty` `require`s it from
 * `prebuilds/win32-<arch>`, and Electron redirects that read into
 * `app.asar.unpacked`. `conpty.dll` and `OpenConsole.exe` sit beside it and are
 * not on this path: `useConptyDll` is off, so `conpty.cc` takes
 * `CreatePseudoConsole` out of `kernel32` and never opens the DLL. Each of the
 * three was moved aside on a Windows runner to establish that rather than
 * assume it; the pull request for #89 carries the runs.
 */
function fragility() {
  if (process.platform === 'darwin') {
    return {
      fragile: 'spawn-helper',
      heading: 'Reproducing #88: moving spawn-helper aside',
      // What `llama-protocol.ts` calls the fault `process.crash()` raises in
      // the engine. Observed on this platform: Electron reports a POSIX signal
      // death as the bare signal number, and 11 is SIGSEGV.
      faultName: 'SIGSEGV',
    };
  }
  if (process.platform === 'win32') {
    return {
      fragile: 'conpty.node',
      heading: 'The same defect as #88, one platform over: moving conpty.node aside',
      // `process.crash()` writes through a null pointer, which is
      // STATUS_ACCESS_VIOLATION here. `process.abort()` was used until #156
      // and never faulted on Windows at all: Node defines it as `_exit(134)`.
      faultName: 'access violation',
    };
  }
  return undefined;
}

const built = packagedApp();
const platform = fragility();
if (!built || !platform) {
  console.error(`This check runs on macOS and Windows, and the host is ${process.platform}.`);
  process.exit(1);
}

const { fragile: FRAGILE, heading: HEADING } = platform;

if (!existsSync(built.binary)) {
  console.error(`No packaged application at ${path.relative(ROOT, built.binary)}. Run \`npm run package\`.`);
  process.exit(1);
}

/* ------------------------------------------- out of the repository first */

/**
 * The premise, asserted rather than assumed.
 *
 * If nothing sits above `out/` there is nothing to relocate away from, and the
 * copy below is ceremony. A zero here fails, which is the honest outcome if
 * this ever stops being true.
 */
console.log('Copying the package out of the repository\n');

const above = nodeModulesAbove(built.directory);
check(
  above.length > 0,
  'out/ is inside this repository, so a package launched in place resolves up into it',
  { count: above.length, of: 'node_modules directories above out/' },
);
console.log(`       nearest: ${path.relative(ROOT, above[0] ?? '(none)')}`);

const packaged = relocate(built);
const copied = countFiles(packaged.directory);

check(copied === countFiles(built.directory), 'the copy holds every file the package does', {
  count: copied,
  of: 'files copied',
});

const stillAbove = nodeModulesAbove(packaged.directory);
check(stillAbove.length === 0, 'and nothing above the copy can be resolved from inside it', {
  count: ancestors(packaged.directory).length,
  of: 'directories walked above the copy',
});

console.log(`       ${packaged.directory}\n`);

const BINARY = packaged.binary;
const NATIVE = path.join(
  packaged.resources,
  `app.asar.unpacked/node_modules/node-pty/prebuilds/${process.platform}-${process.arch}`,
  FRAGILE,
);
/** Where the negative control parks the file. Restored before the run ends. */
const ASIDE = `${NATIVE}.aside`;

/** Run the packaged binary once, with a fresh token. */
function launch(args, timeoutMs = LAUNCH_TIMEOUT_MS) {
  const token = randomBytes(8).toString('hex');
  return new Promise((resolve) => {
    const argv = args ?? [FLAG, `${TOKEN_FLAG}${token}`];
    const child = spawn(BINARY, argv, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ token, stdout, stderr: `${stderr}${String(error)}`, code: null, signal: null, timedOut, timeoutMs });
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ token, stdout, stderr, code, signal, timedOut, timeoutMs });
    });
  });
}

function describe(run) {
  // The limit comes off the run, not off the constant. The llama launches use
  // a longer one, and a message naming the wrong number is how a reader
  // mis-calibrates the next timeout.
  const status = run.timedOut
    ? `killed after ${String(run.timeoutMs)} ms`
    : `exit ${String(run.code)}${run.signal ? ` signal ${run.signal}` : ''}`;
  return `${status}\n${[run.stdout, run.stderr].join('').trimEnd()}`;
}

/* ------------------------------------------------- the application works */

console.log(`Launching ${path.basename(BINARY)} from the copy\n`);

const working = await launch();
console.log(`${describe(working)}\n`);

check(working.code === 0, 'the packaged application exits 0', { count: 1, of: 'launches' });
// The token is random per run and reaches the driver only by way of a shell
// that ran a command joining its two halves. A build that spawns nothing cannot
// produce it, and neither can a stale log.
check(
  working.stdout.includes(working.token),
  'a shell inside the package echoed this run\'s token back',
  { count: 1, of: 'tokens' },
);

/* ------------------------------------------------- and it can still fail */

// The floor. Four checks in this repository passed while covering nothing, so
// this one reproduces the defect on every run: with the native file gone, the
// same launch must fail, and it must fail by reporting a shell that would not
// start rather than by dying for an unrelated reason.
console.log(`${HEADING}\n`);

if (!existsSync(NATIVE)) {
  console.error(`No ${FRAGILE} at ${path.relative(packaged.root, NATIVE)}.`);
  packaged.cleanup();
  process.exit(1);
}
const nativeSize = statSync(NATIVE).size;

let broken;
try {
  renameSync(NATIVE, ASIDE);
  broken = await launch();
} finally {
  renameSync(ASIDE, NATIVE);
}

console.log(`${describe(broken)}\n`);

check(broken.code !== 0, `the packaged application fails without ${FRAGILE}`, {
  count: 1,
  of: 'launches without it',
});
check(
  broken.stdout.includes(FAILED),
  'it fails by reporting the shell, not by dying before the check',
  { count: 1, of: 'launches without it' },
);
check(!broken.stdout.includes(broken.token), 'no token comes back when no shell can start', {
  count: 1,
  of: 'tokens',
});
check(
  existsSync(NATIVE) && statSync(NATIVE).size === nativeSize && !existsSync(ASIDE),
  `${FRAGILE} is back where it was`,
  { count: 1, of: 'files moved aside' },
);

/* ------------------------------ and the engine runs, and can be survived */

/**
 * The llama.cpp half. Issue #133.
 *
 * `verify:package` reads names out of the archive listing, and until this ran,
 * `docs/architecture.md` said in as many words that nothing exercised the
 * packaged llama.cpp. A name in a listing is not a library that loads: #88 is
 * the same shape, and it shipped.
 *
 * The application forks its engine as a `utilityProcess`, makes it load
 * `node-llama-cpp` out of `app.asar.unpacked`, then makes it fault in native
 * code. A pass means both halves: the library resolved from the child, and the
 * main process outlived the fault well enough to print a line about it.
 */
console.log('\nLoading llama.cpp in the engine process, then killing it\n');

const engine = await launch([LLAMA_FLAG], LLAMA_LAUNCH_TIMEOUT_MS);
console.log(`${describe(engine)}\n`);

check(engine.code === 0, 'the packaged application survives a native fault in the engine', {
  count: 1,
  of: 'engine runs',
});
check(
  engine.stdout.includes(LLAMA_OK),
  'the engine loaded llama.cpp and the main process reported its death',
  { count: 1, of: 'engine runs' },
);
// The supervisor must have recognised the death as a fault rather than as an
// ordinary exit. This is the assertion that holds on every platform: an exit
// code `llama-protocol.ts` cannot name reads as "exited with code N", and the
// number is then in the log above to be pinned.
check(
  engine.stdout.includes(LLAMA_OK) && !engine.stdout.includes('exited with code'),
  'it names a native fault rather than a bare exit code',
  { count: 1, of: 'engine runs' },
);
check(engine.stdout.includes(platform.faultName), `it reports the fault as ${platform.faultName}`, {
  count: 1,
  of: 'named faults',
});

/**
 * The floor for that one. With the prebuild scope gone, the engine cannot load
 * llama.cpp, and the check must say so rather than pass — and the application
 * must still exit rather than hang, because a crash the supervisor never hears
 * about is the failure this whole change exists to remove.
 *
 * It only means anything from the copy. Launched in place, the scope one
 * directory above the package answers instead, so this control took the same
 * branch as the run it is the control for. Issue #149.
 */
console.log('Reproducing #113: moving the @node-llama-cpp scope aside\n');

const SCOPE = path.join(packaged.resources, 'app.asar.unpacked/node_modules/@node-llama-cpp');

if (!existsSync(SCOPE)) {
  console.error(`No llama.cpp prebuild scope at ${path.relative(packaged.root, SCOPE)}.`);
  packaged.cleanup();
  process.exit(1);
}
const scopeEntries = readdirSync(SCOPE).length;
const SCOPE_ASIDE = `${SCOPE}.aside`;

let noEngine;
try {
  renameSync(SCOPE, SCOPE_ASIDE);
  noEngine = await launch([LLAMA_FLAG], LLAMA_LAUNCH_TIMEOUT_MS);
} finally {
  renameSync(SCOPE_ASIDE, SCOPE);
}

console.log(`${describe(noEngine)}\n`);

check(noEngine.code !== 0, 'the llama check fails with no prebuild scope', {
  count: 1,
  of: 'engine runs without it',
});
check(
  noEngine.stdout.includes(LLAMA_FAILED),
  'it fails by reporting the engine, not by dying before the check',
  { count: 1, of: 'engine runs without it' },
);
// Not merely "it failed". Removing the wait on `app.whenReady()` once made both
// this run and the real one die at the fork with the same message, and the two
// assertions above passed on it. This is the branch reached only after the
// engine started, so it tells a library that will not load apart from an engine
// that never ran.
check(
  noEngine.stdout.includes(LLAMA_NO_LIBRARY),
  'it fails because the library would not load, not because nothing started',
  { count: 1, of: 'engine runs without it' },
);
check(!noEngine.stdout.includes(LLAMA_OK), 'no pass line comes back when nothing loaded', {
  count: 1,
  of: 'engine runs without it',
});
check(
  existsSync(SCOPE) && readdirSync(SCOPE).length === scopeEntries && !existsSync(SCOPE_ASIDE),
  'the prebuild scope is back where it was',
  { count: scopeEntries, of: 'prebuild packages' },
);

/* --------------------------------------------------------------- result */

packaged.cleanup();

const code = summary('smoke:packaged');
if (code === 0) {
  console.log(
    '\nThe packaged application opened a shell, and cannot pass without one.\n' +
      'It loaded llama.cpp out of process, and outlived it faulting.',
  );
}
process.exit(code);
