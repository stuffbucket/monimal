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
import { existsSync, renameSync, statSync } from 'node:fs';
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

const LAUNCH_TIMEOUT_MS = 90_000;

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
    };
  }
  if (process.platform === 'win32') {
    return {
      fragile: 'conpty.node',
      heading: 'The same defect as #88, one platform over: moving conpty.node aside',
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

/* --------------------------------------------------------------- result */

packaged.cleanup();

const code = summary('smoke:packaged');
if (code === 0) {
  console.log('\nThe packaged application opened a shell, and cannot pass without one.');
}
process.exit(code);
