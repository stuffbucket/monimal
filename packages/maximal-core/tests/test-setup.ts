/**
 * Global test preload (registered via bunfig.toml `[test] preload`).
 *
 * Normal tests run through the root-owned isolation wrapper, either natively
 * beneath its private temporary root or inside the disposable Docker container.
 * Each Bun worker gets fresh Maximal and Claude roots before product modules
 * load. Inherited product path overrides are ignored so ambient user state never
 * influences a test run.
 */

import { afterEach, beforeEach, mock } from "bun:test"
import consola from "consola"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const TEST_CONTAINER_ENV = "MAXIMAL_TEST_CONTAINER"
const TEST_HOST_ENV = "MAXIMAL_TEST_HOST"
const TEST_ROOT_ENV = "MAXIMAL_TEST_ROOT"
const isolatedPathVariables = [
  "HOME",
  "XDG_CACHE_HOME",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "XDG_STATE_HOME",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "COPILOT_API_HOME",
  "CLAUDE_CONFIG_DIR",
]

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return (
    relative.length > 0
    && !relative.startsWith(`..${path.sep}`)
    && relative !== ".."
    && !path.isAbsolute(relative)
  )
}

let testParent = os.tmpdir()
if (process.env[TEST_CONTAINER_ENV] !== "1") {
  const rootValue = process.env[TEST_ROOT_ENV]
  if (
    process.env[TEST_HOST_ENV] !== "1"
    || !rootValue
    || !path.isAbsolute(rootValue)
  ) {
    throw new Error(
      `Refusing to run Maximal tests outside an isolated test environment.`
        + ` Run \`pnpm test\` instead of invoking \`bun test\` directly.`,
    )
  }

  const root = fs.realpathSync(rootValue)
  for (const name of isolatedPathVariables) {
    const value = process.env[name]
    if (
      !value
      || !path.isAbsolute(value)
      || !isInside(root, fs.realpathSync(value))
    ) {
      throw new Error(
        `Refusing native tests: ${name} must be inside ${TEST_ROOT_ENV}.`,
      )
    }
  }
  testParent = root
}

const testRoot = fs.mkdtempSync(path.join(testParent, "maximal-tests-"))
const maximalHome = path.join(testRoot, "maximal")
const claudeConfigDir = path.join(testRoot, "claude")
fs.mkdirSync(maximalHome, { recursive: true })
fs.mkdirSync(claudeConfigDir, { recursive: true })
process.env.COPILOT_API_HOME = maximalHome
process.env.COPILOT_API_HOME_POLICY = "require"
process.env.CLAUDE_CONFIG_DIR = claudeConfigDir

// Reset the global consola level before every test. Some tests bump it to 5
// (verbose mode, e.g. start-run-server) and don't restore it, leaking debug
// logging into later tests — notably the RFC 8628 device-code poll loop in
// poll-access-token.ts, which logs every poll and floods output with hundreds
// of lines. Level 3 (Info) hides debug(4)/trace(5); errors/warns still show.
beforeEach(() => {
  consola.level = 3
})

// Defense-in-depth safety net: restore all `spyOn` spies after every test.
// Registered in the preload, so this is the OUTERMOST afterEach and runs LAST
// (after any file's own afterEach), catching a spy a file forgot to restore.
// A leaked spyOn permanently patches the real method for every later file in
// the Bun worker — a classic CI-order-dependent flake. This does NOT undo
// `mock.module` (that must still be restored per-file in afterAll; see
// ADR-0011); it only covers spyOn, which today every file self-manages — this
// keeps that true even if a future test forgets.
afterEach(() => {
  mock.restore()
})

// No test may terminate the runner. Product code calls `process.exit` in seven
// modules (the `/_internal/shutdown` handler, port acquisition, config load,
// shutdown); every one is reachable in-process from `app.request` or a CLI
// entry. A real call truncates the run *and exits 0*, which `bun test` reports
// as nothing at all — no summary, no failure — and which Stryker's command
// runner reads as "the suite passed, this mutant survived". Throwing instead
// keeps the run alive: the throw is attributed to the test in flight (or to the
// timer that scheduled it), that test fails, and the summary is still written.
// Product code that wants a testable exit takes it as an injected dependency,
// as `createInternalRoutes({ exit })` does.
process.exit = (code?: number): never => {
  throw new Error(
    `process.exit(${String(code)}) was called during a test run. Nothing may`
      + " kill the runner — inject the exit as a dependency instead.",
  )
}

// Opt-in diagnostic for the cross-file leak class (testing-strategy §5.1/§5.6).
// `MAXIMAL_TEST_TRACE=1` records module EVALUATION order and every
// `mock.module` install with its call site — the phase the normal log never
// covers, because Bun's reporter only prints tests, in execution order.
// `=all` widens the trace from the test tree to every first-party module.
//
// Off (the default) this is one `process.env` read: the tracer module is never
// imported, no `Bun.plugin` loader hook is installed, and no output changes.
if (process.env.MAXIMAL_TEST_TRACE) {
  const { installModuleTrace } = await import("./helpers/module-trace")
  installModuleTrace(process.env.MAXIMAL_TEST_TRACE)
}
