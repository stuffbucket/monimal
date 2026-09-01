import { afterEach, describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import type { AppConfig, ConfigReloadFailureReason } from "~/lib/config/config"
import type {
  ProviderHostConfigSnapshot,
  ProviderHostConfigSource,
} from "~/lib/provider-host-types"

import { ConfigReloadError } from "~/lib/config/config"
import { validateAppConfig } from "~/lib/config/config-schema"
import { createProviderHostConfigSource } from "~/lib/config/provider-host-source"

const temporaryDirectories: Array<string> = []

const readValidatedConfig = (configPath: string): AppConfig =>
  validateAppConfig(JSON.parse(fs.readFileSync(configPath, "utf8")))
const noop = (): void => undefined
const ignoreConfigChanges = (
  _listener: (config: AppConfig) => void,
): (() => void) => noop

const waitForSnapshot = (
  source: ProviderHostConfigSource,
  predicate: (snapshot: ProviderHostConfigSnapshot) => boolean,
): Promise<ProviderHostConfigSnapshot> =>
  new Promise((resolve, reject) => {
    let unsubscribe = noop
    const timer = setTimeout(() => {
      unsubscribe()
      reject(new Error("Timed out waiting for config notification"))
    }, 2_000)
    unsubscribe = source.subscribe((snapshot) => {
      if (!predicate(snapshot)) return
      clearTimeout(timer)
      unsubscribe()
      resolve(snapshot)
    })
  })

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { force: true, recursive: true })
  }
})

describe("provider host config source", () => {
  test("publishes validated in-memory mode and opaque plugin changes", async () => {
    let config: AppConfig = {}
    let publish: ((next: AppConfig) => void) | undefined
    const appDataDirectory = "/tmp/maximal-provider-source"
    const source = createProviderHostConfigSource({
      appDataDirectory,
      readConfig: () => config,
      reloadConfig: () => config,
      subscribeValidatedConfig(listener) {
        publish = listener
        return () => {
          publish = undefined
        }
      },
      watchExternalWrites: false,
    })
    const snapshots: Array<ReturnType<typeof source.getSnapshot>> = []
    source.subscribe((snapshot) => snapshots.push(snapshot))

    config = {
      providerHost: { mode: "dsh" },
      providers: {
        compatible: {
          apiKey: "secret",
          baseUrl: "https://provider.example",
          models: { primary: { temperature: 0.2 } },
        },
        unsupported: { type: "unsupported" },
      },
      providerPlugins: {
        hosted: {
          enabled: true,
          config: { nested: [1, { preserved: null }] },
        },
      },
    }
    publish?.(config)

    expect(snapshots).toHaveLength(1)
    expect(snapshots[0]).toEqual({
      appDataDirectory,
      defaultProfileDirectory: path.join(appDataDirectory, "provider-host"),
      configStatus: { state: "ready" },
      providerHost: { mode: "dsh", profileDirectory: undefined },
      providers: config.providers ?? {},
      providerPlugins: config.providerPlugins,
    })
    const published = snapshots[0]
    const publishedPlugin = published.providerPlugins?.hosted
    const publishedPluginConfig = publishedPlugin?.config as {
      nested: Array<number | { preserved: null }>
    }
    expect(Object.isFrozen(published.providers)).toBe(true)
    expect(Object.isFrozen(published.providers.compatible)).toBe(true)
    expect(Object.isFrozen(published.providers.compatible.models)).toBe(true)
    expect(
      Object.isFrozen(published.providers.compatible.models?.primary),
    ).toBe(true)
    expect(Object.isFrozen(published.providerPlugins)).toBe(true)
    expect(Object.isFrozen(publishedPlugin)).toBe(true)
    expect(Object.isFrozen(publishedPluginConfig)).toBe(true)
    expect(Object.isFrozen(publishedPluginConfig.nested)).toBe(true)
    expect(Object.isFrozen(publishedPluginConfig.nested[1])).toBe(true)

    if (config.providers?.compatible) {
      config.providers.compatible.baseUrl = "https://mutated.example"
    }
    if (config.providerPlugins?.hosted) {
      config.providerPlugins.hosted.enabled = false
      const sourcePluginConfig = config.providerPlugins.hosted.config as {
        nested: Array<number | { preserved: null | string }>
      }
      const sourceNested = sourcePluginConfig.nested[1]
      if (typeof sourceNested === "object") sourceNested.preserved = "mutated"
    }
    expect(published.providers.compatible.baseUrl).toBe(
      "https://provider.example",
    )
    expect(publishedPlugin?.enabled).toBe(true)
    expect(publishedPluginConfig.nested[1]).toEqual({ preserved: null })
    expect(() => {
      ;(
        publishedPluginConfig.nested[1] as { preserved: null | string }
      ).preserved = "snapshot mutation"
    }).toThrow(TypeError)

    const firstSnapshot = published
    config = {
      providerHost: { mode: "dsh" },
      providerPlugins: { hosted: { config: { generation: 2 } } },
    }
    publish?.(config)
    expect(snapshots).toHaveLength(2)
    expect(firstSnapshot.providerPlugins?.hosted.enabled).toBe(true)
    expect(publishedPluginConfig.nested[1]).toEqual({ preserved: null })
    await source.dispose()
  })

  test("reloads and notifies after an external atomic config replacement", async () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "maximal-config-source-"),
    )
    temporaryDirectories.push(directory)
    const configPath = path.join(directory, "config.json")
    const appDataDirectory = path.join(directory, "separate-app-data")
    fs.writeFileSync(configPath, JSON.stringify({}), "utf8")
    let reloads = 0
    const source = createProviderHostConfigSource({
      appDataDirectory,
      configPath,
      readConfig: () => readValidatedConfig(configPath),
      reloadConfig: () => {
        reloads += 1
        return readValidatedConfig(configPath)
      },
      subscribeValidatedConfig: ignoreConfigChanges,
    })
    const changed = new Promise<ReturnType<typeof source.getSnapshot>>(
      (resolve) => source.subscribe(resolve),
    )
    const replacement = path.join(directory, "editor-save-buffer")
    fs.writeFileSync(
      replacement,
      JSON.stringify({
        providerHost: { mode: "dsh", profileDirectory: "/profiles/custom" },
        providerPlugins: { hosted: { config: { token: "opaque" } } },
      }),
      "utf8",
    )
    fs.renameSync(replacement, configPath)

    const snapshot = await Promise.race([
      changed,
      Bun.sleep(2_000).then(() => {
        throw new Error("Timed out waiting for config notification")
      }),
    ])

    expect(reloads).toBe(1)
    expect(snapshot.configStatus).toEqual({ state: "ready" })
    expect(snapshot.providerHost).toEqual({
      mode: "dsh",
      profileDirectory: "/profiles/custom",
    })
    expect(snapshot.providers).toEqual({})
    expect(snapshot.providerPlugins).toEqual({
      hosted: { config: { token: "opaque" } },
    })
    await source.dispose()
  })

  test("reconciles a replacement during watcher setup", async () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "maximal-config-setup-source-"),
    )
    temporaryDirectories.push(directory)
    const configPath = path.join(directory, "config.json")
    fs.writeFileSync(configPath, "{}", "utf8")
    const replacement = path.join(directory, "editor-save-buffer")
    fs.writeFileSync(
      replacement,
      JSON.stringify({ providerHost: { mode: "dsh" } }),
      "utf8",
    )
    let reloads = 0
    const source = createProviderHostConfigSource({
      appDataDirectory: directory,
      configPath,
      readConfig: () => readValidatedConfig(configPath),
      reloadConfig: () => {
        reloads += 1
        return readValidatedConfig(configPath)
      },
      subscribeValidatedConfig() {
        fs.renameSync(replacement, configPath)
        return noop
      },
    })

    const snapshot = await waitForSnapshot(
      source,
      (candidate) => candidate.providerHost.mode === "dsh",
    )

    expect(reloads).toBe(1)
    expect(snapshot.configStatus).toEqual({ state: "ready" })
    await source.dispose()
  })
})

