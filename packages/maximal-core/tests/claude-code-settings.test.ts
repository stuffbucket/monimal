import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import {
  applyProxyBaseUrl,
  checkApiKeyHealth,
  getApiKeyHelperOwnership,
  getApiKeyOwnership,
  getBaseUrlOwnership,
  getClaudeCodeSettingsPath,
  isProxyBaseUrlConfigured,
  mergeBaseUrl,
  PROXY_BASE_URL,
  readClaudeCodeSettings,
  revertProxyBaseUrl,
  stripBaseUrl,
  writeClaudeCodeSettings,
} from "~/apps/claude-code/config"

import { expectOwnerOnlyFile } from "./helpers/file-modes"

const TEST_KEY = "mxl_test-key-value"
const resolveTestKey = () => TEST_KEY
// A legacy top-level `apiKeyHelper` string an older maximal wrote, used only to
// exercise the migration/cleanup path — current code never writes this field.
const TEST_HELPER =
  '"/Applications/Maximal.app/Contents/MacOS/maximal" api claude-code'

let dir: string
let settingsPath: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "maximal-claude-code-"))
  settingsPath = path.join(dir, "settings.json")
})

afterEach(() => {
  try {
    fs.rmSync(dir, { recursive: true, force: true })
  } catch {
    /* best effort */
  }
})

function writeRaw(value: string): void {
  fs.writeFileSync(settingsPath, value)
}

function read(): Record<string, unknown> {
  return readClaudeCodeSettings(settingsPath)
}

function envOf(settings: Record<string, unknown>): Record<string, unknown> {
  return settings.env as Record<string, unknown>
}

describe("getClaudeCodeSettingsPath", () => {
  const savedConfigDir = process.env.CLAUDE_CONFIG_DIR

  afterEach(() => {
    if (savedConfigDir === undefined) {
      delete process.env.CLAUDE_CONFIG_DIR
    } else {
      process.env.CLAUDE_CONFIG_DIR = savedConfigDir
    }
  })

  it("defaults to ~/.claude/settings.json", () => {
    delete process.env.CLAUDE_CONFIG_DIR
    expect(getClaudeCodeSettingsPath()).toBe(
      path.join(os.homedir(), ".claude", "settings.json"),
    )
  })

  it("honors CLAUDE_CONFIG_DIR override", () => {
    process.env.CLAUDE_CONFIG_DIR = "/custom/claude/dir"
    expect(getClaudeCodeSettingsPath()).toBe(
      path.join("/custom/claude/dir", "settings.json"),
    )
  })
})

describe("readClaudeCodeSettings", () => {
  it("returns {} when the file is absent", () => {
    expect(read()).toEqual({})
  })

  it("returns {} for empty / malformed / non-object JSON", () => {
    writeRaw("")
    expect(read()).toEqual({})
    writeRaw("{ not valid json")
    expect(read()).toEqual({})
    writeRaw("[]")
    expect(read()).toEqual({})
  })

  it("parses a valid settings object", () => {
    writeRaw(JSON.stringify({ theme: "dark", env: { FOO: "1" } }))
    expect(read()).toEqual({ theme: "dark", env: { FOO: "1" } })
  })
})

describe("getBaseUrlOwnership", () => {
  it("absent when no env / no key", () => {
    expect(getBaseUrlOwnership({})).toBe("absent")
    expect(getBaseUrlOwnership({ env: {} })).toBe("absent")
    expect(getBaseUrlOwnership({ env: { FOO: "1" } })).toBe("absent")
    // non-object env is treated as absent
    expect(getBaseUrlOwnership({ env: "nope" })).toBe("absent")
  })

  it("ours when it equals the proxy URL", () => {
    expect(
      getBaseUrlOwnership({ env: { ANTHROPIC_BASE_URL: PROXY_BASE_URL } }),
    ).toBe("ours")
  })

  it("foreign when it is some other value", () => {
    expect(
      getBaseUrlOwnership({
        env: { ANTHROPIC_BASE_URL: "https://other.example" },
      }),
    ).toBe("foreign")
  })
})

describe("getApiKeyOwnership", () => {
  it("absent when no ANTHROPIC_API_KEY is configured", () => {
    expect(getApiKeyOwnership({})).toBe("absent")
    expect(getApiKeyOwnership({ env: {} })).toBe("absent")
  })

  it("ours when the value carries the mxl_ signature", () => {
    expect(getApiKeyOwnership({ env: { ANTHROPIC_API_KEY: TEST_KEY } })).toBe(
      "ours",
    )
  })

  it("foreign when it is a real (non-maximal) key", () => {
    expect(
      getApiKeyOwnership({ env: { ANTHROPIC_API_KEY: "sk-secret" } }),
    ).toBe("foreign")
  })
})

