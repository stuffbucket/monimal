import type { AppEntry } from "~/lib/config/settings-types"

import { ensureDefaultEndpointKey } from "~/lib/auth/api-key-helper"

import type { AppUninstallResult, ClientApp } from "../index"

import {
  type ApiKeyHelperResolver,
  isProxyBaseUrlConfigured,
  applyProxyBaseUrl,
  revertProxyBaseUrl,
  getClaudeCodeSettingsPath,
  HELPER_LABEL,
  resolveApiKeyHelperCommand,
} from "./config"
import { detectClaudeInstalls } from "./detect"
import {
  reconcileClaudeCodeOnBoot,
  reconcileClaudeCodeOnShutdown,
  setClaudeCodeRoutingIntent,
} from "./reconcile"

const CLAUDE_CODE_INSTALL_COMMAND =
  "curl -fsSL https://claude.ai/install.sh | sh"

export interface ClaudeCodeAppOptions {
  resolveApiKeyHelper?: ApiKeyHelperResolver
}

export function createClaudeCodeApp(
  options: ClaudeCodeAppOptions = {},
): ClientApp {
  const resolveApiKeyHelper =
    options.resolveApiKeyHelper ?? resolveApiKeyHelperCommand

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
      })
    },

    enable() {
      const result = applyProxyBaseUrl(undefined, resolveApiKeyHelper)
      const conflict =
        (
          result.skippedReason === "foreign-base-url"
          || result.skippedReason === "foreign-api-key-helper"
          || result.skippedReason === "invalid-api-key-helper"
        ) ?
          result.skippedReason
        : null
      if (conflict !== null) {
        return Promise.resolve({ success: false, conflict })
      }

      // Persist the durable routing intent so boot/shutdown self-heal runs for
      // all callers (CLI + Settings UI), not just the HTTP path.
      setClaudeCodeRoutingIntent(true)
      // The settings write succeeded (or was already current), so it is now safe
      // to guarantee the helper can resolve a key.
      ensureDefaultEndpointKey()
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
      reconcileClaudeCodeOnBoot(undefined, undefined, resolveApiKeyHelper)
      return Promise.resolve()
    },

    onShutdown() {
      reconcileClaudeCodeOnShutdown()
      return Promise.resolve()
    },
  }
}

export const claudeCodeApp = createClaudeCodeApp()
