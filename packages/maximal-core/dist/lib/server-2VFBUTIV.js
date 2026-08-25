import {
  getAllApps,
  getApp
} from "./chunk-BFCASIWE.js";
import {
  activateAccountLive,
  preflightCopilotError
} from "./chunk-46RLBQDX.js";
import "./chunk-SMHXZYWZ.js";
import {
  getCopilotUsage
} from "./chunk-OHHBYIL4.js";
import {
  createAuthMiddleware,
  defaultGetRequestIp,
  generateApiKeyValue,
  isLoopbackAddress,
  listActiveClients,
  requireGithubAuth
} from "./chunk-LIOSYQNE.js";
import {
  ANTHROPIC_API_VERSION
} from "./chunk-TVYI7M5Y.js";
import {
  buildCopilotHeaders,
  buildResponsesFilters,
  collectSecretStatuses,
  createResponses,
  describeExecutor,
  finishUpstreamResponse,
  requireCopilotToken,
  selectExecutor,
  shouldUseMessagesApi,
  shouldUseResponsesApi,
  summarizeConfig
} from "./chunk-VTIG25X4.js";
import {
  resolveModelProfile
} from "./chunk-5T53LY3F.js";
import {
  createCopilotTokenUsageRecorder,
  createProviderTokenUsageRecorder,
  getGitVersion,
  getTokenUsageEventsPage,
  getTokenUsageSeries,
  getTokenUsageSummary,
  mergeAnthropicUsage,
  normalizeAnthropicUsage,
  normalizeOpenAIUsage,
  normalizeResponsesUsage,
  onTokenUsageRecorded,
  shortSha,
  withCopilotCost
} from "./chunk-GMUJZD4A.js";
import {
  COMPACT_AUTO_CONTINUE,
  COMPACT_REQUEST,
  HTTPError,
  UPDATE_MANIFEST_TIMEOUT_MS,
  addAccountToDefaultRegistry,
  cacheModels,
  cancelDeviceFlow,
  compactAutoContinuePromptStarts,
  compactMessageSections,
  compactSummaryPromptStart,
  compactSystemPromptStarts,
  compactTextOnlyGuard,
  copilotBaseUrl,
  copilotHeaders,
  createHandlerLogger,
  createTeeLogger,
  debugJson,
  debugJsonTail,
  debugLazy,
  forwardError,
  forwardId,
  generateRequestIdFromPayload,
  getActiveRecord,
  getAuthStatus,
  getCopilotTokenUrl,
  getEnterpriseDomain,
  getGitHubApiBaseUrl,
  getRootSessionId,
  getUUID,
  isNullish,
  isVariantId,
  listAccounts,
  makeAccountRecord,
  parseUserIdMetadata,
  pickCopilotVariantId,
  prepareMessageProxyHeaders,
  readDefaultRegistry,
  readGitHubTokenRecord,
  readRegistry,
  rearmCopilotAuth,
  registryPathFor,
  removeAccount,
  requestContext,
  resolveTraceId,
  reverseId,
  sendProviderRequest,
  sendRequest,
  sendRequestJson,
  signOut,
  sleep,
  startDeviceFlow,
  writeDefaultRegistry
} from "./chunk-UQM4JUWE.js";
import {
  API_KEY_VALUE_PATTERN,
  AppConfigSchema,
  PATHS,
  allCacheMetrics,
  copilotRefreshHealth,
  copilotTokenHealth,
  getAnthropicApiKey,
  getClaudeTokenMultiplier,
  getConfig,
  getExtraPromptForModel,
  getModelsLoadedAtMs,
  getPromptCacheRetention,
  getProviderConfig,
  getReasoningEffortForModel,
  hasCopilotToken,
  hasGithubToken,
  isResponsesApiContextManagementModel,
  isResponsesApiWebSearchEnabled,
  isUpdateCheckEnabled,
  isVersionFloorEnforced,
  modelsCached,
  settingsEventBus,
  state,
  tokenPresence,
  writeConfig
} from "./chunk-4JX7327A.js";
import {
  CONTROL_PROTOCOL_VERSION,
  PROTOCOL_VERSION_HEADER,
  SUPPORTED_PROTOCOL_VERSION,
  serializeFrame
} from "./chunk-IFWVZ24P.js";
import {
  JSON_RPC_INTERNAL_ERROR,
  JSON_RPC_INVALID_PARAMS,
  JSON_RPC_INVALID_REQUEST,
  JSON_RPC_METHOD_NOT_FOUND,
  JSON_RPC_PARSE_ERROR,
  codeForReason,
  errorResponse,
  jsonRpcRequestSchema,
  successResponse
} from "./chunk-DIMMVYEQ.js";
import {
  emitQuitRequest,
  emitUpdateRequest
} from "./chunk-7GPE5USJ.js";
import {
  ApiKeyCreateRequest,
  ApiKeyUpdateRequest,
  ClaudeCodeToggleRequest,
  ClaudeDesktopToggleRequest
} from "./chunk-4CKHFAZY.js";
import "./chunk-KCUNSZQQ.js";
import {
  BUILD_CHANNEL,
  BUILD_VERSION
} from "./chunk-CXWZH3X6.js";

// src/server.ts
import consola10 from "consola";
import { Hono as Hono13 } from "hono";
import { cors } from "hono/cors";
import { logger as logger7 } from "hono/logger";

// src/lib/auth/origin-guard.ts
var CSRF_GUARDED_PREFIXES = [
  "/settings/api",
  "/_internal",
  "/_debug/state",
  "/control"
];
var LOCALHOST_HOSTNAMES = /* @__PURE__ */ new Set([
  "localhost",
  "127.0.0.1",
  "[::1]"
  // URL.hostname brackets IPv6 literals
]);
function pathMatchesPrefix(path2, prefix) {
  return path2 === prefix || path2.startsWith(prefix + "/");
}
function isAllowedOrigin(origin, boundPort) {
  if (origin === null) return true;
  let url;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (!LOCALHOST_HOSTNAMES.has(url.hostname)) return false;
  return url.port === String(boundPort);
}
function isCsrfGuardedPath(path2) {
  return CSRF_GUARDED_PREFIXES.some((prefix) => pathMatchesPrefix(path2, prefix));
}
function createOriginGuardMiddleware(options) {
  return async (c, next) => {
    if (isCsrfGuardedPath(c.req.path) && !isAllowedOrigin(c.req.header("origin") ?? null, options.boundPort())) {
      return c.json(
        {
          error: {
            message: "Forbidden: cross-origin request to a control endpoint",
            type: "csrf_error"
          }
        },
        403
      );
    }
    return next();
  };
}
function buildCorsOptions(boundPort) {
  return {
    origin: (origin) => origin && isAllowedOrigin(origin, boundPort()) ? origin : null
  };
}

// src/lib/http/trace.ts
var traceIdMiddleware = async (c, next) => {
  const traceId = resolveTraceId(c.req.header("x-trace-id"));
  c.header("x-trace-id", traceId);
  const context = {
    traceId,
    startTime: Date.now(),
    userAgent: c.req.header("user-agent") || "",
    sessionAffinity: c.req.header("x-session-affinity"),
    parentSessionId: c.req.header("x-parent-session-id")
  };
  await requestContext.run(context, async () => {
    await next();
  });
};

// src/lib/models/refresh-models.ts
import consola from "consola";
import { createHash } from "crypto";
var STALE_AFTER_MS = 6 * 60 * 60 * 1e3;
var JITTER_MS = 2 * 60 * 60 * 1e3;
function jitterFor(machineId) {
  if (!machineId) return 0;
  const hash = createHash("sha256").update(machineId).digest();
  const raw = hash.readUInt32BE(0);
  return raw % JITTER_MS - JITTER_MS / 2;
}
function isStale(args) {
  if (args.loadedAtMs === null) return false;
  return args.now > args.loadedAtMs + args.staleAfterMs + args.jitterMs;
}
var refreshInFlight = false;
async function primeModelsCache(refresh = cacheModels, log2 = consola) {
  const wasEmpty = modelsCached() === 0;
  try {
    await refresh();
  } catch (err) {
    log2.warn(
      "Models cache prime failed; serving the last-known (possibly empty) catalog. Will retry on the next model-list request or activity.",
      err
    );
    return;
  }
  if (wasEmpty && modelsCached() > 0) {
    log2.info(`Models cache recovered: ${modelsCached()} models now available.`);
  }
}
var primeInFlight = false;
var lastPrimeAttemptMs = null;
var PRIME_COOLDOWN_MS = 6e4;
function refreshIfStale(opts) {
  const now = (opts.now ?? Date.now)();
  const loadedAtMs = opts.getLoadedAtMs();
  const jitterMs = opts.jitterMs ?? jitterFor(state.macMachineId);
  const staleAfterMs = opts.staleAfterMs ?? STALE_AFTER_MS;
  if (loadedAtMs === null) {
    if (primeInFlight) return "prime_in_flight";
    if (lastPrimeAttemptMs !== null && now < lastPrimeAttemptMs + PRIME_COOLDOWN_MS) {
      return "prime_cooldown";
    }
    lastPrimeAttemptMs = now;
    primeInFlight = true;
    void primeModelsCache(opts.refresh).finally(() => {
      primeInFlight = false;
    });
    return "priming";
  }
  if (refreshInFlight) return "in_flight";
  if (!isStale({ now, loadedAtMs, staleAfterMs, jitterMs })) return "fresh";
  refreshInFlight = true;
  void opts.refresh().catch((err) => opts.onError?.(err)).finally(() => {
    refreshInFlight = false;
  });
  return "fired";
}
function staleRefreshMiddleware(deps) {
  return async (_c, next) => {
    refreshIfStale({
      getLoadedAtMs: deps.getLoadedAtMs,
      refresh: deps.refresh,
      onError: deps.onError
    });
    await next();
  };
}

// src/lib/runtime-state/status.ts
function buildStatus(startMs) {
  const authenticated = hasGithubToken();
  const ready = authenticated && hasCopilotToken();
  return {
    service: "maximal",
    status: "ok",
    version: BUILD_VERSION,
    uptime_ms: Date.now() - startMs,
    subsystems: {
      copilot: {
        authenticated,
        ready,
        account_type: state.accountType
      },
      models: {
        cached: modelsCached()
      }
    },
    ports: {
      proxy: state.proxyPort,
      control: state.controlPort
    }
  };
}

// src/lib/update/update-check.ts
var log = createTeeLogger("update");
var MANIFEST_URL = "https://mxml.sh/updates/manifest.json";
var UPDATE_CHANNEL = BUILD_CHANNEL;
var DOWNLOAD_URL = "https://mxml.sh/";
var CACHE_TTL_MS = 6 * 60 * 60 * 1e3;
var REFRESH_RETRY_MS = 5 * 60 * 1e3;
var fetchImpl = fetch;
var nowMs = Date.now;
var versionImpl = BUILD_VERSION;
var cache = null;
var lastError = null;
var inFlight = null;
var nextAttemptAtMs = 0;
function parseSemver(v) {
  const raw = typeof v === "string" ? v.replace(/^v/u, "") : "";
  const prereleaseAt = raw.indexOf("-");
  const core = prereleaseAt === -1 ? raw : raw.slice(0, prereleaseAt);
  const prerelease = prereleaseAt === -1 ? [] : raw.slice(prereleaseAt + 1).split(".");
  const parts = core.split(".").map((n) => Number.parseInt(n, 10) || 0);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, prerelease];
}
function isNewerVersion(a, b) {
  const [a0, a1, a2, aPre] = parseSemver(a);
  const [b0, b1, b2, bPre] = parseSemver(b);
  if (a0 !== b0) return a0 > b0;
  if (a1 !== b1) return a1 > b1;
  if (a2 !== b2) return a2 > b2;
  if (aPre.length === 0 || bPre.length === 0) return bPre.length > 0;
  for (let i = 0; i < Math.max(aPre.length, bPre.length); i++) {
    if (i >= aPre.length) return false;
    if (i >= bPre.length) return true;
    const aId = aPre[i];
    const bId = bPre[i];
    const aNum = /^\d+$/u.test(aId);
    const bNum = /^\d+$/u.test(bId);
    if (aNum && bNum) {
      const diff = Number.parseInt(aId, 10) - Number.parseInt(bId, 10);
      if (diff !== 0) return diff > 0;
    } else if (aNum !== bNum) {
      return !aNum;
    } else if (aId !== bId) {
      return aId > bId;
    }
  }
  return false;
}
function normalizeCurrent(version) {
  const devAt = version.indexOf("-dev+");
  return devAt === -1 ? version : version.slice(0, devAt);
}
var VERSION_RE = /^v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?)$/u;
function readChannelVersion(parsed, channel, field) {
  const value = parsed?.channels?.[channel]?.[field];
  if (typeof value !== "string") return null;
  const match = VERSION_RE.exec(value.trim());
  return match ? match[1] : null;
}
function parseManifest(body, channel = UPDATE_CHANNEL) {
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { latest: null, minSupported: null };
  }
  return {
    latest: readChannelVersion(parsed, channel, "version"),
    minSupported: readChannelVersion(parsed, channel, "min_supported_version")
  };
}
async function refreshManifest() {
  try {
    const res = await fetchImpl(MANIFEST_URL, {
      headers: { "user-agent": "maximal" },
      signal: AbortSignal.timeout(UPDATE_MANIFEST_TIMEOUT_MS)
    });
    if (!res.ok) {
      lastError = `manifest fetch returned HTTP ${res.status}`;
      log.warn(`Update check: ${lastError}; skipping.`);
      return;
    }
    const facts = parseManifest(await res.text());
    lastError = facts.latest === null ? "manifest had no usable version for this channel" : null;
    cache = { atMs: nowMs(), facts };
  } catch (err) {
    lastError = err instanceof Error ? `network error: ${err.message}` : "update check failed";
    log.warn("Update check failed (continuing):", err);
  }
}
function ensureManifest(force) {
  if (inFlight) return inFlight;
  const now = nowMs();
  if (!force) {
    if (cache && now - cache.atMs < CACHE_TTL_MS) return Promise.resolve();
    if (now < nextAttemptAtMs) return Promise.resolve();
  }
  nextAttemptAtMs = now + REFRESH_RETRY_MS;
  const started = refreshManifest().finally(() => {
    if (inFlight === started) inFlight = null;
  });
  inFlight = started;
  return started;
}
async function getUpdateStatus(force = false) {
  const current = versionImpl;
  if (!isUpdateCheckEnabled()) {
    return {
      current,
      latest: null,
      update_available: false,
      url: DOWNLOAD_URL,
      enabled: false,
      checked_at: cache ? new Date(cache.atMs).toISOString() : null,
      last_error: null,
      min_supported: cache?.facts.minSupported ?? null
    };
  }
  await ensureManifest(force);
  const latest = cache?.facts.latest ?? null;
  return {
    current,
    latest,
    update_available: latest !== null && isNewerVersion(latest, normalizeCurrent(current)),
    url: DOWNLOAD_URL,
    enabled: true,
    checked_at: cache ? new Date(cache.atMs).toISOString() : null,
    last_error: lastError,
    min_supported: cache?.facts.minSupported ?? null
  };
}
function checkVersionFloor() {
  const current = versionImpl;
  if (!isVersionFloorEnforced()) {
    return { current, minSupported: null, retired: false };
  }
  void ensureManifest(false);
  const minSupported = cache?.facts.minSupported ?? null;
  return {
    current,
    minSupported,
    retired: minSupported !== null && isNewerVersion(minSupported, normalizeCurrent(current))
  };
}

// src/lib/update/version-gate.ts
var BUILD_RETIRED_TYPE = "build_retired";
function buildRetiredBody(current, minSupported) {
  return {
    error: {
      message: `This maximal build (${current}) has been retired: the minimum supported version is ${minSupported}. Proxy requests are refused until the engine is updated \u2014 retrying, re-authenticating, or changing API keys will not help. Update from ${DOWNLOAD_URL} (or run \`maximal upgrade\`).`,
      type: BUILD_RETIRED_TYPE,
      current_version: current,
      min_supported_version: minSupported,
      upgrade_url: DOWNLOAD_URL
    }
  };
}
var requireSupportedBuild = async (c, next) => {
  const verdict = checkVersionFloor();
  if (!verdict.retired || verdict.minSupported === null) {
    return next();
  }
  return c.json(buildRetiredBody(verdict.current, verdict.minSupported), 426);
};

// src/routes/chat-completions/route.ts
import { Hono } from "hono";

// src/routes/chat-completions/handler.ts
import { streamSSE } from "hono/streaming";

// src/lib/http/approval.ts
import consola2 from "consola";
var awaitApproval = async () => {
  const response = await consola2.prompt(`Accept incoming request?`, {
    type: "confirm"
  });
  if (!response)
    throw new HTTPError(
      "Request rejected",
      Response.json({ message: "Request rejected" }, { status: 403 })
    );
};

// src/lib/http/rate-limit.ts
import consola3 from "consola";
async function checkRateLimit(state2) {
  if (state2.rateLimitSeconds === void 0) return;
  const now = Date.now();
  if (!state2.lastRequestTimestamp) {
    state2.lastRequestTimestamp = now;
    return;
  }
  const elapsedSeconds = (now - state2.lastRequestTimestamp) / 1e3;
  if (elapsedSeconds > state2.rateLimitSeconds) {
    state2.lastRequestTimestamp = now;
    return;
  }
  const waitTimeSeconds = Math.ceil(state2.rateLimitSeconds - elapsedSeconds);
  if (!state2.rateLimitWait) {
    consola3.warn(
      `Rate limit exceeded. Need to wait ${waitTimeSeconds} more seconds.`
    );
    throw new HTTPError(
      "Rate limit exceeded",
      Response.json({ message: "Rate limit exceeded" }, { status: 429 })
    );
  }
  const waitTimeMs = waitTimeSeconds * 1e3;
  consola3.warn(
    `Rate limit reached. Waiting ${waitTimeSeconds} seconds before proceeding...`
  );
  await sleep(waitTimeMs);
  state2.lastRequestTimestamp = now;
  consola3.info("Rate limit wait completed, proceeding with request");
  return;
}

// src/lib/http/untrusted-frame.ts
var asRecord = (value) => typeof value === "object" && value !== null ? value : void 0;
var readNestedUsage = (frame, key) => asRecord(asRecord(frame)?.[key])?.usage;
var readUsage = (frame) => asRecord(frame)?.usage;

// src/services/copilot/create-chat-completions.ts
import consola4 from "consola";
import "fetch-event-stream";

// src/services/copilot/agent-initiator.ts
var messagesInitiator = (payload) => {
  let isInitiateRequest = false;
  const lastMessage = payload.messages.at(-1);
  if (lastMessage?.role === "user") {
    isInitiateRequest = Array.isArray(lastMessage.content) ? lastMessage.content.some((block) => block.type !== "tool_result") : true;
  }
  return isInitiateRequest ? "user" : "agent";
};
var chatCompletionsInitiator = (payload) => {
  const lastMessage = payload.messages.at(-1);
  if (lastMessage && ["assistant", "tool"].includes(lastMessage.role)) {
    return "agent";
  }
  return "user";
};
var responsesInitiator = (payload) => {
  const input = payload.input;
  const lastItem = Array.isArray(input) ? input.at(-1) : void 0;
  if (!lastItem) {
    return "user";
  }
  if (!("role" in lastItem) || !lastItem.role) {
    return "agent";
  }
  const role = typeof lastItem.role === "string" ? lastItem.role.toLowerCase() : "";
  return role === "assistant" ? "agent" : "user";
};

// src/services/copilot/create-chat-completions.ts
var createChatCompletions = async (payload, options) => {
  requireCopilotToken();
  const enableVision = payload.messages.some(
    (x) => typeof x.content !== "string" && x.content?.some((x2) => x2.type === "image_url")
  );
  const headers = buildCopilotHeaders(state, {
    ...options,
    vision: enableVision,
    initiator: chatCompletionsInitiator(payload)
  });
  consola4.log(`<-- model: ${payload.model}`);
  const response = await sendRequest(
    `${copilotBaseUrl(state)}/chat/completions`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    }
  );
  return finishUpstreamResponse(response, {
    stream: Boolean(payload.stream),
    errorMessage: "Failed to create chat completions"
  });
};

// src/routes/streaming-predicates.ts
var isNonStreaming = (response) => Object.hasOwn(response, "choices");
var isAsyncIterable = (value) => Boolean(value) && typeof value[Symbol.asyncIterator] === "function";

// src/routes/chat-completions/handler.ts
var logger = createHandlerLogger("chat-completions-handler");
async function handleCompletion(c) {
  await checkRateLimit(state);
  let payload = await c.req.json();
  payload.model = reverseId(payload.model);
  debugJsonTail(logger, "Request payload:", { value: payload, tailLength: 400 });
  const selectedModel = state.models?.data.find(
    (model) => model.id === payload.model
  );
  if (selectedModel?.id === "gpt-5.4") {
    return c.json(
      {
        error: {
          message: "Please use `/v1/responses` or `/v1/messages` API",
          type: "invalid_request_error"
        }
      },
      400
    );
  }
  if (state.manualApprove) await awaitApproval();
  if (isNullish(payload.max_tokens)) {
    const maxOutputTokens = selectedModel ? resolveModelProfile(selectedModel).maxOutputTokens : 0;
    payload = {
      ...payload,
      max_tokens: maxOutputTokens > 0 ? maxOutputTokens : void 0
    };
    debugJson(logger, "Set max_tokens to:", payload.max_tokens);
  }
  const requestId = generateRequestIdFromPayload(payload);
  logger.debug("Generated request ID:", requestId);
  const sessionId = getUUID(requestId);
  logger.debug("Extracted session ID:", sessionId);
  const recordUsage = createCopilotTokenUsageRecorder({
    endpoint: "chat_completions",
    fallbackSessionId: sessionId,
    model: payload.model
  });
  const response = await createChatCompletions(payload, {
    requestId,
    sessionId
  });
  if (isNonStreaming(response)) {
    debugJson(logger, "Non-streaming response:", response);
    recordUsage(
      withCopilotCost(
        normalizeOpenAIUsage(response.usage),
        response.copilot_usage
      )
    );
    return c.json(response);
  }
  logger.debug("Streaming response");
  return streamSSE(c, async (stream) => {
    let usage = {};
    for await (const chunk of response) {
      debugJson(logger, "Streaming chunk:", chunk);
      const parsedChunk = parseChatCompletionChunk(chunk);
      if (asRecord(parsedChunk)?.usage) {
        usage = normalizeOpenAIUsage(readUsage(parsedChunk));
      }
      await stream.writeSSE(chunk);
    }
    recordUsage(usage);
  });
}
var parseChatCompletionChunk = (chunk) => {
  const data = chunk.data;
  if (!data || data === "[DONE]") {
    return null;
  }
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
};

// src/routes/chat-completions/route.ts
var completionRoutes = new Hono();
completionRoutes.post("/", async (c) => {
  try {
    return await handleCompletion(c);
  } catch (error) {
    return await forwardError(c, error);
  }
});

// src/routes/control/route.ts
import { Hono as Hono2 } from "hono";
import { z as z2 } from "zod";

// src/lib/jsonrpc/errors.ts
var RpcParamsError = class extends Error {
};
function jsonRpcError(code, message, data) {
  return data === void 0 ? { code, message } : { code, message, data };
}
function controlError(reason, message, extra = {}) {
  const { retryable, ...rest } = extra;
  const data = {
    reason,
    // Only a re-mintable auth blip is worth re-issuing unprompted; everything
    // else needs a human or a different request.
    retryable: retryable ?? reason === "auth_retry",
    ...rest
  };
  return jsonRpcError(codeForReason(reason), message, data);
}
function reasonForErrorType(type, status) {
  if (type === "auth_fatal") return "auth_fatal";
  if (type === "server_error" && status === 503) return "auth_retry";
  return "upstream_error";
}
async function toJsonRpcError(c, error) {
  if (error instanceof RpcParamsError) {
    return jsonRpcError(JSON_RPC_INVALID_PARAMS, error.message, {
      reason: "internal",
      retryable: false
    });
  }
  const response = await forwardError(c, error);
  const status = response.status;
  let message = "Internal error";
  try {
    const body = await response.json();
    if (typeof body.error?.message === "string") message = body.error.message;
    const remediationUrl = body.error?.remediation_url;
    return controlError(reasonForErrorType(body.error?.type, status), message, {
      ...typeof remediationUrl === "string" ? { remediationUrl } : {}
    });
  } catch {
    return jsonRpcError(JSON_RPC_INTERNAL_ERROR, message, {
      reason: "internal",
      retryable: false
    });
  }
}

// src/lib/jsonrpc/dispatch.ts
function parseEnvelope(raw) {
  if (Array.isArray(raw)) {
    return {
      ok: false,
      error: jsonRpcError(
        JSON_RPC_INVALID_REQUEST,
        "Batch requests are not supported"
      )
    };
  }
  if (typeof raw !== "object" || raw === null) {
    return {
      ok: false,
      error: jsonRpcError(
        JSON_RPC_INVALID_REQUEST,
        "Request must be a JSON object"
      )
    };
  }
  const envelope = raw;
  if ("result" in envelope || "error" in envelope) {
    return {
      ok: false,
      error: jsonRpcError(
        JSON_RPC_INVALID_REQUEST,
        "Clients must not send JSON-RPC responses"
      )
    };
  }
  const hasId = "id" in envelope && envelope.id !== void 0;
  if (!hasId) {
    if (envelope.jsonrpc !== "2.0" || typeof envelope.method !== "string") {
      return {
        ok: false,
        error: jsonRpcError(
          JSON_RPC_INVALID_REQUEST,
          "Invalid JSON-RPC 2.0 notification"
        )
      };
    }
    return {
      ok: true,
      parsed: {
        kind: "notification",
        message: {
          jsonrpc: "2.0",
          method: envelope.method,
          params: envelope.params
        }
      }
    };
  }
  const result = jsonRpcRequestSchema.safeParse(envelope);
  if (!result.success) {
    const id = typeof envelope.id === "string" || typeof envelope.id === "number" ? envelope.id : void 0;
    return {
      ok: false,
      error: jsonRpcError(
        JSON_RPC_INVALID_REQUEST,
        "Invalid JSON-RPC 2.0 request",
        { issues: result.error.issues.map((issue) => issue.message) }
      ),
      ...id === void 0 ? {} : { id }
    };
  }
  return { ok: true, parsed: { kind: "request", message: result.data } };
}
function createRpcHandler(registry) {
  return async (c) => {
    let raw;
    try {
      raw = await c.req.json();
    } catch {
      return c.json(
        errorResponse(
          void 0,
          jsonRpcError(JSON_RPC_PARSE_ERROR, "Request body is not valid JSON")
        ),
        400
      );
    }
    const outcome = parseEnvelope(raw);
    if (!outcome.ok) {
      return c.json(errorResponse(outcome.id, outcome.error), 400);
    }
    const { parsed } = outcome;
    const handler = registry[parsed.message.method];
    if (parsed.kind === "notification") {
      if (handler) {
        try {
          await handler(parsed.message.params, c);
        } catch {
        }
      }
      return c.body(null, 202);
    }
    const { id } = parsed.message;
    if (!handler) {
      return c.json(
        errorResponse(
          id,
          jsonRpcError(
            JSON_RPC_METHOD_NOT_FOUND,
            `Unknown method: ${parsed.message.method}`
          )
        )
      );
    }
    try {
      const result = await handler(parsed.message.params, c);
      if (result instanceof Response) return result;
      return c.json(successResponse(id, result ?? null));
    } catch (error) {
      const rpcError = await toJsonRpcError(c, error).catch(
        () => jsonRpcError(
          JSON_RPC_INTERNAL_ERROR,
          error instanceof Error ? error.message : "Internal error"
        )
      );
      return c.json(errorResponse(id, rpcError));
    }
  };
}

// src/lib/live/queue.ts
var CLOSED = /* @__PURE__ */ Symbol("queue-closed");
var BoundedQueue = class {
  items = [];
  waiter = null;
  closed = false;
  capacity;
  constructor(capacity) {
    this.capacity = capacity;
  }
  /** Append to the tail. Returns false on overflow or after close; a waiting
   *  consumer is handed the item directly and bypasses the capacity check. */
  push(item) {
    if (this.closed) return false;
    if (this.waiter) {
      const resolve = this.waiter;
      this.waiter = null;
      resolve(item);
      return true;
    }
    if (this.items.length >= this.capacity) return false;
    this.items.push(item);
    return true;
  }
  /** Prepend — used once, for the snapshot frame, before the drain starts. */
  pushFront(item) {
    if (this.closed) return;
    if (this.waiter) {
      const resolve = this.waiter;
      this.waiter = null;
      resolve(item);
      return;
    }
    this.items.unshift(item);
  }
  take() {
    if (this.items.length > 0) {
      return Promise.resolve(this.items.shift());
    }
    if (this.closed) return Promise.resolve(CLOSED);
    return new Promise((resolve) => {
      this.waiter = resolve;
    });
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    if (this.waiter) {
      const resolve = this.waiter;
      this.waiter = null;
      resolve(CLOSED);
    }
  }
  get size() {
    return this.items.length;
  }
};