describe("getApiKeyHelperOwnership (legacy field, migration/cleanup only)", () => {
  it("absent when no apiKeyHelper is configured", () => {
    expect(getApiKeyHelperOwnership({})).toBe("absent")
  })

  it("ours when it equals maximal's helper command", () => {
    expect(getApiKeyHelperOwnership({ apiKeyHelper: TEST_HELPER })).toBe("ours")
  })

  it("foreign when it is some other value", () => {
    expect(getApiKeyHelperOwnership({ apiKeyHelper: "other-helper" })).toBe(
      "foreign",
    )
  })
})

describe("mergeBaseUrl / stripBaseUrl (pure)", () => {
  it("merge sets env.ANTHROPIC_BASE_URL and env.ANTHROPIC_API_KEY, preserves existing settings", () => {
    const merged = mergeBaseUrl(
      {
        theme: "dark",
        env: { FOO: "1" },
      },
      TEST_KEY,
    )
    expect(merged.theme).toBe("dark")
    expect(merged.apiKeyHelper).toBeUndefined()
    expect(envOf(merged)).toEqual({
      FOO: "1",
      ANTHROPIC_API_KEY: TEST_KEY,
      ANTHROPIC_BASE_URL: PROXY_BASE_URL,
    })
  })

  it("merge creates env when absent", () => {
    const merged = mergeBaseUrl({ theme: "dark" }, TEST_KEY)
    expect(merged.theme).toBe("dark")
    expect(envOf(merged)).toEqual({
      ANTHROPIC_BASE_URL: PROXY_BASE_URL,
      ANTHROPIC_API_KEY: TEST_KEY,
    })
  })

  it("merge does not mutate the input", () => {
    const input = { env: { FOO: "1" } }
    mergeBaseUrl(input, TEST_KEY)
    expect(input).toEqual({ env: { FOO: "1" } })
  })

  it("merge drops a legacy top-level apiKeyHelper field", () => {
    const merged = mergeBaseUrl(
      { theme: "dark", apiKeyHelper: TEST_HELPER, env: { FOO: "1" } },
      TEST_KEY,
    )
    expect("apiKeyHelper" in merged).toBe(false)
    expect(envOf(merged)).toEqual({
      FOO: "1",
      ANTHROPIC_API_KEY: TEST_KEY,
      ANTHROPIC_BASE_URL: PROXY_BASE_URL,
    })
  })

  it("strip removes only our env keys, preserves sibling env + top-level", () => {
    const stripped = stripBaseUrl({
      theme: "dark",
      env: {
        ANTHROPIC_BASE_URL: PROXY_BASE_URL,
        ANTHROPIC_API_KEY: TEST_KEY,
        FOO: "1",
      },
    })
    expect(stripped).toEqual({
      theme: "dark",
      env: { FOO: "1" },
    })
  })

  it("strip preserves a foreign base URL and a foreign apiKeyHelper (no snapshot)", () => {
    const stripped = stripBaseUrl({
      apiKeyHelper: "other-helper",
      env: { ANTHROPIC_BASE_URL: "https://other.example" },
    })
    expect(stripped).toEqual({
      apiKeyHelper: "other-helper",
      env: { ANTHROPIC_BASE_URL: "https://other.example" },
    })
  })

  it("strip drops the env key when it becomes empty", () => {
    const stripped = stripBaseUrl({
      theme: "dark",
      env: { ANTHROPIC_BASE_URL: PROXY_BASE_URL, ANTHROPIC_API_KEY: TEST_KEY },
    })
    expect(stripped).toEqual({ theme: "dark" })
    expect("env" in stripped).toBe(false)
  })
})

