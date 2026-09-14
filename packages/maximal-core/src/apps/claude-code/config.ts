/**
 * Read / merge / write helpers for Claude Code's `~/.claude/settings.json`.
 */

import fs from "node:fs"

import {
  ensureDefaultEndpointKey,
  isOwnedApiKeyHelper,
  MANAGED_API_KEY_PREFIX,
  resolveApiKey,
} from "~/lib/auth/api-key-helper"
import { getClaudeCodeSettingsPath } from "~/lib/configurator-effects/claude-code-path"
import { atomicWriteJson } from "~/lib/platform/atomic-json"

export { getClaudeCodeSettingsPath } from "~/lib/configurator-effects/claude-code-path"

/** The label Claude Code attributes its key under (Settings → API clients).
 *  Single-sourced: it is both the `api <client>` token written on disk and the
 *  `ClientApp.apiKeyLabel` used by `maximal api claude-code`, so both resolve
 *  the same key. */
export const HELPER_LABEL = "claude-code"

export const PROXY_BASE_URL = "http://127.0.0.1:4141"

export type ClaudeCodeApiKeyResolver = () => string | null

/**
 * Resolve the literal key value Claude Code should send as
 * `ANTHROPIC_API_KEY`. Written directly into settings.json rather than via an
 * `apiKeyHelper` command: a helper is re-exec'd by Claude Code on every
 * request, so any drift in maximal's own path/binary (a move, a rebuild, a
 * renamed worktree) surfaces mid-session as an opaque failure. A static value
 * has no such runtime dependency on maximal's location.
 *
 * `ensureDefaultEndpointKey` runs first so the very first `enable()` — before
 * any key has ever been configured — still resolves to a real value instead
 * of failing with "no default endpoint API key is configured".
 */
export function resolveClaudeCodeApiKey(): string | null {
  ensureDefaultEndpointKey()
  const result = resolveApiKey(HELPER_LABEL)
  return result.ok ? result.key : null
}

/** Legacy top-level field an older maximal wrote; retained here only so apply
 *  / revert can detect and clean it up during migration to the static-key
 *  field below. Never written by current code. */
const API_KEY_HELPER_KEY = "apiKeyHelper"
const BASE_URL_KEY = "ANTHROPIC_BASE_URL"
const API_KEY_KEY = "ANTHROPIC_API_KEY"
const ENV_KEY = "env"

/** maximal-namespaced snapshot of the two fields we touch, taken on first
 *  apply so disable can restore EXACTLY what was there before — rather than
 *  blindly deleting (which would drop a value the user happened to set to the
 *  same proxy URL / our own helper string). Claude Code ignores unknown keys,
 *  and we strip this on revert. */
const PRIOR_KEY = "_maximalPrior"
/** Sentinel recording "this field was absent before we wrote it" → revert
 *  removes it (vs. an empty/real value → revert restores that value). */
const UNSET = "__UNSET__"

interface PriorSnapshot {
  [BASE_URL_KEY]: unknown
  [API_KEY_KEY]: unknown
}

function readPriorSnapshot(
  settings: Record<string, unknown>,
): PriorSnapshot | null {
  const snap = settings[PRIOR_KEY]
  if (typeof snap !== "object" || snap === null || Array.isArray(snap)) {
    return null
  }
  const s = snap as Record<string, unknown>
  // A snapshot written by an older maximal never recorded ANTHROPIC_API_KEY
  // (it only ever wrote the top-level apiKeyHelper field, never touching this
  // one) — so `key in s` is naturally false and this correctly resolves to
  // UNSET, restoring "no ANTHROPIC_API_KEY" on revert. No special-cased
  // migration logic is needed.
  return {
    [BASE_URL_KEY]: BASE_URL_KEY in s ? s[BASE_URL_KEY] : UNSET,
    [API_KEY_KEY]: API_KEY_KEY in s ? s[API_KEY_KEY] : UNSET,
  }
}

export function readClaudeCodeSettings(
  filePath: string = getClaudeCodeSettingsPath(),
): Record<string, unknown> {
  let raw: string
  try {
    raw = fs.readFileSync(filePath, "utf8")
  } catch {
    return {}
  }
  if (!raw.trim()) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed !== "object"
      || parsed === null
      || Array.isArray(parsed)
    ) {
      return {}
    }
    return parsed as Record<string, unknown>
  } catch {
    return {}
  }
}

