import { afterEach, beforeEach, describe, expect, test } from "bun:test"

import type { ClientApp } from "~/apps"
import type { AppConfig, ApiKeyEntry } from "~/lib/config/config"
import type { AppEntry } from "~/lib/config/settings-types"

import { getConfig, writeConfig } from "~/lib/config/config"
import {
  buildDiagnostics,
  createApiKey,
  listApiKeys,
  removeApiKey,
  setApiKeyEnforcement,
  setAppEnabled,
  SettingsOperationError,
  updateApiKey,
} from "~/lib/config/settings-operations"
import { state } from "~/lib/runtime-state/state"

const firstKey: ApiKeyEntry = {
  id: "key-one",
  label: "First key",
  key: "first_key",
  enabled: true,
  created_at: "2026-01-02T03:04:05.000Z",
}
const secondKey: ApiKeyEntry = {
  id: "key-two",
  label: "Second key",
  key: "second-key",
  enabled: false,
  created_at: "2026-02-03T04:05:06.000Z",
}

let originalConfig: AppConfig
let originalOllamaApiKey: string | undefined
let originalTokenExpiry: number | undefined

function seedKeys(entries: Array<ApiKeyEntry>, enforce = false): void {
  const config = getConfig()
  writeConfig({
    ...config,
    auth: { ...config.auth, apiKeyEntries: entries, enforce },
  })
}

function expectOperationError(
  operation: () => unknown,
  expected: { kind: SettingsOperationError["kind"]; message: string },
): void {
  let thrown: unknown
  try {
    operation()
  } catch (error) {
    thrown = error
  }
  expect(thrown).toBeInstanceOf(SettingsOperationError)
  expect(thrown).toMatchObject({
    name: "SettingsOperationError",
    kind: expected.kind,
    message: expected.message,
  })
}

async function expectAsyncOperationError(
  operation: () => Promise<unknown>,
  expected: { kind: SettingsOperationError["kind"]; message: string },
): Promise<void> {
  let thrown: unknown
  try {
    await operation()
  } catch (error) {
    thrown = error
  }
  expect(thrown).toBeInstanceOf(SettingsOperationError)
  expect(thrown).toMatchObject({
    name: "SettingsOperationError",
    kind: expected.kind,
    message: expected.message,
  })
}

beforeEach(() => {
  originalConfig = structuredClone(getConfig())
  originalOllamaApiKey = process.env.OLLAMA_API_KEY
  originalTokenExpiry = state.copilotTokenExpiresAtMs
})

afterEach(() => {
  writeConfig(originalConfig)
  if (originalOllamaApiKey === undefined) delete process.env.OLLAMA_API_KEY
  else process.env.OLLAMA_API_KEY = originalOllamaApiKey
  state.copilotTokenExpiresAtMs = originalTokenExpiry
})