describe("writeClaudeCodeSettings", () => {
  it("creates parent directory if missing", () => {
    const nested = path.join(dir, "a", "b", "settings.json")
    writeClaudeCodeSettings(nested, { foo: "bar" })
    expect(JSON.parse(fs.readFileSync(nested, "utf8"))).toEqual({ foo: "bar" })
  })

  it("writes JSON with trailing newline and no .tmp leak", () => {
    writeClaudeCodeSettings(settingsPath, { foo: 1 })
    const raw = fs.readFileSync(settingsPath, "utf8")
    expect(raw.endsWith("\n")).toBe(true)
    expect(JSON.parse(raw)).toEqual({ foo: 1 })
    expect(fs.existsSync(`${settingsPath}.tmp`)).toBe(false)
  })

  it("writes an owner-only file (mode 0600 on POSIX)", () => {
    writeClaudeCodeSettings(settingsPath, { foo: 1 })
    expectOwnerOnlyFile(settingsPath)
  })
})

describe("applyProxyBaseUrl (end-to-end)", () => {
  it("writes env.ANTHROPIC_BASE_URL and env.ANTHROPIC_API_KEY into a fresh file", () => {
    const result = applyProxyBaseUrl(settingsPath, resolveTestKey)
    expect(result.wrote).toBe(true)
    expect(result.skippedReason).toBeUndefined()
    expect(envOf(read()).ANTHROPIC_BASE_URL).toBe(PROXY_BASE_URL)
    expect(envOf(read()).ANTHROPIC_API_KEY).toBe(TEST_KEY)
    expect(read().apiKeyHelper).toBeUndefined()
  })

  it("preserves a pre-existing top-level setting and sibling env vars", () => {
    writeRaw(
      JSON.stringify({
        theme: "dark",
        permissions: { allow: ["Bash"] },
        env: { FOO: "1" },
      }),
    )
    const result = applyProxyBaseUrl(settingsPath, resolveTestKey)
    expect(result.wrote).toBe(true)
    const after = read()
    expect(after.theme).toBe("dark")
    expect(after.permissions).toEqual({ allow: ["Bash"] })
    expect(envOf(after)).toEqual({
      FOO: "1",
      ANTHROPIC_API_KEY: TEST_KEY,
      ANTHROPIC_BASE_URL: PROXY_BASE_URL,
    })
  })

  it("ownership guard: does NOT overwrite a foreign base URL", () => {
    const original = {
      env: { ANTHROPIC_BASE_URL: "https://other.example", FOO: "1" },
    }
    writeRaw(JSON.stringify(original))
    const before = fs.statSync(settingsPath).mtimeMs
    const result = applyProxyBaseUrl(settingsPath, resolveTestKey)
    expect(result.wrote).toBe(false)
    expect(result.skippedReason).toBe("foreign-base-url")
    // file unchanged
    expect(read()).toEqual(original)
    expect(fs.statSync(settingsPath).mtimeMs).toBe(before)
  })

  it("swaps in our key over a real (foreign) API key", () => {
    // A real user Anthropic key here would just break routing (Claude Code
    // would send it to maximal's proxy, which needs OUR key to authenticate),
    // so apply takes over the field rather than refusing.
    const original = { env: { ANTHROPIC_API_KEY: "sk-secret" } }
    writeRaw(JSON.stringify(original))
    const result = applyProxyBaseUrl(settingsPath, resolveTestKey)
    expect(result.wrote).toBe(true)
    expect(envOf(read())).toEqual({
      ANTHROPIC_BASE_URL: PROXY_BASE_URL,
      ANTHROPIC_API_KEY: TEST_KEY,
    })
    // The real key is snapshotted so disable restores it.
    expect(
      (read()._maximalPrior as { ANTHROPIC_API_KEY?: string })
        .ANTHROPIC_API_KEY,
    ).toBe("sk-secret")
  })

  it("idempotent: applying twice is a no-op the second time", () => {
    const first = applyProxyBaseUrl(settingsPath, resolveTestKey)
    expect(first.wrote).toBe(true)
    const before = fs.statSync(settingsPath).mtimeMs
    const second = applyProxyBaseUrl(settingsPath, resolveTestKey)
    expect(second.wrote).toBe(false)
    expect(second.skippedReason).toBe("already-ours")
    expect(fs.statSync(settingsPath).mtimeMs).toBe(before)
    // no duplication
    expect(envOf(read())).toEqual({
      ANTHROPIC_BASE_URL: PROXY_BASE_URL,
      ANTHROPIC_API_KEY: TEST_KEY,
    })
  })

  it("re-applies (writes) when the resolved key has rotated", () => {
    applyProxyBaseUrl(settingsPath, resolveTestKey)
    const rotated = "mxl_rotated-key"
    const result = applyProxyBaseUrl(settingsPath, () => rotated)
    expect(result.wrote).toBe(true)
    expect(envOf(read()).ANTHROPIC_API_KEY).toBe(rotated)
  })

  it("handles an absent file (writes fresh)", () => {
    expect(fs.existsSync(settingsPath)).toBe(false)
    const result = applyProxyBaseUrl(settingsPath, resolveTestKey)
    expect(result.wrote).toBe(true)
    expect(read()).toEqual({
      env: { ANTHROPIC_BASE_URL: PROXY_BASE_URL, ANTHROPIC_API_KEY: TEST_KEY },
      // Snapshot of the prior state: both fields were absent → UNSET, so a later
      // disable removes them (returns the file to nothing).
      _maximalPrior: {
        ANTHROPIC_BASE_URL: "__UNSET__",
        ANTHROPIC_API_KEY: "__UNSET__",
      },
    })
  })

  it("handles an unparseable file (writes fresh)", () => {
    writeRaw("{ garbage")
    const result = applyProxyBaseUrl(settingsPath, resolveTestKey)
    expect(result.wrote).toBe(true)
    expect(read()).toEqual({
      env: { ANTHROPIC_BASE_URL: PROXY_BASE_URL, ANTHROPIC_API_KEY: TEST_KEY },
      _maximalPrior: {
        ANTHROPIC_BASE_URL: "__UNSET__",
        ANTHROPIC_API_KEY: "__UNSET__",
      },
    })
  })

  it("ownership guard: does NOT overwrite a foreign apiKeyHelper", () => {
    const original = { apiKeyHelper: "other-helper" }
    writeRaw(JSON.stringify(original))
    const result = applyProxyBaseUrl(settingsPath, resolveTestKey)
    expect(result.wrote).toBe(false)
    expect(result.skippedReason).toBe("foreign-api-key-helper")
    expect(read()).toEqual(original)
  })

  it("no resolvable key leaves existing settings bytes and mtime unchanged", () => {
    const original = '{"theme":"dark","env":{"FOO":"1"}}\n'
    writeRaw(original)
    const before = fs.statSync(settingsPath).mtimeMs
    const result = applyProxyBaseUrl(settingsPath, () => null)
    expect(result).toEqual({
      path: settingsPath,
      wrote: false,
      skippedReason: "invalid-api-key",
    })
    expect(fs.readFileSync(settingsPath, "utf8")).toBe(original)
    expect(fs.statSync(settingsPath).mtimeMs).toBe(before)
    expect("_maximalPrior" in read()).toBe(false)
  })

  it("migrates a legacy owned apiKeyHelper: writes the static key and drops the field", () => {
    const legacyHelper =
      '"/opt/homebrew/bin/bun" "/workspace/tests/leak.test.ts" api claude-code'
    writeRaw(
      JSON.stringify({
        theme: "dark",
        apiKeyHelper: legacyHelper,
        env: { FOO: "1", ANTHROPIC_BASE_URL: PROXY_BASE_URL },
      }),
    )
    const result = applyProxyBaseUrl(settingsPath, resolveTestKey)
    expect(result.wrote).toBe(true)
    const after = read()
    expect(after.apiKeyHelper).toBeUndefined()
    expect(after.theme).toBe("dark")
    expect(envOf(after)).toEqual({
      FOO: "1",
      ANTHROPIC_BASE_URL: PROXY_BASE_URL,
      ANTHROPIC_API_KEY: TEST_KEY,
    })
  })
})