describe("provider host config source failure handling", () => {
  test("retains the last valid DSH snapshot across bounded reload failures and recovers", async () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "maximal-config-failure-source-"),
    )
    temporaryDirectories.push(directory)
    const configPath = path.join(directory, "config.json")
    fs.writeFileSync(configPath, "{}", "utf8")
    const stableConfig: AppConfig = {
      providerHost: { mode: "dsh" },
      providers: {
        compatible: {
          apiKey: "last-known-secret",
          baseUrl: "https://provider.example",
        },
      },
      providerPlugins: {
        hosted: { config: { nested: { generation: 1 } } },
      },
    }
    let failureReason: ConfigReloadFailureReason | undefined
    const source = createProviderHostConfigSource({
      appDataDirectory: directory,
      configPath,
      readConfig: () => stableConfig,
      reloadConfig: () => {
        if (failureReason) throw new ConfigReloadError(failureReason)
        return stableConfig
      },
      subscribeValidatedConfig: ignoreConfigChanges,
    })

    for (const reason of ["read", "parse", "validation"] as const) {
      const failed = waitForSnapshot(
        source,
        (snapshot) =>
          snapshot.configStatus.state === "error"
          && snapshot.configStatus.reason === reason,
      )
      failureReason = reason
      fs.writeFileSync(configPath, `failure-${reason}`, "utf8")
      const failedSnapshot = await failed

      expect(failedSnapshot.configStatus).toEqual({ state: "error", reason })
      expect(failedSnapshot.providerHost.mode).toBe("dsh")
      expect(failedSnapshot.providers.compatible.apiKey).toBe(
        "last-known-secret",
      )
      expect(failedSnapshot.providerPlugins).toEqual({
        hosted: { config: { nested: { generation: 1 } } },
      })
      expect(
        Object.isFrozen(failedSnapshot.providerPlugins?.hosted.config),
      ).toBe(true)
      expect(Object.keys(failedSnapshot.configStatus).sort()).toEqual([
        "reason",
        "state",
      ])

      const recovered = waitForSnapshot(
        source,
        (snapshot) => snapshot.configStatus.state === "ready",
      )
      failureReason = undefined
      fs.writeFileSync(configPath, `recovery-${reason}`, "utf8")
      expect((await recovered).configStatus).toEqual({ state: "ready" })
    }

    await source.dispose()
  })

  test("ignores unrelated writes in the config directory", async () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "maximal-config-filter-source-"),
    )
    temporaryDirectories.push(directory)
    const configPath = path.join(directory, "config.json")
    fs.writeFileSync(configPath, "{}", "utf8")
    let reloads = 0
    const source = createProviderHostConfigSource({
      appDataDirectory: directory,
      configPath,
      readConfig: () => ({}),
      reloadConfig: () => {
        reloads += 1
        return {}
      },
      subscribeValidatedConfig: ignoreConfigChanges,
    })

    fs.writeFileSync(path.join(directory, "accounts.json"), "{}", "utf8")
    fs.writeFileSync(
      path.join(directory, "copilot-api.sqlite"),
      "fixture",
      "utf8",
    )
    await Bun.sleep(100)

    expect(reloads).toBe(0)
    await source.dispose()
  })
})
