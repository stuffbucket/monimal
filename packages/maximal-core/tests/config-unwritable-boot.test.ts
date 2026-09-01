/**
 * Boot must survive a `config.json` it cannot rewrite.
 *
 * `readConfigFromDisk` wraps its read in a `try` and falls back to defaults with
 * a logged error — but `ensureConfigFile()` was called OUTSIDE that `try`. When
 * the file exists and is readable but not writable, `ensureConfigFile`'s
 * access check fails, it takes the "create it" branch, and the `writeFileSync`
 * throws `EACCES` straight past every guard in the read path. `run-server.ts`
 * calls this through `mergeConfigWithDefaults()` before the port is bound, so
 * the proxy dies at boot printing a raw errno — and the user's config, which
 * was perfectly readable, is never even opened.
 *
 * A read-only config is a state users create deliberately (it holds
 * `anthropicApiKey`) and one they inherit accidentally (a file left owned by
 * root after a single `sudo` run). Either way `ensureConfigFile` is a
 * best-effort convenience: if it cannot seed a file, the read below is still
 * entitled to try.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import fs from "node:fs"

import {
  __resetConfigCacheForTests,
  ConfigReloadError,
  getConfig,
  mergeConfigWithDefaults,
  reloadConfigFromDisk,
  writeConfig,
} from "~/lib/config/config"
import { PATHS } from "~/lib/platform/paths"

const CONFIG_PATH = PATHS.CONFIG_PATH

/** Restore write permission (if the file is still there) and delete it, so the
 *  shared per-worker COPILOT_API_HOME is left exactly as a fresh boot would
 *  find it. Runs on the way IN and the way OUT — a module-level `cachedConfig`
 *  only reset on one side leaks in the other direction (testing-strategy §5.6).
 *  Seed a clean file, then leave the cache cold for the next reader. */
function resetConfigFile(): void {
  try {
    fs.chmodSync(CONFIG_PATH, 0o600)
  } catch {
    /* not there, or the platform has no mode bits */
  }
  fs.rmSync(CONFIG_PATH, { force: true })
  mergeConfigWithDefaults()
  __resetConfigCacheForTests()
}

beforeEach(resetConfigFile)
afterEach(resetConfigFile)

/** True when the platform actually made the file unwritable. Windows has no
 *  POSIX mode bits; `chmodSync` maps only the read-only attribute, so this is a
 *  precondition to check rather than assume.
 *
 *  It is a precondition, NOT an escape hatch. On POSIX a 0o400 file is
 *  unwritable, and a false there means the fixture silently stopped existing —
 *  both cases below would fall through to asserting that a file is a file and
 *  report green while checking nothing. The way to get that is running as root,
 *  which bypasses DAC: exactly what a container run as root does, and why
 *  `docs/dev/container-toolchain.md` runs as the host uid instead. Fail loudly
 *  rather than quietly stop testing. */
function makeUnwritable(file: string): boolean {
  fs.chmodSync(file, 0o400)
  let writable = true
  try {
    fs.accessSync(file, fs.constants.W_OK)
  } catch {
    writable = false
  }
  if (!writable) return true
  if (process.platform !== "win32") {
    throw new Error(
      `${file} is still writable at mode 0o400, so this test cannot construct `
        + `its fixture. Almost certainly the suite is running as root, which `
        + `bypasses DAC — run as an unprivileged user. See `
        + `docs/dev/container-toolchain.md.`,
    )
  }
  return false
}