describe("revertProxyBaseUrl", () => {
  it("removes only our key, preserves a foreign sibling ANTHROPIC_API_KEY", () => {
    writeRaw(
      JSON.stringify({
        theme: "dark",
        apiKeyHelper: TEST_HELPER,
        env: {
          ANTHROPIC_BASE_URL: PROXY_BASE_URL,
          ANTHROPIC_API_KEY: "sk-secret",
        },
      }),
    )
    const result = revertProxyBaseUrl(settingsPath)
    expect(result.wrote).toBe(true)
    expect(result.remainingKeys.sort()).toEqual(["env", "theme"])
    expect(read()).toEqual({
      theme: "dark",
      env: { ANTHROPIC_API_KEY: "sk-secret" },
    })
  })

  it("removes our own env.ANTHROPIC_API_KEY (mxl_-prefixed)", () => {
    writeRaw(
      JSON.stringify({
        theme: "dark",
        env: {
          ANTHROPIC_BASE_URL: PROXY_BASE_URL,
          ANTHROPIC_API_KEY: TEST_KEY,
          FOO: "1",
        },
      }),
    )
    const result = revertProxyBaseUrl(settingsPath)
    expect(result.wrote).toBe(true)
    expect(read()).toEqual({ theme: "dark", env: { FOO: "1" } })
  })

  it("drops the empty env key but keeps other settings", () => {
    writeRaw(
      JSON.stringify({
        theme: "dark",
        apiKeyHelper: TEST_HELPER,
        env: { ANTHROPIC_BASE_URL: PROXY_BASE_URL },
      }),
    )
    const result = revertProxyBaseUrl(settingsPath)
    expect(result.wrote).toBe(true)
    expect(result.remainingKeys).toEqual(["theme"])
    expect(read()).toEqual({ theme: "dark" })
  })

  it("deletes the file when it becomes empty", () => {
    writeRaw(
      JSON.stringify({
        apiKeyHelper: TEST_HELPER,
        env: { ANTHROPIC_BASE_URL: PROXY_BASE_URL },
      }),
    )
    const result = revertProxyBaseUrl(settingsPath)
    expect(result.wrote).toBe(true)
    expect(result.remainingKeys).toEqual([])
    expect(fs.existsSync(settingsPath)).toBe(false)
  })

  it("leaves a foreign base URL intact", () => {
    const original = {
      env: { ANTHROPIC_BASE_URL: "https://other.example" },
    }
    writeRaw(JSON.stringify(original))
    const result = revertProxyBaseUrl(settingsPath)
    expect(result.wrote).toBe(false)
    expect(read()).toEqual(original)
  })

  it("removes our apiKeyHelper even when the base URL is absent", () => {
    writeRaw(JSON.stringify({ apiKeyHelper: TEST_HELPER }))
    const result = revertProxyBaseUrl(settingsPath)
    expect(result.wrote).toBe(true)
    expect(result.remainingKeys).toEqual([])
    expect(fs.existsSync(settingsPath)).toBe(false)
  })

  it("no-op on an absent file", () => {
    const result = revertProxyBaseUrl(settingsPath)
    expect(result.wrote).toBe(false)
    expect(result.remainingKeys).toEqual([])
  })

  it("no-op when our key isn't present", () => {
    writeRaw(JSON.stringify({ theme: "dark", env: { FOO: "1" } }))
    const result = revertProxyBaseUrl(settingsPath)
    expect(result.wrote).toBe(false)
    expect(result.remainingKeys.sort()).toEqual(["env", "theme"])
    expect(read()).toEqual({ theme: "dark", env: { FOO: "1" } })
  })
})

