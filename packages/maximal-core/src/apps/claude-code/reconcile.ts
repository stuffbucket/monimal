import consola from "consola"

import { getConfig, updateConfig } from "~/lib/config/config"

import {
  type ClaudeCodeApiKeyResolver,
  applyProxyBaseUrl,
  getClaudeCodeSettingsPath,
  resolveClaudeCodeApiKey,
  revertProxyBaseUrl,
} from "./config"

export function claudeCodeRoutingIntended(): boolean {
  return getConfig().apps?.claudeCode?.enabled === true
}

/**
 * Persist the durable routing-intent flag (`config.apps.claudeCode.enabled`)
 * that boot/shutdown reconciliation gates on. Co-located with its reader
 * (`claudeCodeRoutingIntended`) so the intent has a SINGLE owner: both the CLI
 * (`maximal app claude-code --enable/--disable`) and the Settings HTTP route
 * flow through `claudeCodeApp.enable()/disable()`, which call this — nothing
 * else writes the flag. The fresh-read transaction preserves concurrent
 * changes from another Maximal process.
 */
export function setClaudeCodeRoutingIntent(enabled: boolean): void {
  updateConfig((config) => ({
    ...config,
    apps: {
      ...config.apps,
      claudeCode: {
        ...config.apps?.claudeCode,
        enabled,
      },
    },
  }))
}

export function reconcileClaudeCodeAfterApiKeyMutation(
  intended: boolean = claudeCodeRoutingIntended(),
): void {
  if (!intended) return
  reconcileClaudeCodeOnBoot(true)
}

export function reconcileClaudeCodeOnBoot(
  intended: boolean = claudeCodeRoutingIntended(),
  filePath: string = getClaudeCodeSettingsPath(),
  resolveApiKey: ClaudeCodeApiKeyResolver = resolveClaudeCodeApiKey,
): void {
  if (!intended) return
  try {
    const result = applyProxyBaseUrl(filePath, resolveApiKey)
    if (result.wrote) {
      consola.info(
        "claude-code: re-applied proxy base URL on boot (routing intent is on)",
      )
    } else
      switch (result.skippedReason) {
        case "foreign-base-url": {
          consola.warn(
            "claude-code: routing intent is on, but a non-proxy ANTHROPIC_BASE_URL"
              + " is present — left it untouched",
          )
          return
        }
        case "foreign-api-key-helper": {
          consola.warn(
            "claude-code: routing intent is on, but a custom apiKeyHelper"
              + " is present — left it untouched",
          )
          return
        }
        case "invalid-api-key": {
          consola.warn(
            "claude-code: routing intent is on, but no API key could be resolved"
              + " — left settings untouched",
          )
          return
        }
        // No default
      }
  } catch (err) {
    consola.warn("claude-code: failed to reconcile base URL on boot", err)
  }
}

export function reconcileClaudeCodeOnShutdown(
  intended: boolean = claudeCodeRoutingIntended(),
  filePath: string = getClaudeCodeSettingsPath(),
): void {
  if (!intended) return
  try {
    const result = revertProxyBaseUrl(filePath)
    if (result.wrote) {
      consola.info(
        "claude-code: removed proxy base URL for shutdown"
          + " (routing intent persists for next boot)",
      )
    }
  } catch (err) {
    consola.warn("claude-code: failed to reconcile base URL on shutdown", err)
  }
}