// src/lib/live/hub.ts
var DEFAULT_QUEUE_CAPACITY = 256;
var HEARTBEAT_FRAME = ": keepalive\n\n";
var ControlHub = class {
  subscribers = /* @__PURE__ */ new Set();
  latestUsage = void 0;
  usageDirty = false;
  buildSnapshot;
  queueCapacity;
  heartbeatTimer;
  constructor(options) {
    this.buildSnapshot = options.buildSnapshot;
    this.queueCapacity = options.queueCapacity ?? DEFAULT_QUEUE_CAPACITY;
    this.heartbeatTimer = options.heartbeatMs === void 0 ? null : this.startHeartbeat(options.heartbeatMs);
  }
  startHeartbeat(intervalMs) {
    const timer = setInterval(() => {
      this.fanout(HEARTBEAT_FRAME);
    }, intervalMs);
    timer.unref();
    return timer;
  }
  /** Stop the heartbeat timer. For tests and a clean shutdown. */
  dispose() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
  }
  // ── Producer API ────────────────────────────────────────────────────────
  /**
   * Publish a state change to every live subscriber.
   *
   * One method, not the old cursored/edge pair: with nothing ringed there is no
   * ring for a high-frequency topic to evict, so the distinction that justified
   * two methods no longer exists.
   */
  emit(topic, data) {
    this.fanout(serializeFrame({ topic, data }));
  }
  /** Record a usage tick. Still coalesced — that was always about volume, not
   *  resume: a per-request storm would otherwise overflow every subscriber's
   *  bounded queue and get slow clients dropped. */
  recordUsage(data) {
    this.latestUsage = data;
    this.usageDirty = true;
  }
  /** Emit at most one coalesced usage frame. Wire to an interval in production;
   *  called directly in tests for determinism. */
  flushUsage() {
    if (!this.usageDirty) return;
    this.usageDirty = false;
    this.emit("usage", this.latestUsage);
  }
  // ── Consumer API ────────────────────────────────────────────────────────
  /**
   * Attach a subscriber. Registers it for fan-out synchronously (so no frame is
   * missed during the snapshot build), pushes the snapshot at the head of its
   * queue, then starts the single drain loop. Returns an unsubscribe function.
   *
   * Every connect is a fresh snapshot — there is no resume path to take instead.
   */
  async subscribe(sink) {
    const subscriber = {
      sink,
      queue: new BoundedQueue(this.queueCapacity),
      alive: true
    };
    this.subscribers.add(subscriber);
    let snapshot;
    try {
      snapshot = await this.buildSnapshot();
    } catch (error) {
      this.remove(subscriber, "snapshot_failed");
      throw error;
    }
    const payload = {
      protocolVersion: CONTROL_PROTOCOL_VERSION,
      snapshot
    };
    subscriber.queue.pushFront(
      serializeFrame({ topic: "snapshot", data: payload })
    );
    void this.drain(subscriber);
    return () => {
      this.remove(subscriber, "client_close");
    };
  }
  // ── Internals ───────────────────────────────────────────────────────────
  fanout(frame) {
    for (const subscriber of Array.from(this.subscribers)) {
      if (!subscriber.queue.push(frame)) {
        this.remove(subscriber, "overflow");
      }
    }
  }
  async drain(subscriber) {
    try {
      while (subscriber.alive) {
        const item = await subscriber.queue.take();
        if (item === CLOSED) break;
        await subscriber.sink.write(item);
      }
    } catch {
    } finally {
      this.remove(subscriber, "drain_end");
    }
  }
  remove(subscriber, reason) {
    if (!subscriber.alive) return;
    subscriber.alive = false;
    this.subscribers.delete(subscriber);
    subscriber.queue.close();
    subscriber.sink.close(reason);
  }
  // ── Introspection (tests / diagnostics) ─────────────────────────────────
  get stats() {
    return { subscribers: this.subscribers.size };
  }
};

// src/lib/live/mutex.ts
var AsyncMutex = class {
  tail = Promise.resolve();
  /** Run `fn` once every prior action has settled. A rejected action does not
   *  wedge the queue — the next action still runs. */
  runExclusive(fn) {
    const result = this.tail.then(fn, fn);
    this.tail = result.then(
      () => void 0,
      () => void 0
    );
    return result;
  }
};

// src/lib/live/resources.ts
async function buildAccountsList() {
  const reg = await readDefaultRegistry();
  const accounts = listAccounts(reg).map((account) => ({
    key: account.key,
    login: account.login,
    host: account.host,
    added_via: account.addedVia,
    obtained_at: account.obtainedAt,
    active: account.active
  }));
  return { accounts, active_key: reg.activeKey };
}
async function buildAppsList() {
  const apps = await Promise.all(getAllApps().map((app) => app.getDetails()));
  return { apps };
}
function toModelSummary(model) {
  const capabilities = model.capabilities ?? {};
  const limits = capabilities.limits ?? {};
  const supports = capabilities.supports ?? {};
  return {
    id: model.id,
    name: model.name,
    vendor: model.vendor,
    family: capabilities.family ?? "",
    type: capabilities.type ?? "",
    preview: model.preview,
    context_window_tokens: limits.max_context_window_tokens ?? null,
    max_output_tokens: limits.max_output_tokens ?? null,
    capabilities: {
      vision: supports.vision ?? false,
      tool_calls: supports.tool_calls ?? false,
      streaming: supports.streaming ?? false,
      reasoning: (supports.adaptive_thinking ?? false) || (supports.reasoning_effort?.length ?? 0) > 0
    }
  };
}
function buildModelsList() {
  const models = (state.models?.data ?? []).map(
    (model) => toModelSummary(model)
  );
  models.sort(
    (a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name)
  );
  const loadedAtMs = getModelsLoadedAtMs();
  return {
    models,
    count: models.length,
    loaded_at: loadedAtMs === null ? null : new Date(loadedAtMs).toISOString()
  };
}
async function buildControlSnapshot() {
  const auth = getAuthStatus();
  const [accounts, apps, usage] = await Promise.all([
    buildAccountsList(),
    buildAppsList(),
    getTokenUsageSummary("day")
  ]);
  const models = buildModelsList();
  const clients = listActiveClients();
  return {
    auth,
    accounts,
    apps,
    models,
    usage,
    clients: { clients, total: clients.length }
  };
}

// src/lib/live/service.ts
var USAGE_FLUSH_MS = 1e3;
var HEARTBEAT_MS = 15e3;
var hub = null;
var teardown = [];
function getControlHub() {
  if (hub) return hub;
  const created = new ControlHub({
    buildSnapshot: buildControlSnapshot,
    heartbeatMs: HEARTBEAT_MS
  });
  teardown.push(
    settingsEventBus.subscribe("auth.changed", (payload) => {
      created.emit("auth", payload);
    })
  );
  let usageDirty = false;
  teardown.push(
    onTokenUsageRecorded(() => {
      usageDirty = true;
    })
  );
  const timer = setInterval(() => {
    if (!usageDirty) return;
    usageDirty = false;
    void getTokenUsageSummary("day").then(
      (summary) => {
        created.recordUsage(summary);
        created.flushUsage();
      },
      () => {
      }
    );
  }, USAGE_FLUSH_MS);
  timer.unref();
  teardown.push(() => {
    clearInterval(timer);
  });
  hub = created;
  return created;
}

// src/lib/live/stream-subscription.ts
import { streamSSE as streamSSE2 } from "hono/streaming";
function streamSubscription(c, hub2) {
  return streamSSE2(c, async (stream) => {
    const sink = {
      write: async (frame) => {
        await stream.write(frame);
      },
      close: () => {
      }
    };
    const unsubscribe = await hub2().subscribe(sink);
    await new Promise((resolve) => {
      stream.onAbort(() => {
        unsubscribe();
        resolve();
      });
    });
  });
}

// src/routes/control/rpc.ts
function keyFromParams(params) {
  const key = params?.key;
  if (typeof key !== "string" || !key) {
    throw new RpcParamsError("Expected { key } string.");
  }
  return key;
}
function relayToShell(emit, verb) {
  return () => emit() ? { ok: true, [verb]: true } : { ok: false, reason: "no_supervising_shell" };
}
function createControlRpcMethods(deps) {
  const { hub: hub2, mutex } = deps;
  const listClients = deps.listClients ?? listActiveClients;
  const registry = {
    health: () => ({ ok: true, version: BUILD_VERSION }),
    // Reads. Each mirrors a live feed topic and shares its builder, so a
    // snapshot read and a pushed update can never describe different shapes.
    "auth/status": () => getAuthStatus(),
    "accounts/list": () => buildAccountsList(),
    "apps/list": () => buildAppsList(),
    "models/list": () => buildModelsList(),
    "usage/get": () => getTokenUsageSummary("day"),
    "config/get": () => getConfig(),
    "clients/list": () => {
      const clients = listClients();
      return { clients, total: clients.length };
    },
    "update/status": () => getUpdateStatus(),
    // Auth actions. `auth/status` returns ADR-0006's discriminated union, so
    // these deliberately return the same union rather than a parallel vocabulary.
    "auth/start": () => startDeviceFlow(),
    "auth/cancel": () => cancelDeviceFlow(),
    "auth/rearm": async () => ({
      outcome: await rearmCopilotAuth(),
      status: getAuthStatus()
    }),
    "auth/signOut": async () => {
      await signOut();
      return { ok: true };
    },
    "models/refresh": async () => {
      await cacheModels();
      return buildModelsList();
    },
    // Account mutations, serialized through the same mutex the REST routes use
    // so an RPC switch and a REST switch can never interleave.
    "accounts/switch": (params) => mutex.runExclusive(async () => {
      const key = keyFromParams(params);
      const result = await activateAccountLive(key);
      if (!result.ok) throw new RpcParamsError(result.message);
      hub2().emit("accounts", await buildAccountsList());
      return { ok: true, key };
    }),
    "accounts/remove": (params) => mutex.runExclusive(async () => {
      const key = keyFromParams(params);
      const reg = await readDefaultRegistry();
      if (!(key in reg.accounts)) {
        throw new RpcParamsError(`No account ${key}.`);
      }
      const wasActive = reg.activeKey === key;
      await writeDefaultRegistry(removeAccount(reg, key));
      hub2().emit("accounts", await buildAccountsList());
      return { ok: true, key, was_active: wasActive };
    }),
    /**
     * Long-lived push stream. The response IS the subscription: a snapshot
     * notification first, then per-topic change notifications until either side
     * closes. Closing the stream is the unsubscribe — there is no cancel method,
     * because a transport-level disconnect is unambiguous and a separate cancel
     * would race it.
     */
    "subscriptions/listen": (_params, c) => streamSubscription(c, hub2),
    "app/quit": relayToShell(emitQuitRequest, "quitting"),
    "app/upgrade": relayToShell(emitUpdateRequest, "upgrading")
  };
  return {
    ...registry,
    "server/discover": () => ({
      protocolVersion: SUPPORTED_PROTOCOL_VERSION,
      capabilities: {
        methods: [...Object.keys(registry), "server/discover"].sort(),
        feed: true
      },
      identity: { name: "maximal-core", version: BUILD_VERSION },
      // Both bound ports (maximal-core#10). A host reaches the control plane on
      // an ephemeral port but must advertise `/v1` on the public one, and the
      // public one is not necessarily the requested 4141 — it falls back when
      // held. Reported here so a client that missed the ready-line, or
      // reconnected later, can still learn both without guessing.
      ports: { control: state.controlPort, proxy: state.proxyPort }
    })
  };
}
function unsupportedVersion(c) {
  const pinned = c.req.header(PROTOCOL_VERSION_HEADER);
  if (pinned === void 0 || pinned === SUPPORTED_PROTOCOL_VERSION) return null;
  return pinned;
}

// src/routes/control/settings-endpoints.ts
import { randomUUID } from "crypto";
import { z } from "zod";