describe("apply→revert snapshot round-trip (restores prior state)", () => {
  it("absent → enable → disable returns the file to nothing", () => {
    applyProxyBaseUrl(settingsPath, resolveTestKey)
    revertProxyBaseUrl(settingsPath)
    // Nothing was there before, so disable removes everything (file gone).
    expect(fs.existsSync(settingsPath)).toBe(false)
  })

  it("restores a user's OWN ANTHROPIC_BASE_URL that equals the proxy URL", () => {
    // The coincidence trap: the user had set the proxy URL themselves. Ownership
    // reads "ours", but a blind delete would drop THEIR value. The snapshot makes
    // disable restore it exactly.
    writeRaw(JSON.stringify({ env: { ANTHROPIC_BASE_URL: PROXY_BASE_URL } }))
    applyProxyBaseUrl(settingsPath, resolveTestKey)
    revertProxyBaseUrl(settingsPath)
    expect(read()).toEqual({ env: { ANTHROPIC_BASE_URL: PROXY_BASE_URL } })
  })

  it("permanently migrates away a legacy apiKeyHelper matching our signature", () => {
    // Unlike ANTHROPIC_BASE_URL, the top-level apiKeyHelper field is a retired
    // mechanism: even one that matches maximal's own signature is not restored
    // on revert — it is cleaned up for good as part of the move to a static key.
    const userHelper = '"/old/maximal" --apiKeyHelper claude-code'
    writeRaw(JSON.stringify({ apiKeyHelper: userHelper }))
    applyProxyBaseUrl(settingsPath, resolveTestKey)
    revertProxyBaseUrl(settingsPath)
    expect(fs.existsSync(settingsPath)).toBe(false)
  })

  it("preserves unrelated settings + sibling env across the round-trip", () => {
    const before = {
      theme: "dark",
      permissions: { allow: ["Bash"] },
      env: { FOO: "1" },
    }
    writeRaw(JSON.stringify(before))
    applyProxyBaseUrl(settingsPath, resolveTestKey)
    revertProxyBaseUrl(settingsPath)
    expect(read()).toEqual(before)
  })

  it("round-trips a real ANTHROPIC_API_KEY: apply swaps it, revert restores it", () => {
    const before = {
      theme: "dark",
      env: { FOO: "1", ANTHROPIC_API_KEY: "sk-secret" },
    }
    writeRaw(JSON.stringify(before))
    const applied = applyProxyBaseUrl(settingsPath, resolveTestKey)
    expect(applied.wrote).toBe(true)
    expect(envOf(read())).toEqual({
      FOO: "1",
      ANTHROPIC_BASE_URL: PROXY_BASE_URL,
      ANTHROPIC_API_KEY: TEST_KEY,
    })
    revertProxyBaseUrl(settingsPath)
    expect(read()).toEqual(before)
  })

  it("re-apply (self-heal) does not poison the snapshot", () => {
    // The execPath self-heal re-runs applyProxyBaseUrl. It must NOT capture our
    // own values as the prior state, or disable would restore the proxy URL.
    applyProxyBaseUrl(settingsPath, resolveTestKey)
    applyProxyBaseUrl(settingsPath, resolveTestKey) // self-heal / re-apply
    revertProxyBaseUrl(settingsPath)
    expect(fs.existsSync(settingsPath)).toBe(false)
  })
})

