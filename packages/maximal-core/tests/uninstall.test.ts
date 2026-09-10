import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import type { ClientApp } from "~/apps/index"
import type { AppEntry } from "~/lib/config/settings-types"
import type {
  RunUninstallDependencies,
  UninstallControlClient,
} from "~/uninstall"

import {
  enabledApps,
  installTargets,
  revertLegacyAppIntegrations,
  runUninstall,
} from "~/uninstall"

let workDir: string

beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), "maximal-uninstall-"))
})

afterEach(() => {
  fs.rmSync(workDir, { recursive: true, force: true })
})

describe("uninstall — Claude Desktop revert integration", () => {
  it("removes its profile while preserving user preferences", async () => {
    const {
      applyConfigLibraryProfile,
      revertConfigLibraryProfile,
      isConfigLibraryApplied,
      getClaude3pDir,
    } = await import("~/apps/claude-desktop/config")

    const dir = getClaude3pDir(workDir)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(
      path.join(dir, "claude_desktop_config.json"),
      JSON.stringify({
        coworkUserFilesPath: "/Users/x/Claude",
        preferences: { theme: "dark" },
      }),
    )

    applyConfigLibraryProfile(workDir)
    expect(isConfigLibraryApplied(workDir)).toBe(true)

    const result = revertConfigLibraryProfile(workDir)
    expect(result.reverted).toBe(true)
    expect(isConfigLibraryApplied(workDir)).toBe(false)

    const after = JSON.parse(
      fs.readFileSync(path.join(dir, "claude_desktop_config.json"), "utf8"),
    ) as Record<string, unknown>
    expect(after.deploymentMode).toBeUndefined()
    expect(after.coworkUserFilesPath).toBe("/Users/x/Claude")
    expect((after.preferences as { theme: string }).theme).toBe("dark")
  })
})

describe("uninstall — Claude Code settings revert integration", () => {
  const testHelper =
    '"/Applications/Maximal.app/Contents/MacOS/maximal" api claude-code'

  it("reverts only the base URL it wrote", async () => {
    const { applyProxyBaseUrl, revertProxyBaseUrl, isProxyBaseUrlConfigured } =
      await import("~/apps/claude-code/config")
    const settings = path.join(workDir, "settings.json")
    fs.writeFileSync(
      settings,
      JSON.stringify({ env: { ANTHROPIC_API_KEY: "user-key" } }),
    )

    applyProxyBaseUrl(settings, () => testHelper)
    expect(isProxyBaseUrlConfigured(settings)).toBe(true)
    expect(revertProxyBaseUrl(settings).wrote).toBe(true)

    const after = JSON.parse(fs.readFileSync(settings, "utf8")) as {
      env?: { ANTHROPIC_API_KEY?: string }
    }
    expect(after.env?.ANTHROPIC_API_KEY).toBe("user-key")
  })

  it("does not revert an absent or foreign base URL", async () => {
    const { revertProxyBaseUrl } = await import("~/apps/claude-code/config")
    const settings = path.join(workDir, "settings.json")
    expect(revertProxyBaseUrl(settings).wrote).toBe(false)

    fs.writeFileSync(
      settings,
      JSON.stringify({ env: { ANTHROPIC_BASE_URL: "https://other.example" } }),
    )
    revertProxyBaseUrl(settings)
    const after = JSON.parse(fs.readFileSync(settings, "utf8")) as {
      env?: { ANTHROPIC_BASE_URL?: string }
    }
    expect(after.env?.ANTHROPIC_BASE_URL).toBe("https://other.example")
  })
})

describe("uninstall — install-target selection", () => {
  it("targets only the Homebrew binaries", () => {
    if (process.platform === "win32") return
    const paths = installTargets()
    expect(paths).toContain("/opt/homebrew/bin/maximal")
    expect(paths).toContain("/usr/local/bin/maximal")
    expect(paths.some((candidate) => candidate.endsWith(".app"))).toBe(false)
    expect(paths.some((candidate) => candidate.includes("/.local/bin/"))).toBe(
      false,
    )
  })
})

function appEntry(
  id: AppEntry["id"],
  name: string,
  enabled: boolean,
): AppEntry {
  return {
    id,
    name,
    kind: id === "copilot-cli" ? "coming-soon" : "config",
    enabled,
    status: id === "copilot-cli" ? "coming-soon" : "ready",
    installs: [],
    install: null,
    conflict: null,
  }
}

interface FakeAppOptions {
  id: ClientApp["id"]
  name: string
  enabled: boolean
  disable?: ReturnType<typeof mock>
  uninstall?: ReturnType<typeof mock>
}

function fakeApp(options: FakeAppOptions): ClientApp {
  return {
    id: options.id,
    name: options.name,
    kind: "config",
    isEnabled: () => options.enabled,
    disable: options.disable ?? mock(() => Promise.resolve({ success: true })),
    uninstall:
      options.uninstall ?? mock(() => Promise.resolve({ reverted: [] })),
    detect: () => Promise.resolve(true),
    getDetails: () =>
      Promise.resolve(appEntry(options.id, options.name, options.enabled)),
    enable: () => Promise.resolve({ success: true }),
  }
}

function uninstallDependencies(
  control: UninstallControlClient | null,
  events: Array<string>,
  legacyApps: ReadonlyArray<ClientApp> = [],
): RunUninstallDependencies {
  return {
    connectControl: () => Promise.resolve(control),
    enabledLegacyApps: () => enabledApps(legacyApps),
    stopProxy: () => events.push("stop-proxy"),
    removeStartupIntegration: () => events.push("remove-startup"),
    removeBinary: () => events.push("remove-binary"),
    revertLegacyAppIntegrations: () => {
      events.push("legacy-sweep")
      return Promise.resolve()
    },
    maybePurgeSecrets: () => {
      events.push("purge")
      return Promise.resolve()
    },
  }
}

