import { randomUUID } from "node:crypto"

import type { AppEntry } from "~/lib/config/settings-types"
import type {
  ApiKeyCreateRequest as ApiKeyCreateRequestType,
  ApiKeyEntry,
  ApiKeysListResponse,
  ApiKeyUpdateRequest as ApiKeyUpdateRequestType,
  CopilotRefreshStatus,
  DiagnosticsResponse,
} from "~/lib/config/settings-types"

import { getApp } from "~/apps/registry"
import { describeExecutor } from "~/debug"
import { generateApiKeyValue } from "~/lib/auth/api-key-helper"
import {
  copilotBaseUrl,
  getCopilotTokenUrl,
  getEnterpriseDomain,
  getGitHubApiBaseUrl,
} from "~/lib/config/api-config"
import { getConfig, writeConfig } from "~/lib/config/config"
import { API_KEY_VALUE_PATTERN } from "~/lib/config/config-schema"
import { describeLaunchSource } from "~/lib/platform/cli-path"
import {
  copilotRefreshHealth,
  copilotTokenHealth,
  modelsCached,
  state,
  tokenPresence,
} from "~/lib/runtime-state/state"
import { BUILD_VERSION } from "~/lib/update/build-info"
import { getGitVersion, shortSha } from "~/lib/update/version"

export type SettingsOperationErrorKind =
  | "conflict"
  | "not_found"
  | "validation_error"

export class SettingsOperationError extends Error {
  readonly kind: SettingsOperationErrorKind

  constructor(message: string, kind: SettingsOperationErrorKind) {
    super(message)
    this.name = "SettingsOperationError"
    this.kind = kind
  }
}

export function listApiKeys(): ApiKeysListResponse {
  const config = getConfig()
  return {
    entries: config.auth?.apiKeyEntries ?? [],
    enforcing: config.auth?.enforce === true,
  }
}

function persistApiKeyEntries(entries: Array<ApiKeyEntry>): void {
  const config = getConfig()
  writeConfig({ ...config, auth: { ...config.auth, apiKeyEntries: entries } })
}

function validApiKey(candidate: string): string {
  const key = candidate.trim()
  if (!API_KEY_VALUE_PATTERN.test(key)) {
    throw new SettingsOperationError(
      "Key must be 8–128 chars of letters, digits, underscore, or hyphen — or the literal '*' wildcard.",
      "validation_error",
    )
  }
  return key
}

export function createApiKey(input: ApiKeyCreateRequestType): ApiKeyEntry {
  const key = validApiKey(input.key ?? generateApiKeyValue())
  const existing = getConfig().auth?.apiKeyEntries ?? []
  if (existing.some((entry) => entry.key === key)) {
    throw new SettingsOperationError("Key already exists", "conflict")
  }
  const entry: ApiKeyEntry = {
    id: randomUUID(),
    label: input.label.trim(),
    key,
    enabled: input.enabled ?? true,
    created_at: new Date().toISOString(),
  }
  persistApiKeyEntries([...existing, entry])
  return entry
}

export function updateApiKey(
  id: string,
  input: ApiKeyUpdateRequestType,
): ApiKeyEntry {
  const entries = listApiKeys().entries
  const index = entries.findIndex((entry) => entry.id === id)
  if (index === -1) {
    throw new SettingsOperationError("API key not found", "not_found")
  }
  const current = entries[index]
  const key = input.key === undefined ? current.key : validApiKey(input.key)
  if (
    entries.some(
      (entry, entryIndex) => entryIndex !== index && entry.key === key,
    )
  ) {
    throw new SettingsOperationError("Key already exists", "conflict")
  }
  const updated: ApiKeyEntry = {
    ...current,
    label: input.label?.trim() ?? current.label,
    key,
    enabled: input.enabled ?? current.enabled,
  }
  const next = [...entries]
  next[index] = updated
  persistApiKeyEntries(next)
  return updated
}

