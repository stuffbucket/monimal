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

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import fs from "node:fs"
import path from "node:path"

import { createClaudeCodeApp } from "~/apps/claude-code"
import {
  isProxyBaseUrlConfigured,
  PROXY_BASE_URL,
  readClaudeCodeSettings,
} from "~/apps/claude-code/config"
import { claudeCodeRoutingIntended } from "~/apps/claude-code/reconcile"
import { resolveApiKey } from "~/lib/auth/api-key-helper"
import { getConfig, writeConfig } from "~/lib/config/config"
import { createApiKey, removeApiKey } from "~/lib/config/settings-operations"

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

afterEach(() => {
  fs.rmSync(SETTINGS, { force: true })
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

  test("enable() mints and selects a managed Claude Code key", async () => {
    const mintingApp = createClaudeCodeApp()
    expect(getConfig().auth?.apiKeyEntries ?? []).toHaveLength(0)
    expect(resolveApiKey("claude-code").ok).toBe(false)

    await mintingApp.enable()

    const entries = getConfig().auth?.apiKeyEntries ?? []
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      id: "managed:claude-code",
      label: "Claude Code",
      kind: "managed",
      configurator_id: "claude-code",
    })
    expect(entries[0]?.enabled).toBe(true)
    const resolved = resolveApiKey("claude-code")
    expect(resolved).toMatchObject({ ok: true, source: "app" })
  })

  test("enable() preserves unrelated manual keys", async () => {
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
    expect(entries).toHaveLength(2)
    expect(entries.find((entry) => entry.id === "x")).toMatchObject({
      id: "x",
      key: "mxl_existing",
    })
    expect(
      entries.find((entry) => entry.id === "managed:claude-code"),
    ).toMatchObject({
      id: "managed:claude-code",
      kind: "managed",
    })
  })

  test("an API-key mutation migrates an enabled integration to its managed key", () => {
    writeConfig({
      apps: { claudeCode: { enabled: true } },
      auth: {
        apiKeyEntries: [
          {
            id: "legacy-selected",
            label: "Claude Code",
            key: "mxl_legacy-selected",
            enabled: true,
            created_at: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    })
    fs.writeFileSync(
      SETTINGS,
      JSON.stringify({
        env: {
          ANTHROPIC_BASE_URL: PROXY_BASE_URL,
          ANTHROPIC_API_KEY: "mxl_legacy-selected",
        },
      }),
    )

    createApiKey({ label: "Other client", key: "mxl_other-client" })

    const managed = getConfig().auth?.apiKeyEntries?.find(
      (entry) => entry.id === "managed:claude-code",
    )
    const env = readClaudeCodeSettings(SETTINGS).env as Record<string, unknown>
    expect(managed).toBeDefined()
    expect(env.ANTHROPIC_API_KEY).toBe(managed?.key)
    expect(env.ANTHROPIC_BASE_URL).toBe(PROXY_BASE_URL)
  })

  test("API-key removal reconciles an enabled integration", () => {
    writeConfig({
      apps: { claudeCode: { enabled: true } },
      auth: {
        apiKeyEntries: [
          {
            id: "legacy-selected",
            label: "Claude Code",
            key: "mxl_legacy-selected",
            enabled: true,
            created_at: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "remove-me",
            label: "Other client",
            key: "mxl_remove-me",
            enabled: true,
            created_at: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    })
    fs.writeFileSync(
      SETTINGS,
      JSON.stringify({
        env: {
          ANTHROPIC_BASE_URL: PROXY_BASE_URL,
          ANTHROPIC_API_KEY: "mxl_legacy-selected",
        },
      }),
    )

    removeApiKey("remove-me")

    const managed = getConfig().auth?.apiKeyEntries?.find(
      (entry) => entry.id === "managed:claude-code",
    )
    const env = readClaudeCodeSettings(SETTINGS).env as Record<string, unknown>
    expect(managed).toBeDefined()
    expect(env.ANTHROPIC_API_KEY).toBe(managed?.key)
    expect(env.ANTHROPIC_BASE_URL).toBe(PROXY_BASE_URL)
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

    // An externally changed resolver value can still make settings stale.
    // Settings API mutations reconcile immediately; this injected seam models
    // state changed outside that owned path.
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