function readEnv(settings: Record<string, unknown>): Record<string, unknown> {
  const env = settings[ENV_KEY]
  if (typeof env === "object" && env !== null && !Array.isArray(env)) {
    return env as Record<string, unknown>
  }
  return {}
}

export type BaseUrlOwnership = "ours" | "foreign" | "absent"

export function getBaseUrlOwnership(
  settings: Record<string, unknown>,
): BaseUrlOwnership {
  const env = readEnv(settings)
  if (!(BASE_URL_KEY in env)) return "absent"
  return env[BASE_URL_KEY] === PROXY_BASE_URL ? "ours" : "foreign"
}

export type ApiKeyOwnership = "ours" | "foreign" | "absent"

/** Ownership of `env.ANTHROPIC_API_KEY`. Recognized by SIGNATURE (the
 *  `mxl_` prefix every maximal-minted key carries), not by an exact value
 *  comparison — the actual key differs across installs and rotations. This
 *  never gates whether `applyProxyBaseUrl` writes (it always overwrites
 *  whatever key is present, real or otherwise, since routing requires OUR key
 *  in this field to work at all); it's used only to decide what's safe to
 *  remove when reverting without a snapshot, and to detect that we're
 *  already fully configured. A real Anthropic key never carries the `mxl_`
 *  prefix, so this can never misclassify a genuine user key as ours. */
export function getApiKeyOwnership(
  settings: Record<string, unknown>,
): ApiKeyOwnership {
  const env = readEnv(settings)
  if (!(API_KEY_KEY in env)) return "absent"
  const value = env[API_KEY_KEY]
  return typeof value === "string" && value.startsWith(MANAGED_API_KEY_PREFIX) ?
      "ours"
    : "foreign"
}

export type ApiKeyHelperOwnership = "ours" | "foreign" | "absent"

/** Ownership of the LEGACY top-level `apiKeyHelper` field. No longer written,
 *  but still checked so apply/revert can detect and clean up a field left by
 *  an older maximal version (or refuse to touch a user's own custom helper). */
export function getApiKeyHelperOwnership(
  settings: Record<string, unknown>,
): ApiKeyHelperOwnership {
  if (!(API_KEY_HELPER_KEY in settings)) return "absent"
  // Ours by SIGNATURE, not exact string: a command pointing at an older maximal
  // path — or one still carrying the legacy `--apiKeyHelper claude-code` form —
  // is recognized as ours (to heal it forward / strip it) rather than
  // misclassified as foreign.
  return isOwnedApiKeyHelper(settings[API_KEY_HELPER_KEY], HELPER_LABEL) ?
      "ours"
    : "foreign"
}

export function mergeBaseUrl(
  existing: Record<string, unknown>,
  apiKey: string,
): Record<string, unknown> {
  const currentEnv = readEnv(existing)
  const env = {
    ...currentEnv,
    [BASE_URL_KEY]: PROXY_BASE_URL,
    [API_KEY_KEY]: apiKey,
  }
  // Capture the prior values of the two fields we touch — but ONLY on the first
  // apply (when no snapshot exists yet). Re-apply / self-heal must not overwrite
  // the snapshot, or it would record OUR values as the "prior" state and disable
  // would restore the proxy URL instead of removing it. UNSET marks a field that
  // was absent so revert deletes it rather than writing the sentinel back.
  const prior =
    PRIOR_KEY in existing ?
      existing[PRIOR_KEY]
    : {
        [BASE_URL_KEY]:
          BASE_URL_KEY in currentEnv ? currentEnv[BASE_URL_KEY] : UNSET,
        [API_KEY_KEY]:
          API_KEY_KEY in currentEnv ? currentEnv[API_KEY_KEY] : UNSET,
      }
  // Heal forward: drop a legacy top-level apiKeyHelper field a prior maximal
  // version wrote. Callers only reach here once ownership has already been
  // confirmed non-foreign, so this never discards a user's own custom helper.
  const { [API_KEY_HELPER_KEY]: _droppedLegacyHelper, ...rest } = existing
  return {
    ...rest,
    [ENV_KEY]: env,
    [PRIOR_KEY]: prior,
  }
}