const uninstallOptions = {
  purge: false,
  force: false,
  unattended: true,
  keepApp: false,
} as const

async function caughtError(operation: Promise<void>): Promise<Error> {
  try {
    await operation
  } catch (error) {
    if (error instanceof Error) return error
  }
  throw new Error("Expected operation to fail")
}

describe("uninstall — daemon-owned disconnect", () => {
  it("refuses enabled live connections before destructive work", async () => {
    const events: Array<string> = []
    const setAppEnabled = mock((appId: AppEntry["id"], enabled: boolean) =>
      Promise.resolve(appEntry(appId, "Claude Code", enabled)),
    )
    const control: UninstallControlClient = {
      listApps: () =>
        Promise.resolve({
          apps: [
            appEntry("claude-code", "Claude Code", true),
            appEntry("claude-desktop", "Claude Desktop", true),
          ],
        }),
      setAppEnabled,
    }

    const error = await caughtError(
      runUninstall(uninstallOptions, uninstallDependencies(control, events)),
    )

    expect(error.message).toContain("Refusing to uninstall")
    expect(error.message).toContain("Claude Code")
    expect(error.message).toContain("Claude Desktop")
    expect(setAppEnabled).not.toHaveBeenCalled()
    expect(events).toEqual([])
  })

  it("disconnects every enabled connection before stopping the proxy", async () => {
    const events: Array<string> = []
    const legacyProbe = mock((): Array<ClientApp> => {
      throw new Error("live state must not use the legacy registry")
    })
    const control: UninstallControlClient = {
      listApps: () =>
        Promise.resolve({
          apps: [
            appEntry("claude-code", "Claude Code", true),
            appEntry("claude-desktop", "Claude Desktop", false),
          ],
        }),
      setAppEnabled: (appId, enabled) => {
        events.push(`disconnect:${appId}`)
        return Promise.resolve(appEntry(appId, "Claude Code", enabled))
      },
    }
    const dependencies = uninstallDependencies(control, events)
    dependencies.enabledLegacyApps = legacyProbe

    await runUninstall({ ...uninstallOptions, force: true }, dependencies)

    expect(legacyProbe).not.toHaveBeenCalled()
    expect(events).toEqual([
      "disconnect:claude-code",
      "stop-proxy",
      "remove-startup",
      "remove-binary",
      "legacy-sweep",
      "purge",
    ])
  })

  it("stops before proxy removal when the daemon does not confirm disconnect", async () => {
    const events: Array<string> = []
    const control: UninstallControlClient = {
      listApps: () =>
        Promise.resolve({
          apps: [appEntry("claude-code", "Claude Code", true)],
        }),
      setAppEnabled: () =>
        Promise.resolve(appEntry("claude-code", "Claude Code", true)),
    }

    const error = await caughtError(
      runUninstall(
        { ...uninstallOptions, force: true },
        uninstallDependencies(control, events),
      ),
    )

    expect(error.message).toContain("did not disconnect Claude Code")
    expect(events).toEqual([])
  })

  it("never mutates an enabled target from a short-lived process", async () => {
    const events: Array<string> = []
    const disable = mock(() => Promise.resolve({ success: true }))
    const legacy = fakeApp({
      id: "claude-code",
      name: "Claude Code",
      enabled: true,
      disable,
    })

    const error = await caughtError(
      runUninstall(
        { ...uninstallOptions, force: true },
        uninstallDependencies(null, events, [legacy]),
      ),
    )

    expect(error.message).toContain("without a running Maximal control plane")
    expect(error.message).toContain("Start maximal")
    expect(disable).not.toHaveBeenCalled()
    expect(events).toEqual([])
  })

  it("allows legacy cleanup without a daemon when no integration is active", async () => {
    const events: Array<string> = []
    const legacy = fakeApp({
      id: "claude-code",
      name: "Claude Code",
      enabled: false,
    })

    await runUninstall(
      uninstallOptions,
      uninstallDependencies(null, events, [legacy]),
    )

    expect(events).toEqual([
      "stop-proxy",
      "remove-startup",
      "remove-binary",
      "legacy-sweep",
      "purge",
    ])
  })
})

describe("uninstall — legacy compatibility helpers", () => {
  it("finds only enabled legacy apps", () => {
    const enabled = fakeApp({
      id: "claude-code",
      name: "Claude Code",
      enabled: true,
    })
    const disabled = fakeApp({
      id: "claude-desktop",
      name: "Claude Desktop",
      enabled: false,
    })

    expect(enabledApps([enabled, disabled])).toEqual([enabled])
  })

  it("continues the compatibility sweep after one app fails", async () => {
    const badUninstall = mock(() => Promise.reject(new Error("legacy failure")))
    const goodUninstall = mock(() => Promise.resolve({ reverted: [] }))
    const bad = fakeApp({
      id: "claude-code",
      name: "Claude Code",
      enabled: false,
      uninstall: badUninstall,
    })
    const good = fakeApp({
      id: "claude-desktop",
      name: "Claude Desktop",
      enabled: false,
      uninstall: goodUninstall,
    })

    await revertLegacyAppIntegrations([bad, good])

    expect(badUninstall).toHaveBeenCalledTimes(1)
    expect(goodUninstall).toHaveBeenCalledTimes(1)
  })
})
