import consola from "consola"
import fs from "node:fs"
import path from "node:path"

import type {
  ProviderCompatibilityConfig,
  ProviderHostConfigFailureReason,
  ProviderHostConfigSnapshot,
  ProviderHostConfigSource,
} from "~/lib/provider-host-types"

import {
  type AppConfig,
  ConfigReloadError,
  getConfig,
  reloadConfigFromDisk,
  subscribeConfig,
} from "~/lib/config/config"
import { PATHS } from "~/lib/platform/paths"

/** @internal Test seams for the Core-owned watcher. */
export interface CreateProviderHostConfigSourceOptions {
  appDataDirectory?: string
  configPath?: string
  readConfig?: () => AppConfig
  reloadConfig?: () => AppConfig
  subscribeValidatedConfig?: (
    listener: (config: AppConfig) => void,
  ) => () => void
  watchExternalWrites?: boolean
}

const deepFreeze = <T>(value: T): T => {
  if (value === null || typeof value !== "object") return value
  for (const nested of Object.values(value)) deepFreeze(nested)
  return Object.freeze(value)
}

const isolatedSnapshotValue = <T>(value: T): T =>
  deepFreeze(structuredClone(value))

const readonlyProvidersFor = (
  config: AppConfig,
): Readonly<Record<string, ProviderCompatibilityConfig>> =>
  isolatedSnapshotValue(config.providers ?? {})

const snapshotFor = (
  config: AppConfig,
  appDataDirectory: string,
): ProviderHostConfigSnapshot =>
  Object.freeze({
    appDataDirectory,
    defaultProfileDirectory: path.join(appDataDirectory, "provider-host"),
    configStatus: Object.freeze({ state: "ready" as const }),
    providerHost: Object.freeze({
      mode: config.providerHost?.mode ?? "legacy",
      profileDirectory: config.providerHost?.profileDirectory,
    }),
    providers: readonlyProvidersFor(config),
    providerPlugins:
      config.providerPlugins === undefined ?
        undefined
      : isolatedSnapshotValue(config.providerPlugins),
  })

const failureReasonFor = (error: unknown): ProviderHostConfigFailureReason =>
  error instanceof ConfigReloadError ? error.reason : "unknown"

const fileIdentity = (filePath: string): string | undefined => {
  try {
    const stats = fs.statSync(filePath)
    return [
      stats.dev,
      stats.ino,
      stats.size,
      stats.mtimeMs,
      stats.ctimeMs,
    ].join(":")
  } catch {
    return undefined
  }
}

/**
 * A narrow validated view over Core-owned config. It observes both `writeConfig`
 * and external atomic replacements of config.json without exposing parsing or
 * cache mutation to the embedding host.
 */
export function createProviderHostConfigSource(
  options: CreateProviderHostConfigSourceOptions = {},
): ProviderHostConfigSource {
  const appDataDirectory = options.appDataDirectory ?? PATHS.APP_DIR
  const configPath = options.configPath ?? PATHS.CONFIG_PATH
  const configDirectory = path.dirname(configPath)
  const configFilename = path.basename(configPath)
  const readConfig = options.readConfig ?? getConfig
  const reloadConfig = options.reloadConfig ?? reloadConfigFromDisk
  const subscribeValidatedConfig =
    options.subscribeValidatedConfig ?? subscribeConfig
  const listeners = new Set<(snapshot: ProviderHostConfigSnapshot) => void>()
  // Capture before the initial read so the post-watch comparison also closes the
  // otherwise unobservable read-to-watch setup gap.
  let observedConfigIdentity = fileIdentity(configPath)
  let snapshot = snapshotFor(readConfig(), appDataDirectory)
  let fingerprint = JSON.stringify(snapshot)
  let disposed = false
  let reloadTimer: ReturnType<typeof setTimeout> | undefined

  const publish = (next: ProviderHostConfigSnapshot): void => {
    if (disposed) return
    const nextFingerprint = JSON.stringify(next)
    if (nextFingerprint === fingerprint) return
    snapshot = next
    fingerprint = nextFingerprint
    for (const listener of listeners) listener(snapshot)
  }

  const update = (config: AppConfig): void => {
    publish(snapshotFor(config, appDataDirectory))
  }

  const publishReloadFailure = (error: unknown): void => {
    const reason = failureReasonFor(error)
    consola.error(
      `Failed to reload externally changed config (${reason}); retaining last validated config`,
    )
    publish(
      Object.freeze({
        ...snapshot,
        configStatus: Object.freeze({ state: "error" as const, reason }),
      }),
    )
  }

  const scheduleReload = (): void => {
    if (reloadTimer) clearTimeout(reloadTimer)
    reloadTimer = setTimeout(() => {
      reloadTimer = undefined
      try {
        update(reloadConfig())
      } catch (error) {
        publishReloadFailure(error)
      }
    }, 25)
    reloadTimer.unref()
  }

  const refreshObservedConfigIdentity = (): boolean => {
    const nextIdentity = fileIdentity(configPath)
    if (nextIdentity === observedConfigIdentity) return false
    observedConfigIdentity = nextIdentity
    return true
  }

  const unsubscribeConfig = subscribeValidatedConfig(update)
  let watcher: fs.FSWatcher | undefined
  if (options.watchExternalWrites !== false) {
    try {
      watcher = fs.watch(configDirectory, (_eventType, filename) => {
        // Bun/Linux reports an atomic sibling rename by its source name only.
        // Stat the target to distinguish that from a genuinely unrelated write.
        const changedConfig = refreshObservedConfigIdentity()
        if (
          filename !== null
          && filename !== configFilename
          && !changedConfig
        ) {
          return
        }
        scheduleReload()
      })
      watcher.unref()
      if (refreshObservedConfigIdentity()) scheduleReload()
    } catch (error) {
      consola.warn("Could not watch config for external changes", error)
    }
  }

  return {
    getSnapshot() {
      return snapshot
    },

    subscribe(listener) {
      if (disposed) return () => undefined
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    dispose() {
      if (disposed) return Promise.resolve()
      disposed = true
      unsubscribeConfig()
      watcher?.close()
      if (reloadTimer) clearTimeout(reloadTimer)
      listeners.clear()
      return Promise.resolve()
    },
  }
}
