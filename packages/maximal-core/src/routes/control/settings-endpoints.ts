/**
 * The heavier /control endpoints re-homed from the deleted routes/settings/*
 * (recovered from git history): api-keys CRUD, the local-gh helper, app toggles,
 * and the diagnostics snapshot. Split out of route.ts to keep each registrar
 * under the function-length cap. Mounted by createControlRoutes.
 *
 * All logic is preserved from the originals; only the mount prefix changed
 * (/settings/api/* → /control/*) and schema-validated responses are returned
 * directly (the ControlClient validates on its side).
 */

import type { Context, Hono as HonoApp } from "hono"

import { z } from "zod"

import { preflightCopilotError } from "~/lib/auth/copilot-preflight"
import {
  addAccountToDefaultRegistry,
  makeAccountRecord,
} from "~/lib/auth/github-token-store"
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
import {
  ApiKeyCreateRequest,
  ApiKeyUpdateRequest,
  ClaudeCodeToggleRequest,
  ClaudeDesktopToggleRequest,
} from "~/lib/config/settings-types"
import { forwardError } from "~/lib/errors/error"

type GhCliModule = Pick<
  typeof import("~/lib/system/gh-cli"),
  "detectGhCli" | "getGhAccountToken"
>

export interface SettingsEndpointDeps {
  addAccountToDefaultRegistry: typeof addAccountToDefaultRegistry
  buildDiagnostics: typeof buildDiagnostics
  createApiKey: typeof createApiKey
  listApiKeys: typeof listApiKeys
  loadGhCli?: () => Promise<GhCliModule>
  makeAccountRecord: typeof makeAccountRecord
  preflightCopilotError: typeof preflightCopilotError
  removeApiKey: typeof removeApiKey
  setApiKeyEnforcement: typeof setApiKeyEnforcement
  setAppEnabled: typeof setAppEnabled
  updateApiKey: typeof updateApiKey
}

const defaultDeps: SettingsEndpointDeps = {
  addAccountToDefaultRegistry,
  buildDiagnostics,
  createApiKey,
  listApiKeys,
  makeAccountRecord,
  preflightCopilotError,
  removeApiKey,
  setApiKeyEnforcement,
  setAppEnabled,
  updateApiKey,
}

// Map malformed JSON to a primitive every request schema rejects. The value is
// never returned; it only keeps syntax failures on the route's validation path.
const malformedJson = String

const VALIDATION = {
  message:
    "Key must be 8–128 chars of letters, digits, underscore, or hyphen — or the literal '*' wildcard.",
  type: "validation_error",
} as const

const SETTINGS_ERROR_STATUS = {
  conflict: 409,
  not_found: 404,
  validation_error: 400,
} as const

async function settingsOperationError(
  c: Context,
  error: unknown,
): Promise<Response> {
  if (!(error instanceof SettingsOperationError)) return forwardError(c, error)
  return c.json(
    { error: { message: error.message, type: error.kind } },
    SETTINGS_ERROR_STATUS[error.kind],
  )
}

function registerApiKeyReads(app: HonoApp, deps: SettingsEndpointDeps): void {
  app.get("/api-keys", (c) => c.json(deps.listApiKeys()))
}

function registerApiKeyCreate(app: HonoApp, deps: SettingsEndpointDeps): void {
  app.post("/api-keys", async (c) => {
    const parsed = ApiKeyCreateRequest.safeParse(
      await c.req.json().catch(malformedJson),
    )
    if (!parsed.success) {
      return c.json(
        { error: { ...VALIDATION, message: "Invalid payload" } },
        400,
      )
    }
    try {
      return c.json(deps.createApiKey(parsed.data), 201)
    } catch (error) {
      return settingsOperationError(c, error)
    }
  })
}

/** Request-body shapes, validated rather than cast. `c.req.json()` returns
 *  `any`, and asserting a shape onto it moves an untrusted payload into the
 *  type system unchecked — see `bun run casts:check`. */
const enforceBodySchema = z.object({ enforce: z.boolean() })
const ghUseBodySchema = z.object({
  login: z.string().min(1),
  host: z.string().min(1),
})