describe("settings API-key operations", () => {
  test("the operation error exposes its stable public identity", () => {
    const error = new SettingsOperationError("bad input", "validation_error")
    expect(error).toMatchObject({
      name: "SettingsOperationError",
      message: "bad input",
      kind: "validation_error",
    })
  })

  test("list reports absent, disabled, and enabled auth state", () => {
    writeConfig({ ...getConfig(), auth: undefined })
    expect(listApiKeys()).toEqual({ entries: [], enforcing: false })

    seedKeys([firstKey], false)
    expect(listApiKeys()).toEqual({ entries: [firstKey], enforcing: false })

    seedKeys([firstKey], true)
    expect(listApiKeys()).toEqual({ entries: [firstKey], enforcing: true })
  })

  test("create trims explicit fields, honors false, and persists the entry", () => {
    seedKeys([firstKey])
    const created = createApiKey({
      label: "  Build machine  ",
      key: "  build-key_123  ",
      enabled: false,
    })

    expect(created.label).toBe("Build machine")
    expect(created.key).toBe("build-key_123")
    expect(created.enabled).toBe(false)
    expect(created.id).not.toBe("")
    expect(Number.isNaN(Date.parse(created.created_at))).toBe(false)
    expect(listApiKeys().entries).toEqual([firstKey, created])
  })

  test("create generates a valid enabled key when auth state is absent", () => {
    writeConfig({ ...getConfig(), auth: undefined })
    const created = createApiKey({ label: "Generated" })

    expect(created.key).toMatch(/^[\w-]{8,128}$/u)
    expect(created.enabled).toBe(true)
    expect(listApiKeys().entries).toEqual([created])
  })

  test("create rejects invalid and duplicate keys without changing persistence", () => {
    seedKeys([firstKey])
    expectOperationError(
      () => createApiKey({ label: "Invalid", key: " short " }),
      {
        kind: "validation_error",
        message:
          "Key must be 8–128 chars of letters, digits, underscore, or hyphen — or the literal '*' wildcard.",
      },
    )
    expectOperationError(
      () => createApiKey({ label: "Duplicate", key: " first_key " }),
      { kind: "conflict", message: "Key already exists" },
    )
    expect(listApiKeys().entries).toEqual([firstKey])
  })

  test("update trims changed fields, honors false, and preserves identity", () => {
    seedKeys([firstKey, secondKey])
    const updated = updateApiKey(firstKey.id, {
      label: "  Renamed  ",
      key: "  replacement_key  ",
      enabled: false,
    })

    expect(updated).toEqual({
      ...firstKey,
      label: "Renamed",
      key: "replacement_key",
      enabled: false,
    })
    expect(listApiKeys().entries).toEqual([updated, secondKey])
  })

  test("update preserves omitted fields and accepts its own existing key", () => {
    seedKeys([firstKey, secondKey])
    expect(updateApiKey(firstKey.id, {})).toEqual(firstKey)
    expect(updateApiKey(firstKey.id, { key: ` ${firstKey.key} ` })).toEqual(
      firstKey,
    )
    expect(listApiKeys().entries).toEqual([firstKey, secondKey])
  })

  test("update rejects missing, invalid, and another entry's key", () => {
    seedKeys([firstKey, secondKey])
    expectOperationError(() => updateApiKey("missing", { enabled: false }), {
      kind: "not_found",
      message: "API key not found",
    })
    expectOperationError(() => updateApiKey(firstKey.id, { key: "bad" }), {
      kind: "validation_error",
      message:
        "Key must be 8–128 chars of letters, digits, underscore, or hyphen — or the literal '*' wildcard.",
    })
    expectOperationError(
      () => updateApiKey(firstKey.id, { key: secondKey.key }),
      { kind: "conflict", message: "Key already exists" },
    )
    expect(listApiKeys().entries).toEqual([firstKey, secondKey])
  })

  test("remove deletes only the selected entry and rejects a missing id", () => {
    seedKeys([firstKey, secondKey])
    removeApiKey(firstKey.id)
    expect(listApiKeys().entries).toEqual([secondKey])

    expectOperationError(() => removeApiKey("missing"), {
      kind: "not_found",
      message: "API key not found",
    })
    expect(listApiKeys().entries).toEqual([secondKey])
  })

  test("missing auth state has consistent update and remove behavior", () => {
    writeConfig({ ...getConfig(), auth: undefined })
    expectOperationError(() => updateApiKey(firstKey.id, {}), {
      kind: "not_found",
      message: "API key not found",
    })
    expectOperationError(() => removeApiKey(firstKey.id), {
      kind: "not_found",
      message: "API key not found",
    })
  })

  test("enforcement changes only that flag and returns persisted state", () => {
    const config = getConfig()
    writeConfig({
      ...config,
      auth: {
        ...config.auth,
        apiKeys: ["legacy-key"],
        apiKeyEntries: [firstKey],
        enforce: false,
      },
    })

    expect(setApiKeyEnforcement(true)).toEqual({
      entries: [firstKey],
      enforcing: true,
    })
    expect(getConfig().auth).toEqual({
      apiKeys: ["legacy-key"],
      apiKeyEntries: [firstKey],
      enforce: true,
    })

    expect(setApiKeyEnforcement(false).enforcing).toBe(false)
    expect(getConfig().auth?.enforce).toBe(false)
  })
})

interface FakeAppOptions {
  id?: AppEntry["id"]
  kind?: AppEntry["kind"]
  detected?: boolean
  conflict?: AppEntry["conflict"]
}

function makeFakeApp(options: FakeAppOptions = {}): {
  app: ClientApp
  events: Array<string>
} {
  const id = options.id ?? "claude-code"
  const kind = options.kind ?? "config"
  const events: Array<string> = []
  let enabled = false

  const app: ClientApp = {
    id,
    name: id === "claude-desktop" ? "Claude Desktop" : "Claude Code",
    kind,
    detect: () => {
      events.push("detect")
      return Promise.resolve(options.detected ?? true)
    },
    enable: () => {
      events.push("enable")
      enabled = true
      return Promise.resolve({
        success: true,
        conflict: options.conflict ?? undefined,
      })
    },
    disable: () => {
      events.push("disable")
      enabled = false
      return Promise.resolve({ success: true })
    },
    isEnabled: () => enabled,
    getDetails: (conflict = null) => {
      events.push(`details:${String(conflict)}`)
      return Promise.resolve({
        id,
        name: app.name,
        kind,
        enabled,
        status: kind === "coming-soon" ? "coming-soon" : "ready",
        installs: [],
        install: null,
        conflict,
      })
    },
    uninstall: () => Promise.resolve({ reverted: [] }),
  }
  return { app, events }
}

function appDependencies(
  app: ClientApp | undefined,
  config: AppConfig = {},
): {
  dependencies: Parameters<typeof setAppEnabled>[2]
  written: Array<AppConfig>
} {
  const written: Array<AppConfig> = []
  return {
    dependencies: {
      getApp: () => app,
      getConfig: () => config,
      writeConfig: (next) => {
        written.push(next)
        return next
      },
    },
    written,
  }
}