describe("config boot", () => {
  test("keeps existing config bytes while applying defaults in memory", () => {
    const originalBytes = [
      "{",
      '  "smallModel" : "user-selected",',
      '  "extraPrompts" : { "gpt-5-mini" : "user prompt" },',
      '  "modelReasoningEfforts" : { "gpt-5.3-codex" : "low" }',
      "}",
      "",
    ].join("\r\n")
    fs.writeFileSync(CONFIG_PATH, originalBytes, "utf8")

    const config = mergeConfigWithDefaults()

    expect(fs.readFileSync(CONFIG_PATH, "utf8")).toBe(originalBytes)
    expect(config.smallModel).toBe("user-selected")
    expect(config.extraPrompts?.["gpt-5-mini"]).toBe("user prompt")
    expect(config.extraPrompts?.["gpt-5.3-codex"]).toBeDefined()
    expect(config.modelReasoningEfforts?.["gpt-5.3-codex"]).toBe("low")
    expect(config.modelReasoningEfforts?.["gpt-5-mini"]).toBe("low")
    expect(getConfig()).toBe(config)
  })

  test("applies the same defaults on reload without changing replacement bytes", () => {
    const originalBytes = [
      "{",
      '  "smallModel" : "boot-model",',
      '  "extraPrompts" : { "gpt-5-mini" : "boot prompt" }',
      "}",
      "",
    ].join("\r\n")
    fs.writeFileSync(CONFIG_PATH, originalBytes, "utf8")
    mergeConfigWithDefaults()

    const replacementBytes = [
      "{",
      '  "smallModel" : "reload-model",',
      '  "extraPrompts" : { "gpt-5-mini" : "reload prompt" },',
      '  "forwardCompatible" : { "preserved" : true }',
      "}",
      "",
    ].join("\r\n")
    fs.writeFileSync(CONFIG_PATH, replacementBytes, "utf8")

    const reloaded = reloadConfigFromDisk()

    expect(fs.readFileSync(CONFIG_PATH, "utf8")).toBe(replacementBytes)
    expect(reloaded.smallModel).toBe("reload-model")
    expect(reloaded.extraPrompts?.["gpt-5-mini"]).toBe("reload prompt")
    expect(reloaded.extraPrompts?.["gpt-5.3-codex"]).toBeDefined()
    expect(reloaded.modelReasoningEfforts?.["gpt-5-mini"]).toBe("low")
    expect(getConfig()).toBe(reloaded)
  })

  test("retains the last known good merged config after a failed reload", () => {
    fs.writeFileSync(
      CONFIG_PATH,
      '{"smallModel":"last-known-good","extraPrompts":{}}\n',
      "utf8",
    )
    const stable = mergeConfigWithDefaults()
    const invalidBytes = '{ "useMessagesApi" : "not-a-boolean" }\r\n'
    fs.writeFileSync(CONFIG_PATH, invalidBytes, "utf8")

    let reloadError: unknown
    try {
      reloadConfigFromDisk()
    } catch (error) {
      reloadError = error
    }

    expect(reloadError).toBeInstanceOf(ConfigReloadError)
    if (!(reloadError instanceof ConfigReloadError)) {
      throw new Error("Expected ConfigReloadError")
    }
    expect(reloadError.reason).toBe("validation")
    expect(fs.readFileSync(CONFIG_PATH, "utf8")).toBe(invalidBytes)
    expect(getConfig()).toBe(stable)
    expect(getConfig().smallModel).toBe("last-known-good")
    expect(getConfig().extraPrompts?.["gpt-5.3-codex"]).toBeDefined()
  })

  test("merges defaults on a cold cache without rewriting config bytes", () => {
    const originalBytes = '{ "smallModel" : "cold-cache" }\r\n'
    fs.writeFileSync(CONFIG_PATH, originalBytes, "utf8")
    __resetConfigCacheForTests()

    const config = getConfig()

    expect(config.smallModel).toBe("cold-cache")
    expect(config.extraPrompts?.["gpt-5.3-codex"]).toBeDefined()
    expect(fs.readFileSync(CONFIG_PATH, "utf8")).toBe(originalBytes)
  })

  test("writes only the requested shape while adopting merged defaults", () => {
    const requested = { smallModel: "written" }
    const expectedBytes = `${JSON.stringify(requested, null, 2)}\n`
    const config = writeConfig(requested)

    expect(fs.readFileSync(CONFIG_PATH, "utf8")).toBe(expectedBytes)
    expect(config.smallModel).toBe("written")
    expect(config.extraPrompts?.["gpt-5.3-codex"]).toBeDefined()
    expect(getConfig()).toBe(config)
  })

  test("reads the user's settings instead of dying with a raw errno", () => {
    fs.mkdirSync(PATHS.APP_DIR, { recursive: true })
    fs.writeFileSync(
      CONFIG_PATH,
      `${JSON.stringify({ smallModel: "gpt-5-mini-readonly" }, null, 2)}\n`,
      "utf8",
    )
    if (!makeUnwritable(CONFIG_PATH)) {
      // Fixture not constructible here; assert what is still observable.
      expect(fs.statSync(CONFIG_PATH).isFile()).toBe(true)
      return
    }

    const config = mergeConfigWithDefaults()

    expect(config.smallModel).toBe("gpt-5-mini-readonly")
  })
})
