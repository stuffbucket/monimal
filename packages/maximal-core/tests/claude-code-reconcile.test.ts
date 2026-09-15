/**
 * Lifecycle reconciliation for Claude Code routing.
 *
 * These tests drive `reconcileClaudeCodeOnBoot` / `OnShutdown` directly via
 * their injectable `intended` + `filePath` params — no `mock.module`, so
 * there's no cross-file bleed risk (CLAUDE.md → prefer injectable options).
 * We assert the on-disk effect through the real `claude-code-settings`
 * reader, the same way `apps-route.test.ts` does.
 */

import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import {
  isProxyBaseUrlConfigured,
  PROXY_BASE_URL,
  readClaudeCodeSettings,
} from "~/apps/claude-code/config"
import {
  reconcileClaudeCodeOnBoot,
  reconcileClaudeCodeOnShutdown,
} from "~/apps/claude-code/reconcile"
import { getConfig, writeConfig } from "~/lib/config/config"

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "cc-reconcile-"))
const SETTINGS = path.join(TMP_DIR, "settings.json")
const TEST_KEY = "mxl_test-key-value"
const resolveTestKey = () => TEST_KEY

function writeSettings(obj: unknown): void {
  fs.writeFileSync(SETTINGS, JSON.stringify(obj))
}

beforeEach(() => {
  fs.rmSync(SETTINGS, { force: true })
  writeConfig({})
})

afterAll(() => {
  fs.rmSync(TMP_DIR, { recursive: true, force: true })
  writeConfig({})
})

describe("reconcileClaudeCodeOnBoot", () => {
  test("writes the proxy base URL when routing is intended", () => {
    reconcileClaudeCodeOnBoot(true, SETTINGS, resolveTestKey)
    expect(isProxyBaseUrlConfigured(SETTINGS)).toBe(true)
  })

  test("is a no-op when routing is not intended", () => {
    reconcileClaudeCodeOnBoot(false, SETTINGS)
    expect(fs.existsSync(SETTINGS)).toBe(false)
  })

  test("preserves a sibling env key when applying", () => {
    writeSettings({
      env: { ANTHROPIC_AUTH_TOKEN: "tok-keep" },
    })
    reconcileClaudeCodeOnBoot(true, SETTINGS, resolveTestKey)
    const env = (readClaudeCodeSettings(SETTINGS).env ?? {}) as Record<
      string,
      unknown
    >
    expect(env.ANTHROPIC_BASE_URL).toBe(PROXY_BASE_URL)
    expect(env.ANTHROPIC_API_KEY).toBe(TEST_KEY)
    expect(env.ANTHROPIC_AUTH_TOKEN).toBe("tok-keep")
  })

  test("does not clobber a foreign base URL even when intended", () => {
    writeSettings({ env: { ANTHROPIC_BASE_URL: "https://other.example" } })
    reconcileClaudeCodeOnBoot(true, SETTINGS, resolveTestKey)
    const env = (readClaudeCodeSettings(SETTINGS).env ?? {}) as Record<
      string,
      unknown
    >
    expect(env.ANTHROPIC_BASE_URL).toBe("https://other.example")
    expect(isProxyBaseUrlConfigured(SETTINGS)).toBe(false)
  })

  test("swaps in the resolved key over a real (foreign) ANTHROPIC_API_KEY", () => {
    // Routing requires OUR key in this field to authenticate against
    // maximal's proxy, so boot reconcile takes over the field rather than
    // leaving a real user key in place (unlike the base URL, which it leaves
    // untouched when foreign).
    writeSettings({ env: { ANTHROPIC_API_KEY: "sk-real" } })
    reconcileClaudeCodeOnBoot(true, SETTINGS, resolveTestKey)
    const env = (readClaudeCodeSettings(SETTINGS).env ?? {}) as Record<
      string,
      unknown
    >
    expect(env.ANTHROPIC_API_KEY).toBe(TEST_KEY)
    expect(env.ANTHROPIC_BASE_URL).toBe(PROXY_BASE_URL)
    expect(isProxyBaseUrlConfigured(SETTINGS)).toBe(true)
  })

  test("unresolvable key leaves settings and API keys untouched", () => {
    writeSettings({ keep: { nested: true } })
    const before = fs.readFileSync(SETTINGS)

    reconcileClaudeCodeOnBoot(true, SETTINGS, () => null)

    expect(fs.readFileSync(SETTINGS)).toEqual(before)
    expect(getConfig().auth?.apiKeyEntries ?? []).toHaveLength(0)
  })
})

describe("reconcileClaudeCodeOnShutdown", () => {
  test("removes the proxy base URL when routing is intended", () => {
    writeSettings({
      env: { ANTHROPIC_BASE_URL: PROXY_BASE_URL, ANTHROPIC_API_KEY: TEST_KEY },
    })
    reconcileClaudeCodeOnShutdown(true, SETTINGS)
    expect(isProxyBaseUrlConfigured(SETTINGS)).toBe(false)
  })

  test("is a no-op when routing is not intended (leaves our URL in place)", () => {
    // Edge case: intent off but a stale URL is on disk. Shutdown reconcile
    // is intent-gated, so it must NOT touch it — that's the boot reconciler's
    // and the toggle's job, not shutdown's.
    writeSettings({
      env: { ANTHROPIC_BASE_URL: PROXY_BASE_URL, ANTHROPIC_API_KEY: TEST_KEY },
    })
    reconcileClaudeCodeOnShutdown(false, SETTINGS)
    expect(isProxyBaseUrlConfigured(SETTINGS)).toBe(true)
  })

  test("preserves a foreign sibling ANTHROPIC_API_KEY when reverting", () => {
    writeSettings({
      env: { ANTHROPIC_BASE_URL: PROXY_BASE_URL, ANTHROPIC_API_KEY: "sk-keep" },
    })
    reconcileClaudeCodeOnShutdown(true, SETTINGS)
    const env = (readClaudeCodeSettings(SETTINGS).env ?? {}) as Record<
      string,
      unknown
    >
    expect(env.ANTHROPIC_BASE_URL).toBeUndefined()
    expect(env.ANTHROPIC_API_KEY).toBe("sk-keep")
  })

  test("leaves a foreign base URL intact", () => {
    writeSettings({ env: { ANTHROPIC_BASE_URL: "https://other.example" } })
    reconcileClaudeCodeOnShutdown(true, SETTINGS)
    const env = (readClaudeCodeSettings(SETTINGS).env ?? {}) as Record<
      string,
      unknown
    >
    expect(env.ANTHROPIC_BASE_URL).toBe("https://other.example")
  })
})

describe("boot/shutdown round trip", () => {
  test("boot applies, shutdown removes, boot re-applies (intent persists)", () => {
    reconcileClaudeCodeOnBoot(true, SETTINGS, resolveTestKey)
    expect(isProxyBaseUrlConfigured(SETTINGS)).toBe(true)
    reconcileClaudeCodeOnShutdown(true, SETTINGS)
    expect(isProxyBaseUrlConfigured(SETTINGS)).toBe(false)
    reconcileClaudeCodeOnBoot(true, SETTINGS, resolveTestKey)
    expect(isProxyBaseUrlConfigured(SETTINGS)).toBe(true)
  })
})