function registerApiKeyMutations(
  app: HonoApp,
  deps: SettingsEndpointDeps,
): void {
  app.patch("/api-keys/enforce", async (c) => {
    const body = enforceBodySchema.safeParse(
      await c.req.json().catch(malformedJson),
    )
    if (!body.success) {
      return c.json(
        {
          error: {
            message: "Expected { enforce: boolean }",
            type: "validation_error",
          },
        },
        400,
      )
    }
    return c.json(deps.setApiKeyEnforcement(body.data.enforce))
  })

  app.patch("/api-keys/:id", async (c) => {
    const parsed = ApiKeyUpdateRequest.safeParse(
      await c.req.json().catch(malformedJson),
    )
    if (!parsed.success) {
      return c.json(
        { error: { ...VALIDATION, message: "Invalid payload" } },
        400,
      )
    }
    try {
      return c.json(deps.updateApiKey(c.req.param("id"), parsed.data))
    } catch (error) {
      return settingsOperationError(c, error)
    }
  })

  app.delete("/api-keys/:id", async (c) => {
    try {
      deps.removeApiKey(c.req.param("id"))
      return c.body(null, 204)
    } catch (error) {
      return settingsOperationError(c, error)
    }
  })
}

async function loadGhCli(deps: SettingsEndpointDeps): Promise<GhCliModule> {
  return deps.loadGhCli ? deps.loadGhCli() : import("~/lib/system/gh-cli")
}

function registerGh(app: HonoApp, deps: SettingsEndpointDeps): void {
  app.get("/gh/status", async (c) => {
    try {
      const { detectGhCli } = await loadGhCli(deps)
      return c.json(await detectGhCli())
    } catch (error) {
      return forwardError(c, error)
    }
  })

  app.post("/gh/use", async (c) => {
    try {
      const { detectGhCli, getGhAccountToken } = await loadGhCli(deps)
      const parsed = ghUseBodySchema.safeParse(
        await c.req.json().catch(malformedJson),
      )
      if (!parsed.success) {
        return c.json(
          { error: { message: "Expected { login, host } strings." } },
          400,
        )
      }
      const { login, host } = parsed.data
      const status = await detectGhCli()
      if (!status.accounts.some((a) => a.login === login && a.host === host)) {
        return c.json(
          { error: { message: `gh has no account ${login} on ${host}.` } },
          404,
        )
      }
      const token = await getGhAccountToken(login, host)
      if (!token) {
        return c.json(
          { error: { message: `Could not read the gh token for ${login}.` } },
          502,
        )
      }
      const preErr = await deps.preflightCopilotError(token, login)
      if (preErr) return c.json({ error: { message: preErr } }, 422)
      await deps.addAccountToDefaultRegistry(
        deps.makeAccountRecord({ login, host, token, addedVia: "gh-cli" }),
      )
      return c.json({ ok: true, login, host })
    } catch (error) {
      return forwardError(c, error)
    }
  })
}

function registerAppToggles(app: HonoApp, deps: SettingsEndpointDeps): void {
  app.post("/apps/claude-code/toggle", async (c) => {
    try {
      const parsed = ClaudeCodeToggleRequest.safeParse(
        await c.req.json().catch(malformedJson),
      )
      if (!parsed.success) {
        return c.json(
          { error: { message: "Expected { enabled: boolean }" } },
          400,
        )
      }
      return c.json(
        await deps.setAppEnabled("claude-code", parsed.data.enabled),
      )
    } catch (error) {
      return settingsOperationError(c, error)
    }
  })

  app.post("/apps/claude-desktop/toggle", async (c) => {
    try {
      const parsed = ClaudeDesktopToggleRequest.safeParse(
        await c.req.json().catch(malformedJson),
      )
      if (!parsed.success) {
        return c.json(
          { error: { message: "Expected { enabled: boolean }" } },
          400,
        )
      }
      return c.json(
        await deps.setAppEnabled("claude-desktop", parsed.data.enabled),
      )
    } catch (error) {
      return settingsOperationError(c, error)
    }
  })
}

function registerDiagnostics(app: HonoApp, deps: SettingsEndpointDeps): void {
  app.get("/diagnostics", (c) => c.json(deps.buildDiagnostics()))
}

/** Mount the recovered settings-derived endpoints on the /control router. */
export function registerSettingsEndpoints(
  app: HonoApp,
  deps: SettingsEndpointDeps = defaultDeps,
): void {
  registerApiKeyReads(app, deps)
  registerApiKeyCreate(app, deps)
  registerApiKeyMutations(app, deps)
  registerGh(app, deps)
  registerAppToggles(app, deps)
  registerDiagnostics(app, deps)
}