describe("settings app operation", () => {
  test("default registry rejects its coming-soon app as non-configurable", async () => {
    await expectAsyncOperationError(() => setAppEnabled("copilot-cli", false), {
      kind: "validation_error",
      message: "App cannot be configured",
    })
  })

  test("rejects an absent or coming-soon app as non-configurable", async () => {
    await expectAsyncOperationError(
      () =>
        setAppEnabled(
          "claude-code",
          true,
          appDependencies(undefined).dependencies,
        ),
      { kind: "validation_error", message: "App cannot be configured" },
    )

    const { app, events } = makeFakeApp({
      id: "copilot-cli",
      kind: "coming-soon",
    })
    await expectAsyncOperationError(
      () =>
        setAppEnabled("copilot-cli", true, appDependencies(app).dependencies),
      { kind: "validation_error", message: "App cannot be configured" },
    )
    expect(events).toEqual([])
  })

  test("refuses enable when the named app is not installed", async () => {
    const { app, events } = makeFakeApp({ detected: false })
    await expectAsyncOperationError(
      () =>
        setAppEnabled("claude-code", true, appDependencies(app).dependencies),
      { kind: "conflict", message: "No Claude Code install detected." },
    )
    expect(events).toEqual(["detect"])
  })

  test("enable returns details with no conflict when integration succeeds", async () => {
    const { app, events } = makeFakeApp()
    const result = await setAppEnabled(
      "claude-code",
      true,
      appDependencies(app).dependencies,
    )

    expect(result.enabled).toBe(true)
    expect(result.conflict).toBeNull()
    expect(events).toEqual(["detect", "enable", "details:null"])
  })

  test("enable carries a configuration conflict into returned details", async () => {
    const { app, events } = makeFakeApp({ conflict: "foreign-base-url" })
    const result = await setAppEnabled(
      "claude-code",
      true,
      appDependencies(app).dependencies,
    )

    expect(result.enabled).toBe(true)
    expect(result.conflict).toBe("foreign-base-url")
    expect(events).toEqual(["detect", "enable", "details:foreign-base-url"])
  })

  test("disable skips install detection and returns disabled details", async () => {
    const { app, events } = makeFakeApp({ detected: false })
    const result = await setAppEnabled(
      "claude-code",
      false,
      appDependencies(app).dependencies,
    )

    expect(result.enabled).toBe(false)
    expect(result.conflict).toBeNull()
    expect(events).toEqual(["disable", "details:null"])
  })

  test("Claude Desktop persists enabled state while preserving app config", async () => {
    const { app, events } = makeFakeApp({ id: "claude-desktop" })
    const config: AppConfig = {
      apps: {
        claudeCode: { enabled: true },
        claudeDesktop: { enabled: false },
      },
      auth: { apiKeys: ["legacy-key"] },
    }
    const { dependencies, written } = appDependencies(app, config)

    const result = await setAppEnabled("claude-desktop", true, dependencies)
    expect(result.enabled).toBe(true)
    expect(events).toEqual(["detect", "enable", "details:null"])
    expect(written).toEqual([
      {
        ...config,
        apps: {
          claudeCode: { enabled: true },
          claudeDesktop: { enabled: true },
        },
      },
    ])
  })

  test("Claude Desktop creates missing app config when disabling", async () => {
    const { app } = makeFakeApp({ id: "claude-desktop" })
    const config: AppConfig = { auth: { apiKeys: ["legacy-key"] } }
    const { dependencies, written } = appDependencies(app, config)

    const result = await setAppEnabled("claude-desktop", false, dependencies)
    expect(result.enabled).toBe(false)
    expect(written).toEqual([
      {
        ...config,
        apps: { claudeDesktop: { enabled: false } },
      },
    ])
  })

  test("non-Desktop app mutations do not alter core app config", async () => {
    const { app } = makeFakeApp()
    const { dependencies, written } = appDependencies(app, {
      apps: { claudeDesktop: { enabled: true } },
    })

    await setAppEnabled("claude-code", false, dependencies)
    expect(written).toEqual([])
  })
})

describe("settings diagnostics operation", () => {
  test("projects null refresh timestamps and a known token expiry", () => {
    state.copilotTokenExpiresAtMs = 0
    const diagnostics = buildDiagnostics()

    expect(diagnostics.copilot_refresh?.token_expires_at).toBe(
      "1970-01-01T00:00:00.000Z",
    )
    expect(diagnostics.copilot_refresh?.last_success_at).toBeNull()
    expect(diagnostics.copilot_refresh?.last_failure_at).toBeNull()
  })

  test("reports process uptime in milliseconds", () => {
    const before = process.uptime() * 1000
    const diagnostics = buildDiagnostics()
    const after = process.uptime() * 1000

    expect(diagnostics.uptime_ms).toBeGreaterThanOrEqual(Math.floor(before) - 1)
    expect(diagnostics.uptime_ms).toBeLessThanOrEqual(Math.ceil(after) + 1)
  })

  test("uses the selected executor base as web-search detail", () => {
    process.env.OLLAMA_API_KEY = "diagnostics-test-key"
    const diagnostics = buildDiagnostics()

    expect(diagnostics.web_search).toEqual({
      kind: "OllamaWebExecutor",
      detail: "https://ollama.com/api",
    })
  })
})