// src/lib/platform/cli-path.ts
function isAppBundlePath(execPath) {
  return /\.app\/Contents\/MacOS\//u.test(execPath);
}
function describeLaunchSource(execPath = process.execPath) {
  if (isAppBundlePath(execPath)) return { path: execPath, kind: "dmg-app" };
  if (/\/target\/(?:debug|release)\//u.test(execPath) || /\/bun$/u.test(execPath))
    return { path: execPath, kind: "dev" };
  if (/\/(?:homebrew|Cellar)\//u.test(execPath))
    return { path: execPath, kind: "homebrew" };
  if (execPath.includes("/.local/bin/"))
    return { path: execPath, kind: "user-bin" };
  return { path: execPath, kind: "other" };
}

// src/routes/control/settings-endpoints.ts
var VALIDATION = {
  message: "Key must be 8\u2013128 chars of letters, digits, underscore, or hyphen \u2014 or the literal '*' wildcard.",
  type: "validation_error"
};
function apiKeysList() {
  const config = getConfig();
  return {
    entries: config.auth?.apiKeyEntries ?? [],
    enforcing: config.auth?.enforce === true
  };
}
function persistApiKeyEntries(entries) {
  const config = getConfig();
  writeConfig({ ...config, auth: { ...config.auth, apiKeyEntries: entries } });
}
function registerApiKeyReads(app) {
  app.get("/api-keys", (c) => c.json(apiKeysList()));
}
function registerApiKeyCreate(app) {
  app.post("/api-keys", async (c) => {
    const parsed = ApiKeyCreateRequest.safeParse(
      await c.req.json().catch(() => null)
    );
    if (!parsed.success) {
      return c.json(
        { error: { ...VALIDATION, message: "Invalid payload" } },
        400
      );
    }
    const key = (parsed.data.key ?? generateApiKeyValue()).trim();
    if (!API_KEY_VALUE_PATTERN.test(key)) {
      return c.json({ error: VALIDATION }, 400);
    }
    const existing = getConfig().auth?.apiKeyEntries ?? [];
    if (existing.some((e) => e.key === key)) {
      return c.json(
        { error: { message: "Key already exists", type: "conflict" } },
        409
      );
    }
    const entry = {
      id: randomUUID(),
      label: parsed.data.label.trim(),
      key,
      enabled: parsed.data.enabled ?? true,
      created_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    persistApiKeyEntries([...existing, entry]);
    return c.json(entry, 201);
  });
}
var enforceBodySchema = z.object({ enforce: z.boolean() });
var ghUseBodySchema = z.object({
  login: z.string().min(1),
  host: z.string().min(1)
});
function registerApiKeyMutations(app) {
  app.patch("/api-keys/enforce", async (c) => {
    const body = enforceBodySchema.safeParse(
      await c.req.json().catch(() => null)
    );
    if (!body.success) {
      return c.json(
        {
          error: {
            message: "Expected { enforce: boolean }",
            type: "validation_error"
          }
        },
        400
      );
    }
    const config = getConfig();
    writeConfig({
      ...config,
      auth: { ...config.auth, enforce: body.data.enforce }
    });
    return c.json(apiKeysList());
  });
  app.patch("/api-keys/:id", async (c) => {
    const parsed = ApiKeyUpdateRequest.safeParse(
      await c.req.json().catch(() => null)
    );
    if (!parsed.success) {
      return c.json(
        { error: { ...VALIDATION, message: "Invalid payload" } },
        400
      );
    }
    const entries = getConfig().auth?.apiKeyEntries ?? [];
    const idx = entries.findIndex((e) => e.id === c.req.param("id"));
    if (idx === -1) {
      return c.json(
        { error: { message: "API key not found", type: "not_found" } },
        404
      );
    }
    const current = entries[idx];
    let nextKey = current.key;
    if (parsed.data.key !== void 0) {
      const candidate = parsed.data.key.trim();
      if (!API_KEY_VALUE_PATTERN.test(candidate)) {
        return c.json({ error: VALIDATION }, 400);
      }
      if (entries.some((e, i) => i !== idx && e.key === candidate)) {
        return c.json(
          { error: { message: "Key already exists", type: "conflict" } },
          409
        );
      }
      nextKey = candidate;
    }
    const updated = {
      ...current,
      label: parsed.data.label?.trim() ?? current.label,
      key: nextKey,
      enabled: parsed.data.enabled ?? current.enabled
    };
    const next = [...entries];
    next[idx] = updated;
    persistApiKeyEntries(next);
    return c.json(updated);
  });
  app.delete("/api-keys/:id", (c) => {
    const entries = getConfig().auth?.apiKeyEntries ?? [];
    const next = entries.filter((e) => e.id !== c.req.param("id"));
    if (next.length === entries.length) {
      return c.json(
        { error: { message: "API key not found", type: "not_found" } },
        404
      );
    }
    persistApiKeyEntries(next);
    return c.body(null, 204);
  });
}
function registerGh(app) {
  app.get("/gh/status", async (c) => {
    try {
      const { detectGhCli } = await import("./gh-cli-KBH53ZC4.js");
      return c.json(await detectGhCli());
    } catch (error) {
      return forwardError(c, error);
    }
  });
  app.post("/gh/use", async (c) => {
    try {
      const { detectGhCli, getGhAccountToken } = await import("./gh-cli-KBH53ZC4.js");
      const parsed = ghUseBodySchema.safeParse(
        await c.req.json().catch(() => null)
      );
      if (!parsed.success) {
        return c.json(
          { error: { message: "Expected { login, host } strings." } },
          400
        );
      }
      const { login, host } = parsed.data;
      const status = await detectGhCli();
      if (!status.accounts.some((a) => a.login === login && a.host === host)) {
        return c.json(
          { error: { message: `gh has no account ${login} on ${host}.` } },
          404
        );
      }
      const token = await getGhAccountToken(login, host);
      if (!token) {
        return c.json(
          { error: { message: `Could not read the gh token for ${login}.` } },
          502
        );
      }
      const preErr = await preflightCopilotError(token, login);
      if (preErr) return c.json({ error: { message: preErr } }, 422);
      await addAccountToDefaultRegistry(
        makeAccountRecord({ login, host, token, addedVia: "gh-cli" })
      );
      return c.json({ ok: true, login, host });
    } catch (error) {
      return forwardError(c, error);
    }
  });
}
function registerAppToggles(app) {
  app.post("/apps/claude-code/toggle", async (c) => {
    try {
      const parsed = ClaudeCodeToggleRequest.safeParse(
        await c.req.json().catch(() => null)
      );
      if (!parsed.success) {
        return c.json(
          { error: { message: "Expected { enabled: boolean }" } },
          400
        );
      }
      const appEntry = getApp("claude-code");
      if (!appEntry) return c.json({ error: { message: "App not found" } }, 404);
      if (parsed.data.enabled) {
        if (!await appEntry.detect()) {
          return c.json(
            { error: { message: "No Claude Code install detected." } },
            409
          );
        }
        const result = await appEntry.enable();
        return c.json(await appEntry.getDetails(result.conflict ?? null));
      }
      await appEntry.disable();
      return c.json(await appEntry.getDetails());
    } catch (error) {
      return forwardError(c, error);
    }
  });
  app.post("/apps/claude-desktop/toggle", async (c) => {
    try {
      const parsed = ClaudeDesktopToggleRequest.safeParse(
        await c.req.json().catch(() => null)
      );
      if (!parsed.success) {
        return c.json(
          { error: { message: "Expected { enabled: boolean }" } },
          400
        );
      }
      const appEntry = getApp("claude-desktop");
      if (!appEntry) return c.json({ error: { message: "App not found" } }, 404);
      await (parsed.data.enabled ? appEntry.enable() : appEntry.disable());
      const config = getConfig();
      writeConfig({
        ...config,
        apps: {
          ...config.apps,
          claudeDesktop: {
            ...config.apps?.claudeDesktop,
            enabled: parsed.data.enabled
          }
        }
      });
      return c.json(await appEntry.getDetails());
    } catch (error) {
      return forwardError(c, error);
    }
  });
}
var isoOrNull = (ms) => ms === null || ms === void 0 ? null : new Date(ms).toISOString();
function buildCopilotRefreshStatus() {
  const health = copilotRefreshHealth();
  return {
    health: copilotTokenHealth(),
    token_expires_at: isoOrNull(state.copilotTokenExpiresAtMs),
    last_success_at: isoOrNull(health.lastSuccessAtMs),
    last_failure_at: isoOrNull(health.lastFailureAtMs),
    last_failure_reason: health.lastFailureReason,
    consecutive_failures: health.consecutiveFailures
  };
}
function buildDiagnostics() {
  const git = getGitVersion();
  const launch = describeLaunchSource();
  const tokens = tokenPresence();
  const executor = describeExecutor();
  return {
    version: BUILD_VERSION,
    source_revision: git.sha ? shortSha(git.sha) : null,
    source_branch: git.branch ?? null,
    launch_path: launch.path,
    launch_kind: launch.kind,
    pid: process.pid,
    uptime_ms: Math.round(process.uptime() * 1e3),
    account_type: state.accountType,
    models_cached: modelsCached(),
    tokens: {
      github_token_present: tokens.github,
      copilot_token_present: tokens.copilot
    },
    copilot_refresh: buildCopilotRefreshStatus(),
    rate_limit: {
      interval_seconds: state.rateLimitSeconds ?? null,
      last_request_at: state.lastRequestTimestamp ? new Date(state.lastRequestTimestamp).toISOString() : null,
      wait_when_throttled: state.rateLimitWait
    },
    web_search: {
      kind: executor.web_tools,
      detail: executor.base ?? executor.notes ?? null
    },
    copilot_service: {
      upstream_host: copilotBaseUrl(state),
      github_api_base_url: getGitHubApiBaseUrl(),
      token_endpoint: getCopilotTokenUrl(),
      enterprise_domain: getEnterpriseDomain(),
      discovered_upstream: state.copilotApiUrl ?? null
    }
  };
}
function registerDiagnostics(app) {
  app.get("/diagnostics", (c) => c.json(buildDiagnostics()));
}
function registerSettingsEndpoints(app) {
  registerApiKeyReads(app);
  registerApiKeyCreate(app);
  registerApiKeyMutations(app);
  registerGh(app);
  registerAppToggles(app);
  registerDiagnostics(app);
}

// src/routes/control/route.ts
var keyBodySchema = z2.object({ key: z2.string().min(1) });
async function readKey(c) {
  const parsed = keyBodySchema.safeParse(await c.req.json().catch(() => null));
  return parsed.success ? parsed.data.key : null;
}
function registerEventStream(app, hub2) {
  app.get("/events", (c) => streamSubscription(c, hub2));
}
function registerReads(app, listClients) {
  app.get("/auth", (c) => c.json(getAuthStatus()));
  app.get("/accounts", async (c) => {
    try {
      return c.json(await buildAccountsList());
    } catch (error) {
      return forwardError(c, error);
    }
  });
  app.get("/apps", async (c) => {
    try {
      return c.json(await buildAppsList());
    } catch (error) {
      return forwardError(c, error);
    }
  });
  app.get("/models", (c) => c.json(buildModelsList()));
  app.get("/usage", async (c) => {
    try {
      return c.json(await getTokenUsageSummary("day"));
    } catch (error) {
      return forwardError(c, error);
    }
  });
  app.get("/config", (c) => c.json(getConfig()));
  app.get("/clients", (c) => {
    const clients = listClients();
    return c.json({ clients, total: clients.length });
  });
  app.get("/update-status", async (c) => {
    try {
      return c.json(await getUpdateStatus());
    } catch (error) {
      return forwardError(c, error);
    }
  });
}
function registerAuthActions(app) {
  app.post("/auth/start", async (c) => {
    try {
      return c.json(await startDeviceFlow());
    } catch (error) {
      return forwardError(c, error);
    }
  });
  app.post("/auth/cancel", (c) => c.json(cancelDeviceFlow()));
  app.post(
    "/auth/rearm",
    async (c) => c.json({ outcome: await rearmCopilotAuth(), status: getAuthStatus() })
  );
  app.post("/auth/sign-out", async (c) => {
    try {
      await signOut();
      return c.json({ ok: true });
    } catch (error) {
      return forwardError(c, error);
    }
  });
  app.post("/models/refresh", async (c) => {
    try {
      await cacheModels();
      return c.json(buildModelsList());
    } catch (error) {
      return forwardError(c, error);
    }
  });
}
function registerShellSignals(app) {
  app.post("/quit", (c) => {
    if (emitQuitRequest()) return c.json({ ok: true, quitting: true }, 202);
    return c.json({ ok: false, reason: "no_supervising_shell" }, 409);
  });
  app.post("/upgrade", (c) => {
    if (emitUpdateRequest()) return c.json({ ok: true, upgrading: true }, 202);
    return c.json({ ok: false, reason: "no_supervising_shell" }, 409);
  });
}
function registerAccountActions(app, hub2, mutex) {
  app.post(
    "/accounts/switch",
    (c) => mutex.runExclusive(async () => {
      try {
        const key = await readKey(c);
        if (!key) {
          return c.json({ error: { message: "Expected { key } string." } }, 400);
        }
        const result = await activateAccountLive(key);
        if (!result.ok) {
          return c.json({ error: { message: result.message } }, result.status);
        }
        hub2().emit("accounts", await buildAccountsList());
        return c.json({ ok: true, key });
      } catch (error) {
        return forwardError(c, error);
      }
    })
  );
  app.post(
    "/accounts/remove",
    (c) => mutex.runExclusive(async () => {
      try {
        const key = await readKey(c);
        if (!key) {
          return c.json({ error: { message: "Expected { key } string." } }, 400);
        }
        const reg = await readDefaultRegistry();
        if (!(key in reg.accounts)) {
          return c.json({ error: { message: `No account ${key}.` } }, 404);
        }
        const wasActive = reg.activeKey === key;
        await writeDefaultRegistry(removeAccount(reg, key));
        hub2().emit("accounts", await buildAccountsList());
        return c.json({ ok: true, key, was_active: wasActive });
      } catch (error) {
        return forwardError(c, error);
      }
    })
  );
}
function registerRpc(app, deps) {
  const dispatch = createRpcHandler(createControlRpcMethods(deps));
  app.post("/rpc", async (c) => {
    const pinned = unsupportedVersion(c);
    if (pinned !== null) {
      return c.json(
        errorResponse(
          void 0,
          controlError(
            "unsupported_version",
            `Unsupported protocol version ${pinned}; this sidecar speaks ${SUPPORTED_PROTOCOL_VERSION}.`
          )
        ),
        400
      );
    }
    return dispatch(c);
  });
  app.on(["GET", "DELETE"], "/rpc", (c) => c.body(null, 405));
}
function createControlRoutes(options = {}) {
  const getRequestIp = options.getRequestIp ?? defaultGetRequestIp;
  const listClients = options.listClients ?? listActiveClients;
  const hub2 = () => options.hub ?? getControlHub();
  const app = new Hono2();
  app.use("*", async (c, next) => {
    if (!isLoopbackAddress(getRequestIp(c))) {
      return c.notFound();
    }
    await next();
  });
  registerEventStream(app, hub2);
  registerReads(app, listClients);
  registerAuthActions(app);
  registerSettingsEndpoints(app);
  registerShellSignals(app);
  registerAccountActions(app, hub2, new AsyncMutex());
  registerRpc(app, { hub: hub2, mutex: new AsyncMutex(), listClients });
  return app;
}
var controlRoutes = createControlRoutes();

// src/routes/debug/route.ts
import { Hono as Hono3 } from "hono";
var debugRoutes = new Hono3();
function buildDebugState() {
  let config;
  try {
    config = getConfig();
  } catch {
    config = {};
  }
  const models = modelsCached();
  const tokens = tokenPresence();
  return {
    git: getGitVersion(),
    runtime: {
      account_type: state.accountType,
      verbose: state.verbose,
      manual_approve: state.manualApprove,
      rate_limit_seconds: state.rateLimitSeconds ?? null,
      rate_limit_wait: state.rateLimitWait,
      models_loaded: models > 0,
      models_count: models,
      copilot_token_present: tokens.copilot,
      github_token_present: tokens.github
    },
    config: summarizeConfig(config),
    executor: describeExecutor(),
    caches: allCacheMetrics(),
    secrets: collectSecretStatuses(config)
  };
}
debugRoutes.get("/state", (c) => {
  if (!state.verbose) {
    return c.notFound();
  }
  return c.json(buildDebugState());
});

// src/routes/embeddings/route.ts
import { Hono as Hono4 } from "hono";

// src/services/copilot/create-embeddings.ts
import { z as z3 } from "zod";
var createEmbeddings = async (payload) => {
  if (!hasCopilotToken()) throw new Error("Copilot token not found");
  return await sendRequestJson(
    `${copilotBaseUrl(state)}/embeddings`,
    {
      method: "POST",
      headers: copilotHeaders(state),
      body: JSON.stringify(payload),
      errorMessage: "Failed to create embeddings"
    },
    EmbeddingResponseSchema
  );
};
var EmbeddingSchema = z3.object({
  object: z3.string(),
  embedding: z3.array(z3.number()),
  index: z3.number()
}).partial().loose();
var EmbeddingResponseSchema = z3.object({
  object: z3.string(),
  data: z3.array(EmbeddingSchema),
  model: z3.string(),
  usage: z3.object({
    prompt_tokens: z3.number(),
    total_tokens: z3.number()
  }).partial().loose()
}).partial().loose();

// src/routes/embeddings/route.ts
var embeddingRoutes = new Hono4();
embeddingRoutes.post("/", async (c) => {
  try {
    const paylod = await c.req.json();
    const response = await createEmbeddings(paylod);
    const recordUsage = createCopilotTokenUsageRecorder({
      endpoint: "embeddings",
      model: paylod.model
    });
    recordUsage({
      input_tokens: response.usage?.prompt_tokens ?? 0,
      output_tokens: 0
    });
    return c.json(response);
  } catch (error) {
    return await forwardError(c, error);
  }
});

// src/routes/internal/route.ts
import consola5 from "consola";
import { Hono as Hono5 } from "hono";
function createInternalRoutes(options = {}) {
  const getRequestIp = options.getRequestIp ?? defaultGetRequestIp;
  const requestShutdown = options.requestShutdown;
  const scheduleShutdown = options.scheduleShutdown ?? ((callback, delayMs) => setTimeout(callback, delayMs));
  const app = new Hono5();
  app.post("/shutdown", async (c) => {
    if (!isLoopbackAddress(getRequestIp(c))) {
      return c.notFound();
    }
    if (!requestShutdown) {
      return c.json({ ok: false, draining: false }, 503);
    }
    let reason;
    try {
      const body = await c.req.json();
      if (body && typeof body.reason === "string") {
        reason = body.reason;
      }
    } catch {
    }
    const traceId = requestContext.getStore()?.traceId;
    consola5.warn(
      `shutting down due to /_internal/shutdown${reason ? ` (reason: ${reason})` : ""}${traceId ? ` [trace ${traceId}]` : ""}`
    );
    const timer = scheduleShutdown(() => {
      try {
        void Promise.resolve(
          requestShutdown(`/_internal/shutdown${reason ? ` (${reason})` : ""}`)
        ).catch((error) => {
          consola5.error("shutdown owner rejected", error);
        });
      } catch (error) {
        consola5.error("shutdown owner threw", error);
      }
    }, 250);
    timer.unref();
    return c.json({ ok: true, draining: true }, 202);
  });
  return app;
}

// src/routes/messages/route.ts
import { Hono as Hono6 } from "hono";

// src/routes/messages/count-tokens-handler.ts
import consola7 from "consola";

// src/lib/models/tokenizer.ts
var ENCODING_MAP = {
  o200k_base: () => import("gpt-tokenizer/encoding/o200k_base"),
  cl100k_base: () => import("gpt-tokenizer/encoding/cl100k_base"),
  p50k_base: () => import("gpt-tokenizer/encoding/p50k_base"),
  p50k_edit: () => import("gpt-tokenizer/encoding/p50k_edit"),
  r50k_base: () => import("gpt-tokenizer/encoding/r50k_base")
};
var encodingCache = /* @__PURE__ */ new Map();
var calculateToolCallsTokens = (toolCalls, encoder, constants) => {
  let tokens = 0;
  for (const toolCall of toolCalls) {
    tokens += constants.funcInit;
    tokens += encoder.encode(toolCall.id).length;
    tokens += encoder.encode(toolCall.function.name).length;
    tokens += encoder.encode(toolCall.function.arguments).length;
  }
  tokens += constants.funcEnd;
  return tokens;
};
var calculateContentPartsTokens = (contentParts, encoder) => {
  let tokens = 0;
  for (const part of contentParts) {
    if (part.type === "image_url") {
      tokens += encoder.encode(part.image_url.url).length + 85;
    } else if (part.text) {
      tokens += encoder.encode(part.text).length;
    }
  }
  return tokens;
};
var calculateMessageTokens = (message, encoder, constants) => {
  const tokensPerMessage = 3;
  const tokensPerName = 1;
  let tokens = tokensPerMessage;
  for (const [key, value] of Object.entries(message)) {
    if (key === "reasoning_opaque") {
      continue;
    }
    if (typeof value === "string") {
      tokens += encoder.encode(value).length;
    }
    if (key === "name") {
      tokens += tokensPerName;
    }
    if (key === "tool_calls" && Array.isArray(value)) {
      tokens += calculateToolCallsTokens(
        value,
        encoder,
        constants
      );
    }
    if (key === "content" && Array.isArray(value)) {
      tokens += calculateContentPartsTokens(
        value,
        encoder
      );
    }
  }
  return tokens;
};
var calculateTokens = (messages, encoder, constants) => {
  if (messages.length === 0) {
    return 0;
  }
  let numTokens = 0;
  for (const message of messages) {
    numTokens += calculateMessageTokens(message, encoder, constants);
  }
  numTokens += 3;
  return numTokens;
};
var getEncodeChatFunction = async (encoding) => {
  if (encodingCache.has(encoding)) {
    const cached = encodingCache.get(encoding);
    if (cached) {
      return cached;
    }
  }
  const supportedEncoding = encoding;
  if (!(supportedEncoding in ENCODING_MAP)) {
    const fallbackModule = await ENCODING_MAP.o200k_base();
    encodingCache.set(encoding, fallbackModule);
    return fallbackModule;
  }
  const encodingModule = await ENCODING_MAP[supportedEncoding]();
  encodingCache.set(encoding, encodingModule);
  return encodingModule;
};
var getTokenizerFromModel = (model) => {
  return model.capabilities.tokenizer || "o200k_base";
};
var getModelConstants = (model) => {
  return model.id === "gpt-3.5-turbo" || model.id === "gpt-4" ? {
    funcInit: 10,
    propInit: 3,
    propKey: 3,
    enumInit: -3,
    enumItem: 3,
    funcEnd: 12,
    isGpt: true
  } : {
    funcInit: 7,
    propInit: 3,
    propKey: 3,
    enumInit: -3,
    enumItem: 3,
    funcEnd: 12,
    isGpt: model.id.startsWith("gpt-")
  };
};
var calculateParameterTokens = (key, prop, context) => {
  const { encoder, constants } = context;
  let tokens = constants.propKey;
  if (typeof prop !== "object" || prop === null) {
    return tokens;
  }
  const param = prop;
  const paramName = key;
  const paramType = param.type || "string";
  let paramDesc = param.description || "";
  if (param.enum && Array.isArray(param.enum)) {
    tokens += constants.enumInit;
    for (const item of param.enum) {
      tokens += constants.enumItem;
      tokens += encoder.encode(String(item)).length;
    }
  }
  if (paramDesc.endsWith(".")) {
    paramDesc = paramDesc.slice(0, -1);
  }
  const line = `${paramName}:${paramType}:${paramDesc}`;
  tokens += encoder.encode(line).length;
  if (param.type === "array" && param["items"]) {
    tokens += calculateParametersTokens(param["items"], encoder, constants);
  }
  const excludedKeys = /* @__PURE__ */ new Set(["type", "description", "enum", "items"]);
  for (const propertyName of Object.keys(param)) {
    if (!excludedKeys.has(propertyName)) {
      const propertyValue = param[propertyName];
      const propertyText = typeof propertyValue === "string" ? propertyValue : JSON.stringify(propertyValue);
      tokens += encoder.encode(`${propertyName}:${propertyText}`).length;
    }
  }
  return tokens;
};
var calculatePropertiesTokens = (properties, encoder, constants) => {
  let tokens = 0;
  if (Object.keys(properties).length > 0) {
    tokens += constants.propInit;
    for (const propKey of Object.keys(properties)) {
      tokens += calculateParameterTokens(propKey, properties[propKey], {
        encoder,
        constants
      });
    }
  }
  return tokens;
};
var calculateParametersTokens = (parameters, encoder, constants) => {
  if (!parameters || typeof parameters !== "object") {
    return 0;
  }
  const params = parameters;
  let tokens = 0;
  const excludedKeys = /* @__PURE__ */ new Set(["$schema", "additionalProperties"]);
  for (const [key, value] of Object.entries(params)) {
    if (excludedKeys.has(key)) {
      continue;
    }
    if (key === "properties") {
      tokens += calculatePropertiesTokens(
        value,
        encoder,
        constants
      );
    } else {
      const paramText = typeof value === "string" ? value : JSON.stringify(value);
      tokens += encoder.encode(`${key}:${paramText}`).length;
    }
  }
  return tokens;
};
var calculateToolTokens = (tool, encoder, constants) => {
  let tokens = constants.funcInit;
  const func = tool.function;
  const fName = func.name;
  let fDesc = func.description || "";
  if (fDesc.endsWith(".")) {
    fDesc = fDesc.slice(0, -1);
  }
  const line = fName + ":" + fDesc;
  tokens += encoder.encode(line).length;
  if (typeof func.parameters === "object" && func.parameters !== null) {
    tokens += calculateParametersTokens(func.parameters, encoder, constants);
  }
  return tokens;
};
var numTokensForTools = (tools, encoder, constants) => {
  let funcTokenCount = 0;
  if (constants.isGpt) {
    for (const tool of tools) {
      funcTokenCount += calculateToolTokens(tool, encoder, constants);
    }
    funcTokenCount += constants.funcEnd;
  } else {
    for (const tool of tools) {
      funcTokenCount += encoder.encode(JSON.stringify(tool)).length;
    }
  }
  return funcTokenCount;
};
var getTokenCount = async (payload, model) => {
  const tokenizer = getTokenizerFromModel(model);
  const encoder = await getEncodeChatFunction(tokenizer);
  const simplifiedMessages = payload.messages;
  const inputMessages = simplifiedMessages.filter(
    (msg) => msg.role !== "assistant"
  );
  const outputMessages = simplifiedMessages.filter(
    (msg) => msg.role === "assistant"
  );
  const constants = getModelConstants(model);
  let inputTokens = calculateTokens(inputMessages, encoder, constants);
  if (payload.tools && payload.tools.length > 0) {
    inputTokens += numTokensForTools(payload.tools, encoder, constants);
  }
  const outputTokens = calculateTokens(outputMessages, encoder, constants);
  return {
    input: inputTokens,
    output: outputTokens
  };
};

// src/lib/models/models.ts
var findEndpointModel = (sdkModelId) => findInModels(sdkModelId, state.models?.data ?? []);
var findInModels = (sdkModelId, models) => {
  const exactMatch = models.find((m) => m.id === sdkModelId);
  if (exactMatch) return exactMatch;
  const normalized = normalizeSdkModelId(sdkModelId);
  if (!normalized) return void 0;
  const modelName = `claude-${normalized.family}-${normalized.version}`;
  const byName = models.find(
    (m) => m.id === modelName || m.version === modelName
  );
  if (byName) return byName;
  return models.find((m) => {
    const c = normalizeSdkModelId(m.version) ?? normalizeSdkModelId(m.capabilities.family) ?? normalizeSdkModelId(m.id);
    if (!c) return false;
    return c.family === normalized.family && c.version === normalized.version;
  });
};
var normalizeSdkModelId = (sdkModelId) => {
  const lower = sdkModelId.toLowerCase();
  const withoutDate = lower.replace(/-\d{8}$/, "");
  const pattern1 = withoutDate.match(/^claude-(\w+)-(\d+)-(\d+)$/);
  if (pattern1) {
    return { family: pattern1[1], version: `${pattern1[2]}.${pattern1[3]}` };
  }
  const pattern2 = withoutDate.match(/^claude-(\d+)-(\d+)-(\w+)$/);
  if (pattern2) {
    return { family: pattern2[3], version: `${pattern2[1]}.${pattern2[2]}` };
  }
  const pattern3 = withoutDate.match(/^claude-(\w+)-(\d+)\.(\d+)$/);
  if (pattern3) {
    return { family: pattern3[1], version: `${pattern3[2]}.${pattern3[3]}` };
  }
  const pattern4 = withoutDate.match(/^claude-(\w+)-(\d+)$/);
  if (pattern4) {
    return { family: pattern4[1], version: pattern4[2] };
  }
  const pattern5 = withoutDate.match(/^claude-(\d+)-(\w+)$/);
  if (pattern5) {
    return { family: pattern5[2], version: pattern5[1] };
  }
  return void 0;
};

// src/routes/messages/utils.ts
import consola6 from "consola";
function parseToolCallArguments(rawArguments) {
  if (typeof rawArguments !== "string" || rawArguments.trim().length === 0) {
    return {};
  }
  try {
    const parsed = JSON.parse(rawArguments);
    if (Array.isArray(parsed)) {
      return { arguments: parsed };
    }
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  } catch (error) {
    consola6.warn("Failed to parse tool call arguments", { error, rawArguments });
  }
  return { raw_arguments: rawArguments };
}
function mapOpenAIStopReasonToAnthropic(finishReason) {
  if (finishReason === null) {
    return null;
  }
  const stopReasonMap = {
    stop: "end_turn",
    length: "max_tokens",
    tool_calls: "tool_use",
    content_filter: "end_turn"
  };
  return stopReasonMap[finishReason];
}

// src/routes/messages/non-stream-translation.ts
var THINKING_TEXT = "Thinking...";
function translateToOpenAI(payload) {
  const modelId = payload.model;
  const model = state.models?.data.find((m) => m.id === modelId);
  const thinkingBudget = getThinkingBudget(payload, model);
  return {
    model: modelId,
    messages: translateAnthropicMessagesToOpenAI(payload, modelId),
    max_tokens: payload.max_tokens,
    stop: payload.stop_sequences,
    stream: payload.stream,
    temperature: payload.temperature,
    top_p: payload.top_p,
    user: payload.metadata?.user_id,
    tools: translateAnthropicToolsToOpenAI(payload.tools),
    tool_choice: translateAnthropicToolChoiceToOpenAI(payload.tool_choice),
    thinking_budget: thinkingBudget
  };
}
function getThinkingBudget(payload, model) {
  const thinking = payload.thinking;
  if (model && thinking) {
    const profile = resolveModelProfile(model);
    const maxThinkingBudget = Math.min(
      profile.maxThinkingBudget,
      profile.maxOutputTokens - 1
    );
    thinking.budget_tokens ??= maxThinkingBudget;
    if (maxThinkingBudget > 0) {
      const budgetTokens = Math.min(thinking.budget_tokens, maxThinkingBudget);
      return Math.max(budgetTokens, profile.minThinkingBudget);
    }
  }
  return void 0;
}
function translateAnthropicMessagesToOpenAI(payload, modelId) {
  const systemMessages = handleSystemPrompt(payload.system);
  const otherMessages = payload.messages.flatMap(
    (message) => message.role === "user" ? handleUserMessage(message) : handleAssistantMessage(message, modelId)
  );
  return [...systemMessages, ...otherMessages];
}
function handleSystemPrompt(system) {
  if (!system) {
    return [];
  }
  if (typeof system === "string") {
    return [{ role: "system", content: system }];
  } else {
    const systemText = system.map((block) => {
      return block.text;
    }).join("\n\n");
    return [{ role: "system", content: systemText }];
  }
}
function handleUserMessage(message) {
  const newMessages = [];
  if (Array.isArray(message.content)) {
    const toolResultBlocks = message.content.filter(
      (block) => block.type === "tool_result"
    );
    const otherBlocks = message.content.filter(
      (block) => block.type !== "tool_result"
    );
    for (const block of toolResultBlocks) {
      newMessages.push({
        role: "tool",
        tool_call_id: block.tool_use_id,
        content: mapContent(block.content)
      });
    }
    if (otherBlocks.length > 0) {
      newMessages.push({
        role: "user",
        content: mapContent(otherBlocks)
      });
    }
  } else {
    newMessages.push({
      role: "user",
      content: mapContent(message.content)
    });
  }
  return newMessages;
}
function handleAssistantMessage(message, modelId) {
  if (!Array.isArray(message.content)) {
    return [
      {
        role: "assistant",
        content: mapContent(message.content)
      }
    ];
  }
  const toolUseBlocks = message.content.filter(
    (block) => block.type === "tool_use"
  );
  let thinkingBlocks = message.content.filter(
    (block) => block.type === "thinking"
  );
  if (modelId.startsWith("claude")) {
    thinkingBlocks = thinkingBlocks.filter(
      (b) => b.thinking && b.thinking !== THINKING_TEXT && b.signature && !b.signature.includes("@")
    );
  }
  const thinkingContents = thinkingBlocks.filter((b) => b.thinking && b.thinking !== THINKING_TEXT).map((b) => b.thinking);
  const allThinkingContent = thinkingContents.length > 0 ? thinkingContents.join("\n\n") : void 0;
  const signature = thinkingBlocks.find((b) => b.signature)?.signature;
  return toolUseBlocks.length > 0 ? [
    {
      role: "assistant",
      content: mapContent(message.content),
      reasoning_text: allThinkingContent,
      reasoning_opaque: signature,
      tool_calls: toolUseBlocks.map((toolUse) => ({
        id: toolUse.id,
        type: "function",
        function: {
          name: toolUse.name,
          arguments: JSON.stringify(toolUse.input)
        }
      }))
    }
  ] : [
    {
      role: "assistant",
      content: mapContent(message.content),
      reasoning_text: allThinkingContent,
      reasoning_opaque: signature
    }
  ];
}
function mapContent(content) {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return null;
  }
  const contentParts = [];
  for (const block of content) {
    switch (block.type) {
      case "text": {
        contentParts.push({ type: "text", text: block.text });
        break;
      }
      case "image": {
        contentParts.push({
          type: "image_url",
          image_url: {
            url: `data:${block.source.media_type};base64,${block.source.data}`
          }
        });
        break;
      }
      case "document": {
        contentParts.push(createDocumentTextPart());
        break;
      }
      case "tool_reference": {
        contentParts.push({
          type: "text",
          text: `Tool ${block.tool_name} loaded`
        });
        break;
      }
    }
  }
  return contentParts;
}
function createDocumentTextPart() {
  return {
    type: "text",
    text: "A PDF document was attached, but this api cannot send PDF inputs directly. Analyze using other tools."
  };
}
function translateAnthropicToolsToOpenAI(anthropicTools) {
  if (!anthropicTools) {
    return void 0;
  }
  return anthropicTools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: normalizeToolSchema(tool.input_schema)
    }
  }));
}
var normalizeToolSchema = (schema) => {
  if (schema.type === "object" && !schema.properties) {
    return { ...schema, properties: {} };
  }
  return schema;
};
function translateAnthropicToolChoiceToOpenAI(anthropicToolChoice) {
  if (!anthropicToolChoice) {
    return void 0;
  }
  switch (anthropicToolChoice.type) {
    case "auto": {
      return "auto";
    }
    case "any": {
      return "required";
    }
    case "tool": {
      if (anthropicToolChoice.name) {
        return {
          type: "function",
          function: { name: anthropicToolChoice.name }
        };
      }
      return void 0;
    }
    case "none": {
      return "none";
    }
    default: {
      return void 0;
    }
  }
}
function translateToAnthropic(response) {
  const assistantContentBlocks = [];
  let stopReason = response.choices[0]?.finish_reason ?? null;
  for (const choice of response.choices) {
    const textBlocks = getAnthropicTextBlocks(choice.message.content);
    const thinkBlocks = getAnthropicThinkBlocks(
      choice.message.reasoning_text,
      choice.message.reasoning_opaque
    );
    const toolUseBlocks = getAnthropicToolUseBlocks(choice.message.tool_calls);
    assistantContentBlocks.push(...thinkBlocks, ...textBlocks, ...toolUseBlocks);
    if (choice.finish_reason === "tool_calls" || stopReason === "stop") {
      stopReason = choice.finish_reason;
    }
  }
  return {
    id: response.id,
    type: "message",
    role: "assistant",
    model: response.model,
    content: assistantContentBlocks,
    stop_reason: mapOpenAIStopReasonToAnthropic(stopReason),
    stop_sequence: null,
    usage: {
      input_tokens: (response.usage?.prompt_tokens ?? 0) - (response.usage?.prompt_tokens_details?.cached_tokens ?? 0),
      output_tokens: response.usage?.completion_tokens ?? 0,
      ...response.usage?.prompt_tokens_details?.cached_tokens !== void 0 && {
        cache_read_input_tokens: response.usage.prompt_tokens_details.cached_tokens
      }
    }
  };
}
function getAnthropicTextBlocks(messageContent) {
  if (typeof messageContent === "string" && messageContent.length > 0) {
    return [{ type: "text", text: messageContent }];
  }
  if (Array.isArray(messageContent)) {
    return messageContent.filter((part) => part.type === "text").map((part) => ({ type: "text", text: part.text }));
  }
  return [];
}
function getAnthropicThinkBlocks(reasoningText, reasoningOpaque) {
  if (reasoningText && reasoningText.length > 0) {
    return [
      {
        type: "thinking",
        thinking: reasoningText,
        signature: reasoningOpaque || ""
      }
    ];
  }
  if (reasoningOpaque && reasoningOpaque.length > 0) {
    return [
      {
        type: "thinking",
        thinking: THINKING_TEXT,
        // Compatible with opencode, it will filter out blocks where the thinking text is empty, so we add a default thinking text here
        signature: reasoningOpaque
      }
    ];
  }
  return [];
}
function getAnthropicToolUseBlocks(toolCalls) {
  if (!toolCalls) {
    return [];
  }
  return toolCalls.map((toolCall) => ({
    type: "tool_use",
    id: toolCall.id,
    name: toolCall.function.name,
    input: parseToolCallArguments(toolCall.function.arguments)
  }));
}