/** Apply a snapshotted prior value to a record under `key`: restore the value,
 *  or omit the key when the prior was UNSET (absent). Returns a new record so we
 *  avoid a dynamically-computed `delete`. */
function withRestoredField(
  target: Record<string, unknown>,
  key: string,
  prior: unknown,
): Record<string, unknown> {
  if (prior === UNSET) {
    const { [key]: _dropped, ...without } = target
    return without
  }
  return { ...target, [key]: prior }
}

export function stripBaseUrl(
  existing: Record<string, unknown>,
): Record<string, unknown> {
  const snapshot = readPriorSnapshot(existing)

  // Drop our snapshot key + the env wrapper; rebuild env below.
  const {
    [PRIOR_KEY]: _droppedPrior,
    [ENV_KEY]: _droppedEnv,
    ...rest
  } = existing
  const currentEnv = readEnv(existing)

  if (snapshot) {
    // RESTORE path: put the two fields back to exactly what was there before we
    // first applied (or remove them if they were absent). This correctly
    // handles the case where the user's own prior value happened to equal the
    // proxy URL / our key's prefix — a blind delete would have lost it. A
    // snapshot's presence means WE wrote the legacy apiKeyHelper cleanup too
    // (mergeBaseUrl always drops it going forward), so it's dropped here
    // unconditionally rather than restored — it has no captured prior value.
    let env = withRestoredField(
      currentEnv,
      BASE_URL_KEY,
      snapshot[BASE_URL_KEY],
    )
    env = withRestoredField(env, API_KEY_KEY, snapshot[API_KEY_KEY])
    const base = withRestoredField(rest, API_KEY_HELPER_KEY, UNSET)
    if (Object.keys(env).length === 0) return base
    return { ...base, [ENV_KEY]: env }
  }

  // FALLBACK (no snapshot — e.g. a config written before snapshots existed):
  // delete only the values that are ours, ownership-guarded as before.
  let env = currentEnv
  if (currentEnv[BASE_URL_KEY] === PROXY_BASE_URL) {
    env = withRestoredField(env, BASE_URL_KEY, UNSET)
  }
  if (getApiKeyOwnership(existing) === "ours") {
    env = withRestoredField(env, API_KEY_KEY, UNSET)
  }
  const base =
    getApiKeyHelperOwnership(existing) === "ours" ?
      withRestoredField(rest, API_KEY_HELPER_KEY, UNSET)
    : rest
  if (Object.keys(env).length === 0) {
    return base
  }
  return { ...base, [ENV_KEY]: env }
}

export function isProxyBaseUrlConfigured(
  filePath: string = getClaudeCodeSettingsPath(),
): boolean {
  const settings = readClaudeCodeSettings(filePath)
  return (
    getBaseUrlOwnership(settings) === "ours"
    && getApiKeyOwnership(settings) === "ours"
  )
}

export type ApiKeyHealthIssue =
  | "foreign-base-url"
  | "foreign-api-key-helper"
  | "invalid-api-key"
  | "out-of-sync"

export interface ApiKeyHealth {
  ok: boolean
  issue: ApiKeyHealthIssue | null
}

/**
 * Read-only check: is `settings.json` currently correct, or would
 * `applyProxyBaseUrl` need to write something right now? Mirrors that
 * function's ownership checks but never writes — it exists so the Settings UI
 * can surface "this needs attention" (e.g. a rotated key that hasn't been
 * re-synced since) without performing the fix itself. `getApiKeyOwnership`
 * alone can't detect this: it recognizes "ours" by the `mxl_` prefix, which
 * still matches after a rotation changes the exact value.
 */
export function checkApiKeyHealth(
  filePath: string = getClaudeCodeSettingsPath(),
  resolveKey: ClaudeCodeApiKeyResolver = resolveClaudeCodeApiKey,
): ApiKeyHealth {
  const existing = readClaudeCodeSettings(filePath)
  const baseUrlOwnership = getBaseUrlOwnership(existing)
  const legacyHelperOwnership = getApiKeyHelperOwnership(existing)

  if (baseUrlOwnership === "foreign") {
    return { ok: false, issue: "foreign-base-url" }
  }
  if (legacyHelperOwnership === "foreign") {
    return { ok: false, issue: "foreign-api-key-helper" }
  }

  const apiKey = resolveKey()
  if (apiKey === null) {
    return { ok: false, issue: "invalid-api-key" }
  }

  const currentValue = readEnv(existing)[API_KEY_KEY]
  const inSync =
    baseUrlOwnership === "ours"
    && legacyHelperOwnership === "absent"
    && currentValue === apiKey
  return inSync ?
      { ok: true, issue: null }
    : { ok: false, issue: "out-of-sync" }
}

