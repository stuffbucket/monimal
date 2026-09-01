import type { ProviderGateway } from "@stuffbucket/maximal-provider-contract"
import type { MiddlewareHandler } from "hono"

import consola from "consola"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { logger } from "hono/logger"

import type { AppConfig } from "~/lib/config/config"
import type {
  ProviderGatewayFactory,
  ProviderHostConfigSource,
} from "~/lib/provider-host-types"
import type { ProviderDispatcher } from "~/services/providers/provider-dispatcher"

import {
  buildCorsOptions,
  createOriginGuardMiddleware,
} from "./lib/auth/origin-guard"
import {
  createAuthMiddleware,
  requireGithubAuth,
} from "./lib/auth/request-auth"
import { traceIdMiddleware } from "./lib/http/trace"
import { staleRefreshMiddleware } from "./lib/models/refresh-models"
import { cacheModels } from "./lib/platform/utils"
import { getModelsLoadedAtMs, state } from "./lib/runtime-state/state"
import { buildStatus } from "./lib/runtime-state/status"
import { BUILD_VERSION } from "./lib/update/build-info"
import { requireSupportedBuild } from "./lib/update/version-gate"
import { completionRoutes } from "./routes/chat-completions/route"
import { controlRoutes } from "./routes/control/route"
import { debugRoutes } from "./routes/debug/route"
import { embeddingRoutes } from "./routes/embeddings/route"
import { createInternalRoutes } from "./routes/internal/route"
import { messageRoutes } from "./routes/messages/route"
import { modelRoutes } from "./routes/models/route"
import { productApiRoutes } from "./routes/product-api"
import { createProviderMessageRoutes } from "./routes/provider/messages/route"
import { createProviderModelRoutes } from "./routes/provider/models/route"
import { responsesRoutes } from "./routes/responses/route"
import { tokenUsageRoute } from "./routes/token-usage/route"
import { usageRoute } from "./routes/usage/route"
import { createProviderDispatcher } from "./services/providers/provider-dispatcher"

/**
 * The two listeners (maximal-core#10).
 *
 * Third-party tools hardcode `http://127.0.0.1:4141/v1`, so the data plane needs
 * a well-known port. The control plane — auth, config, models, live events — is
 * sensitive and should not sit anywhere guessable. One listener cannot satisfy
 * both, so they are separated at the port level: `publicApp` on 4141 (with a
 * prefer-then-fall-back policy), `controlApp` on an ephemeral port the
 * supervisor learns from the ready-line.
 *
 * Separation is **structural, not a path filter**. `/v1` is never mounted on the
 * control app, so it cannot be reached there by any request-shaping trick — the
 * property the issue asks for is a fact about the route table rather than a
 * check somebody could regress.
 */
/** Captured at module load — anchors the `/status` uptime to "when the
 *  server module first ran," which is what callers mean by "how long has
 *  Maximal been up." */
const SERVER_START_MS = Date.now()

// Control-surface hardening (§6, ADR-0021). Read lazily per request —
// `runServer` sets the resolved ports before binding, and in-memory tests fall
// back to the 4141 default.
//
// Keyed on the CONTROL port on BOTH listeners, deliberately: the only browser
// page that has any business driving a guarded prefix is one served from the
// control origin, so that is what "us" means here. It is not the case that every
// CSRF_GUARDED_PREFIX lives on the control listener — `/_internal` is mounted on
// `publicApp` (see the `/_internal` comment below) — which makes this stricter
// than a per-listener key, not looser: a page served from the public port is not
// an allowed origin either, and gets a 403 on `/_internal/shutdown`.
const controlPort = (): number => state.controlPort

/**
 * Middleware every listener shares, applied identically to both.
 *
 * One applier rather than two stacks: the alternative is two copies that drift,
 * and a drifted auth or origin stack is a security bug rather than a cosmetic
 * one. Paths that do not exist on a given app simply 404 after passing through,
 * so listing all of them here is harmless.
 */
