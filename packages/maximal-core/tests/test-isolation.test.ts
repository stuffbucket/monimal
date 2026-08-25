import { describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const CORE_ROOT = path.resolve(import.meta.dirname, "..")
const REPOSITORY_ROOT = path.resolve(CORE_ROOT, "../..")
const MAXIMAL_FIXTURE = path.join(
  import.meta.dirname,
  "fixtures/isolation/maximal-path-probe.test-fixture.ts",
)
const CLAUDE_FIXTURE = path.join(
  import.meta.dirname,
  "fixtures/isolation/claude-path-probe.test-fixture.ts",
)

interface Canary {
  home: string
  maximalPath: string
  claudePath: string
  maximalBytes: string
  claudeBytes: string
  maximalStat: fs.Stats
  claudeStat: fs.Stats
}

function createCanary(): Canary {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "maximal-host-canary-"))
  const maximalPath = path.join(home, ".local/share/maximal/accounts.json")
  const claudePath = path.join(home, ".claude/settings.json")
  const maximalBytes = "maximal-canary\n"
  const claudeBytes = "claude-canary\n"
  fs.mkdirSync(path.dirname(maximalPath), { recursive: true })
  fs.mkdirSync(path.dirname(claudePath), { recursive: true })
  fs.writeFileSync(maximalPath, maximalBytes)
  fs.writeFileSync(claudePath, claudeBytes)
  return {
    home,
    maximalPath,
    claudePath,
    maximalBytes,
    claudeBytes,
    maximalStat: fs.statSync(maximalPath),
    claudeStat: fs.statSync(claudePath),
  }
}

function childEnvironment(home: string): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: home,
    NODE_ENV: "test",
    XDG_CONFIG_HOME: path.join(home, ".config"),
    XDG_DATA_HOME: path.join(home, ".local/share"),
  }
  delete environment.MAXIMAL_TEST_CONTAINER
  delete environment.COPILOT_API_HOME
  delete environment.COPILOT_API_HOME_POLICY
  delete environment.CLAUDE_CONFIG_DIR
  return environment
}

function expectCanaryUnchanged(canary: Canary): void {
  expect(fs.readFileSync(canary.maximalPath, "utf8")).toBe(canary.maximalBytes)
  expect(fs.readFileSync(canary.claudePath, "utf8")).toBe(canary.claudeBytes)
  const maximalAfter = fs.statSync(canary.maximalPath)
  const claudeAfter = fs.statSync(canary.claudePath)
  expect(maximalAfter.ino).toBe(canary.maximalStat.ino)
  expect(maximalAfter.mtimeMs).toBe(canary.maximalStat.mtimeMs)
  expect(claudeAfter.ino).toBe(canary.claudeStat.ino)
  expect(claudeAfter.mtimeMs).toBe(canary.claudeStat.mtimeMs)
}

function runBun(cwd: string, arguments_: Array<string>, canary: Canary) {
  return Bun.spawnSync([process.execPath, ...arguments_], {
    cwd,
    env: childEnvironment(canary.home),
    stdout: "pipe",
    stderr: "pipe",
  })
}

function expectRefused(
  result: ReturnType<typeof runBun>,
  canary: Canary,
): void {
  expect(result.exitCode).not.toBe(0)
  const diagnostics = `${result.stdout.toString()}\n${result.stderr.toString()}`
  expect(diagnostics).toContain("Refusing to")
  expectCanaryUnchanged(canary)
}

describe("test path isolation", () => {
  test("the preload installs separate fresh path families", () => {
    const maximalHome = process.env.COPILOT_API_HOME
    const claudeConfigDir = process.env.CLAUDE_CONFIG_DIR
    expect(process.env.MAXIMAL_TEST_CONTAINER).toBe("1")
    expect(process.env.COPILOT_API_HOME_POLICY).toBe("require")
    expect(maximalHome).toBeTruthy()
    expect(claudeConfigDir).toBeTruthy()
    expect(maximalHome).not.toBe(claudeConfigDir)
    expect(maximalHome?.startsWith(os.tmpdir())).toBe(true)
    expect(claudeConfigDir?.startsWith(os.tmpdir())).toBe(true)
    expect(fs.statSync(maximalHome ?? "").isDirectory()).toBe(true)
    expect(fs.statSync(claudeConfigDir ?? "").isDirectory()).toBe(true)
  })

  test("package-CWD raw bun test is rejected by the Core preload", () => {
    const canary = createCanary()
    try {
      expectRefused(
        runBun(CORE_ROOT, ["test", MAXIMAL_FIXTURE], canary),
        canary,
      )
    } finally {
      fs.rmSync(canary.home, { recursive: true, force: true })
    }
  })

  test("historical root-CWD raw bun test is rejected by the root preload", () => {
    const canary = createCanary()
    try {
      expectRefused(
        runBun(REPOSITORY_ROOT, ["test", MAXIMAL_FIXTURE], canary),
        canary,
      )
    } finally {
      fs.rmSync(canary.home, { recursive: true, force: true })
    }
  })

  test("config bypass cannot resolve the default Maximal data home", () => {
    const canary = createCanary()
    try {
      expectRefused(
        runBun(
          CORE_ROOT,
          ["--config=/dev/null", "test", MAXIMAL_FIXTURE],
          canary,
        ),
        canary,
      )
    } finally {
      fs.rmSync(canary.home, { recursive: true, force: true })
    }
  })

  test("config bypass cannot resolve default Claude settings", () => {
    const canary = createCanary()
    try {
      expectRefused(
        runBun(
          CORE_ROOT,
          ["--config=/dev/null", "test", CLAUDE_FIXTURE],
          canary,
        ),
        canary,
      )
    } finally {
      fs.rmSync(canary.home, { recursive: true, force: true })
    }
  })
})
