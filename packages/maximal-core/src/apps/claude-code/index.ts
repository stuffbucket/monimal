import type { AppEntry } from "~/lib/config/settings-types"

import type { AppUninstallResult, ClientApp } from "../index"

import {
  type ClaudeCodeApiKeyResolver,
  checkApiKeyHealth,
  isProxyBaseUrlConfigured,
  applyProxyBaseUrl,
  revertProxyBaseUrl,
  getClaudeCodeSettingsPath,
  HELPER_LABEL,
  resolveClaudeCodeApiKey,
} from "./config"
import { detectClaudeInstalls } from "./detect"
import {
  claudeCodeRoutingIntended,
  reconcileClaudeCodeOnBoot,
  reconcileClaudeCodeOnShutdown,
  setClaudeCodeRoutingIntent,
} from "./reconcile"

const CLAUDE_CODE_INSTALL_COMMAND =
  "curl -fsSL https://claude.ai/install.sh | sh"

export interface ClaudeCodeAppOptions {
  resolveApiKey?: ClaudeCodeApiKeyResolver
}

export function createClaudeCodeApp(
  options: ClaudeCodeAppOptions = {},
): ClientApp {
  const resolveApiKey = options.resolveApiKey ?? resolveClaudeCodeApiKey

  return {
    id: "claude-code",
    name: "Claude Code",
    kind: "config",
    apiKeyLabel: HELPER_LABEL,

    detect() {
      const installs = detectClaudeInstalls()
      return Promise.resolve(installs.length > 0)
    },

    getDetails(conflict: AppEntry["conflict"] = null): Promise<AppEntry> {
      const installs = detectClaudeInstalls()
      // Only meaningful while routing is intended: if the user turned it off,
      // there is nothing to have drifted out of sync.
      const health =
        claudeCodeRoutingIntended() ?
          checkApiKeyHealth(undefined, resolveApiKey)
        : { ok: true, issue: null }
      return Promise.resolve({
        id: "claude-code",
        name: "Claude Code",
        kind: "config",
        enabled: isProxyBaseUrlConfigured(),
        status: installs.length > 0 ? "ready" : "not-installed",
        installs: installs.map((i) => ({
          path: i.path,
          version: i.version,
          source: i.source,
        })),
        install:
          installs.length === 0 ?
            { method: "curl", command: CLAUDE_CODE_INSTALL_COMMAND }
          : null,
        conflict,
        health,
      })
    },

    enable() {
      const result = applyProxyBaseUrl(undefined, resolveApiKey)
      const conflict =
        (
          result.skippedReason === "foreign-base-url"
          || result.skippedReason === "foreign-api-key-helper"
          || result.skippedReason === "invalid-api-key"
        ) ?
          result.skippedReason
        : null
      if (conflict !== null) {
        return Promise.resolve({ success: false, conflict })
      }

      // Persist the durable routing intent so boot/shutdown self-heal runs for
      // all callers (CLI + Settings UI), not just the HTTP path.
      setClaudeCodeRoutingIntent(true)
      return Promise.resolve({ success: true, conflict: null })
    },

    disable() {
      const result = revertProxyBaseUrl()
      setClaudeCodeRoutingIntent(false)
      return Promise.resolve({ success: result.wrote })
    },

    uninstall(): Promise<AppUninstallResult> {
      // Ownership-guarded: removes only the ANTHROPIC_BASE_URL block we wrote,
      // no-op when absent or foreign. Anything maximal wrote outside an app's
      // own config is the uninstaller's business, not this contract's.
      const reverted: Array<string> = []
      const result = revertProxyBaseUrl()
      if (result.wrote) {
        reverted.push(`reverted ${getClaudeCodeSettingsPath()}`)
      }
      return Promise.resolve({ reverted })
    },

    isEnabled() {
      return isProxyBaseUrlConfigured()
    },

    onBoot() {
      reconcileClaudeCodeOnBoot(undefined, undefined, resolveApiKey)
      return Promise.resolve()
    },

    onShutdown() {
      reconcileClaudeCodeOnShutdown()
      return Promise.resolve()
    },
  }
}

export const claudeCodeApp = createClaudeCodeApp()