function applyCommonMiddleware(app: Hono): void {
  app.use(traceIdMiddleware)
  // Stamp the proxy build version on every response so downstream clients
  // can read which Maximal build served their request without hitting a
  // separate endpoint. Value is a static build constant — no per-request cost,
  // no secrets. Set before next() so it applies to c.res on the way out.
  app.use(async (c, next) => {
    c.header("x-maximal-version", BUILD_VERSION)
    await next()
  })
  app.use(logger())
  // CORS narrowed from `*` to a localhost allowlist. The OPTIONS preflight is the
  // load-bearing case (auth bypasses OPTIONS), so a `*` here would let any origin
  // preflight-probe the control surface.
  app.use(cors(buildCorsOptions(controlPort)))
  // Reject any present, non-localhost `Origin` on the control prefixes.
  // A missing Origin passes (the CLI/plugin/SDK invariant, §6.6). Mounted before
  // auth so a cross-origin browser request is refused regardless of any key.
  app.use(createOriginGuardMiddleware({ boundPort: controlPort }))
  app.use(
    "*",
    createAuthMiddleware({
      allowUnauthenticatedPaths: [
        "/",
        "/status",
        "/_debug/state",
        "/setup-status",
        // The product-API OpenAPI document is a public spec (no secrets),
        // served alongside the fresh-install `/setup-status` surface.
        "/openapi.json",
      ],
      // The /control/* surface is for a same-machine UI. It's exempt from the
      // API-key dance; the control router enforces loopback itself (a remote
      // caller gets 404) and the Origin guard 403s cross-origin browser requests.
      allowUnauthenticatedPrefixes: ["/control"],
      // Loopback callers on the same machine skip the API-key dance for these
      // local-only endpoints; remote callers still need a valid API key.
      loopbackOnlyPaths: [
        "/usage",
        "/token-usage",
        "/token-usage/events",
        // Graceful eviction: a second `maximal start --replace` POSTs here to ask
        // the running instance to release the port. The route handler *also*
        // enforces loopback (a remote caller with a valid API key must NOT be
        // able to evict the running instance); listing it here just skips the
        // auth dance for the local caller.
        "/_internal/shutdown",
      ],
    }),
  )

  // L1a model-cache lazy refresh. Runs after auth so unauthenticated
  // probes ("/", "/usage-viewer") don't count as activity. Fire-and-
  // forget; the triggering request continues with the slightly stale
  // cache. See docs/spec/model-protocol-strategy.md.
  app.use(
    "*",
    staleRefreshMiddleware({
      getLoadedAtMs: getModelsLoadedAtMs,
      refresh: cacheModels,
      onError: (err) =>
        consola.warn(
          "Background models refresh failed; keeping stale cache",
          err,
        ),
    }),
  )
}

export interface CreateServerAppsOptions {
  createProviderGateway?: ProviderGatewayFactory
  providerConfigSource?: ProviderHostConfigSource
  providerGateway?: ProviderGateway
  readConfig?: () => AppConfig
  requestShutdown?: (reason: string) => void
}

export interface ServerApps {
  controlApp: Hono
  providerDispatcher: ProviderDispatcher
  publicApp: Hono
}

/** Build isolated listeners around an explicitly injected provider boundary. */
export function createServerApps(
  options: CreateServerAppsOptions = {},
): ServerApps {
  const publicApp = new Hono()
  const controlApp = new Hono()
  const providerDispatcher = createProviderDispatcher({
    configSource: options.providerConfigSource,
    gateway: options.providerGateway,
    gatewayFactory: options.createProviderGateway,
    readConfig: options.readConfig,
  })

  applyCommonMiddleware(publicApp)
  applyCommonMiddleware(controlApp)

  // ── Control listener ──────────────────────────────────────────────────────
  controlApp.route("/control", controlRoutes)
  controlApp.route("/_debug", debugRoutes)

  // ── Public listener ───────────────────────────────────────────────────────
  publicApp.get("/", (c) => c.text("Server running"))
  publicApp.get("/status", (c) => c.json(buildStatus(SERVER_START_MS)))
  publicApp.route(
    "/_internal",
    createInternalRoutes({ requestShutdown: options.requestShutdown }),
  )
  publicApp.route("/", productApiRoutes)

  /** Every provider mode keeps the common build floor. GitHub authentication is
   * mode-dependent and is delegated to the dispatcher so no middleware or route
   * has to know the rollout values. */
  publicApp.use("/:provider/v1/*", requireSupportedBuild)
  const requireConfiguredProviderAuth: MiddlewareHandler = async (c, next) => {
    if (providerDispatcher.requiresGithubAuth()) {
      return await requireGithubAuth(c, next)
    }
    await next()
  }
  publicApp.use("/:provider/v1/*", requireConfiguredProviderAuth)

  const githubUpstreamRoutes = [
    "/chat/completions",
    "/chat/completions/*",
    "/models",
    "/models/*",
    "/embeddings",
    "/embeddings/*",
    "/responses",
    "/responses/*",
    "/v1/*",
  ]

  for (const path of githubUpstreamRoutes) {
    publicApp.use(path, requireSupportedBuild)
    publicApp.use(path, requireGithubAuth)
  }

  publicApp.route("/chat/completions", completionRoutes)
  publicApp.route("/models", modelRoutes)
  publicApp.route("/embeddings", embeddingRoutes)
  publicApp.route("/usage", usageRoute)
  publicApp.route("/token-usage", tokenUsageRoute)
  publicApp.route("/responses", responsesRoutes)

  // Compatibility with tools that expect v1/ prefix
  publicApp.route("/v1/chat/completions", completionRoutes)
  publicApp.route("/v1/models", modelRoutes)
  publicApp.route("/v1/embeddings", embeddingRoutes)
  publicApp.route("/v1/responses", responsesRoutes)

  // Anthropic compatible endpoints
  publicApp.route("/v1/messages", messageRoutes)

  // Provider scoped Anthropic-compatible endpoints
  publicApp.route(
    "/:provider/v1/messages",
    createProviderMessageRoutes(providerDispatcher),
  )
  publicApp.route(
    "/:provider/v1/models",
    createProviderModelRoutes(providerDispatcher),
  )

  return { controlApp, providerDispatcher, publicApp }
}

// Backward-compatible standalone apps. No gateway is captured at import time;
// standalone invocation therefore remains on the legacy path by default.
const defaultApps = createServerApps()
/** @internal Legacy standalone public app. */
export const publicApp = defaultApps.publicApp
/** @internal Legacy standalone control app. */
export const controlApp = defaultApps.controlApp
