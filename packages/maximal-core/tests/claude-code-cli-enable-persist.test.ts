/**
 * Regression for #229: the CLI enable/disable path must persist the durable
 * routing-intent flag (`config.apps.claudeCode.enabled`), not just write
 * settings.json. Before the fix, `maximal app claude-code --enable` wrote the
 * base URL but left the flag unset, so boot/shutdown self-heal (which gates on
 * `claudeCodeRoutingIntended()`) never ran for CLI users.
 *
 * These drive `claudeCodeApp.enable()/disable()` directly — that's the exact
 * seam the CLI dispatch (`src/apps/cli.ts` → enableApp/disableApp) invokes, and
 * now the single owner of the flag. The global preload places Claude settings
 * and Maximal config beneath one fresh container-only test root before any
 * product module loads. No mock.module is used here (avoids Bun's
 * forward-persisting hazard — see apps-cli.test.ts).
 */

import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import fs from "node:fs"
import path from "node:path"

import { createClaudeCodeApp } from "~/apps/claude-code"
import { isProxyBaseUrlConfigured } from "~/apps/claude-code/config"
import { claudeCodeRoutingIntended } from "~/apps/claude-code/reconcile"
import { resolveApiKey } from "~/lib/auth/api-key-helper"
import { getConfig, writeConfig } from "~/lib/config/config"

const claudeConfigDir = process.env.CLAUDE_CONFIG_DIR
if (!claudeConfigDir) {
  throw new Error("The container test preload did not set CLAUDE_CONFIG_DIR.")
}
const SETTINGS = path.join(claudeConfigDir, "settings.json")
const TEST_KEY = "mxl_test-key-value"
const claudeCodeApp = createClaudeCodeApp({
  resolveApiKey: () => TEST_KEY,
})

beforeEach(() => {
  fs.rmSync(SETTINGS, { force: true })
  // Clean config so the intent flag starts unset for each case.
  writeConfig({})
})

afterAll(() => {
  writeConfig({})
})

describe("claude-code CLI enable/disable persists routing intent (#229)", () => {
  test("enable() persists config.apps.claudeCode.enabled = true", async () => {
    expect(claudeCodeRoutingIntended()).toBe(false)

    const result = await claudeCodeApp.enable()

    expect(result.success).toBe(true)
    expect(result.conflict).toBeNull()
    // The durable intent flag is now set — boot/shutdown self-heal will run.
    expect(getConfig().apps?.claudeCode?.enabled).toBe(true)
    expect(claudeCodeRoutingIntended()).toBe(true)
    // settings.json was actually written too.
    expect(isProxyBaseUrlConfigured(SETTINGS)).toBe(true)
  })

  test("disable() persists config.apps.claudeCode.enabled = false", async () => {
    await claudeCodeApp.enable()
    expect(claudeCodeRoutingIntended()).toBe(true)

    await claudeCodeApp.disable()

    expect(getConfig().apps?.claudeCode?.enabled).toBe(false)
    expect(claudeCodeRoutingIntended()).toBe(false)
    expect(isProxyBaseUrlConfigured(SETTINGS)).toBe(false)
  })

  test("enable does not clobber sibling apps config", async () => {
    writeConfig({ apps: { claudeDesktop: { enabled: true } } })

    await claudeCodeApp.enable()

    const apps = getConfig().apps
    expect(apps?.claudeCode?.enabled).toBe(true)
    expect(apps?.claudeDesktop?.enabled).toBe(true)
  })

  test("enable() mints a default endpoint key so the resolved API key works", async () => {
    // Use the real default resolver here (not the fixed TEST_KEY stub) since
    // this test exercises `ensureDefaultEndpointKey`'s minting behavior.
    const mintingApp = createClaudeCodeApp()
    // Fresh config: no key at all — `maximal api claude-code` would otherwise
    // exit key-less and break the client.
    expect(getConfig().auth?.apiKeyEntries ?? []).toHaveLength(0)
    expect(resolveApiKey("claude-code").ok).toBe(false)

    await mintingApp.enable()

    const entries = getConfig().auth?.apiKeyEntries ?? []
    expect(entries).toHaveLength(1)
    expect(entries[0]?.label).toBe("Default")
    expect(entries[0]?.enabled).toBe(true)
    // The default resolver now resolves the freshly-minted default endpoint key.
    const resolved = resolveApiKey("claude-code")
    expect(resolved).toMatchObject({ ok: true, source: "default" })
  })

  test("enable() does not mint a second key when one already exists", async () => {
    const mintingApp = createClaudeCodeApp()
    writeConfig({
      auth: {
        apiKeyEntries: [
          {
            id: "x",
            label: "Mine",
            key: "mxl_existing",
            enabled: true,
            created_at: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    })

    await mintingApp.enable()

    const entries = getConfig().auth?.apiKeyEntries ?? []
    expect(entries).toHaveLength(1)
    expect(entries[0]?.key).toBe("mxl_existing")
  })

  test("invalid key resolution leaves settings, routing intent, and keys untouched", async () => {
    const invalidApp = createClaudeCodeApp({
      resolveApiKey: () => null,
    })
    writeConfig({ apps: { claudeDesktop: { enabled: true } } })

    const result = await invalidApp.enable()

    expect(result).toEqual({
      success: false,
      conflict: "invalid-api-key",
    })
    expect(fs.existsSync(SETTINGS)).toBe(false)
    expect(getConfig().apps?.claudeCode?.enabled).not.toBe(true)
    expect(getConfig().apps?.claudeDesktop?.enabled).toBe(true)
    expect(getConfig().auth?.apiKeyEntries ?? []).toHaveLength(0)
  })

  test("getDetails().health stays healthy through routing intent off, on, and re-applied", async () => {
    // Routing intent off: nothing to have drifted, so health is reported ok
    // even though settings.json has never been touched.
    expect((await claudeCodeApp.getDetails()).health).toEqual({
      ok: true,
      issue: null,
    })

    await claudeCodeApp.enable()
    expect((await claudeCodeApp.getDetails()).health).toEqual({
      ok: true,
      issue: null,
    })

    // A key rotation while enabled: settings.json now carries a stale value
    // until the next enable()/boot. getDetails() surfaces that as unhealthy —
    // this is exactly the gap the Settings UI's "Fix" affordance addresses.
    const rotatedApp = createClaudeCodeApp({
      resolveApiKey: () => "mxl_rotated-value",
    })
    expect((await rotatedApp.getDetails()).health).toEqual({
      ok: false,
      issue: "out-of-sync",
    })

    // Re-running enable() (the "Fix" action) re-syncs it.
    await rotatedApp.enable()
    expect((await rotatedApp.getDetails()).health).toEqual({
      ok: true,
      issue: null,
    })
  })
})