// src/routes/messages/preprocess.ts
var TOOL_REFERENCE_TURN_BOUNDARY = "Tool loaded.";
var IDE_EXECUTE_CODE_TOOL = "mcp__ide__executeCode";
var IDE_GET_DIAGNOSTICS_TOOL = "mcp__ide__getDiagnostics";
var IDE_GET_DIAGNOSTICS_DESCRIPTION = "Get language diagnostics from VS Code. Returns errors, warnings, information, and hints for files in the workspace.";
var PDF_FILE_READ_PREFIX = "PDF file read:";
var stripUnsupportedTopLevelAnthropicFields = (payload) => {
  delete payload.diagnostics;
};
var getCompactCandidateText = (message) => {
  if (message.role !== "user") {
    return "";
  }
  if (typeof message.content === "string") {
    return message.content;
  }
  return message.content.filter((block) => block.type === "text").map(
    (block) => block.text.startsWith("<system-reminder>") ? "" : block.text
  ).filter((text) => text.length > 0).join("\n\n");
};
var isCompactMessage = (lastMessage) => {
  const text = getCompactCandidateText(lastMessage);
  if (!text) {
    return false;
  }
  return text.includes(compactTextOnlyGuard) && text.includes(compactSummaryPromptStart) && compactMessageSections.some((section) => text.includes(section));
};
var isCompactAutoContinueMessage = (lastMessage) => {
  const text = getCompactCandidateText(lastMessage);
  return Boolean(text) && compactAutoContinuePromptStarts.some(
    (promptStart) => text.startsWith(promptStart)
  );
};
var getCompactType = (anthropicPayload) => {
  const lastMessage = anthropicPayload.messages.at(-1);
  if (lastMessage && isCompactMessage(lastMessage)) {
    return COMPACT_REQUEST;
  }
  if (lastMessage && isCompactAutoContinueMessage(lastMessage)) {
    return COMPACT_AUTO_CONTINUE;
  }
  const system = anthropicPayload.system;
  if (typeof system === "string") {
    const hasCompactSystemPrompt2 = compactSystemPromptStarts.some(
      (promptStart) => system.startsWith(promptStart)
    );
    return hasCompactSystemPrompt2 ? COMPACT_REQUEST : 0;
  }
  if (!Array.isArray(system)) return 0;
  const hasCompactSystemPrompt = system.some(
    (msg) => typeof msg.text === "string" && compactSystemPromptStarts.some(
      (promptStart) => msg.text.startsWith(promptStart)
    )
  );
  if (hasCompactSystemPrompt) {
    return COMPACT_REQUEST;
  }
  return 0;
};
var resultBlocks = (tr) => Array.isArray(tr.content) ? tr.content : [];
var mergeContentWithText = (tr, textBlock) => {
  if (typeof tr.content === "string") {
    return { ...tr, content: `${tr.content}

${textBlock.text}` };
  }
  if (hasToolRef(tr)) {
    return tr;
  }
  return {
    ...tr,
    content: [...resultBlocks(tr), textBlock]
  };
};
var mergeContentWithTexts = (tr, textBlocks) => {
  if (typeof tr.content === "string") {
    const appendedTexts = textBlocks.map((tb) => tb.text).join("\n\n");
    return { ...tr, content: `${tr.content}

${appendedTexts}` };
  }
  if (hasToolRef(tr)) {
    return tr;
  }
  return { ...tr, content: [...resultBlocks(tr), ...textBlocks] };
};
var mergeContentWithAttachments = (tr, attachments) => {
  if (typeof tr.content === "string") {
    return {
      ...tr,
      content: [{ type: "text", text: tr.content }, ...attachments]
    };
  }
  return {
    ...tr,
    content: [...resultBlocks(tr), ...attachments]
  };
};
var isAttachmentBlock = (block) => {
  return block.type === "image" || block.type === "document";
};
var getMergeableToolResultIndices = (toolResults) => {
  return toolResults.flatMap(
    (block, index) => block.is_error || hasToolRef(block) ? [] : [index]
  );
};
var mergeAttachmentsIntoToolResults = (toolResults, attachmentsByToolResultIndex) => {
  if (attachmentsByToolResultIndex.size === 0) {
    return toolResults;
  }
  return toolResults.map((block, index) => {
    const matchedAttachments = attachmentsByToolResultIndex.get(index);
    if (!matchedAttachments) {
      return block;
    }
    const orderedAttachments = [...matchedAttachments].sort((left, right) => left.order - right.order).map(({ attachment }) => attachment);
    return mergeContentWithAttachments(block, orderedAttachments);
  });
};
var assignAttachmentsToToolResults = (target, attachments, options) => {
  const { toolResultIndices } = options;
  const fallbackToolResultIndices = options.fallbackToolResultIndices ?? toolResultIndices;
  if (attachments.length === 0) {
    return;
  }
  if (toolResultIndices.length > 0 && toolResultIndices.length === attachments.length) {
    for (const [index, toolResultIndex] of toolResultIndices.entries()) {
      const currentAttachments2 = target.get(toolResultIndex);
      if (currentAttachments2) {
        currentAttachments2.push(attachments[index]);
        continue;
      }
      target.set(toolResultIndex, [attachments[index]]);
    }
    return;
  }
  const lastToolResultIndex = fallbackToolResultIndices.at(-1);
  if (lastToolResultIndex === void 0) {
    return;
  }
  const currentAttachments = target.get(lastToolResultIndex);
  if (currentAttachments) {
    currentAttachments.push(...attachments);
    return;
  }
  target.set(lastToolResultIndex, [...attachments]);
};
var startsWithPdfFileRead = (toolResult) => {
  if (typeof toolResult.content === "string") {
    return toolResult.content.startsWith(PDF_FILE_READ_PREFIX);
  }
  const blocks = resultBlocks(toolResult);
  if (blocks.some((block) => block.type === "document")) {
    return false;
  }
  if (blocks.length === 0) {
    return false;
  }
  const firstBlock = blocks[0];
  if (firstBlock.type !== "text") {
    return false;
  }
  return firstBlock.text.startsWith(PDF_FILE_READ_PREFIX);
};
var collectMergeableUserContent = (content) => {
  const toolResults = [];
  const textBlocks = [];
  const attachments = [];
  for (const [order, block] of content.entries()) {
    if (block.type === "tool_result") {
      toolResults.push(block);
      continue;
    }
    if (block.type === "text") {
      textBlocks.push(block);
      continue;
    }
    if (isAttachmentBlock(block)) {
      attachments.push({ attachment: block, order });
      continue;
    }
    return null;
  }
  return {
    toolResults,
    textBlocks,
    attachments
  };
};
var mergeAttachmentsForToolResults = (toolResults, attachments) => {
  if (attachments.length === 0) {
    return toolResults;
  }
  const documentBlocks = attachments.filter(
    ({ attachment }) => attachment.type === "document"
  );
  const mergeableToolResultIndices = getMergeableToolResultIndices(toolResults);
  const pdfReadToolResultIndices = mergeableToolResultIndices.filter(
    (index) => startsWithPdfFileRead(toolResults[index])
  );
  const attachmentsByToolResultIndex = /* @__PURE__ */ new Map();
  let remainingAttachments = attachments;
  let countMatchToolResultIndices = mergeableToolResultIndices;
  if (documentBlocks.length > 0 && pdfReadToolResultIndices.length > 0) {
    const matchedDocumentCount = Math.min(
      pdfReadToolResultIndices.length,
      documentBlocks.length
    );
    const matchedDocuments = documentBlocks.slice(0, matchedDocumentCount);
    const matchedDocumentOrders = new Set(
      matchedDocuments.map(({ order }) => order)
    );
    const matchedPdfToolResultIndices = pdfReadToolResultIndices.slice(
      0,
      matchedDocumentCount
    );
    const matchedPdfToolResultIndexSet = new Set(matchedPdfToolResultIndices);
    assignAttachmentsToToolResults(
      attachmentsByToolResultIndex,
      matchedDocuments,
      {
        toolResultIndices: matchedPdfToolResultIndices
      }
    );
    countMatchToolResultIndices = mergeableToolResultIndices.filter(
      (index) => !matchedPdfToolResultIndexSet.has(index)
    );
    remainingAttachments = attachments.filter(
      ({ attachment, order }) => attachment.type !== "document" || !matchedDocumentOrders.has(order)
    );
  }
  assignAttachmentsToToolResults(
    attachmentsByToolResultIndex,
    remainingAttachments,
    {
      toolResultIndices: countMatchToolResultIndices,
      fallbackToolResultIndices: mergeableToolResultIndices
    }
  );
  return mergeAttachmentsIntoToolResults(
    toolResults,
    attachmentsByToolResultIndex
  );
};
var mergeUserMessageContent = (content) => {
  const mergeableContent = collectMergeableUserContent(content);
  if (!mergeableContent) {
    return null;
  }
  const { toolResults, textBlocks, attachments } = mergeableContent;
  if (toolResults.length === 0 || textBlocks.length === 0 && attachments.length === 0) {
    return null;
  }
  const mergedToolResults = textBlocks.length === 0 ? toolResults : mergeToolResult(toolResults, textBlocks);
  return mergeAttachmentsForToolResults(mergedToolResults, attachments);
};
var mergeToolResult = (toolResults, textBlocks) => {
  if (toolResults.length === textBlocks.length) {
    return toolResults.map((tr, i) => mergeContentWithText(tr, textBlocks[i]));
  }
  const lastIndex = toolResults.length - 1;
  return toolResults.map(
    (tr, i) => i === lastIndex ? mergeContentWithTexts(tr, textBlocks) : tr
  );
};
var stripToolReferenceTurnBoundary = (anthropicPayload) => {
  for (const msg of anthropicPayload.messages) {
    if (msg.role !== "user" || !Array.isArray(msg.content)) continue;
    const hasToolReference = msg.content.some(
      (block) => block.type === "tool_result" && hasToolRef(block)
    );
    if (!hasToolReference) continue;
    msg.content = msg.content.filter(
      (block) => block.type !== "text" || block.text.trim() !== TOOL_REFERENCE_TURN_BOUNDARY
    );
  }
};
var mergeToolResultForClaude = (anthropicPayload, options) => {
  const lastMessageIndex = anthropicPayload.messages.length - 1;
  for (const [index, msg] of anthropicPayload.messages.entries()) {
    if (options?.skipLastMessage && index === lastMessageIndex) continue;
    if (msg.role !== "user" || !Array.isArray(msg.content)) continue;
    const mergedContent = mergeUserMessageContent(msg.content);
    if (mergedContent) {
      msg.content = mergedContent;
    }
  }
};
var sanitizeIdeTools = (payload) => {
  if (!payload.tools || payload.tools.length === 0) {
    return;
  }
  payload.tools = payload.tools.flatMap((tool) => {
    if (tool.name === IDE_EXECUTE_CODE_TOOL && !tool.defer_loading) {
      return [];
    }
    if (tool.name === IDE_GET_DIAGNOSTICS_TOOL) {
      return [
        {
          ...tool,
          description: IDE_GET_DIAGNOSTICS_DESCRIPTION
        }
      ];
    }
    return [tool];
  });
};
var hasToolRef = (block) => {
  return Array.isArray(block.content) && block.content.some((c) => c.type === "tool_reference");
};
var stripCacheControlScope = (obj) => {
  if (!obj || typeof obj !== "object") return;
  const record = obj;
  const cc = record.cache_control;
  if (cc && typeof cc === "object") {
    const { scope: _scope, ...rest } = cc;
    record.cache_control = rest;
  }
};
var stripCacheControl = (payload) => {
  if (Array.isArray(payload.system)) {
    for (const block of payload.system) {
      stripCacheControlScope(block);
    }
  }
  if (payload.tools) {
    for (const tool of payload.tools) {
      stripCacheControlScope(tool);
      delete tool.eager_input_streaming;
    }
  }
  for (const msg of payload.messages) {
    if (!Array.isArray(msg.content)) continue;
    for (const block of msg.content) {
      if (block.type !== "tool_result" || !Array.isArray(block.content))
        continue;
      for (const inner of block.content) {
        const b = inner;
        if ("cache_control" in b) {
          delete b.cache_control;
        }
      }
    }
  }
};
var filterAssistantThinkingBlocks = (payload) => {
  for (const msg of payload.messages) {
    if (msg.role === "assistant" && Array.isArray(msg.content)) {
      msg.content = msg.content.filter((block) => {
        if (block.type !== "thinking") return true;
        return block.thinking && block.thinking !== "Thinking..." && block.signature && !block.signature.includes("@");
      });
    }
  }
};
var stripSamplingParams = (payload, selectedModel) => {
  if (selectedModel && resolveModelProfile(selectedModel).isReasoning) {
    delete payload.temperature;
    delete payload.top_p;
    delete payload.top_k;
  }
  if (payload.temperature !== void 0 && payload.top_p !== void 0) {
    delete payload.top_p;
  }
};
var applyAdaptiveThinking = (payload, selectedModel) => {
  const incomingDisplay = payload.thinking?.display;
  const clientDisabledThinking = payload.thinking?.type === "disabled";
  const toolChoice = payload.tool_choice;
  const disableThink = toolChoice?.type === "any" || toolChoice?.type === "tool" || clientDisabledThinking;
  if (!selectedModel || disableThink) {
    return;
  }
  const profile = resolveModelProfile(selectedModel);
  if (!profile.supportsAdaptiveThinking) {
    return;
  }
  payload.thinking = {
    type: "adaptive"
  };
  payload.thinking.display = incomingDisplay ?? "summarized";
  if (payload.model === "claude-opus-4.7") {
    payload.thinking.display = "summarized";
  }
  let effort = getReasoningEffortForModel(payload.model);
  if (effort === "none" || effort === "minimal") {
    effort = "low";
  }
  const reasoningEffort = profile.reasoningEffortLadder;
  if (reasoningEffort && !reasoningEffort.includes(effort)) {
    effort = reasoningEffort.at(-1);
  }
  payload.output_config = {
    effort
  };
};
var MESSAGES_API_PASSES = [
  { name: "stripCacheControl", run: (payload) => stripCacheControl(payload) },
  {
    name: "filterAssistantThinkingBlocks",
    run: (payload) => filterAssistantThinkingBlocks(payload)
  },
  {
    name: "stripSamplingParams",
    run: (payload, selectedModel) => stripSamplingParams(payload, selectedModel)
  },
  {
    name: "applyAdaptiveThinking",
    run: (payload, selectedModel) => applyAdaptiveThinking(payload, selectedModel)
  }
];
var prepareMessagesApiPayload = (payload, selectedModel) => {
  for (const pass of MESSAGES_API_PASSES) {
    pass.run(payload, selectedModel);
  }
};

// src/routes/messages/count-tokens-handler.ts
async function countTokensViaAnthropic(c, payload) {
  if (!payload.model.startsWith("claude")) return null;
  if (!getAnthropicApiKey()) return null;
  const model = payload.model.replaceAll(".", "-");
  const res = await sendRequest(
    "https://api.anthropic.com/v1/messages/count_tokens",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "anthropic-version": ANTHROPIC_API_VERSION,
        "anthropic-beta": "token-counting-2024-11-01"
      },
      body: JSON.stringify({ ...payload, model })
    }
  );
  if (!res.ok) {
    consola7.warn(
      "Anthropic count_tokens failed:",
      res.status,
      await res.text().catch(() => ""),
      "- falling back to estimation"
    );
    return null;
  }
  const result = await res.json();
  consola7.info("Token count (Anthropic API):", result.input_tokens);
  return c.json(result);
}
async function handleCountTokens(c) {
  try {
    const anthropicPayload = await c.req.json();
    stripUnsupportedTopLevelAnthropicFields(anthropicPayload);
    anthropicPayload.model = reverseId(anthropicPayload.model);
    const anthropicResult = await countTokensViaAnthropic(c, anthropicPayload);
    if (anthropicResult) return anthropicResult;
    const anthropicBeta = c.req.header("anthropic-beta");
    const openAIPayload = translateToOpenAI(anthropicPayload);
    const selectedModel = findEndpointModel(anthropicPayload.model);
    anthropicPayload.model = selectedModel?.id ?? anthropicPayload.model;
    if (!selectedModel) {
      consola7.warn("Model not found, returning default token count");
      return c.json({
        input_tokens: 1
      });
    }
    const tokenCount = await getTokenCount(openAIPayload, selectedModel);
    if (anthropicPayload.tools && anthropicPayload.tools.length > 0) {
      let addToolSystemPromptCount = false;
      if (anthropicBeta) {
        const toolsLength = anthropicPayload.tools.length;
        addToolSystemPromptCount = !anthropicPayload.tools.some(
          (tool) => tool.name.startsWith("mcp__") || tool.name === "Skill" && toolsLength === 1
        );
      }
      if (addToolSystemPromptCount) {
        if (anthropicPayload.model.startsWith("claude")) {
          tokenCount.input = tokenCount.input + 346;
        } else if (anthropicPayload.model.startsWith("grok")) {
          tokenCount.input = tokenCount.input + 120;
        }
      }
    }
    let finalTokenCount = tokenCount.input + tokenCount.output;
    if (anthropicPayload.model.startsWith("claude")) {
      finalTokenCount = Math.round(finalTokenCount * getClaudeTokenMultiplier());
    }
    consola7.info("Token count:", finalTokenCount);
    return c.json({
      input_tokens: finalTokenCount
    });
  } catch (error) {
    consola7.error("Error counting tokens:", error);
    return c.json({
      input_tokens: 1
    });
  }
}

// src/routes/messages/handler.ts
import { z as z5 } from "zod";

// src/routes/messages/api-flows.ts
import { streamSSE as streamSSE3 } from "hono/streaming";

// src/routes/messages/responses-translation.ts
var MESSAGE_TYPE = "message";
var COMPACTION_SIGNATURE_PREFIX = "cm1#";
var COMPACTION_SIGNATURE_SEPARATOR = "@";
var THINKING_TEXT2 = "Thinking...";
var translateAnthropicMessagesToResponsesPayload = (payload) => {
  const input = [];
  const applyPhase = shouldApplyPhase(payload.model);
  for (const message of payload.messages) {
    input.push(...translateMessage(message, applyPhase));
  }
  const translatedTools = convertAnthropicTools(payload.tools);
  const toolChoice = convertAnthropicToolChoice(payload.tool_choice);
  const { sessionId: promptCacheKey } = parseUserIdMetadata(
    payload.metadata?.user_id
  );
  const responsesPayload = {
    model: payload.model,
    input,
    instructions: translateSystemPrompt(payload.system, payload.model),
    temperature: 1,
    // reasoning high temperature fixed to 1
    top_p: payload.top_p ?? null,
    max_output_tokens: Math.max(payload.max_tokens, 12800),
    tools: translatedTools,
    tool_choice: toolChoice,
    metadata: payload.metadata ? { ...payload.metadata } : null,
    prompt_cache_key: promptCacheKey,
    // prompt_cache_retention is Copilot/OpenAI-Responses-specific and is set
    // AFTER translation in the flow handler (api-flows.ts) so this pure
    // translator stays free of config I/O. See getPromptCacheRetention.
    stream: payload.stream ?? null,
    store: false,
    parallel_tool_calls: true,
    reasoning: {
      effort: getReasoningEffortForModel(payload.model),
      summary: "detailed"
    },
    include: ["reasoning.encrypted_content"]
  };
  return responsesPayload;
};
var encodeCompactionCarrierSignature = (compaction) => {
  return `${COMPACTION_SIGNATURE_PREFIX}${compaction.encrypted_content}${COMPACTION_SIGNATURE_SEPARATOR}${compaction.id}`;
};
var decodeCompactionCarrierSignature = (signature) => {
  if (signature.startsWith(COMPACTION_SIGNATURE_PREFIX)) {
    const raw = signature.slice(COMPACTION_SIGNATURE_PREFIX.length);
    const separatorIndex = raw.indexOf(COMPACTION_SIGNATURE_SEPARATOR);
    if (separatorIndex <= 0 || separatorIndex === raw.length - 1) {
      return void 0;
    }
    const encrypted_content = raw.slice(0, separatorIndex);
    const id = raw.slice(separatorIndex + 1);
    if (!encrypted_content) {
      return void 0;
    }
    return {
      id,
      encrypted_content
    };
  }
  return void 0;
};
var translateMessage = (message, applyPhase) => {
  if (message.role === "user") {
    return translateUserMessage(message);
  }
  return translateAssistantMessage(message, applyPhase);
};
var translateUserMessage = (message) => {
  if (typeof message.content === "string") {
    return [createMessage("user", message.content)];
  }
  if (!Array.isArray(message.content)) {
    return [];
  }
  const items = [];
  const pendingContent = [];
  for (const block of message.content) {
    if (block.type === "tool_result") {
      flushPendingContent(pendingContent, items, { role: "user" });
      items.push(createFunctionCallOutput(block));
      continue;
    }
    const converted = translateUserContentBlock(block);
    if (converted.length > 0) {
      pendingContent.push(...converted);
    }
  }
  flushPendingContent(pendingContent, items, { role: "user" });
  return items;
};
var translateAssistantMessage = (message, applyPhase) => {
  const assistantPhase = resolveAssistantPhase(message.content, applyPhase);
  if (typeof message.content === "string") {
    return [createMessage("assistant", message.content, assistantPhase)];
  }
  if (!Array.isArray(message.content)) {
    return [];
  }
  const items = [];
  const pendingContent = [];
  for (const block of message.content) {
    if (block.type === "tool_use") {
      flushPendingContent(pendingContent, items, {
        role: "assistant",
        phase: assistantPhase
      });
      items.push(createFunctionToolCall(block));
      continue;
    }
    if (block.type === "thinking" && block.signature) {
      const compactionContent = createCompactionContent(block);
      if (compactionContent) {
        flushPendingContent(pendingContent, items, {
          role: "assistant",
          phase: assistantPhase
        });
        items.push(compactionContent);
        continue;
      }
      if (block.signature.includes("@")) {
        flushPendingContent(pendingContent, items, {
          role: "assistant",
          phase: assistantPhase
        });
        items.push(createReasoningContent(block));
        continue;
      }
    }
    const converted = translateAssistantContentBlock(block);
    if (converted) {
      pendingContent.push(converted);
    }
  }
  flushPendingContent(pendingContent, items, {
    role: "assistant",
    phase: assistantPhase
  });
  return items;
};
var translateUserContentBlock = (block) => {
  switch (block.type) {
    case "text": {
      return [createTextContent(block.text)];
    }
    case "image": {
      return [createImageContent(block)];
    }
    case "document": {
      return [createFileContent(block)];
    }
    default: {
      return [];
    }
  }
};
var translateAssistantContentBlock = (block) => {
  switch (block.type) {
    case "text": {
      return createOutPutTextContent(block.text);
    }
    default: {
      return void 0;
    }
  }
};
var flushPendingContent = (pendingContent, target, message) => {
  if (pendingContent.length === 0) {
    return;
  }
  const messageContent = [...pendingContent];
  target.push(createMessage(message.role, messageContent, message.phase));
  pendingContent.length = 0;
};
var createMessage = (role, content, phase) => ({
  type: MESSAGE_TYPE,
  role,
  content,
  ...role === "assistant" && phase ? { phase } : {}
});
var resolveAssistantPhase = (content, applyPhase) => {
  if (!applyPhase) {
    return void 0;
  }
  if (typeof content === "string") {
    return "final_answer";
  }
  if (!Array.isArray(content)) {
    return void 0;
  }
  const hasText = content.some((block) => block.type === "text");
  if (!hasText) {
    return void 0;
  }
  const hasToolUse = content.some((block) => block.type === "tool_use");
  return hasToolUse ? "commentary" : "final_answer";
};
var shouldApplyPhase = (model) => {
  const extraPrompt = getExtraPromptForModel(model);
  return extraPrompt.includes("## Intermediary updates");
};
var createTextContent = (text) => ({
  type: "input_text",
  text
});
var createOutPutTextContent = (text) => ({
  type: "output_text",
  text
});
var createImageContent = (block) => ({
  type: "input_image",
  image_url: `data:${block.source.media_type};base64,${block.source.data}`,
  detail: "auto"
});
var createFileContent = (block) => ({
  type: "input_file",
  file_data: `data:${block.source.media_type};base64,${block.source.data}`,
  filename: block.title ?? "document.pdf"
});
var createReasoningContent = (block) => {
  const { encryptedContent: encryptedContent2, id } = parseReasoningSignature(block.signature);
  const thinking = block.thinking === THINKING_TEXT2 ? "" : block.thinking;
  return {
    id,
    type: "reasoning",
    summary: thinking ? [{ type: "summary_text", text: thinking }] : [],
    encrypted_content: encryptedContent2
  };
};
var createCompactionContent = (block) => {
  const compaction = decodeCompactionCarrierSignature(block.signature);
  if (!compaction) {
    return void 0;
  }
  return {
    id: compaction.id,
    type: "compaction",
    encrypted_content: compaction.encrypted_content
  };
};
var parseReasoningSignature = (signature) => {
  const splitIndex = signature.lastIndexOf("@");
  if (splitIndex <= 0 || splitIndex === signature.length - 1) {
    return { encryptedContent: signature, id: "" };
  }
  return {
    encryptedContent: signature.slice(0, splitIndex),
    id: signature.slice(splitIndex + 1)
  };
};
var createFunctionToolCall = (block) => ({
  type: "function_call",
  call_id: block.id,
  name: block.name,
  arguments: JSON.stringify(block.input),
  status: "completed"
});
var createFunctionCallOutput = (block) => ({
  type: "function_call_output",
  call_id: block.tool_use_id,
  output: convertToolResultContent(block.content),
  status: block.is_error ? "incomplete" : "completed"
});
var translateSystemPrompt = (system, model) => {
  if (!system) {
    return null;
  }
  const extraPrompt = getExtraPromptForModel(model);
  if (typeof system === "string") {
    return system + extraPrompt;
  }
  const text = system.map((block, index) => {
    if (index === 0) {
      return block.text + "\n\n" + extraPrompt + "\n\n";
    }
    return block.text;
  }).join(" ");
  return text.length > 0 ? text : null;
};
var convertAnthropicTools = (tools) => {
  if (!tools || tools.length === 0) {
    return null;
  }
  return tools.map((tool) => ({
    type: "function",
    name: tool.name,
    parameters: normalizeToolSchema(tool.input_schema),
    strict: false,
    ...tool.description ? { description: tool.description } : {}
  }));
};
var convertAnthropicToolChoice = (choice) => {
  if (!choice) {
    return "auto";
  }
  switch (choice.type) {
    case "auto": {
      return "auto";
    }
    case "any": {
      return "required";
    }
    case "tool": {
      return choice.name ? { type: "function", name: choice.name } : "auto";
    }
    case "none": {
      return "none";
    }
    default: {
      return "auto";
    }
  }
};
var translateResponsesResultToAnthropic = (response) => {
  const contentBlocks = mapOutputToAnthropicContent(response.output);
  const usage = mapResponsesUsage(response);
  let anthropicContent = fallbackContentBlocks(response.output_text);
  if (contentBlocks.length > 0) {
    anthropicContent = contentBlocks;
  }
  const stopReason = mapResponsesStopReason(response);
  return {
    id: response.id,
    type: "message",
    role: "assistant",
    content: anthropicContent,
    model: response.model,
    stop_reason: stopReason,
    stop_sequence: null,
    usage
  };
};
var mapOutputToAnthropicContent = (output) => {
  const contentBlocks = [];
  for (const item of output) {
    switch (item.type) {
      case "reasoning": {
        const thinkingText = extractReasoningText(item);
        if (thinkingText.length > 0) {
          contentBlocks.push({
            type: "thinking",
            thinking: thinkingText,
            signature: (item.encrypted_content ?? "") + "@" + item.id
          });
        }
        break;
      }
      case "function_call": {
        const toolUseBlock = createToolUseContentBlock(item);
        if (toolUseBlock) {
          contentBlocks.push(toolUseBlock);
        }
        break;
      }
      case "message": {
        const combinedText = combineMessageTextContent(item.content);
        if (combinedText.length > 0) {
          contentBlocks.push({ type: "text", text: combinedText });
        }
        break;
      }
      case "compaction": {
        const compactionBlock = createCompactionThinkingBlock(item);
        if (compactionBlock) {
          contentBlocks.push(compactionBlock);
        }
        break;
      }
      default: {
        const combinedText = combineMessageTextContent(
          item.content
        );
        if (combinedText.length > 0) {
          contentBlocks.push({ type: "text", text: combinedText });
        }
      }
    }
  }
  return contentBlocks;
};
var combineMessageTextContent = (content) => {
  if (!Array.isArray(content)) {
    return "";
  }
  let aggregated = "";
  for (const block of content) {
    if (isResponseOutputText(block)) {
      aggregated += block.text;
      continue;
    }
    if (isResponseOutputRefusal(block)) {
      aggregated += block.refusal;
      continue;
    }
    if (typeof block.text === "string") {
      aggregated += block.text;
      continue;
    }
    if (typeof block.reasoning === "string") {
      aggregated += block.reasoning;
      continue;
    }
  }
  return aggregated;
};
var extractReasoningText = (item) => {
  const segments = [];
  const collectFromBlocks = (blocks) => {
    if (!Array.isArray(blocks)) {
      return;
    }
    for (const block of blocks) {
      if (typeof block.text === "string") {
        segments.push(block.text);
        continue;
      }
    }
  };
  if (!item.summary || item.summary.length === 0) {
    return THINKING_TEXT2;
  }
  collectFromBlocks(item.summary);
  return segments.join("").trim();
};
var createToolUseContentBlock = (call) => {
  const toolId = call.call_id;
  if (!call.name || !toolId) {
    return null;
  }
  const input = parseToolCallArguments(call.arguments);
  return {
    type: "tool_use",
    id: toolId,
    name: call.name,
    input
  };
};
var createCompactionThinkingBlock = (item) => {
  if (!item.id || !item.encrypted_content) {
    return null;
  }
  return {
    type: "thinking",
    thinking: THINKING_TEXT2,
    signature: encodeCompactionCarrierSignature({
      id: item.id,
      encrypted_content: item.encrypted_content
    })
  };
};
var fallbackContentBlocks = (outputText) => {
  if (!outputText) {
    return [];
  }
  return [
    {
      type: "text",
      text: outputText
    }
  ];
};
var mapResponsesStopReason = (response) => {
  const { status, incomplete_details: incompleteDetails } = response;
  if (status === "completed") {
    if (response.output.some((item) => item.type === "function_call")) {
      return "tool_use";
    }
    return "end_turn";
  }
  if (status === "incomplete") {
    if (incompleteDetails?.reason === "max_output_tokens") {
      return "max_tokens";
    }
    if (incompleteDetails?.reason === "content_filter") {
      return "end_turn";
    }
  }
  return null;
};
var mapResponsesUsage = (response) => {
  const inputTokens = response.usage?.input_tokens ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;
  const inputCachedTokens = response.usage?.input_tokens_details?.cached_tokens;
  return {
    input_tokens: inputTokens - (inputCachedTokens ?? 0),
    output_tokens: outputTokens,
    ...response.usage?.input_tokens_details?.cached_tokens !== void 0 && {
      cache_read_input_tokens: response.usage.input_tokens_details.cached_tokens
    }
  };
};
var isRecord = (value) => typeof value === "object" && value !== null;
var isResponseOutputText = (block) => isRecord(block) && "type" in block && block.type === "output_text";
var isResponseOutputRefusal = (block) => isRecord(block) && "type" in block && block.type === "refusal";
var convertToolResultContent = (content) => {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    const result = [];
    for (const block of content) {
      switch (block.type) {
        case "text": {
          result.push(createTextContent(block.text));
          break;
        }
        case "image": {
          result.push(createImageContent(block));
          break;
        }
        case "document": {
          result.push(createFileContent(block));
          break;
        }
        case "tool_reference": {
          result.push(createTextContent(`Tool ${block.tool_name} loaded`));
          break;
        }
        default: {
          break;
        }
      }
    }
    return result;
  }
  return "";
};