export function removeApiKey(id: string): void {
  const entries = listApiKeys().entries
  const next = entries.filter((entry) => entry.id !== id)
  if (next.length === entries.length) {
    throw new SettingsOperationError("API key not found", "not_found")
  }
  persistApiKeyEntries(next)
}

export function setApiKeyEnforcement(enforcing: boolean): ApiKeysListResponse {
  const config = getConfig()
  writeConfig({ ...config, auth: { ...config.auth, enforce: enforcing } })
  return listApiKeys()
}

interface AppOperationDependencies {
  getApp: typeof getApp
  getConfig: typeof getConfig
  writeConfig: typeof writeConfig
}

const appOperationDependencies: AppOperationDependencies = {
  getApp,
  getConfig,
  writeConfig,
}

export async function setAppEnabled(
  appId: AppEntry["id"],
  enabled: boolean,
  dependencies: AppOperationDependencies = appOperationDependencies,
): Promise<AppEntry> {
  const app = dependencies.getApp(appId)
  if (!app || app.kind === "coming-soon") {
    throw new SettingsOperationError(
      "App cannot be configured",
      "validation_error",
    )
  }
  if (enabled && !(await app.detect())) {
    throw new SettingsOperationError(
      `No ${app.name} install detected.`,
      "conflict",
    )
  }
  let conflict: AppEntry["conflict"] = null
  if (enabled) {
    const result = await app.enable()
    conflict = result.conflict ?? null
  } else {
    await app.disable()
  }
  if (appId === "claude-desktop") {
    const config = dependencies.getConfig()
    dependencies.writeConfig({
      ...config,
      apps: {
        ...config.apps,
        claudeDesktop: {
          ...config.apps?.claudeDesktop,
          enabled,
        },
      },
    })
  }
  return app.getDetails(conflict)
}

const isoOrNull = (ms: number | null | undefined): string | null =>
  ms === null || ms === undefined ? null : new Date(ms).toISOString()

function buildCopilotRefreshStatus(): CopilotRefreshStatus {
  const health = copilotRefreshHealth()
  return {
    health: copilotTokenHealth(),
    token_expires_at: isoOrNull(state.copilotTokenExpiresAtMs),
    last_success_at: isoOrNull(health.lastSuccessAtMs),
    last_failure_at: isoOrNull(health.lastFailureAtMs),
    last_failure_reason: health.lastFailureReason,
    consecutive_failures: health.consecutiveFailures,
  }
}

export function buildDiagnostics(): DiagnosticsResponse {
  const git = getGitVersion()
  const launch = describeLaunchSource()
  const tokens = tokenPresence()
  const executor = describeExecutor()
  return {
    version: BUILD_VERSION,
    source_revision: git.sha ? shortSha(git.sha) : null,
    source_branch: git.branch ?? null,
    launch_path: launch.path,
    launch_kind: launch.kind,
    pid: process.pid,
    uptime_ms: Math.round(process.uptime() * 1000),
    account_type: state.accountType,
    models_cached: modelsCached(),
    tokens: {
      github_token_present: tokens.github,
      copilot_token_present: tokens.copilot,
    },
    copilot_refresh: buildCopilotRefreshStatus(),
    rate_limit: {
      interval_seconds: state.rateLimitSeconds ?? null,
      last_request_at:
        state.lastRequestTimestamp ?
          new Date(state.lastRequestTimestamp).toISOString()
        : null,
      wait_when_throttled: state.rateLimitWait,
    },
    web_search: {
      kind: executor.web_tools,
      detail: executor.base ?? executor.notes ?? null,
    },
    copilot_service: {
      upstream_host: copilotBaseUrl(state),
      github_api_base_url: getGitHubApiBaseUrl(),
      token_endpoint: getCopilotTokenUrl(),
      enterprise_domain: getEnterpriseDomain(),
      discovered_upstream: state.copilotApiUrl ?? null,
    },
  }
}