describe("isProxyBaseUrlConfigured", () => {
  it("true only when both ANTHROPIC_BASE_URL and ANTHROPIC_API_KEY are ours", () => {
    expect(isProxyBaseUrlConfigured(settingsPath)).toBe(false)
    writeRaw(JSON.stringify({ env: { ANTHROPIC_BASE_URL: "https://other" } }))
    expect(isProxyBaseUrlConfigured(settingsPath)).toBe(false)
    applyProxyBaseUrl(settingsPath, resolveTestKey)
    // foreign URL present, so apply backed off — still not ours
    expect(isProxyBaseUrlConfigured(settingsPath)).toBe(false)
    // now make it ours
    writeRaw(
      JSON.stringify({
        env: {
          ANTHROPIC_BASE_URL: PROXY_BASE_URL,
          ANTHROPIC_API_KEY: TEST_KEY,
        },
      }),
    )
    expect(isProxyBaseUrlConfigured(settingsPath)).toBe(true)
  })
})

describe("checkApiKeyHealth", () => {
  it("is healthy right after applyProxyBaseUrl writes", () => {
    applyProxyBaseUrl(settingsPath, resolveTestKey)
    expect(checkApiKeyHealth(settingsPath, resolveTestKey)).toEqual({
      ok: true,
      issue: null,
    })
  })

  it("flags a rotated key as out-of-sync — same mxl_ signature, different value", () => {
    applyProxyBaseUrl(settingsPath, resolveTestKey)
    const rotatedKey = "mxl_rotated-key-value"
    expect(checkApiKeyHealth(settingsPath, () => rotatedKey)).toEqual({
      ok: false,
      issue: "out-of-sync",
    })
    // getApiKeyOwnership alone would still call this "ours" (prefix match),
    // which is exactly why checkApiKeyHealth compares the exact value too.
    expect(getApiKeyOwnership(read())).toBe("ours")
  })

  it("flags a foreign base URL", () => {
    writeRaw(JSON.stringify({ env: { ANTHROPIC_BASE_URL: "https://other" } }))
    expect(checkApiKeyHealth(settingsPath, resolveTestKey)).toEqual({
      ok: false,
      issue: "foreign-base-url",
    })
  })

  it("flags a foreign legacy apiKeyHelper", () => {
    writeRaw(JSON.stringify({ apiKeyHelper: "/usr/local/bin/some-other-tool" }))
    expect(checkApiKeyHealth(settingsPath, resolveTestKey)).toEqual({
      ok: false,
      issue: "foreign-api-key-helper",
    })
  })

  it("flags an unresolvable key", () => {
    applyProxyBaseUrl(settingsPath, resolveTestKey)
    expect(checkApiKeyHealth(settingsPath, () => null)).toEqual({
      ok: false,
      issue: "invalid-api-key",
    })
  })

  it("flags settings.json never having been applied at all", () => {
    expect(checkApiKeyHealth(settingsPath, resolveTestKey)).toEqual({
      ok: false,
      issue: "out-of-sync",
    })
  })
})