// src/routes/messages/responses-stream-translation.ts
var MAX_CONSECUTIVE_FUNCTION_CALL_WHITESPACE = 20;
var FunctionCallArgumentsValidationError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "FunctionCallArgumentsValidationError";
  }
};
var updateWhitespaceRunState = (previousCount, chunk) => {
  let count = previousCount;
  for (const char of chunk) {
    if (char === "\r" || char === "\n" || char === "	") {
      count += 1;
      if (count > MAX_CONSECUTIVE_FUNCTION_CALL_WHITESPACE) {
        return { nextCount: count, exceeded: true };
      }
      continue;
    }
    if (char !== " ") {
      count = 0;
    }
  }
  return { nextCount: count, exceeded: false };
};
var createResponsesStreamState = (estimatedInputTokens) => ({
  estimatedInputTokens,
  messageStartSent: false,
  messageCompleted: false,
  nextContentBlockIndex: 0,
  blockIndexByKey: /* @__PURE__ */ new Map(),
  openBlocks: /* @__PURE__ */ new Set(),
  blockHasDelta: /* @__PURE__ */ new Set(),
  functionCallStateByOutputIndex: /* @__PURE__ */ new Map()
});
var translateResponsesStreamEvent = (rawEvent, state2) => asRecord(rawEvent) ? dispatchResponsesStreamEvent(rawEvent, state2) : [];
var dispatchResponsesStreamEvent = (rawEvent, state2) => {
  const eventType = rawEvent.type;
  switch (eventType) {
    case "response.created": {
      return handleResponseCreated(rawEvent, state2);
    }
    case "response.output_item.added": {
      return handleOutputItemAdded(rawEvent, state2);
    }
    case "response.reasoning_summary_text.delta": {
      return handleReasoningSummaryTextDelta(rawEvent, state2);
    }
    case "response.output_text.delta": {
      return handleOutputTextDelta(rawEvent, state2);
    }
    case "response.reasoning_summary_text.done": {
      return handleReasoningSummaryTextDone(rawEvent, state2);
    }
    case "response.output_text.done": {
      return handleOutputTextDone(rawEvent, state2);
    }
    case "response.output_item.done": {
      return handleOutputItemDone(rawEvent, state2);
    }
    case "response.function_call_arguments.delta": {
      return handleFunctionCallArgumentsDelta(rawEvent, state2);
    }
    case "response.function_call_arguments.done": {
      return handleFunctionCallArgumentsDone(rawEvent, state2);
    }
    case "response.completed":
    case "response.incomplete": {
      return handleResponseCompleted(rawEvent, state2);
    }
    case "response.failed": {
      return handleResponseFailed(rawEvent, state2);
    }
    case "error": {
      return handleErrorEvent(rawEvent, state2);
    }
    default: {
      return [];
    }
  }
};
var handleResponseCreated = (rawEvent, state2) => {
  if (!asRecord(rawEvent.response)) {
    return [];
  }
  return messageStart(state2, rawEvent.response);
};
var handleOutputItemAdded = (rawEvent, state2) => {
  const events4 = new Array();
  const functionCallDetails = extractFunctionCallDetails(rawEvent);
  if (!functionCallDetails) {
    return events4;
  }
  const { outputIndex, toolCallId, name, initialArguments } = functionCallDetails;
  const blockIndex = openFunctionCallBlock(state2, {
    outputIndex,
    toolCallId,
    name,
    events: events4
  });
  if (initialArguments !== void 0 && initialArguments.length > 0) {
    events4.push({
      type: "content_block_delta",
      index: blockIndex,
      delta: {
        type: "input_json_delta",
        partial_json: initialArguments
      }
    });
    state2.blockHasDelta.add(blockIndex);
  }
  return events4;
};
var handleOutputItemDone = (rawEvent, state2) => {
  const events4 = new Array();
  const item = rawEvent.item;
  if (!asRecord(item)) {
    return events4;
  }
  const itemType = item.type;
  const outputIndex = rawEvent.output_index;
  if (itemType === "compaction") {
    if (!item.id || !item.encrypted_content) {
      return events4;
    }
    const blockIndex2 = openThinkingBlockIfNeeded(state2, outputIndex, events4);
    if (!state2.blockHasDelta.has(blockIndex2)) {
      events4.push({
        type: "content_block_delta",
        index: blockIndex2,
        delta: {
          type: "thinking_delta",
          thinking: THINKING_TEXT2
        }
      });
    }
    events4.push({
      type: "content_block_delta",
      index: blockIndex2,
      delta: {
        type: "signature_delta",
        signature: encodeCompactionCarrierSignature({
          id: item.id,
          encrypted_content: item.encrypted_content
        })
      }
    });
    state2.blockHasDelta.add(blockIndex2);
    return events4;
  }
  if (itemType !== "reasoning") {
    return events4;
  }
  const blockIndex = openThinkingBlockIfNeeded(state2, outputIndex, events4);
  const signature = (item.encrypted_content ?? "") + "@" + item.id;
  if (signature) {
    if (!item.summary || item.summary.length === 0) {
      events4.push({
        type: "content_block_delta",
        index: blockIndex,
        delta: {
          type: "thinking_delta",
          thinking: THINKING_TEXT2
        }
      });
    }
    events4.push({
      type: "content_block_delta",
      index: blockIndex,
      delta: {
        type: "signature_delta",
        signature
      }
    });
    state2.blockHasDelta.add(blockIndex);
  }
  return events4;
};
var handleFunctionCallArgumentsDelta = (rawEvent, state2) => {
  const events4 = new Array();
  const outputIndex = rawEvent.output_index;
  const deltaText = rawEvent.delta;
  if (!deltaText) {
    return events4;
  }
  const blockIndex = openFunctionCallBlock(state2, {
    outputIndex,
    events: events4
  });
  const functionCallState = state2.functionCallStateByOutputIndex.get(outputIndex);
  if (!functionCallState) {
    return handleFunctionCallArgumentsValidationError(
      new FunctionCallArgumentsValidationError(
        "Received function call arguments delta without an open tool call block."
      ),
      state2,
      events4
    );
  }
  const { nextCount, exceeded } = updateWhitespaceRunState(
    functionCallState.consecutiveWhitespaceCount,
    deltaText
  );
  if (exceeded) {
    return handleFunctionCallArgumentsValidationError(
      new FunctionCallArgumentsValidationError(
        "Received function call arguments delta containing more than 20 consecutive whitespace characters."
      ),
      state2,
      events4
    );
  }
  functionCallState.consecutiveWhitespaceCount = nextCount;
  events4.push({
    type: "content_block_delta",
    index: blockIndex,
    delta: {
      type: "input_json_delta",
      partial_json: deltaText
    }
  });
  state2.blockHasDelta.add(blockIndex);
  return events4;
};
var handleFunctionCallArgumentsDone = (rawEvent, state2) => {
  const events4 = new Array();
  const outputIndex = rawEvent.output_index;
  const blockIndex = openFunctionCallBlock(state2, {
    outputIndex,
    events: events4
  });
  const finalArguments = typeof rawEvent.arguments === "string" ? rawEvent.arguments : void 0;
  if (!state2.blockHasDelta.has(blockIndex) && finalArguments) {
    events4.push({
      type: "content_block_delta",
      index: blockIndex,
      delta: {
        type: "input_json_delta",
        partial_json: finalArguments
      }
    });
    state2.blockHasDelta.add(blockIndex);
  }
  state2.functionCallStateByOutputIndex.delete(outputIndex);
  return events4;
};
var handleOutputTextDelta = (rawEvent, state2) => {
  const events4 = new Array();
  const outputIndex = rawEvent.output_index;
  const contentIndex = rawEvent.content_index;
  const deltaText = rawEvent.delta;
  if (!deltaText) {
    return events4;
  }
  const blockIndex = openTextBlockIfNeeded(state2, {
    outputIndex,
    contentIndex,
    events: events4
  });
  events4.push({
    type: "content_block_delta",
    index: blockIndex,
    delta: {
      type: "text_delta",
      text: deltaText
    }
  });
  state2.blockHasDelta.add(blockIndex);
  return events4;
};
var handleReasoningSummaryTextDelta = (rawEvent, state2) => {
  const outputIndex = rawEvent.output_index;
  const deltaText = rawEvent.delta;
  const events4 = new Array();
  const blockIndex = openThinkingBlockIfNeeded(state2, outputIndex, events4);
  events4.push({
    type: "content_block_delta",
    index: blockIndex,
    delta: {
      type: "thinking_delta",
      thinking: deltaText
    }
  });
  state2.blockHasDelta.add(blockIndex);
  return events4;
};
var handleReasoningSummaryTextDone = (rawEvent, state2) => {
  const outputIndex = rawEvent.output_index;
  const text = rawEvent.text;
  const events4 = new Array();
  const blockIndex = openThinkingBlockIfNeeded(state2, outputIndex, events4);
  if (text && !state2.blockHasDelta.has(blockIndex)) {
    events4.push({
      type: "content_block_delta",
      index: blockIndex,
      delta: {
        type: "thinking_delta",
        thinking: text
      }
    });
  }
  return events4;
};
var handleOutputTextDone = (rawEvent, state2) => {
  const events4 = new Array();
  const outputIndex = rawEvent.output_index;
  const contentIndex = rawEvent.content_index;
  const text = rawEvent.text;
  const blockIndex = openTextBlockIfNeeded(state2, {
    outputIndex,
    contentIndex,
    events: events4
  });
  if (text && !state2.blockHasDelta.has(blockIndex)) {
    events4.push({
      type: "content_block_delta",
      index: blockIndex,
      delta: {
        type: "text_delta",
        text
      }
    });
  }
  return events4;
};
var handleResponseCompleted = (rawEvent, state2) => {
  const response = rawEvent.response;
  const events4 = new Array();
  closeAllOpenBlocks(state2, events4);
  if (!asRecord(response)) {
    events4.push(
      buildErrorEvent(
        `Upstream sent ${rawEvent.type} with no response body; the stream cannot be completed.`
      )
    );
    state2.messageCompleted = true;
    return events4;
  }
  const anthropic = translateResponsesResultToAnthropic(response);
  events4.push(
    {
      type: "message_delta",
      delta: {
        stop_reason: anthropic.stop_reason,
        stop_sequence: anthropic.stop_sequence
      },
      usage: anthropic.usage
    },
    { type: "message_stop" }
  );
  state2.messageCompleted = true;
  return events4;
};
var handleResponseFailed = (rawEvent, state2) => {
  const response = rawEvent.response;
  const events4 = new Array();
  closeAllOpenBlocks(state2, events4);
  const errorMessage = asRecord(asRecord(response)?.error)?.message;
  const message = typeof errorMessage === "string" ? errorMessage : "The response failed due to an unknown error.";
  events4.push(buildErrorEvent(message));
  state2.messageCompleted = true;
  return events4;
};
var handleErrorEvent = (rawEvent, state2) => {
  const message = typeof rawEvent.message === "string" ? rawEvent.message : "An unexpected error occurred during streaming.";
  state2.messageCompleted = true;
  return [buildErrorEvent(message)];
};
var handleFunctionCallArgumentsValidationError = (error, state2, events4 = []) => {
  const reason = error.message;
  closeAllOpenBlocks(state2, events4);
  state2.messageCompleted = true;
  events4.push(buildErrorEvent(reason));
  return events4;
};
var messageStart = (state2, response) => {
  state2.messageStartSent = true;
  const inputCachedTokens = response.usage?.input_tokens_details?.cached_tokens;
  const upstreamInput = response.usage?.input_tokens;
  const inputTokens = upstreamInput === void 0 ? state2.estimatedInputTokens ?? 0 : upstreamInput - (inputCachedTokens ?? 0);
  return [
    {
      type: "message_start",
      message: {
        id: response.id,
        type: "message",
        role: "assistant",
        content: [],
        model: response.model,
        stop_reason: null,
        stop_sequence: null,
        usage: {
          input_tokens: inputTokens,
          output_tokens: 0,
          cache_read_input_tokens: inputCachedTokens ?? 0
        }
      }
    }
  ];
};
var openTextBlockIfNeeded = (state2, params) => {
  const { outputIndex, contentIndex, events: events4 } = params;
  const key = getBlockKey(outputIndex, contentIndex);
  let blockIndex = state2.blockIndexByKey.get(key);
  if (blockIndex === void 0) {
    blockIndex = state2.nextContentBlockIndex;
    state2.nextContentBlockIndex += 1;
    state2.blockIndexByKey.set(key, blockIndex);
  }
  if (!state2.openBlocks.has(blockIndex)) {
    closeOpenBlocks(state2, events4);
    events4.push({
      type: "content_block_start",
      index: blockIndex,
      content_block: {
        type: "text",
        text: ""
      }
    });
    state2.openBlocks.add(blockIndex);
  }
  return blockIndex;
};
var openThinkingBlockIfNeeded = (state2, outputIndex, events4) => {
  const summaryIndex = 0;
  const key = getBlockKey(outputIndex, summaryIndex);
  let blockIndex = state2.blockIndexByKey.get(key);
  if (blockIndex === void 0) {
    blockIndex = state2.nextContentBlockIndex;
    state2.nextContentBlockIndex += 1;
    state2.blockIndexByKey.set(key, blockIndex);
  }
  if (!state2.openBlocks.has(blockIndex)) {
    closeOpenBlocks(state2, events4);
    events4.push({
      type: "content_block_start",
      index: blockIndex,
      content_block: {
        type: "thinking",
        thinking: ""
      }
    });
    state2.openBlocks.add(blockIndex);
  }
  return blockIndex;
};
var closeBlockIfOpen = (state2, blockIndex, events4) => {
  if (!state2.openBlocks.has(blockIndex)) {
    return;
  }
  events4.push({ type: "content_block_stop", index: blockIndex });
  state2.openBlocks.delete(blockIndex);
  state2.blockHasDelta.delete(blockIndex);
};
var closeOpenBlocks = (state2, events4) => {
  for (const blockIndex of state2.openBlocks) {
    closeBlockIfOpen(state2, blockIndex, events4);
  }
};
var closeAllOpenBlocks = (state2, events4) => {
  closeOpenBlocks(state2, events4);
  state2.functionCallStateByOutputIndex.clear();
};
var buildErrorEvent = (message) => ({
  type: "error",
  error: {
    type: "api_error",
    message
  }
});
var getBlockKey = (outputIndex, contentIndex) => `${outputIndex}:${contentIndex}`;
var openFunctionCallBlock = (state2, params) => {
  const { outputIndex, toolCallId, name, events: events4 } = params;
  let functionCallState = state2.functionCallStateByOutputIndex.get(outputIndex);
  if (!functionCallState) {
    const blockIndex2 = state2.nextContentBlockIndex;
    state2.nextContentBlockIndex += 1;
    const resolvedToolCallId = toolCallId ?? `tool_call_${blockIndex2}`;
    const resolvedName = name ?? "function";
    functionCallState = {
      blockIndex: blockIndex2,
      toolCallId: resolvedToolCallId,
      name: resolvedName,
      consecutiveWhitespaceCount: 0
    };
    state2.functionCallStateByOutputIndex.set(outputIndex, functionCallState);
  }
  const { blockIndex } = functionCallState;
  if (!state2.openBlocks.has(blockIndex)) {
    closeOpenBlocks(state2, events4);
    events4.push({
      type: "content_block_start",
      index: blockIndex,
      content_block: {
        type: "tool_use",
        id: functionCallState.toolCallId,
        name: functionCallState.name,
        input: {}
      }
    });
    state2.openBlocks.add(blockIndex);
  }
  return blockIndex;
};
var extractFunctionCallDetails = (rawEvent) => {
  const item = rawEvent.item;
  if (!asRecord(item)) {
    return void 0;
  }
  const itemType = item.type;
  if (itemType !== "function_call") {
    return void 0;
  }
  const outputIndex = rawEvent.output_index;
  const toolCallId = item.call_id;
  const name = item.name;
  const initialArguments = item.arguments;
  return {
    outputIndex,
    toolCallId,
    name,
    initialArguments
  };
};

// src/routes/responses/utils.ts
var getResponsesRequestOptions = (payload) => {
  const vision = hasVisionInput(payload);
  const initiator = hasAgentInitiator(payload) ? "agent" : "user";
  return { vision, initiator };
};
var hasAgentInitiator = (payload) => responsesInitiator(payload) === "agent";
var hasVisionInput = (payload) => {
  const values = getPayloadItems(payload);
  return values.some((item) => containsVisionContent(item));
};
var resolveResponsesCompactThreshold = (maxPromptTokens) => {
  if (typeof maxPromptTokens === "number" && maxPromptTokens > 0) {
    return Math.floor(maxPromptTokens * 0.9);
  }
  return 5e4;
};
var createCompactionContextManagement = (compactThreshold) => [
  {
    type: "compaction",
    compact_threshold: compactThreshold
  }
];
var applyResponsesApiContextManagement = (payload, maxPromptTokens) => {
  if (payload.context_management !== void 0) {
    return;
  }
  if (!isResponsesApiContextManagementModel(payload.model)) {
    return;
  }
  payload.context_management = createCompactionContextManagement(
    resolveResponsesCompactThreshold(maxPromptTokens)
  );
};
var compactInputByLatestCompaction = (payload) => {
  if (!Array.isArray(payload.input) || payload.input.length === 0) {
    return;
  }
  const latestCompactionMessageIndex = getLatestCompactionMessageIndex(
    payload.input
  );
  if (latestCompactionMessageIndex === void 0) {
    return;
  }
  payload.input = payload.input.slice(latestCompactionMessageIndex);
};
var getLatestCompactionMessageIndex = (input) => {
  for (let index = input.length - 1; index >= 0; index -= 1) {
    if (isCompactionInputItem(input[index])) {
      return index;
    }
  }
  return void 0;
};
var isCompactionInputItem = (value) => {
  return "type" in value && typeof value.type === "string" && value.type === "compaction";
};
var getPayloadItems = (payload) => {
  const result = [];
  const { input } = payload;
  if (Array.isArray(input)) {
    result.push(...input);
  }
  return result;
};
var containsVisionContent = (value) => {
  if (!value) return false;
  if (Array.isArray(value)) {
    return value.some((entry) => containsVisionContent(entry));
  }
  if (typeof value !== "object") {
    return false;
  }
  const record = value;
  const type = typeof record.type === "string" ? record.type.toLowerCase() : void 0;
  if (type === "input_image") {
    return true;
  }
  if (Array.isArray(record.content)) {
    return record.content.some((entry) => containsVisionContent(entry));
  }
  return false;
};