export function writeClaudeCodeSettings(
  filePath: string,
  settings: Record<string, unknown>,
): void {
  atomicWriteJson(filePath, settings, { label: "Claude Code settings" })
}

export type SkipReason =
  | "already-ours"
  | "foreign-base-url"
  | "foreign-api-key-helper"
  | "invalid-api-key"

export interface ApplyResult {
  path: string
  wrote: boolean
  skippedReason?: SkipReason
}

export function applyProxyBaseUrl(
  filePath: string = getClaudeCodeSettingsPath(),
  resolveKey: ClaudeCodeApiKeyResolver = resolveClaudeCodeApiKey,
): ApplyResult {
  const existing = readClaudeCodeSettings(filePath)
  const baseUrlOwnership = getBaseUrlOwnership(existing)
  const legacyHelperOwnership = getApiKeyHelperOwnership(existing)

  if (baseUrlOwnership === "foreign") {
    return { path: filePath, wrote: false, skippedReason: "foreign-base-url" }
  }
  if (legacyHelperOwnership === "foreign") {
    // The user set up their own custom apiKeyHelper: leave it — and the rest
    // of this file — untouched rather than layering a static key on top of a
    // mechanism they manage themselves.
    return {
      path: filePath,
      wrote: false,
      skippedReason: "foreign-api-key-helper",
    }
  }

  // Ownership checks passed; resolve the key to write. The default resolver
  // (`resolveClaudeCodeApiKey`) guarantees a default endpoint key exists first,
  // so the very first enable (before any key has ever been configured) still
  // has something to resolve.
  const apiKey = resolveKey()
  if (apiKey === null) {
    return { path: filePath, wrote: false, skippedReason: "invalid-api-key" }
  }

  // Unlike the base URL / legacy helper, we never refuse to write over an
  // existing ANTHROPIC_API_KEY value — a real user key left in place would
  // just silently break routing (Claude Code would send it to maximal's
  // proxy instead of the real Anthropic key it needs, and the proxy needs
  // OUR key to authenticate). The prior value — real key or one of ours —
  // is snapshotted below and restored on disable either way.
  const existingKeyValue = readEnv(existing)[API_KEY_KEY]
  const alreadyCurrent =
    baseUrlOwnership === "ours"
    && legacyHelperOwnership === "absent"
    && existingKeyValue === apiKey
  if (alreadyCurrent) {
    return { path: filePath, wrote: false, skippedReason: "already-ours" }
  }

  writeClaudeCodeSettings(filePath, mergeBaseUrl(existing, apiKey))
  return { path: filePath, wrote: true }
}

export interface RevertResult {
  path: string
  wrote: boolean
  remainingKeys: Array<string>
}

export function revertProxyBaseUrl(
  filePath: string = getClaudeCodeSettingsPath(),
): RevertResult {
  const existing = readClaudeCodeSettings(filePath)
  const baseUrlOwnership = getBaseUrlOwnership(existing)
  const apiKeyOwnership = getApiKeyOwnership(existing)
  const legacyHelperOwnership = getApiKeyHelperOwnership(existing)
  if (
    baseUrlOwnership !== "ours"
    && apiKeyOwnership !== "ours"
    && legacyHelperOwnership !== "ours"
  ) {
    return {
      path: filePath,
      wrote: false,
      remainingKeys: Object.keys(existing),
    }
  }
  const stripped = stripBaseUrl(existing)
  if (Object.keys(stripped).length === 0) {
    try {
      fs.rmSync(filePath, { force: true })
    } catch {
      /* best effort */
    }
    return { path: filePath, wrote: true, remainingKeys: [] }
  }
  writeClaudeCodeSettings(filePath, stripped)
  return {
    path: filePath,
    wrote: true,
    remainingKeys: Object.keys(stripped),
  }
}