// src/services/copilot/create-messages.ts
import consola8 from "consola";
import "fetch-event-stream";
var INTERLEAVED_THINKING_BETA = "interleaved-thinking-2025-05-14";
var ADVANCED_TOOL_USE_BETA = "advanced-tool-use-2025-11-20";
var allowedAnthropicBetas = /* @__PURE__ */ new Set([
  INTERLEAVED_THINKING_BETA,
  "context-management-2025-06-27",
  ADVANCED_TOOL_USE_BETA
]);
var buildAnthropicBetaHeader = (anthropicBetaHeader, thinking) => {
  const isAdaptiveThinking = thinking?.type === "adaptive";
  if (anthropicBetaHeader) {
    const filteredBeta = anthropicBetaHeader.split(",").map((item) => item.trim()).filter((item) => item.length > 0).filter((item) => allowedAnthropicBetas.has(item));
    if (filteredBeta.length > 0) {
      return filteredBeta.join(",");
    }
    return void 0;
  }
  if (thinking?.budget_tokens && !isAdaptiveThinking) {
    return INTERLEAVED_THINKING_BETA;
  }
  return void 0;
};
var createMessages = async (payload, anthropicBetaHeader, options) => {
  requireCopilotToken();
  const enableVision = payload.messages.some((message) => {
    if (!Array.isArray(message.content)) return false;
    return message.content.some(
      (block) => block.type === "image" || block.type === "tool_result" && Array.isArray(block.content) && block.content.some((inner) => inner.type === "image")
    );
  });
  const headers = buildCopilotHeaders(state, {
    ...options,
    vision: enableVision,
    initiator: messagesInitiator(payload)
  });
  const { safetyIdentifier, sessionId } = parseUserIdMetadata(
    payload.metadata?.user_id
  );
  if (safetyIdentifier && sessionId && !payload.model.startsWith("claude-opus-4.8")) {
    prepareMessageProxyHeaders(headers);
  }
  const anthropicBeta = buildAnthropicBetaHeader(
    anthropicBetaHeader,
    payload.thinking
  );
  if (anthropicBeta) {
    headers["anthropic-beta"] = anthropicBeta;
  }
  consola8.log(`<-- model: ${payload.model}`);
  const response = await sendRequest(`${copilotBaseUrl(state)}/v1/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });
  return finishUpstreamResponse(response, {
    stream: Boolean(payload.stream),
    errorMessage: "Failed to create messages"
  });
};

// src/routes/messages/stream-error.ts
var emitStreamError = async (stream, logger8, ctx) => {
  const { error, flow } = ctx;
  const message = error instanceof Error ? error.message : String(error);
  logger8.error(`Upstream ${flow} stream failed mid-flight: ${message}`);
  const errorEvent = buildErrorEvent(
    `Upstream stream ended unexpectedly: ${message}`
  );
  try {
    await stream.writeSSE({
      event: errorEvent.type,
      data: JSON.stringify(errorEvent)
    });
  } catch (writeError) {
    logger8.warn(
      "Could not write stream-error event (client may have disconnected)",
      writeError
    );
  }
};

// src/routes/messages/stream-translation.ts
function isToolBlockOpen(state2) {
  if (!state2.contentBlockOpen) {
    return false;
  }
  return Object.values(state2.toolCalls).some(
    (tc) => tc.anthropicBlockIndex === state2.contentBlockIndex
  );
}
var readTranslatableChoice = (chunk) => {
  const choices = asRecord(chunk)?.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return void 0;
  }
  const choice = asRecord(choices[0]);
  if (!choice) {
    return void 0;
  }
  return {
    choice,
    delta: asRecord(choice.delta) ?? {}
  };
};
function translateChunkToAnthropicEvents(chunk, state2) {
  const events4 = [];
  const translatable = readTranslatableChoice(chunk);
  if (!translatable) {
    return events4;
  }
  const { choice, delta } = translatable;
  handleMessageStart(state2, events4, chunk);
  handleThinkingText(delta, state2, events4);
  handleContent(delta, state2, events4);
  handleToolCalls(delta, state2, events4);
  handleFinish(choice, state2, { events: events4, chunk, delta });
  return events4;
}
function handleFinish(choice, state2, context) {
  const { events: events4, chunk, delta } = context;
  if (typeof choice.finish_reason === "string" && choice.finish_reason.length > 0) {
    if (state2.contentBlockOpen) {
      const toolBlockOpen = isToolBlockOpen(state2);
      context.events.push({
        type: "content_block_stop",
        index: state2.contentBlockIndex
      });
      state2.contentBlockOpen = false;
      state2.contentBlockIndex++;
      if (!toolBlockOpen) {
        handleReasoningOpaque(delta, events4, state2);
      }
    }
    events4.push(
      {
        type: "message_delta",
        delta: {
          stop_reason: mapOpenAIStopReasonToAnthropic(choice.finish_reason),
          stop_sequence: null
        },
        usage: {
          input_tokens: (chunk.usage?.prompt_tokens ?? 0) - (chunk.usage?.prompt_tokens_details?.cached_tokens ?? 0),
          output_tokens: chunk.usage?.completion_tokens ?? 0,
          ...chunk.usage?.prompt_tokens_details?.cached_tokens !== void 0 && {
            cache_read_input_tokens: chunk.usage.prompt_tokens_details.cached_tokens
          }
        }
      },
      {
        type: "message_stop"
      }
    );
  }
}
function handleToolCalls(delta, state2, events4) {
  if (Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0) {
    closeThinkingBlockIfOpen(state2, events4);
    handleReasoningOpaqueInToolCalls(state2, events4, delta);
    for (const toolCall of delta.tool_calls) {
      if (!asRecord(toolCall)) {
        continue;
      }
      if (toolCall.id && toolCall.function?.name) {
        if (state2.contentBlockOpen) {
          events4.push({
            type: "content_block_stop",
            index: state2.contentBlockIndex
          });
          state2.contentBlockIndex++;
          state2.contentBlockOpen = false;
        }
        const anthropicBlockIndex = state2.contentBlockIndex;
        state2.toolCalls[toolCall.index] = {
          id: toolCall.id,
          name: toolCall.function.name,
          anthropicBlockIndex
        };
        events4.push({
          type: "content_block_start",
          index: anthropicBlockIndex,
          content_block: {
            type: "tool_use",
            id: toolCall.id,
            name: toolCall.function.name,
            input: {}
          }
        });
        state2.contentBlockOpen = true;
      }
      if (toolCall.function?.arguments) {
        const toolCallInfo = state2.toolCalls[toolCall.index];
        if (toolCallInfo) {
          events4.push({
            type: "content_block_delta",
            index: toolCallInfo.anthropicBlockIndex,
            delta: {
              type: "input_json_delta",
              partial_json: toolCall.function.arguments
            }
          });
        }
      }
    }
  }
}
function handleReasoningOpaqueInToolCalls(state2, events4, delta) {
  if (state2.contentBlockOpen && !isToolBlockOpen(state2)) {
    events4.push({
      type: "content_block_stop",
      index: state2.contentBlockIndex
    });
    state2.contentBlockIndex++;
    state2.contentBlockOpen = false;
  }
  handleReasoningOpaque(delta, events4, state2);
}
function handleContent(delta, state2, events4) {
  if (delta.content && delta.content.length > 0) {
    closeThinkingBlockIfOpen(state2, events4);
    if (isToolBlockOpen(state2)) {
      events4.push({
        type: "content_block_stop",
        index: state2.contentBlockIndex
      });
      state2.contentBlockIndex++;
      state2.contentBlockOpen = false;
    }
    if (!state2.contentBlockOpen) {
      events4.push({
        type: "content_block_start",
        index: state2.contentBlockIndex,
        content_block: {
          type: "text",
          text: ""
        }
      });
      state2.contentBlockOpen = true;
    }
    events4.push({
      type: "content_block_delta",
      index: state2.contentBlockIndex,
      delta: {
        type: "text_delta",
        text: delta.content
      }
    });
  }
  if (delta.content === "" && delta.reasoning_opaque && delta.reasoning_opaque.length > 0 && state2.thinkingBlockOpen) {
    events4.push(
      {
        type: "content_block_delta",
        index: state2.contentBlockIndex,
        delta: {
          type: "signature_delta",
          signature: delta.reasoning_opaque
        }
      },
      {
        type: "content_block_stop",
        index: state2.contentBlockIndex
      }
    );
    state2.contentBlockIndex++;
    state2.thinkingBlockOpen = false;
  }
}
function handleMessageStart(state2, events4, chunk) {
  if (!state2.messageStartSent) {
    events4.push({
      type: "message_start",
      message: {
        id: chunk.id,
        type: "message",
        role: "assistant",
        content: [],
        model: chunk.model,
        stop_reason: null,
        stop_sequence: null,
        usage: {
          input_tokens: (chunk.usage?.prompt_tokens ?? 0) - (chunk.usage?.prompt_tokens_details?.cached_tokens ?? 0),
          output_tokens: 0,
          // Will be updated in message_delta when finished
          ...chunk.usage?.prompt_tokens_details?.cached_tokens !== void 0 && {
            cache_read_input_tokens: chunk.usage.prompt_tokens_details.cached_tokens
          }
        }
      }
    });
    state2.messageStartSent = true;
  }
}
function handleReasoningOpaque(delta, events4, state2) {
  if (delta.reasoning_opaque && delta.reasoning_opaque.length > 0) {
    events4.push(
      {
        type: "content_block_start",
        index: state2.contentBlockIndex,
        content_block: {
          type: "thinking",
          thinking: ""
        }
      },
      {
        type: "content_block_delta",
        index: state2.contentBlockIndex,
        delta: {
          type: "thinking_delta",
          thinking: THINKING_TEXT
          // Compatible with opencode, it will filter out blocks where the thinking text is empty, so we add a default thinking text here
        }
      },
      {
        type: "content_block_delta",
        index: state2.contentBlockIndex,
        delta: {
          type: "signature_delta",
          signature: delta.reasoning_opaque
        }
      },
      {
        type: "content_block_stop",
        index: state2.contentBlockIndex
      }
    );
    state2.contentBlockIndex++;
  }
}
function handleThinkingText(delta, state2, events4) {
  if (delta.reasoning_text && delta.reasoning_text.length > 0) {
    if (state2.contentBlockOpen) {
      delta.content = delta.reasoning_text;
      delta.reasoning_text = void 0;
      return;
    }
    if (!state2.thinkingBlockOpen) {
      events4.push({
        type: "content_block_start",
        index: state2.contentBlockIndex,
        content_block: {
          type: "thinking",
          thinking: ""
        }
      });
      state2.thinkingBlockOpen = true;
    }
    events4.push({
      type: "content_block_delta",
      index: state2.contentBlockIndex,
      delta: {
        type: "thinking_delta",
        thinking: delta.reasoning_text
      }
    });
  }
}
function closeThinkingBlockIfOpen(state2, events4) {
  if (state2.thinkingBlockOpen) {
    events4.push(
      {
        type: "content_block_delta",
        index: state2.contentBlockIndex,
        delta: {
          type: "signature_delta",
          signature: ""
        }
      },
      {
        type: "content_block_stop",
        index: state2.contentBlockIndex
      }
    );
    state2.contentBlockIndex++;
    state2.thinkingBlockOpen = false;
  }
}

// src/routes/messages/api-flows.ts
var handleWithChatCompletions = async (c, anthropicPayload, options) => {
  const { logger: logger8, subagentMarker, requestId, sessionId, compactType } = options;
  const openAIPayload = translateToOpenAI(anthropicPayload);
  const recordUsage = createCopilotUsageRecorder({
    endpoint: "chat_completions",
    fallbackSessionId: sessionId,
    model: openAIPayload.model,
    payload: anthropicPayload
  });
  debugJson(logger8, "Translated OpenAI request payload:", openAIPayload);
  const response = await createChatCompletions(openAIPayload, {
    subagentMarker,
    requestId,
    sessionId,
    compactType
  });
  if (isNonStreaming(response)) {
    debugJson(logger8, "Non-streaming response from Copilot:", response);
    recordUsage(
      withCopilotCost(
        normalizeOpenAIUsage(response.usage),
        response.copilot_usage
      )
    );
    const anthropicResponse = translateToAnthropic(response);
    debugJson(logger8, "Translated Anthropic response:", anthropicResponse);
    return c.json(anthropicResponse);
  }
  logger8.debug("Streaming response from Copilot");
  return streamSSE3(c, async (stream) => {
    let usage = {};
    const streamState = {
      messageStartSent: false,
      contentBlockIndex: 0,
      contentBlockOpen: false,
      toolCalls: {},
      thinkingBlockOpen: false
    };
    try {
      for await (const rawEvent of response) {
        debugJson(logger8, "Copilot raw stream event:", rawEvent);
        if (rawEvent.data === "[DONE]") {
          break;
        }
        if (!rawEvent.data) {
          continue;
        }
        const chunk = readChatCompletionFrame(rawEvent.data);
        if (chunk === null) {
          logger8.debug("Skipping unparseable chat-completions frame");
          continue;
        }
        if (asRecord(chunk)?.usage) {
          usage = normalizeOpenAIUsage(readUsage(chunk));
        }
        const events4 = translateChunkToAnthropicEvents(chunk, streamState);
        for (const event of events4) {
          const eventData = JSON.stringify(event);
          debugLazy(logger8, () => ["Translated Anthropic event:", eventData]);
          await stream.writeSSE({
            event: event.type,
            data: eventData
          });
        }
      }
    } catch (error) {
      await emitStreamError(stream, logger8, { error, flow: "chat_completions" });
    }
    recordUsage(usage);
  });
};
var estimateInputTokens = async (anthropicPayload, selectedModel) => {
  if (!selectedModel) return void 0;
  try {
    const count = await getTokenCount(
      translateToOpenAI(anthropicPayload),
      selectedModel
    );
    return count.input > 0 ? count.input : void 0;
  } catch {
    return void 0;
  }
};
var handleWithResponsesApi = async (c, anthropicPayload, options) => {
  const { logger: logger8, selectedModel, ...requestOptions } = options;
  const responsesPayload = translateAnthropicMessagesToResponsesPayload(anthropicPayload);
  const recordUsage = createCopilotUsageRecorder({
    endpoint: "responses",
    fallbackSessionId: requestOptions.sessionId,
    model: responsesPayload.model,
    payload: anthropicPayload
  });
  applyResponsesApiContextManagement(
    responsesPayload,
    selectedModel ? resolveModelProfile(selectedModel).maxPromptTokens : void 0
  );
  const promptCacheRetention = getPromptCacheRetention();
  if (promptCacheRetention) {
    responsesPayload.prompt_cache_retention = promptCacheRetention;
  }
  compactInputByLatestCompaction(responsesPayload);
  debugJson(logger8, "Translated Responses payload:", responsesPayload);
  const { vision, initiator } = getResponsesRequestOptions(responsesPayload);
  const inputEstimate = estimateInputTokens(anthropicPayload, selectedModel);
  const response = await createResponses(responsesPayload, {
    vision,
    initiator,
    ...requestOptions
  });
  if (responsesPayload.stream && isAsyncIterable(response)) {
    logger8.debug("Streaming response from Copilot (Responses API)");
    return streamSSE3(c, async (stream) => {
      const streamState = createResponsesStreamState(await inputEstimate);
      let usage = {};
      try {
        for await (const chunk of response) {
          const eventName = chunk.event;
          if (eventName === "ping") {
            await stream.writeSSE({ event: "ping", data: '{"type":"ping"}' });
            continue;
          }
          const data = chunk.data;
          if (!data) {
            continue;
          }
          debugLazy(logger8, () => ["Responses raw stream event:", data]);
          const frame = readResponsesFrame(data);
          if (!frame) {
            continue;
          }
          if (frame.usage) {
            usage = frame.usage;
          }
          const events4 = translateResponsesStreamEvent(frame.event, streamState);
          for (const event of events4) {
            const eventData = JSON.stringify(event);
            debugLazy(logger8, () => ["Translated Anthropic event:", eventData]);
            await stream.writeSSE({
              event: event.type,
              data: eventData
            });
          }
          if (streamState.messageCompleted) {
            logger8.debug("Message completed, ending stream");
            break;
          }
        }
      } catch (error) {
        await emitStreamError(stream, logger8, { error, flow: "responses" });
        recordUsage(usage);
        return;
      }
      if (!streamState.messageCompleted) {
        logger8.warn(
          "Responses stream ended without completion; sending error event"
        );
        const errorEvent = buildErrorEvent(
          "Responses stream ended without completion"
        );
        await stream.writeSSE({
          event: errorEvent.type,
          data: JSON.stringify(errorEvent)
        });
      }
      recordUsage(usage);
    });
  }
  return finishNonStreamingResponses(c, response, {
    logger: logger8,
    recordUsage
  });
};
function finishNonStreamingResponses(c, result, deps) {
  const { logger: logger8, recordUsage } = deps;
  debugJsonTail(logger8, "Non-streaming Responses result:", {
    value: result,
    tailLength: 400
  });
  const anthropicResponse = translateResponsesResultToAnthropic(result);
  recordUsage(
    withCopilotCost(
      normalizeResponsesUsage(result.usage),
      result.copilot_usage
    )
  );
  debugJson(logger8, "Translated Anthropic response:", anthropicResponse);
  return c.json(anthropicResponse);
}
var handleWithMessagesApi = async (c, anthropicPayload, options) => {
  const {
    logger: logger8,
    anthropicBetaHeader,
    subagentMarker,
    selectedModel,
    requestId,
    sessionId,
    compactType
  } = options;
  prepareMessagesApiPayload(anthropicPayload, selectedModel);
  const recordUsage = createCopilotUsageRecorder({
    endpoint: "messages",
    fallbackSessionId: sessionId,
    model: anthropicPayload.model,
    payload: anthropicPayload
  });
  debugJson(logger8, "Translated Messages payload:", anthropicPayload);
  const response = await createMessages(anthropicPayload, anthropicBetaHeader, {
    subagentMarker,
    requestId,
    sessionId,
    compactType
  });
  if (isAsyncIterable(response)) {
    logger8.debug("Streaming response from Copilot (Messages API)");
    return streamSSE3(c, async (stream) => {
      let usage = {};
      try {
        for await (const event of response) {
          const eventName = event.event;
          const data = event.data ?? "";
          if (data === "[DONE]") {
            break;
          }
          if (!data) {
            continue;
          }
          debugLazy(logger8, () => ["Messages raw stream event:", data]);
          const parsedEvent = parseAnthropicStreamEvent(data);
          if (parsedEvent?.type === "message_start") {
            usage = mergeAnthropicUsage(
              usage,
              normalizeAnthropicUsage(readNestedUsage(parsedEvent, "message"))
            );
          } else if (parsedEvent?.type === "message_delta") {
            usage = mergeAnthropicUsage(
              usage,
              normalizeAnthropicUsage(readUsage(parsedEvent))
            );
          }
          await stream.writeSSE({
            event: eventName,
            data
          });
        }
      } catch (error) {
        await emitStreamError(stream, logger8, { error, flow: "messages" });
      }
      recordUsage(usage);
    });
  }
  debugJsonTail(logger8, "Non-streaming Messages result:", {
    value: response,
    tailLength: 400
  });
  recordUsage(
    withCopilotCost(
      normalizeAnthropicUsage(response.usage),
      response.copilot_usage
    )
  );
  return c.json(response);
};
var createCopilotUsageRecorder = (options) => createCopilotTokenUsageRecorder({
  endpoint: options.endpoint,
  fallbackSessionId: options.fallbackSessionId,
  model: options.model,
  sessionId: getMetadataSessionId(options.payload)
});
var getMetadataSessionId = (payload) => parseUserIdMetadata(payload.metadata?.user_id).sessionId;
var readChatCompletionFrame = (data) => {
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
};
var readResponsesFrame = (data) => {
  if (data === "[DONE]") {
    return null;
  }
  let event;
  try {
    event = JSON.parse(data);
  } catch {
    return null;
  }
  if (!asRecord(event)) {
    return null;
  }
  if (event.type === "response.completed" || event.type === "response.failed" || event.type === "response.incomplete") {
    return {
      event,
      usage: normalizeResponsesUsage(readNestedUsage(event, "response"))
    };
  }
  return { event };
};
var parseAnthropicStreamEvent = (data) => {
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
};

// src/lib/runtime-state/subagent.ts
import { z as z4 } from "zod";
var subagentMarkerPrefix = "__SUBAGENT_MARKER__";
var subagentMarkerSchema = z4.object({
  session_id: z4.string().min(1),
  agent_id: z4.string().min(1),
  agent_type: z4.string().min(1)
}).loose();

// src/routes/messages/subagent-marker.ts
var parseSubagentMarkerFromFirstUser = (payload) => {
  const firstUserMessage = payload.messages.find(
    (msg) => msg.role === "user" && Array.isArray(msg.content)
  );
  if (!firstUserMessage || !Array.isArray(firstUserMessage.content)) {
    return null;
  }
  for (const block of firstUserMessage.content) {
    if (block.type !== "text") {
      continue;
    }
    const marker = parseSubagentMarkerFromSystemReminder(block.text);
    if (marker) {
      return marker;
    }
  }
  return null;
};
var parseSubagentMarkerFromSystemReminder = (text) => {
  const startTag = "<system-reminder>";
  const endTag = "</system-reminder>";
  let searchFrom = 0;
  while (true) {
    const reminderStart = text.indexOf(startTag, searchFrom);
    if (reminderStart === -1) {
      break;
    }
    const contentStart = reminderStart + startTag.length;
    const reminderEnd = text.indexOf(endTag, contentStart);
    if (reminderEnd === -1) {
      break;
    }
    const reminderContent = text.slice(contentStart, reminderEnd);
    const markerIndex = reminderContent.indexOf(subagentMarkerPrefix);
    if (markerIndex === -1) {
      searchFrom = reminderEnd + endTag.length;
      continue;
    }
    const markerJson = reminderContent.slice(markerIndex + subagentMarkerPrefix.length).trim();
    const parsed = subagentMarkerSchema.safeParse(safeJsonParse(markerJson));
    if (!parsed.success) {
      searchFrom = reminderEnd + endTag.length;
      continue;
    }
    return parsed.data;
  }
  return null;
};
var safeJsonParse = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return void 0;
  }
};

// src/routes/messages/warmup.ts
import { streamSSE as streamSSE4 } from "hono/streaming";
import { randomUUID as randomUUID2 } from "crypto";
var WARMUP_TEXT = "Warmup";
var CANNED_REPLY = "OK";
function extractMessageText(payload) {
  const { content } = payload.messages[0];
  if (typeof content === "string") {
    return content;
  }
  return content.filter((block) => block.type === "text").map((block) => block.text).join("");
}
function isWarmupRequest(payload) {
  const noTools = !payload.tools || payload.tools.length === 0;
  if (!noTools) {
    return false;
  }
  if (payload.messages.length !== 1) {
    return false;
  }
  const [message] = payload.messages;
  if (message.role !== "user") {
    return false;
  }
  return extractMessageText(payload).trim() === WARMUP_TEXT;
}
function respondToWarmup(c, payload) {
  const id = `msg_warmup_${randomUUID2()}`;
  const { model } = payload;
  if (!payload.stream) {
    const response = {
      id,
      type: "message",
      role: "assistant",
      model,
      content: [{ type: "text", text: CANNED_REPLY }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 0, output_tokens: 0 }
    };
    return c.json(response);
  }
  return streamSSE4(c, async (stream) => {
    const messageStart2 = {
      type: "message_start",
      message: {
        id,
        type: "message",
        role: "assistant",
        model,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0 }
      }
    };
    const contentBlockStart = {
      type: "content_block_start",
      index: 0,
      content_block: { type: "text", text: "" }
    };
    const contentBlockDelta = {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: CANNED_REPLY }
    };
    const contentBlockStop = {
      type: "content_block_stop",
      index: 0
    };
    const messageDelta = {
      type: "message_delta",
      delta: { stop_reason: "end_turn", stop_sequence: null },
      usage: { output_tokens: 0 }
    };
    const messageStop = { type: "message_stop" };
    for (const event of [
      messageStart2,
      contentBlockStart,
      contentBlockDelta,
      contentBlockStop,
      messageDelta,
      messageStop
    ]) {
      await stream.writeSSE({ event: event.type, data: JSON.stringify(event) });
    }
  });
}

// src/routes/messages/web-tools/flow.ts
import { streamSSE as streamSSE5 } from "hono/streaming";

// src/routes/messages/web-tools/vocab.ts
var TOOL_TYPE = {
  webSearch: "web_search_20250305",
  webFetch: "web_fetch_20250910"
};
var TOOL_NAME = {
  webSearch: "web_search",
  webFetch: "web_fetch"
};
var BLOCK_KIND = {
  serverToolUse: "server_tool_use",
  webSearchResult: "web_search_tool_result",
  webFetchResult: "web_fetch_tool_result",
  webSearchError: "web_search_tool_result_error",
  webFetchError: "web_fetch_tool_result_error"
};
var MAX_URL_LENGTH = 250;
var DEFAULT_MAX_USES = {
  webSearch: 5,
  webFetch: 10
};
var MAX_AGENT_TURNS = 10;

// src/routes/messages/web-tools/state.ts
function newRequestState(declared) {
  const active = {};
  for (const decl of declared) {
    if (decl.name === TOOL_NAME.webSearch) active[TOOL_NAME.webSearch] = decl;
    else active[TOOL_NAME.webFetch] = decl;
  }
  return {
    active,
    uses: { [TOOL_NAME.webSearch]: 0, [TOOL_NAME.webFetch]: 0 }
  };
}
function isHostAllowed(host, policy) {
  if (policy.blocked_domains?.length) {
    return !policy.blocked_domains.some((d) => hostCoveredBy(host, d));
  }
  if (policy.allowed_domains?.length) {
    return policy.allowed_domains.some((d) => hostCoveredBy(host, d));
  }
  return true;
}
function hostCoveredBy(host, entry) {
  const listedHost = entry.split("/")[0].toLowerCase();
  const h = host.toLowerCase();
  return h === listedHost || h.endsWith(`.${listedHost}`);
}
function checkSearchPolicy(state2, input) {
  const decl = state2.active[TOOL_NAME.webSearch];
  if (!decl) return { ok: false, code: "unavailable" };
  if (typeof input !== "object" || input === null || typeof input.query !== "string") {
    return { ok: false, code: "invalid_input" };
  }
  const query = input.query;
  const maxUses = decl.max_uses ?? DEFAULT_MAX_USES.webSearch;
  if (state2.uses[TOOL_NAME.webSearch] >= maxUses) {
    return { ok: false, code: "max_uses_exceeded" };
  }
  if (query.length === 0 || query.length > 2e3) {
    return { ok: false, code: "query_too_long" };
  }
  return { ok: true };
}
function parseFetchUrl(input) {
  if (typeof input !== "object" || input === null || typeof input.url !== "string") {
    return { ok: false, code: "invalid_input" };
  }
  const url = input.url;
  if (url.length > MAX_URL_LENGTH) return { ok: false, code: "url_too_long" };
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, code: "invalid_input" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, code: "invalid_input" };
  }
  return { ok: true, url, parsed };
}
function checkDomainPolicy(host, decl) {
  if (!isHostAllowed(host, decl)) {
    return { ok: false, code: "url_not_allowed" };
  }
  return { ok: true };
}
function checkFetchPolicy(state2, input) {
  const decl = state2.active[TOOL_NAME.webFetch];
  if (!decl) return { ok: false, code: "unavailable" };
  const parsed = parseFetchUrl(input);
  if (!parsed.ok) return parsed;
  const maxUses = decl.max_uses ?? DEFAULT_MAX_USES.webFetch;
  if (state2.uses[TOOL_NAME.webFetch] >= maxUses) {
    return { ok: false, code: "max_uses_exceeded" };
  }
  return checkDomainPolicy(parsed.parsed.hostname, decl);
}
function recordUse(state2, name) {
  state2.uses[name]++;
}

// src/routes/messages/web-tools/exec.ts
async function executeToolUse(tu, executor, state2) {
  if (tu.name === TOOL_NAME.webFetch) {
    const policy2 = checkFetchPolicy(state2, tu.input);
    if (!policy2.ok) {
      return { tool: TOOL_NAME.webFetch, ok: false, code: policy2.code };
    }
    const url = tu.input.url;
    const fr = await executor.fetch(url);
    if (!fr.ok) return { tool: TOOL_NAME.webFetch, ok: false, code: fr.code };
    recordUse(state2, TOOL_NAME.webFetch);
    return {
      tool: TOOL_NAME.webFetch,
      ok: true,
      url,
      markdown: fr.markdown,
      title: fr.title
    };
  }
  const policy = checkSearchPolicy(state2, tu.input);
  if (!policy.ok) {
    return { tool: TOOL_NAME.webSearch, ok: false, code: policy.code };
  }
  const query = tu.input.query;
  const decl = state2.active[TOOL_NAME.webSearch];
  const sr = await executor.search(query, {
    allowedDomains: decl?.allowed_domains,
    blockedDomains: decl?.blocked_domains
  });
  if (!sr.ok) return { tool: TOOL_NAME.webSearch, ok: false, code: sr.code };
  recordUse(state2, TOOL_NAME.webSearch);
  const items = decl && (decl.allowed_domains?.length || decl.blocked_domains?.length) ? sr.items.filter((hit) => hostAllowedForHit(hit.url, decl)) : sr.items;
  return { tool: TOOL_NAME.webSearch, ok: true, query, items };
}
function hostAllowedForHit(url, policy) {
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    return false;
  }
  return isHostAllowed(host, policy);
}
function buildToolResultMessage(toolUseId, outcome) {
  if (outcome.ok) {
    if (outcome.tool === TOOL_NAME.webFetch) {
      return {
        type: "tool_result",
        tool_use_id: toolUseId,
        content: outcome.markdown
      };
    }
    return {
      type: "tool_result",
      tool_use_id: toolUseId,
      content: JSON.stringify(outcome.items, null, 2)
    };
  }
  return {
    type: "tool_result",
    tool_use_id: toolUseId,
    content: `Error: ${outcome.code}`,
    is_error: true
  };
}
function encryptedContent(payload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}
function buildResultBlockForOutcome(toolUseId, outcome) {
  if (outcome.tool === TOOL_NAME.webFetch) {
    if (!outcome.ok) {
      return {
        type: BLOCK_KIND.webFetchError,
        tool_use_id: toolUseId,
        content: { type: BLOCK_KIND.webFetchError, error_code: outcome.code }
      };
    }
    return {
      type: BLOCK_KIND.webFetchResult,
      tool_use_id: toolUseId,
      content: {
        type: "web_fetch_result",
        url: outcome.url,
        content: {
          type: "document",
          source: {
            type: "text",
            media_type: "text/markdown",
            data: outcome.markdown
          },
          ...outcome.title === void 0 ? {} : { title: outcome.title },
          citations: { enabled: false }
        },
        retrieved_at: (/* @__PURE__ */ new Date()).toISOString()
      }
    };
  }
  if (!outcome.ok) {
    return {
      type: BLOCK_KIND.webSearchError,
      tool_use_id: toolUseId,
      content: { type: BLOCK_KIND.webSearchError, error_code: outcome.code }
    };
  }
  return {
    type: BLOCK_KIND.webSearchResult,
    tool_use_id: toolUseId,
    content: outcome.items.map((it) => ({
      type: "web_search_result",
      url: it.url,
      title: it.title,
      encrypted_content: encryptedContent({
        url: it.url,
        title: it.title,
        page_age: it.page_age ?? null
      }),
      ...it.page_age === void 0 ? {} : { page_age: it.page_age }
    }))
  };
}

// src/routes/messages/web-tools/rewriter.ts
var EMPTY_POLICY = {
  declarations: [],
  hasSearch: false,
  hasFetch: false
};
function isWebToolDecl(tool) {
  return tool.type === TOOL_TYPE.webSearch && tool.name === TOOL_NAME.webSearch || tool.type === TOOL_TYPE.webFetch && tool.name === TOOL_NAME.webFetch;
}
function splitWebTools(payload) {
  const tools = payload.tools;
  if (!tools || tools.length === 0) return EMPTY_POLICY;
  if (!tools.some((t) => isWebToolDecl(t))) return EMPTY_POLICY;
  const declarations = [];
  const remaining = [];
  for (const t of tools) {
    if (isWebToolDecl(t)) {
      declarations.push(t);
    } else {
      const clean = { ...t };
      delete clean.type;
      remaining.push(clean);
    }
  }
  payload.tools = remaining;
  return {
    declarations,
    hasSearch: declarations.some((d) => d.name === TOOL_NAME.webSearch),
    hasFetch: declarations.some((d) => d.name === TOOL_NAME.webFetch)
  };
}
var WEB_FETCH_SHIM = {
  name: TOOL_NAME.webFetch,
  description: "Fetch the content of a web page or document at a URL and return it as markdown text. The URL must be one that already appears in the conversation; do not invent URLs.",
  input_schema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The URL to fetch."
      }
    },
    required: ["url"]
  }
};
var WEB_SEARCH_SHIM = {
  name: TOOL_NAME.webSearch,
  description: "Search the web for information matching a query. Returns a list of result URLs and titles. Follow up with web_fetch to get the actual content of a result.",
  input_schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query."
      }
    },
    required: ["query"]
  }
};
function attachClientShims(payload, policy) {
  if (policy.declarations.length === 0) return;
  const tools = payload.tools ?? [];
  const existing = new Set(tools.map((t) => t.name));
  if (policy.hasFetch && !existing.has(TOOL_NAME.webFetch)) {
    tools.push(WEB_FETCH_SHIM);
  }
  if (policy.hasSearch && !existing.has(TOOL_NAME.webSearch)) {
    tools.push(WEB_SEARCH_SHIM);
  }
  payload.tools = tools;
}
function isWebToolName(name) {
  return name === TOOL_NAME.webSearch || name === TOOL_NAME.webFetch;
}

// src/routes/messages/web-tools/agent.ts
async function runAgentLoop(args) {
  const { initialPayload, policy, executor, callOnce, logger: logger8 } = args;
  const state2 = newRequestState(policy.declarations);
  const messages = [...initialPayload.messages];
  const turns = [];
  let last = null;
  const usageTotal = newUsageTotal();
  if (logger8) {
    debugLazy(logger8, () => [
      "web-tools agent start",
      JSON.stringify({
        decls: policy.declarations.map((d) => d.name),
        max_turns: MAX_AGENT_TURNS
      })
    ]);
  }
  for (let i = 0; i < MAX_AGENT_TURNS; i++) {
    const turnPayload = {
      ...initialPayload,
      messages
    };
    if (logger8) {
      debugLazy(logger8, () => [
        "web-tools agent turn",
        JSON.stringify({ turn: i, msgs: messages.length })
      ]);
    }
    last = await callOnce(turnPayload);
    accumulateTurnUsage(usageTotal, last);
    const content = Array.isArray(last.content) ? last.content : [];
    const ours = content.filter((block) => isOurToolUse(block));
    if (ours.length === 0 || last.stop_reason !== "tool_use") {
      if (logger8) {
        debugLazy(logger8, () => [
          "web-tools agent done",
          JSON.stringify({ turns: i + 1, stop_reason: last?.stop_reason })
        ]);
      }
      turns.push({ assistant: content, trips: [] });
      break;
    }
    const trips = [];
    const toolResults = [];
    for (const block of content) {
      if (!isOurToolUse(block)) continue;
      const t0 = Date.now();
      const outcome = await executeToolUse(block, executor, state2);
      const ms = Date.now() - t0;
      if (logger8) {
        debugLazy(logger8, () => [
          "web-tools outcome",
          JSON.stringify({
            tool: block.name,
            id: block.id,
            ok: outcome.ok,
            ...outcome.ok ? {} : { code: outcome.code },
            ms
          })
        ]);
      }
      trips.push({ toolUseId: block.id, outcome });
      toolResults.push(buildToolResultMessage(block.id, outcome));
    }
    turns.push({ assistant: content, trips });
    messages.push(
      { role: "assistant", content },
      { role: "user", content: toolResults }
    );
  }
  if (logger8 && turns.length === MAX_AGENT_TURNS) {
    const lastTurn = turns.at(-1);
    if (lastTurn && lastTurn.trips.length > 0) {
      debugLazy(logger8, () => [
        "web-tools agent ceiling",
        JSON.stringify({ max: MAX_AGENT_TURNS })
      ]);
    }
  }
  return synthesizeFinalResponse(last, turns, usageTotal);
}
function isOurToolUse(block) {
  return block.type === "tool_use" && isWebToolName(block.name);
}
function newUsageTotal() {
  return { input_tokens: 0, output_tokens: 0 };
}
function accumulateTurnUsage(total, resp) {
  const u = resp.usage;
  total.input_tokens += u.input_tokens;
  total.output_tokens += u.output_tokens;
  if (u.cache_creation_input_tokens !== void 0) {
    total.cache_creation_input_tokens = (total.cache_creation_input_tokens ?? 0) + u.cache_creation_input_tokens;
  }
  if (u.cache_read_input_tokens !== void 0) {
    total.cache_read_input_tokens = (total.cache_read_input_tokens ?? 0) + u.cache_read_input_tokens;
  }
  if (u.service_tier !== void 0) total.service_tier = u.service_tier;
  const nano = resp.copilot_usage?.total_nano_aiu;
  if (nano !== void 0) {
    total.copilot_total_nano_aiu = (total.copilot_total_nano_aiu ?? 0) + nano;
  }
}
function buildServerToolUse(tu) {
  return {
    type: BLOCK_KIND.serverToolUse,
    id: tu.id,
    name: tu.name,
    input: tu.input
  };
}
function weaveTurn(turn) {
  if (turn.trips.length === 0) return turn.assistant;
  const tripById = new Map(
    turn.trips.map((t) => [t.toolUseId, t])
  );
  const out = [];
  for (const block of turn.assistant) {
    if (block.type === "tool_use" && tripById.has(block.id)) {
      const trip = tripById.get(block.id);
      out.push(
        buildServerToolUse(block),
        buildResultBlockForOutcome(trip.toolUseId, trip.outcome)
      );
    } else {
      out.push(block);
    }
  }
  return out;
}
function synthesizeFinalResponse(last, turns, usageTotal) {
  const synthesized = [];
  for (const turn of turns) {
    for (const block of weaveTurn(turn)) synthesized.push(block);
  }
  const usage = {
    input_tokens: usageTotal.input_tokens,
    output_tokens: usageTotal.output_tokens,
    ...usageTotal.cache_creation_input_tokens !== void 0 ? { cache_creation_input_tokens: usageTotal.cache_creation_input_tokens } : {},
    ...usageTotal.cache_read_input_tokens !== void 0 ? { cache_read_input_tokens: usageTotal.cache_read_input_tokens } : {},
    ...usageTotal.service_tier !== void 0 ? { service_tier: usageTotal.service_tier } : {}
  };
  return {
    ...last,
    content: synthesized,
    usage,
    ...usageTotal.copilot_total_nano_aiu !== void 0 ? { copilot_usage: { total_nano_aiu: usageTotal.copilot_total_nano_aiu } } : {}
  };
}

// src/routes/messages/web-tools/stream.ts
var NON_STREAMING_UPSTREAM = "web-tools stream: upstream returned non-streaming response despite stream=true";
function chatStreamTransport(payload, callOptions, upstreamCall) {
  const state2 = {
    messageStartSent: false,
    contentBlockIndex: 0,
    contentBlockOpen: false,
    toolCalls: {},
    thinkingBlockOpen: false
  };
  return {
    open: async () => {
      const openAIPayload = translateToOpenAI(payload);
      openAIPayload.stream = true;
      const response = await upstreamCall(openAIPayload, callOptions);
      if (isNonStreaming(response)) throw new Error(NON_STREAMING_UPSTREAM);
      return response;
    },
    decode: (frame) => {
      if (!frame.data || frame.data === "[DONE]") return [];
      const chunk = JSON.parse(frame.data);
      return translateChunkToAnthropicEvents(chunk, state2);
    }
  };
}
function responsesStreamTransport(payload, ctx) {
  let state2 = null;
  return {
    open: async () => {
      const responsesPayload = translateAnthropicMessagesToResponsesPayload(payload);
      responsesPayload.stream = true;
      const { vision, initiator } = getResponsesRequestOptions(responsesPayload);
      const inputEstimate = estimateInputTokens(payload, ctx.selectedModel);
      const response = await ctx.responsesCall(responsesPayload, {
        vision,
        initiator,
        ...ctx.callOptions
      });
      state2 = createResponsesStreamState(await inputEstimate);
      if (!isAsyncIterable(response)) {
        throw new Error(NON_STREAMING_UPSTREAM);
      }
      return response;
    },
    decode: (frame) => {
      if (!state2 || !frame.data || frame.event === "ping") return [];
      const parsed = readResponsesFrame(frame.data);
      return parsed ? translateResponsesStreamEvent(parsed.event, state2) : [];
    }
  };
}
async function runStreamingAgent(args) {
  const { executor } = args;
  const { logger: logger8 } = args.options;
  const state2 = newRequestState(args.policy.declarations);
  const messages = [...args.initialPayload.messages];
  const cursor = { next: 0 };
  let messageStartEmitted = false;
  let bufferedFinalEvents = [];
  const usageTotal = { input_tokens: 0, output_tokens: 0 };
  const heartbeatIntervalMs = args.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS;
  debugLazy(logger8, () => [
    "web-tools stream start",
    JSON.stringify({
      decls: args.policy.declarations.map((d) => d.name),
      max_turns: MAX_AGENT_TURNS
    })
  ]);
  for (let turn = 0; turn < MAX_AGENT_TURNS; turn++) {
    debugLazy(logger8, () => [
      "web-tools stream turn",
      JSON.stringify({ turn, msgs: messages.length })
    ]);
    const turnPayload = {
      ...args.initialPayload,
      messages,
      stream: true
    };
    const callOptions = {
      requestId: args.options.requestId,
      sessionId: args.options.sessionId,
      compactType: args.options.compactType,
      subagentMarker: args.options.subagentMarker
    };
    const transport = shouldUseResponsesApi(args.selectedModel) ? responsesStreamTransport(turnPayload, {
      callOptions,
      selectedModel: args.selectedModel,
      responsesCall: args.responsesCall ?? createResponses
    }) : chatStreamTransport(
      turnPayload,
      callOptions,
      args.upstreamCall ?? createChatCompletions
    );
    const turnResult = await runOneStreamingTurn({
      payload: turnPayload,
      options: args.options,
      stream: args.stream,
      cursor,
      messageStartEmitted,
      executor,
      state: state2,
      transport,
      heartbeatIntervalMs
    });
    messageStartEmitted = turnResult.messageStartEmitted;
    bufferedFinalEvents = turnResult.bufferedFinal;
    accumulateTurnUsage2(usageTotal, turnResult.bufferedFinal);
    if (turnResult.stopReason === "tool_use" && turnResult.outcomes.length > 0) {
      const toolResults = turnResult.outcomes.map(
        ({ toolUse, outcome }) => buildToolResultMessage(toolUse.id, outcome)
      );
      messages.push(
        { role: "assistant", content: turnResult.assistantContent },
        { role: "user", content: toolResults }
      );
      continue;
    }
    debugLazy(logger8, () => [
      "web-tools stream done",
      JSON.stringify({ turns: turn + 1, stop_reason: turnResult.stopReason })
    ]);
    break;
  }
  for (const ev of bufferedFinalEvents) {
    if (ev.type === "message_delta") ev.usage = usageTotal;
    await writeEvent(args.stream, ev);
  }
}
function accumulateTurnUsage2(total, turnEvents) {
  for (const ev of turnEvents) {
    if (ev.type !== "message_delta" || !ev.usage) continue;
    const u = ev.usage;
    total.input_tokens = (total.input_tokens ?? 0) + (u.input_tokens ?? 0);
    total.output_tokens += u.output_tokens;
    if (u.cache_read_input_tokens !== void 0) {
      total.cache_read_input_tokens = (total.cache_read_input_tokens ?? 0) + u.cache_read_input_tokens;
    }
    if (u.cache_creation_input_tokens !== void 0) {
      total.cache_creation_input_tokens = (total.cache_creation_input_tokens ?? 0) + u.cache_creation_input_tokens;
    }
  }
}
async function runOneStreamingTurn(args) {
  const response = await withHeartbeat(
    {
      stream: args.stream,
      messageStartEmitted: args.messageStartEmitted,
      intervalMs: args.heartbeatIntervalMs
    },
    () => args.transport.open()
  );
  const upstreamToClient = /* @__PURE__ */ new Map();
  const outcomes = [];
  const assistantContent = [];
  const bufferedFinal = [];
  let stopReason = null;
  let messageStartEmitted = args.messageStartEmitted;
  for await (const frame of response) {
    const events4 = args.transport.decode(frame);
    for (const event of events4) {
      const dispatched = await dispatchEvent({
        event,
        upstreamToClient,
        cursor: args.cursor,
        messageStartEmitted,
        stream: args.stream,
        executor: args.executor,
        state: args.state,
        outcomes,
        assistantContent,
        bufferedFinal,
        logger: args.options.logger,
        heartbeatIntervalMs: args.heartbeatIntervalMs
      });
      if (dispatched.stopReason !== void 0)
        stopReason = dispatched.stopReason;
      if (event.type === "message_start") messageStartEmitted = true;
    }
  }
  return {
    stopReason,
    assistantContent,
    outcomes,
    bufferedFinal,
    messageStartEmitted
  };
}
async function dispatchEvent(d) {
  const ev = d.event;
  switch (ev.type) {
    case "message_start": {
      if (!d.messageStartEmitted) await writeEvent(d.stream, ev);
      return {};
    }
    case "content_block_start": {
      await handleBlockStart(d, ev);
      return {};
    }
    case "content_block_delta": {
      await handleBlockDelta(d, ev);
      return {};
    }
    case "content_block_stop": {
      await handleBlockStop(d, ev);
      return {};
    }
    case "message_delta": {
      d.bufferedFinal.push(ev);
      return { stopReason: ev.delta.stop_reason ?? null };
    }
    case "message_stop": {
      d.bufferedFinal.push(ev);
      return {};
    }
    case "ping":
    case "error": {
      await writeEvent(d.stream, ev);
      return {};
    }
    default: {
      return {};
    }
  }
}
function classifyBlock(block) {
  if (block.type === "tool_use") return "tool_use";
  if (block.type === "text") return "text";
  if (block.type === "thinking") return "thinking";
  return "other";
}
function parseToolInput(partialJson) {
  if (!partialJson) return {};
  try {
    const parsed = JSON.parse(partialJson);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed;
    }
    return {};
  } catch {
    return {};
  }
}
async function handleBlockStart(d, ev) {
  const clientIndex = d.cursor.next++;
  const block = ev.content_block;
  const isToolUse = block.type === "tool_use";
  const isWebTool = isToolUse && isWebToolName(block.name);
  const open = {
    clientIndex,
    isWebTool,
    partialJson: "",
    text: "",
    thinking: "",
    blockKind: classifyBlock(block),
    ...isWebTool ? { toolUse: { id: block.id, name: block.name } } : {}
  };
  d.upstreamToClient.set(ev.index, open);
  if (isWebTool) {
    const rewritten = {
      type: "content_block_start",
      index: clientIndex,
      content_block: {
        type: BLOCK_KIND.serverToolUse,
        id: block.id,
        name: block.name,
        input: block.input
      }
    };
    await d.stream.writeSSE({
      event: "content_block_start",
      data: JSON.stringify(rewritten)
    });
    return;
  }
  await writeEvent(d.stream, { ...ev, index: clientIndex });
}
async function handleBlockDelta(d, ev) {
  const open = d.upstreamToClient.get(ev.index);
  if (!open) return;
  const remapped = { ...ev, index: open.clientIndex };
  if (ev.delta.type === "input_json_delta" && open.isWebTool) {
    open.partialJson += ev.delta.partial_json;
  } else if (ev.delta.type === "text_delta" && open.blockKind === "text") {
    open.text += ev.delta.text;
  } else if (ev.delta.type === "thinking_delta" && open.blockKind === "thinking") {
    open.thinking += ev.delta.thinking;
  }
  await writeEvent(d.stream, remapped);
}
async function handleBlockStop(d, ev) {
  const open = d.upstreamToClient.get(ev.index);
  if (!open) return;
  await writeEvent(d.stream, {
    type: "content_block_stop",
    index: open.clientIndex
  });
  d.upstreamToClient.delete(ev.index);
  if (open.blockKind === "text") {
    d.assistantContent.push({ type: "text", text: open.text });
  } else if (open.blockKind === "thinking") {
  } else if (open.blockKind === "tool_use" && open.toolUse) {
    const input = parseToolInput(open.partialJson);
    const toolUseBlock = {
      type: "tool_use",
      id: open.toolUse.id,
      name: open.toolUse.name,
      input
    };
    d.assistantContent.push(toolUseBlock);
    if (open.isWebTool && isWebToolName(toolUseBlock.name)) {
      const narrowed = toolUseBlock;
      const t0 = Date.now();
      const outcome = await withHeartbeat(
        {
          stream: d.stream,
          messageStartEmitted: d.messageStartEmitted,
          intervalMs: d.heartbeatIntervalMs
        },
        () => executeToolUse(narrowed, d.executor, d.state)
      );
      const ms = Date.now() - t0;
      debugLazy(d.logger, () => [
        "web-tools outcome",
        JSON.stringify({
          tool: toolUseBlock.name,
          id: toolUseBlock.id,
          ok: outcome.ok,
          ...outcome.ok ? {} : { code: outcome.code },
          ms
        })
      ]);
      d.outcomes.push({ toolUse: toolUseBlock, outcome });
      const resultIndex = d.cursor.next++;
      const resultBlock = buildResultBlockForOutcome(toolUseBlock.id, outcome);
      await writeEvent(d.stream, {
        type: "content_block_start",
        index: resultIndex,
        content_block: resultBlock
      });
      await writeEvent(d.stream, {
        type: "content_block_stop",
        index: resultIndex
      });
    }
  }
}
async function writeEvent(stream, event) {
  await stream.writeSSE({
    event: event.type,
    data: JSON.stringify(event)
  });
}
var HEARTBEAT_INTERVAL_MS = 5e3;
async function withHeartbeat(opts, work) {
  const { stream, messageStartEmitted, intervalMs } = opts;
  if (!messageStartEmitted) return work();
  let pinging = false;
  const timer = setInterval(() => {
    if (pinging) return;
    pinging = true;
    void stream.writeSSE({ event: "ping", data: '{"type":"ping"}' }).finally(() => {
      pinging = false;
    });
  }, intervalMs);
  try {
    return await work();
  } finally {
    clearInterval(timer);
  }
}

// src/routes/messages/web-tools/flow.ts
var NON_STREAMING_EXPECTED = "web-tools agent: expected non-streaming response from Copilot";
var defaultUpstreamDeps = {
  createChatCompletions,
  createResponses
};
function buildCallOnce(selectedModel, options, deps = defaultUpstreamDeps) {
  const callOptions = {
    requestId: options.requestId,
    sessionId: options.sessionId,
    compactType: options.compactType,
    subagentMarker: options.subagentMarker
  };
  if (shouldUseResponsesApi(selectedModel)) {
    return async (turnPayload) => {
      const responsesPayload = translateAnthropicMessagesToResponsesPayload(turnPayload);
      responsesPayload.stream = false;
      const { vision, initiator } = getResponsesRequestOptions(responsesPayload);
      const response = await deps.createResponses(responsesPayload, {
        vision,
        initiator,
        ...callOptions
      });
      if (isAsyncIterable(response)) {
        throw new Error(NON_STREAMING_EXPECTED);
      }
      return translateResponsesResultToAnthropic(response);
    };
  }
  return async (turnPayload) => {
    const openAIPayload = translateToOpenAI(turnPayload);
    openAIPayload.stream = false;
    const response = await deps.createChatCompletions(
      openAIPayload,
      callOptions
    );
    if (!isNonStreaming(response)) {
      throw new Error(NON_STREAMING_EXPECTED);
    }
    return translateToAnthropic(response);
  };
}
async function handleWithWebToolsAgent(args) {
  const { c, payload, options, policy, selectedModel } = args;
  attachClientShims(payload, policy);
  const wantsStream = payload.stream === true;
  const executor = selectExecutor();
  if (!wantsStream) {
    const finalResponse = await runAgentLoop({
      initialPayload: payload,
      policy,
      executor,
      callOnce: buildCallOnce(selectedModel, options),
      logger: options.logger
    });
    return c.json(finalResponse);
  }
  return streamSSE5(c, async (stream) => {
    try {
      await runStreamingAgent({
        initialPayload: payload,
        policy,
        stream,
        options,
        executor,
        selectedModel,
        upstreamCall: args.upstreamCall
      });
    } catch (error) {
      await emitStreamError(stream, options.logger, {
        error,
        flow: "chat_completions"
      });
    }
  });
}

// src/routes/messages/handler.ts
var logger2 = createHandlerLogger("messages-handler");
var MessagesRequestShape = z5.object({ messages: z5.array(z5.unknown()) }).loose();
var readMessagesPayload = async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!MessagesRequestShape.safeParse(body).success) return null;
  return body;
};
var invalidRequest = (c) => c.json(
  {
    error: {
      message: "Invalid request body: expected a JSON object with a `messages` array.",
      type: "invalid_request_error"
    }
  },
  400
);
function resolveCopilotModel(c, payload) {
  const reversed = reverseId(payload.model);
  const longContext = c.req.header("anthropic-beta")?.includes("context-1m-2025-08-07") ?? false;
  return pickCopilotVariantId(
    reversed,
    { effort: payload.output_config?.effort, longContext },
    state.models?.data.map((m) => m.id) ?? []
  );
}
var defaultDeps = {
  findEndpointModel,
  handleWithMessagesApi,
  handleWithResponsesApi,
  handleWithChatCompletions
};
function respondIfWarmup(c, payload, ctx) {
  const noTools = !payload.tools || payload.tools.length === 0;
  if (!ctx.anthropicBeta || !noTools || ctx.compactType !== 0) return null;
  if (isWarmupRequest(payload)) {
    logger2.debug("warmup short-circuit", {
      model: payload.model,
      stream: payload.stream ?? false
    });
    return respondToWarmup(c, payload);
  }
  debugLazy(logger2, () => [
    "no-tool beta request, not warmup-shaped",
    { msgCount: payload.messages.length }
  ]);
  return null;
}
async function handleCompletion2(c, deps = defaultDeps) {
  await checkRateLimit(state);
  const anthropicPayload = await readMessagesPayload(c);
  if (!anthropicPayload) return invalidRequest(c);
  stripUnsupportedTopLevelAnthropicFields(anthropicPayload);
  debugJson(logger2, "Anthropic request payload:", anthropicPayload);
  anthropicPayload.model = resolveCopilotModel(c, anthropicPayload);
  sanitizeIdeTools(anthropicPayload);
  const webToolPolicy = splitWebTools(anthropicPayload);
  const subagentMarker = parseSubagentMarkerFromFirstUser(anthropicPayload);
  if (subagentMarker) {
    debugJson(logger2, "Detected Subagent marker:", subagentMarker);
  }
  const sessionId = getRootSessionId(anthropicPayload, c);
  logger2.debug("Extracted session ID:", sessionId);
  const compactType = getCompactType(anthropicPayload);
  const anthropicBeta = c.req.header("anthropic-beta");
  logger2.debug("Anthropic Beta header:", anthropicBeta);
  const warmup = respondIfWarmup(c, anthropicPayload, {
    anthropicBeta,
    compactType
  });
  if (warmup) return warmup;
  if (compactType) {
    logger2.debug("Compact request type:", compactType);
  }
  stripToolReferenceTurnBoundary(anthropicPayload);
  mergeToolResultForClaude(anthropicPayload, {
    skipLastMessage: compactType === COMPACT_REQUEST
  });
  const requestId = generateRequestIdFromPayload(anthropicPayload, sessionId);
  logger2.debug("Generated request ID:", requestId);
  if (state.manualApprove) {
    await awaitApproval();
  }
  const selectedModel = deps.findEndpointModel(anthropicPayload.model);
  anthropicPayload.model = selectedModel?.id ?? anthropicPayload.model;
  if (webToolPolicy.declarations.length > 0) {
    return await handleWithWebToolsAgent({
      c,
      payload: anthropicPayload,
      options: { subagentMarker, requestId, sessionId, compactType, logger: logger2 },
      policy: webToolPolicy,
      selectedModel
    });
  }
  if (shouldUseMessagesApi(selectedModel)) {
    return await deps.handleWithMessagesApi(c, anthropicPayload, {
      anthropicBetaHeader: anthropicBeta,
      subagentMarker,
      selectedModel,
      requestId,
      sessionId,
      compactType,
      logger: logger2
    });
  }
  if (shouldUseResponsesApi(selectedModel)) {
    return await deps.handleWithResponsesApi(c, anthropicPayload, {
      subagentMarker,
      selectedModel,
      requestId,
      sessionId,
      compactType,
      logger: logger2
    });
  }
  return await deps.handleWithChatCompletions(c, anthropicPayload, {
    subagentMarker,
    requestId,
    sessionId,
    compactType,
    logger: logger2
  });
}

// src/routes/messages/route.ts
var messageRoutes = new Hono6();
messageRoutes.post("/", async (c) => {
  try {
    return await handleCompletion2(c);
  } catch (error) {
    return await forwardError(c, error);
  }
});
messageRoutes.post("/count_tokens", async (c) => {
  try {
    return await handleCountTokens(c);
  } catch (error) {
    return await forwardError(c, error);
  }
});

// src/routes/models/route.ts
import { Hono as Hono7 } from "hono";

// src/routes/models/wire-models.ts
var EPOCH_ISO = (/* @__PURE__ */ new Date(0)).toISOString();
function toOpenAiModel(model) {
  return {
    id: forwardId(model.id),
    object: "model",
    created: 0,
    owned_by: model.vendor
  };
}
function openAiModelList(models) {
  return {
    object: "list",
    data: models.map((model) => toOpenAiModel(model)),
    has_more: false
  };
}
function toAnthropicModel(model) {
  const profile = resolveModelProfile(model);
  return {
    id: forwardId(model.id),
    type: "model",
    display_name: model.name,
    // Anthropic permits an epoch when the release date is unknown; the Copilot
    // catalog doesn't carry one.
    created_at: EPOCH_ISO,
    max_input_tokens: profile.maxContextWindowTokens,
    max_tokens: profile.maxOutputTokens,
    capabilities: {
      image_input: { supported: profile.supportsVision },
      pdf_input: { supported: profile.supportsVision },
      structured_outputs: { supported: profile.supportsStructuredOutputs },
      thinking: { supported: profile.isReasoning }
    }
  };
}
function anthropicModelList(models) {
  const data = models.map((model) => toAnthropicModel(model));
  return {
    data,
    first_id: data[0]?.id ?? null,
    has_more: false,
    last_id: data.at(-1)?.id ?? null
  };
}
function prefersAnthropicModels(headers) {
  if (headers.get("anthropic-version")) return true;
  const ua = headers.get("user-agent")?.toLowerCase() ?? "";
  return ua.startsWith("anthropic/") || ua.startsWith("claude");
}

// src/routes/models/route.ts
var modelRoutes = new Hono7();
modelRoutes.get("/", async (c) => {
  if (modelsCached() === 0) {
    await primeModelsCache();
  }
  const models = (state.models?.data ?? []).filter(
    (model) => !isVariantId(model.id)
  );
  return c.json(
    prefersAnthropicModels(c.req.raw.headers) ? anthropicModelList(models) : openAiModelList(models)
  );
});

// src/routes/product-api.ts
import { OpenAPIHono as OpenAPIHono2 } from "@hono/zod-openapi";

// src/routes/setup-status.ts
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";

// src/lib/config/setup-status.ts
import { z as z6 } from "@hono/zod-openapi";
import {
  accessSync,
  constants as fsConstants,
  existsSync,
  readFileSync,
  statSync
} from "fs";
import path from "path";
var SetupCheckNameSchema = z6.enum(["appDir", "config", "db", "githubAuth"]).openapi("SetupCheckName");
var SetupCheckResultSchema = z6.object({
  ok: z6.boolean(),
  reason: z6.string().optional(),
  path: z6.string().optional()
}).openapi("SetupCheckResult");
var SetupStatusSchema = z6.object({
  ready: z6.boolean(),
  checks: z6.object({
    appDir: SetupCheckResultSchema,
    config: SetupCheckResultSchema,
    db: SetupCheckResultSchema,
    githubAuth: SetupCheckResultSchema
  }),
  nextStep: SetupCheckNameSchema.nullable()
}).openapi("SetupStatus");
var CHECK_ORDER = [
  "appDir",
  "config",
  "db",
  "githubAuth"
];
var DB_FILENAME = "copilot-api.sqlite";
function defaultPaths() {
  return {
    appDir: PATHS.APP_DIR,
    configPath: PATHS.CONFIG_PATH,
    dbPath: path.join(PATHS.APP_DIR, DB_FILENAME),
    githubTokenPath: PATHS.GITHUB_TOKEN_PATH
  };
}
async function evaluateSetup(paths = defaultPaths()) {
  const checks = {
    appDir: checkAppDir(paths.appDir),
    config: checkConfig(paths.configPath),
    db: checkDb(paths.dbPath),
    githubAuth: await checkGithubAuth(paths.githubTokenPath)
  };
  const nextStep = CHECK_ORDER.find((name) => !checks[name].ok) ?? null;
  return {
    ready: nextStep === null,
    checks,
    nextStep
  };
}
function checkAppDir(dir) {
  if (!existsSync(dir)) {
    return { ok: false, reason: "directory does not exist", path: dir };
  }
  try {
    accessSync(dir, fsConstants.W_OK);
  } catch {
    return { ok: false, reason: "directory not writable", path: dir };
  }
  return { ok: true, path: dir };
}
function checkConfig(file) {
  if (!existsSync(file)) {
    return { ok: true, path: file };
  }
  let raw;
  try {
    raw = readFileSync(file, "utf8");
  } catch (err) {
    return {
      ok: false,
      reason: `cannot read: ${err.message}`,
      path: file
    };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "invalid JSON", path: file };
  }
  const result = AppConfigSchema.safeParse(parsed);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const where = firstIssue.path.length > 0 ? firstIssue.path.join(".") : "(root)";
    return {
      ok: false,
      reason: `schema mismatch at ${where}`,
      path: file
    };
  }
  return { ok: true, path: file };
}
function checkDb(file) {
  if (!existsSync(file)) {
    return { ok: true, path: file };
  }
  let size;
  try {
    size = statSync(file).size;
  } catch {
    return { ok: false, reason: "cannot stat", path: file };
  }
  if (size === 0) {
    return { ok: false, reason: "empty file", path: file };
  }
  return { ok: true, path: file };
}
async function checkGithubAuth(file) {
  const active = getActiveRecord(await readRegistry(registryPathFor(file)));
  const token = active?.token ?? (await readGitHubTokenRecord(file))?.accessToken;
  if (!token) {
    return { ok: false, reason: "github_token missing", path: file };
  }
  if (token.length === 0) {
    return { ok: false, reason: "github_token empty", path: file };
  }
  return { ok: true, path: file };
}

// src/routes/setup-status.ts
var setupStatusRoute = new OpenAPIHono();
var getSetupStatus = createRoute({
  method: "get",
  path: "/",
  summary: "Report first-run / runtime setup status",
  description: "Unauthenticated snapshot of the local install's readiness (app dir, config, db, GitHub auth) that a fresh install polls to discover what is still missing.",
  responses: {
    200: {
      description: "Current setup status.",
      content: {
        "application/json": {
          schema: SetupStatusSchema
        }
      }
    }
  }
});
setupStatusRoute.openapi(getSetupStatus, async (c) => {
  return c.json(await evaluateSetup(), 200);
});
setupStatusRoute.onError((error, c) => forwardError(c, error));

// src/routes/product-api.ts
var productApiRoutes = new OpenAPIHono2();
productApiRoutes.route("/setup-status", setupStatusRoute);
productApiRoutes.doc("/openapi.json", {
  openapi: "3.1.0",
  info: {
    title: "maximal product API",
    version: BUILD_VERSION,
    description: "maximal-specific product endpoints. Does not cover the OpenAI-/Anthropic-compatible proxy endpoints, which mirror upstream provider specs."
  }
});

// src/routes/provider/messages/route.ts
import { Hono as Hono8 } from "hono";

// src/services/providers/provider-dispatcher.ts
import consola9 from "consola";
var unavailableResponse = (provider) => Response.json(
  {
    type: "error",
    error: {
      type: "api_error",
      message: `Provider '${provider}' is unavailable`
    }
  },
  { status: 503 }
);
function managedGateway(gateway) {
  let leases = 0;
  let retired = false;
  let disposePromise;
  let resolveDrained;
  const drained = () => {
    if (leases === 0) return Promise.resolve();
    return new Promise((resolve) => {
      resolveDrained = resolve;
    });
  };
  return {
    gateway,
    acquire() {
      if (retired) throw new Error("The provider gateway generation is retired");
      leases += 1;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        leases -= 1;
        if (leases === 0) {
          resolveDrained?.();
          resolveDrained = void 0;
        }
      };
    },
    retire() {
      disposePromise ??= (async () => {
        retired = true;
        await drained();
        await gateway.dispose();
      })();
      return disposePromise;
    }
  };
}
function createProviderDispatcher(options = {}) {
  const configSource = options.configSource;
  const gatewayFactory = options.gatewayFactory;
  const readConfig = options.readConfig ?? getConfig;
  const staticGateway = options.gateway ? managedGateway(options.gateway) : void 0;
  let factoryGateway;
  let activation;
  let queuedActivation;
  let disposePromise;
  let disposed = false;
  let generation = 0;
  const transitionDisposals = /* @__PURE__ */ new Set();
  const isLegacyMode = () => configSource ? configSource.getSnapshot().providerHost.mode === "legacy" : (readConfig().providerHost?.mode ?? "legacy") === "legacy";
  const safeRetire = async (candidate, context) => {
    try {
      await candidate.retire();
    } catch (error) {
      consola9.error(`Provider gateway ${context} disposal failed`, error);
    }
  };
  const trackRetirement = (candidate) => {
    const retirement = safeRetire(candidate, "transition").finally(
      () => transitionDisposals.delete(retirement)
    );
    transitionDisposals.add(retirement);
  };
  const activate = (snapshot) => {
    if (disposed || staticGateway || factoryGateway || !gatewayFactory || !configSource) {
      return activation;
    }
    if (activation) {
      queuedActivation = snapshot;
      return activation;
    }
    const activationGeneration = generation;
    const running = Promise.resolve().then(async () => {
      let candidate;
      try {
        candidate = managedGateway(
          await gatewayFactory({
            config: snapshot,
            configSource
          })
        );
      } catch (error) {
        consola9.error("Provider gateway activation failed", error);
        return;
      }
      if (disposed || activationGeneration !== generation || configSource.getSnapshot().providerHost.mode !== "dsh") {
        await safeRetire(candidate, "stale activation");
        return;
      }
      factoryGateway = candidate;
      queuedActivation = void 0;
    });
    activation = running.finally(() => {
      activation = void 0;
      if (disposed || factoryGateway) {
        queuedActivation = void 0;
        return;
      }
      if (configSource.getSnapshot().providerHost.mode !== "dsh") {
        queuedActivation = void 0;
        return;
      }
      const nextSnapshot = queuedActivation;
      queuedActivation = void 0;
      if (nextSnapshot) return activate(nextSnapshot);
      if (activationGeneration !== generation) {
        return activate(configSource.getSnapshot());
      }
    });
    return activation;
  };
  const onConfig = (snapshot) => {
    if (snapshot.providerHost.mode === "legacy") {
      generation += 1;
      queuedActivation = void 0;
      const previous = factoryGateway;
      factoryGateway = void 0;
      if (previous) trackRetirement(previous);
      return;
    }
    void activate(snapshot);
  };
  const unsubscribeConfig = configSource?.subscribe(onConfig);
  const initialActivation = configSource?.getSnapshot().providerHost.mode === "dsh" ? activate(configSource.getSnapshot()) : void 0;
  return {
    async dispatch(dispatchOptions) {
      if (isLegacyMode()) {
        return await dispatchOptions.legacy();
      }
      const activeGateway = staticGateway ?? factoryGateway;
      if (!activeGateway) {
        return unavailableResponse(dispatchOptions.provider);
      }
      const release = activeGateway.acquire();
      try {
        const metadataPromise = dispatchOptions.operation === "messages" ? readRequestUsageMetadata(dispatchOptions.request.clone()) : void 0;
        let response = await activeGateway.gateway.dispatch({
          operation: dispatchOptions.operation,
          provider: dispatchOptions.provider,
          request: dispatchOptions.request,
          signal: dispatchOptions.signal
        });
        if (dispatchOptions.operation === "messages" && response.ok && response.body && metadataPromise) {
          response = observeMessagesUsage(
            response,
            dispatchOptions.provider,
            metadataPromise
          );
        }
        return holdGatewayLease(response, release);
      } catch (error) {
        release();
        throw error;
      }
    },
    dispose() {
      disposePromise ??= (async () => {
        disposed = true;
        generation += 1;
        queuedActivation = void 0;
        unsubscribeConfig?.();
        await activation;
        const currentFactory = factoryGateway;
        factoryGateway = void 0;
        if (currentFactory) await safeRetire(currentFactory, "final");
        if (staticGateway) await safeRetire(staticGateway, "final");
        await Promise.all(transitionDisposals);
        await configSource?.dispose();
      })();
      return disposePromise;
    },
    async ready() {
      await initialActivation;
    },
    requiresGithubAuth() {
      return isLegacyMode();
    }
  };
}
function holdGatewayLease(response, release) {
  const reader = response.body?.getReader();
  if (!reader) {
    release();
    return response;
  }
  const body = new ReadableStream({
    async pull(controller) {
      try {
        const chunk = await reader.read();
        if (chunk.done) {
          release();
          controller.close();
          return;
        }
        const value = chunk.value;
        if (!(value instanceof Uint8Array)) {
          throw new TypeError("Provider response body emitted a non-byte chunk");
        }
        controller.enqueue(value);
      } catch (error) {
        release();
        controller.error(error);
      }
    },
    async cancel(reason) {
      try {
        await reader.cancel(reason);
      } finally {
        release();
      }
    }
  });
  return new Response(body, {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText
  });
}
async function readRequestUsageMetadata(request) {
  try {
    const payload = asRecord(await request.json());
    const model = payload?.model;
    const userId = asRecord(payload?.metadata)?.user_id;
    return {
      model: typeof model === "string" ? model : "unknown",
      sessionId: typeof userId === "string" ? parseUserIdMetadata(userId).sessionId ?? void 0 : void 0
    };
  } catch {
    return { model: "unknown" };
  }
}
function observeMessagesUsage(response, provider, metadataPromise) {
  const reader = response.body?.getReader();
  if (!reader) return response;
  const isSse = (response.headers.get("content-type") ?? "").includes(
    "text/event-stream"
  );
  const observer = isSse ? new AnthropicSseUsageObserver() : void 0;
  const jsonDecoder = isSse ? void 0 : new TextDecoder();
  let jsonBody = "";
  const body = new ReadableStream({
    async pull(controller) {
      try {
        const chunk = await reader.read();
        if (!chunk.done) {
          const value = chunk.value;
          if (!(value instanceof Uint8Array)) {
            throw new TypeError(
              "Provider response body emitted a non-byte chunk"
            );
          }
          if (observer) {
            observer.push(value);
          } else {
            jsonBody += jsonDecoder?.decode(value, { stream: true }) ?? "";
          }
          controller.enqueue(value);
          return;
        }
        const usage = observer ? observer.finish() : readJsonUsage(jsonBody + (jsonDecoder?.decode() ?? ""));
        const metadata = await metadataPromise;
        try {
          createProviderTokenUsageRecorder({
            endpoint: "provider_messages",
            model: metadata.model,
            providerName: provider,
            sessionId: metadata.sessionId
          })(usage);
        } catch (error) {
          consola9.warn("Failed to record provider token usage", error);
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel(reason) {
      await reader.cancel(reason);
    }
  });
  return new Response(body, {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText
  });
}
function readJsonUsage(body) {
  try {
    return normalizeAnthropicUsage(readUsage(JSON.parse(body)));
  } catch {
    return {};
  }
}
var AnthropicSseUsageObserver = class {
  decoder = new TextDecoder();
  buffer = "";
  usage = {};
  push(chunk) {
    this.buffer += this.decoder.decode(chunk, { stream: true });
    this.drain(false);
  }
  finish() {
    this.buffer += this.decoder.decode();
    this.drain(true);
    return this.usage;
  }
  drain(flush) {
    const normalized = this.buffer.replaceAll("\r\n", "\n");
    const blocks = normalized.split("\n\n");
    this.buffer = flush ? "" : blocks.pop() ?? "";
    for (const block of blocks) {
      this.readBlock(block);
    }
    if (flush && this.buffer.length > 0) {
      this.readBlock(this.buffer);
      this.buffer = "";
    }
  }
  readBlock(block) {
    const data = block.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
    if (!data || data === "[DONE]") return;
    try {
      const event = JSON.parse(data);
      const type = asRecord(event)?.type;
      let eventUsage;
      if (type === "message_start") {
        eventUsage = readNestedUsage(event, "message");
      } else if (type === "message_delta") {
        eventUsage = readUsage(event);
      }
      this.usage = mergeAnthropicUsage(
        this.usage,
        normalizeAnthropicUsage(eventUsage)
      );
    } catch {
    }
  }
};

// src/routes/provider/messages/count-tokens-handler.ts
var logger3 = createHandlerLogger("provider-count-tokens-handler");
var createFallbackModel = (modelId) => ({
  capabilities: {
    family: "provider",
    limits: {},
    object: "model_capabilities",
    supports: {},
    tokenizer: "o200k_base",
    type: "chat"
  },
  id: modelId,
  model_picker_enabled: false,
  name: modelId,
  object: "model",
  preview: false,
  vendor: "provider",
  version: "unknown"
});
async function handleProviderCountTokens(c) {
  const provider = c.req.param("provider");
  try {
    const anthropicPayload = await c.req.json();
    stripUnsupportedTopLevelAnthropicFields(anthropicPayload);
    const openAIPayload = translateToOpenAI(anthropicPayload);
    const modelId = anthropicPayload.model.trim();
    let selectedModel = state.models?.data.find((model) => model.id === modelId);
    if (!selectedModel && modelId) {
      selectedModel = createFallbackModel(modelId);
    }
    if (!selectedModel) {
      logger3.warn("provider.count_tokens.model_not_found", {
        provider,
        model: anthropicPayload.model
      });
      return c.json({
        input_tokens: 1
      });
    }
    const tokenCount = await getTokenCount(openAIPayload, selectedModel);
    const finalTokenCount = tokenCount.input + tokenCount.output;
    logger3.debug("provider.count_tokens.success", {
      provider,
      model: anthropicPayload.model,
      input_tokens: finalTokenCount
    });
    return c.json({
      input_tokens: finalTokenCount
    });
  } catch (error) {
    logger3.error("provider.count_tokens.error", {
      provider,
      error
    });
    return c.json({
      input_tokens: 1
    });
  }
}

// src/routes/provider/messages/handler.ts
import { events as events3 } from "fetch-event-stream";
import { streamSSE as streamSSE6 } from "hono/streaming";

// src/services/providers/anthropic-proxy.ts
var FORWARDABLE_HEADERS = [
  "anthropic-version",
  "anthropic-beta",
  "accept",
  "user-agent"
];
var STRIPPED_RESPONSE_HEADERS = [
  "connection",
  "content-encoding",
  "content-length",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade"
];
function buildProviderUpstreamHeaders(requestHeaders) {
  const headers = {
    "content-type": "application/json",
    accept: "application/json"
  };
  for (const headerName of FORWARDABLE_HEADERS) {
    const headerValue = requestHeaders.get(headerName);
    if (headerValue) {
      headers[headerName] = headerValue;
    }
  }
  return headers;
}
function createProviderProxyResponse(upstreamResponse) {
  const headers = new Headers(upstreamResponse.headers);
  for (const headerName of STRIPPED_RESPONSE_HEADERS) {
    headers.delete(headerName);
  }
  return new Response(upstreamResponse.body, {
    headers,
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText
  });
}
async function forwardProviderMessages(providerConfig, payload, requestHeaders) {
  return await sendProviderRequest(
    providerConfig,
    `${providerConfig.baseUrl}/v1/messages`,
    {
      method: "POST",
      headers: buildProviderUpstreamHeaders(requestHeaders),
      body: JSON.stringify(payload)
    }
  );
}
async function forwardProviderModels(providerConfig, requestHeaders) {
  return await sendProviderRequest(
    providerConfig,
    `${providerConfig.baseUrl}/v1/models`,
    {
      method: "GET",
      headers: buildProviderUpstreamHeaders(requestHeaders)
    }
  );
}

// src/routes/provider/messages/handler.ts
var logger4 = createHandlerLogger("provider-messages-handler");
async function handleProviderMessages(c) {
  const provider = c.req.param("provider") ?? "";
  const providerConfig = getProviderConfig(provider);
  if (!providerConfig) {
    return c.json(
      {
        error: {
          message: `Provider '${provider}' not found or disabled`,
          type: "invalid_request_error"
        }
      },
      404
    );
  }
  try {
    const payload = await c.req.json();
    stripUnsupportedTopLevelAnthropicFields(payload);
    const modelConfig = providerConfig.models?.[payload.model];
    payload.temperature ??= modelConfig?.temperature;
    payload.top_p ??= modelConfig?.topP;
    payload.top_k ??= modelConfig?.topK;
    debugJson(logger4, "provider.messages.request", { payload, provider });
    const upstreamResponse = await forwardProviderMessages(
      providerConfig,
      payload,
      c.req.raw.headers
    );
    if (!upstreamResponse.ok) {
      logger4.error("Failed to create responses", upstreamResponse);
      throw new HTTPError("Failed to create responses", upstreamResponse);
    }
    const contentType = upstreamResponse.headers.get("content-type") ?? "";
    const isStreamingResponse = Boolean(payload.stream) && contentType.includes("text/event-stream");
    if (isStreamingResponse) {
      return streamProviderMessages({
        c,
        payload,
        provider,
        providerConfig,
        upstreamResponse
      });
    }
    const jsonBody = await upstreamResponse.json();
    return respondProviderMessagesJson(c, {
      body: jsonBody,
      payload,
      provider,
      providerConfig
    });
  } catch (error) {
    logger4.error("provider.messages.error", {
      provider,
      error
    });
    throw error;
  }
}
var streamProviderMessages = ({
  c,
  payload,
  provider,
  providerConfig,
  upstreamResponse
}) => {
  logger4.debug("provider.messages.streaming");
  const recordUsage = createProviderMessagesUsageRecorder(payload, provider);
  return streamSSE6(c, async (stream) => {
    let usage = {};
    for await (const chunk of events3(upstreamResponse)) {
      logger4.debug("provider.messages.raw_stream_event:", chunk.data);
      const eventName = chunk.event;
      if (eventName === "ping") {
        await stream.writeSSE({ event: "ping", data: '{"type":"ping"}' });
        continue;
      }
      let data = chunk.data;
      if (!data) {
        continue;
      }
      if (chunk.data === "[DONE]") {
        break;
      }
      const parsed = parseProviderStreamEvent(data, providerConfig);
      if (parsed) {
        usage = mergeAnthropicUsage(usage, parsed.usage);
        data = parsed.data;
      }
      await stream.writeSSE({
        event: eventName,
        data
      });
    }
    recordUsage(usage);
  });
};
var parseProviderStreamEvent = (data, providerConfig) => {
  try {
    const parsed = JSON.parse(data);
    if (parsed.type === "message_start") {
      const messageUsage = readNestedUsage(parsed, "message");
      adjustInputTokens(providerConfig, messageUsage);
      return {
        data: JSON.stringify(parsed),
        model: asRecord(parsed.message)?.model,
        usage: normalizeAnthropicUsage(messageUsage)
      };
    }
    if (parsed.type === "message_delta") {
      const deltaUsage = readUsage(parsed);
      adjustInputTokens(providerConfig, deltaUsage);
      return {
        data: JSON.stringify(parsed),
        usage: normalizeAnthropicUsage(deltaUsage)
      };
    }
    return { data: JSON.stringify(parsed), usage: {} };
  } catch (error) {
    logger4.error("provider.messages.streaming.adjust_tokens_error", {
      error,
      originalData: data
    });
    return null;
  }
};
var respondProviderMessagesJson = (c, options) => {
  const { body, payload, provider, providerConfig } = options;
  const recordUsage = createProviderMessagesUsageRecorder(payload, provider);
  adjustInputTokens(providerConfig, body.usage);
  recordUsage(normalizeAnthropicUsage(body.usage));
  debugJson(logger4, "provider.messages.no_stream result:", body);
  return c.json(body);
};
var createProviderMessagesUsageRecorder = (payload, provider) => createProviderTokenUsageRecorder({
  endpoint: "provider_messages",
  model: payload.model,
  providerName: provider,
  sessionId: parseUserIdMetadata(payload.metadata?.user_id).sessionId
});
var adjustInputTokens = (providerConfig, usage) => {
  if (!providerConfig.adjustInputTokens || !usage) {
    return;
  }
  const adjustedInput = Math.max(
    0,
    (usage.input_tokens ?? 0) - (usage.cache_read_input_tokens ?? 0) - (usage.cache_creation_input_tokens ?? 0)
  );
  usage.input_tokens = adjustedInput;
  debugJson(logger4, "provider.messages.adjusted_usage:", usage);
};

// src/routes/provider/messages/route.ts
function createProviderMessageRoutes(dispatcher = createProviderDispatcher()) {
  const routes = new Hono8();
  routes.post("/", async (c) => {
    try {
      return await dispatcher.dispatch({
        legacy: async () => await handleProviderMessages(c),
        operation: "messages",
        provider: c.req.param("provider") ?? "",
        request: c.req.raw,
        signal: c.req.raw.signal
      });
    } catch (error) {
      return await forwardError(c, error);
    }
  });
  routes.post("/count_tokens", async (c) => {
    try {
      return await dispatcher.dispatch({
        legacy: async () => await handleProviderCountTokens(c),
        operation: "count-tokens",
        provider: c.req.param("provider") ?? "",
        request: c.req.raw,
        signal: c.req.raw.signal
      });
    } catch (error) {
      return await forwardError(c, error);
    }
  });
  return routes;
}
var providerMessageRoutes = createProviderMessageRoutes();

// src/routes/provider/models/route.ts
import { Hono as Hono9 } from "hono";
var logger5 = createHandlerLogger("provider-models-handler");
function createProviderModelRoutes(dispatcher = createProviderDispatcher()) {
  const routes = new Hono9();
  routes.get("/", async (c) => {
    const provider = c.req.param("provider") ?? "";
    try {
      return await dispatcher.dispatch({
        legacy: async () => await handleLegacyProviderModels(c, provider),
        operation: "models",
        provider,
        request: c.req.raw,
        signal: c.req.raw.signal
      });
    } catch (error) {
      logger5.error("provider.models.error", {
        provider,
        error
      });
      return await forwardError(c, error);
    }
  });
  return routes;
}
async function handleLegacyProviderModels(c, provider) {
  const providerConfig = getProviderConfig(provider);
  if (!providerConfig) {
    return c.json(
      {
        error: {
          message: `Provider '${provider}' not found or disabled`,
          type: "invalid_request_error"
        }
      },
      404
    );
  }
  const upstreamResponse = await forwardProviderModels(
    providerConfig,
    c.req.raw.headers
  );
  logger5.debug("provider.models.response", {
    provider,
    statusCode: upstreamResponse.status
  });
  return createProviderProxyResponse(upstreamResponse);
}
var providerModelRoutes = createProviderModelRoutes();

// src/routes/responses/route.ts
import { Hono as Hono10 } from "hono";

// src/routes/responses/handler.ts
import { streamSSE as streamSSE7 } from "hono/streaming";

// src/routes/responses/stream-id-sync.ts
var asOutputItemFrame = (value) => {
  if (typeof value !== "object" || value === null) return void 0;
  const item = value.item;
  if (typeof item !== "object" || item === null) return void 0;
  return value;
};
var readOutputIndex = (frame) => typeof frame.output_index === "number" ? frame.output_index : void 0;
var createStreamIdTracker = () => ({
  outputItems: /* @__PURE__ */ new Map()
});
var fixStreamIds = (data, event, tracker) => {
  if (!data) return data;
  let parsed;
  try {
    parsed = JSON.parse(data);
  } catch {
    return data;
  }
  switch (event) {
    case "response.output_item.added": {
      const frame = asOutputItemFrame(parsed);
      return frame ? handleOutputItemAdded2(frame, tracker) : data;
    }
    case "response.output_item.done": {
      const frame = asOutputItemFrame(parsed);
      return frame ? handleOutputItemDone2(frame, tracker) : data;
    }
    default: {
      if (typeof parsed !== "object" || parsed === null) return data;
      return handleItemId(parsed, tracker);
    }
  }
};
var handleOutputItemAdded2 = (parsed, tracker) => {
  if (!parsed.item.id) {
    let randomSuffix = "";
    while (randomSuffix.length < 16) {
      randomSuffix += Math.random().toString(36).slice(2);
    }
    parsed.item.id = `oi_${String(parsed.output_index)}_${randomSuffix.slice(0, 16)}`;
  }
  const outputIndex = readOutputIndex(parsed);
  if (outputIndex !== void 0) {
    tracker.outputItems.set(outputIndex, parsed.item.id);
  }
  return JSON.stringify(parsed);
};
var handleOutputItemDone2 = (parsed, tracker) => {
  const outputIndex = readOutputIndex(parsed);
  const originalId = outputIndex === void 0 ? void 0 : tracker.outputItems.get(outputIndex);
  if (originalId) {
    parsed.item.id = originalId;
  }
  return JSON.stringify(parsed);
};
var handleItemId = (parsed, tracker) => {
  const outputIndex = readOutputIndex(parsed);
  if (outputIndex !== void 0) {
    const itemId = tracker.outputItems.get(outputIndex);
    if (itemId) {
      parsed.item_id = itemId;
    }
  }
  return JSON.stringify(parsed);
};

// src/routes/responses/handler.ts
var createResponses2 = createResponses;
var logger6 = createHandlerLogger("responses-handler");
function responsesUnavailableForModel(c) {
  if (modelsCached() === 0) {
    return c.json(
      {
        error: {
          message: "The model catalog is still loading; retry this request shortly.",
          type: "server_error"
        }
      },
      503
    );
  }
  return c.json(
    {
      error: {
        message: "This model does not support the responses endpoint. Please choose a different model.",
        type: "invalid_request_error"
      }
    },
    400
  );
}
var handleResponses = async (c) => {
  await checkRateLimit(state);
  const payload = await c.req.json();
  payload.model = reverseId(payload.model);
  debugJson(logger6, "Responses request payload:", payload);
  const requestId = generateRequestIdFromPayload({ messages: payload.input });
  logger6.debug("Generated request ID:", requestId);
  const sessionId = getUUID(requestId);
  logger6.debug("Extracted session ID:", sessionId);
  const recordUsage = createCopilotTokenUsageRecorder({
    endpoint: "responses",
    fallbackSessionId: sessionId,
    model: payload.model
  });
  useFunctionApplyPatch(payload);
  removeUnsupportedTools(payload);
  mapAnthropicWebTools(payload);
  if (!isResponsesApiWebSearchEnabled()) {
    removeWebSearchTool(payload);
  }
  compactInputByLatestCompaction(payload);
  const selectedModel = state.models?.data.find(
    (model) => model.id === payload.model
  );
  if (!shouldUseResponsesApi(selectedModel)) {
    return responsesUnavailableForModel(c);
  }
  applyResponsesApiContextManagement(
    payload,
    selectedModel ? resolveModelProfile(selectedModel).maxPromptTokens : void 0
  );
  const promptCacheRetention = getPromptCacheRetention();
  if (promptCacheRetention && !payload.prompt_cache_retention) {
    payload.prompt_cache_retention = promptCacheRetention;
  }
  debugJson(logger6, "Translated Responses payload:", payload);
  const { vision, initiator } = getResponsesRequestOptions(payload);
  if (state.manualApprove) {
    await awaitApproval();
  }
  const response = await createResponses2(payload, {
    vision,
    initiator,
    requestId,
    sessionId
  });
  if (isStreamingRequested(payload) && isAsyncIterable(response)) {
    logger6.debug("Forwarding native Responses stream");
    return streamSSE7(c, async (stream) => {
      const idTracker = createStreamIdTracker();
      let usage = {};
      for await (const chunk of response) {
        debugJson(logger6, "Responses stream chunk:", chunk);
        const parsedEvent = parseResponsesStreamEvent(chunk);
        if (parsedEvent?.type === "response.completed" || parsedEvent?.type === "response.failed" || parsedEvent?.type === "response.incomplete") {
          usage = normalizeResponsesUsage(
            readNestedUsage(parsedEvent, "response")
          );
        }
        const processedData = fixStreamIds(
          chunk.data ?? "",
          chunk.event,
          idTracker
        );
        await stream.writeSSE({
          id: chunk.id,
          event: chunk.event,
          data: processedData
        });
      }
      recordUsage(usage);
    });
  }
  debugJsonTail(logger6, "Forwarding native Responses result:", {
    value: response,
    tailLength: 400
  });
  recordUsage(
    withCopilotCost(
      normalizeResponsesUsage(response.usage),
      response.copilot_usage
    )
  );
  return c.json(response);
};
var isStreamingRequested = (payload) => Boolean(payload.stream);
var parseResponsesStreamEvent = (chunk) => {
  const data = chunk.data;
  if (!data || data === "[DONE]") {
    return null;
  }
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
};
var useFunctionApplyPatch = (payload) => {
  const config = getConfig();
  const useFunctionApplyPatch2 = config.useFunctionApplyPatch ?? true;
  if (useFunctionApplyPatch2) {
    logger6.debug("Using function tool apply_patch for responses");
    if (Array.isArray(payload.tools)) {
      const toolsArr = payload.tools;
      for (let i = 0; i < toolsArr.length; i++) {
        const t = toolsArr[i];
        if (t.type === "custom" && t.name === "apply_patch") {
          toolsArr[i] = {
            type: "function",
            name: t.name,
            description: "Use the `apply_patch` tool to edit files",
            parameters: {
              type: "object",
              properties: {
                input: {
                  type: "string",
                  description: "The entire contents of the apply_patch command"
                }
              },
              required: ["input"]
            },
            strict: false
          };
        }
      }
    }
  }
};
var removeWebSearchTool = (payload) => {
  if (!Array.isArray(payload.tools) || payload.tools.length === 0) return;
  payload.tools = payload.tools.filter((t) => {
    return t.type !== "web_search";
  });
};
var COPILOT_UNSUPPORTED_TOOL_TYPES = /* @__PURE__ */ new Set(["image_generation"]);
var mapAnthropicWebTools = (payload) => {
  if (!Array.isArray(payload.tools) || payload.tools.length === 0) return;
  const tools = payload.tools;
  if (!tools.some(
    (t) => t.type === TOOL_TYPE.webSearch || t.type === TOOL_TYPE.webFetch
  )) {
    return;
  }
  const alreadyNative = tools.some((t) => t.type === "web_search");
  const out = [];
  for (const tool of tools) {
    if (tool.type === TOOL_TYPE.webFetch) {
      logger6.debug("Dropped web_fetch: no native /responses counterpart");
      continue;
    }
    if (tool.type !== TOOL_TYPE.webSearch) {
      out.push(tool);
      continue;
    }
    if (alreadyNative) {
      logger6.debug("Dropped Anthropic web_search: native web_search declared");
      continue;
    }
    const decl = tool;
    out.push({
      type: "web_search",
      ...buildResponsesFilters({
        allowedDomains: decl.allowed_domains,
        blockedDomains: decl.blocked_domains
      }),
      ...decl.user_location ? { user_location: decl.user_location } : {}
    });
  }
  payload.tools = out;
};
var removeUnsupportedTools = (payload) => {
  if (!Array.isArray(payload.tools) || payload.tools.length === 0) return;
  const dropped = [];
  payload.tools = payload.tools.filter((t) => {
    const type = t.type;
    if (COPILOT_UNSUPPORTED_TOOL_TYPES.has(type)) {
      dropped.push(type);
      return false;
    }
    return true;
  });
  if (dropped.length > 0) {
    logger6.debug("Removed unsupported tools:", dropped);
  }
};

// src/routes/responses/route.ts
var responsesRoutes = new Hono10();
responsesRoutes.post("/", async (c) => {
  try {
    return await handleResponses(c);
  } catch (error) {
    return await forwardError(c, error);
  }
});

// src/routes/token-usage/route.ts
import { Hono as Hono11 } from "hono";
var tokenUsageRoute = new Hono11();
var periods = /* @__PURE__ */ new Set(["day", "week", "month", "all"]);
var DEFAULT_EVENTS_PAGE_SIZE = 20;
function parsePeriod(value) {
  return periods.has(value) ? value : "day";
}
function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
var BUCKET_UNIT_MS = {
  ms: 1,
  s: 1e3,
  m: 6e4,
  h: 36e5,
  d: 864e5
};
function parseBucketMs(value) {
  if (!value) return void 0;
  const match = /^(\d+)(ms|[smhd])?$/.exec(value.trim());
  if (!match) return void 0;
  const amount = Number.parseInt(match[1], 10);
  if (!Number.isFinite(amount) || amount <= 0) return void 0;
  const unit = match[2];
  const scale = unit ? BUCKET_UNIT_MS[unit] : 1;
  return amount * scale;
}
tokenUsageRoute.get("/", async (c) => {
  try {
    const period = parsePeriod(c.req.query("period"));
    const summary = await getTokenUsageSummary(period);
    return c.json(summary);
  } catch (error) {
    return forwardError(c, error);
  }
});
tokenUsageRoute.get("/series", async (c) => {
  try {
    const period = parsePeriod(c.req.query("period"));
    const bucketMs = parseBucketMs(c.req.query("bucket"));
    const series = await getTokenUsageSeries({ period, bucketMs });
    return c.json(series);
  } catch (error) {
    return forwardError(c, error);
  }
});
tokenUsageRoute.get("/events", async (c) => {
  try {
    const period = parsePeriod(c.req.query("period"));
    const page = parsePositiveInt(c.req.query("page"), 1);
    const pageSize = parsePositiveInt(
      c.req.query("page_size"),
      DEFAULT_EVENTS_PAGE_SIZE
    );
    const eventsPage = await getTokenUsageEventsPage({ page, pageSize, period });
    return c.json(eventsPage);
  } catch (error) {
    return forwardError(c, error);
  }
});

// src/routes/usage/route.ts
import { Hono as Hono12 } from "hono";
var usageRoute = new Hono12();
usageRoute.get("/", async (c) => {
  try {
    const usage = await getCopilotUsage();
    return c.json(usage);
  } catch (error) {
    return forwardError(c, error);
  }
});

// src/server.ts
var SERVER_START_MS = Date.now();
var controlPort = () => state.controlPort;
function applyCommonMiddleware(app) {
  app.use(traceIdMiddleware);
  app.use(async (c, next) => {
    c.header("x-maximal-version", BUILD_VERSION);
    await next();
  });
  app.use(logger7());
  app.use(cors(buildCorsOptions(controlPort)));
  app.use(createOriginGuardMiddleware({ boundPort: controlPort }));
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
        "/openapi.json"
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
        "/_internal/shutdown"
      ]
    })
  );
  app.use(
    "*",
    staleRefreshMiddleware({
      getLoadedAtMs: getModelsLoadedAtMs,
      refresh: cacheModels,
      onError: (err) => consola10.warn(
        "Background models refresh failed; keeping stale cache",
        err
      )
    })
  );
}
function createServerApps(options = {}) {
  const publicApp2 = new Hono13();
  const controlApp2 = new Hono13();
  const providerDispatcher = createProviderDispatcher({
    configSource: options.providerConfigSource,
    gateway: options.providerGateway,
    gatewayFactory: options.createProviderGateway,
    readConfig: options.readConfig
  });
  applyCommonMiddleware(publicApp2);
  applyCommonMiddleware(controlApp2);
  controlApp2.route("/control", controlRoutes);
  controlApp2.route("/_debug", debugRoutes);
  publicApp2.get("/", (c) => c.text("Server running"));
  publicApp2.get("/status", (c) => c.json(buildStatus(SERVER_START_MS)));
  publicApp2.route(
    "/_internal",
    createInternalRoutes({ requestShutdown: options.requestShutdown })
  );
  publicApp2.route("/", productApiRoutes);
  publicApp2.use("/:provider/v1/*", requireSupportedBuild);
  const requireConfiguredProviderAuth = async (c, next) => {
    if (providerDispatcher.requiresGithubAuth()) {
      return await requireGithubAuth(c, next);
    }
    await next();
  };
  publicApp2.use("/:provider/v1/*", requireConfiguredProviderAuth);
  const githubUpstreamRoutes = [
    "/chat/completions",
    "/chat/completions/*",
    "/models",
    "/models/*",
    "/embeddings",
    "/embeddings/*",
    "/responses",
    "/responses/*",
    "/v1/*"
  ];
  for (const path2 of githubUpstreamRoutes) {
    publicApp2.use(path2, requireSupportedBuild);
    publicApp2.use(path2, requireGithubAuth);
  }
  publicApp2.route("/chat/completions", completionRoutes);
  publicApp2.route("/models", modelRoutes);
  publicApp2.route("/embeddings", embeddingRoutes);
  publicApp2.route("/usage", usageRoute);
  publicApp2.route("/token-usage", tokenUsageRoute);
  publicApp2.route("/responses", responsesRoutes);
  publicApp2.route("/v1/chat/completions", completionRoutes);
  publicApp2.route("/v1/models", modelRoutes);
  publicApp2.route("/v1/embeddings", embeddingRoutes);
  publicApp2.route("/v1/responses", responsesRoutes);
  publicApp2.route("/v1/messages", messageRoutes);
  publicApp2.route(
    "/:provider/v1/messages",
    createProviderMessageRoutes(providerDispatcher)
  );
  publicApp2.route(
    "/:provider/v1/models",
    createProviderModelRoutes(providerDispatcher)
  );
  return { controlApp: controlApp2, providerDispatcher, publicApp: publicApp2 };
}
var defaultApps = createServerApps();
var publicApp = defaultApps.publicApp;
var controlApp = defaultApps.controlApp;
export {
  controlApp,
  createServerApps,
  publicApp
};
