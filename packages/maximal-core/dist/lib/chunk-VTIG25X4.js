import {
  SECRET_DEFS,
  createCopilotTokenUsageRecorder,
  getGitVersion,
  normalizeResponsesUsage,
  secretIsFromFile,
  shortSha,
  withCopilotCost
} from "./chunk-GMUJZD4A.js";
import {
  CopilotAuthFatalError,
  CopilotTokenStaleError,
  HTTPError,
  copilotBaseUrl,
  copilotHeaders,
  isAuthFatal,
  parseCopilotErrorBody,
  prepareForCompact,
  prepareInteractionHeaders,
  readDefaultRecord,
  sendRequest
} from "./chunk-UQM4JUWE.js";
import {
  CREDENTIAL_HEALTH,
  Cache,
  DEFAULT_LOG_RETENTION_DAYS,
  PATHS,
  clearLastUpstreamRejection,
  copilotRefreshHealth,
  copilotTokenHealth,
  getConfig,
  getSmallModel,
  hasCopilotToken,
  isMessagesApiEnabled,
  setLastUpstreamRejection,
  state
} from "./chunk-4JX7327A.js";

// src/debug.ts
import { defineCommand } from "citty";
import consola4 from "consola";
import os from "os";

// src/routes/messages/web-tools/executor.ts
import { randomUUID } from "crypto";
import TurndownService from "turndown";

// src/lib/models/endpoint-selection.ts
var RESPONSES_ENDPOINT = "/responses";
var MESSAGES_ENDPOINT = "/v1/messages";
var shouldUseResponsesApi = (selectedModel) => selectedModel?.supported_endpoints?.includes(RESPONSES_ENDPOINT) ?? false;
var shouldUseMessagesApi = (selectedModel) => {
  if (!isMessagesApiEnabled()) {
    return false;
  }
  return selectedModel?.supported_endpoints?.includes(MESSAGES_ENDPOINT) ?? false;
};

// src/services/copilot/create-responses.ts
import consola3 from "consola";
import "fetch-event-stream";

// src/services/copilot/upstream-request.ts
import consola2 from "consola";
import { events } from "fetch-event-stream";

// src/lib/errors/copilot-rate-limit.ts
import consola from "consola";
var copilotRateLimitTypes = ["session", "weekly"];
var copilotRateLimitHeaders = {
  session: "x-usage-ratelimit-session",
  weekly: "x-usage-ratelimit-weekly"
};
var hasGetMethod = (headers) => {
  return "get" in headers && typeof headers.get === "function";
};
var getHeaderValue = (headers, headerName) => {
  if (hasGetMethod(headers)) {
    return headers.get(headerName);
  }
  const normalizedHeaderName = headerName.toLowerCase();
  const matchedEntry = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === normalizedHeaderName
  );
  return matchedEntry?.[1] ?? null;
};
var parseCopilotRateLimitHeader = (headerValue) => {
  const params = new URLSearchParams(headerValue);
  const remaining = params.get("rem");
  const resetAt = params.get("rst");
  if (!remaining || !resetAt) {
    return null;
  }
  return {
    remaining,
    resetAt
  };
};
var getCopilotRateLimitUsage = (headers, type) => {
  const headerName = copilotRateLimitHeaders[type];
  const headerValue = getHeaderValue(headers, headerName);
  if (!headerValue) {
    return null;
  }
  const parsed = parseCopilotRateLimitHeader(headerValue);
  if (!parsed) {
    return null;
  }
  return {
    type,
    ...parsed
  };
};
var logCopilotRateLimits = (headers) => {
  for (const type of copilotRateLimitTypes) {
    const usage = getCopilotRateLimitUsage(headers, type);
    if (!usage) {
      continue;
    }
    const d = new Date(usage.resetAt);
    const dateStr = Number.isNaN(d.getTime()) ? usage.resetAt : d.toLocaleString();
    consola.info(
      `Copilot ${usage.type} quota remaining: ${usage.remaining}, resets at: ${dateStr}`
    );
  }
};

// src/services/copilot/upstream-request.ts
var requireCopilotToken = () => {
  if (!state.copilotToken) throw new Error("Copilot token not found");
  if (copilotTokenHealth() === CREDENTIAL_HEALTH.expired) {
    throw new CopilotTokenStaleError(copilotRefreshHealth().lastFailureReason);
  }
  return state.copilotToken;
};
var buildCopilotHeaders = (callState, options) => {
  const headers = {
    ...copilotHeaders(callState, options.requestId, options.vision),
    "x-initiator": options.initiator
  };
  prepareInteractionHeaders(
    options.sessionId,
    Boolean(options.subagentMarker),
    headers
  );
  prepareForCompact(headers, options.compactType);
  return headers;
};
var finishUpstreamResponse = async (response, { stream, errorMessage }) => {
  logCopilotRateLimits(response.headers);
  if (!response.ok) {
    consola2.error(errorMessage, response);
    const body = await response.clone().text();
    const parsed = parseCopilotErrorBody(body);
    if (isAuthFatal(response.status, parsed)) {
      throw new CopilotAuthFatalError(
        parsed.message,
        response.status,
        parsed.remediationUrl
      );
    }
    setLastUpstreamRejection({
      message: parsed.message,
      remediationUrl: parsed.remediationUrl,
      status: response.status
    });
    throw new HTTPError(errorMessage, response);
  }
  clearLastUpstreamRejection();
  if (stream) {
    return events(response);
  }
  return await response.json();
};

// src/services/copilot/create-responses.ts
var createResponses = async (payload, { vision, initiator, ...callOptions }) => {
  requireCopilotToken();
  const headers = buildCopilotHeaders(state, {
    ...callOptions,
    vision,
    initiator
  });
  payload.service_tier = void 0;
  consola3.log(`<-- model: ${payload.model}`);
  let response = await sendRequest(`${copilotBaseUrl(state)}/responses`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });
  if (!response.ok && response.status === 400 && payload.prompt_cache_retention) {
    const probeBody = await response.clone().text();
    if (isUnsupportedPromptCacheRetention(probeBody)) {
      consola3.warn(
        "Copilot rejected prompt_cache_retention; retrying once without it"
      );
      delete payload.prompt_cache_retention;
      response = await sendRequest(`${copilotBaseUrl(state)}/responses`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
      });
    }
  }
  return finishUpstreamResponse(response, {
    stream: Boolean(payload.stream),
    errorMessage: "Failed to create responses"
  });
};
function isUnsupportedPromptCacheRetention(body) {
  const text = body.toLowerCase();
  return text.includes("prompt_cache_retention") && (text.includes("unsupported parameter") || text.includes("unknown parameter") || text.includes("unsupported value"));
}

// src/routes/messages/web-tools/executor.ts
var DEFAULT_TIMEOUT_MS = 15e3;
var DEFAULT_MAX_CHARS = 4e5;
var MAX_HTML_INPUT_CHARS = 2e6;
var turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  emDelimiter: "*"
});
var TITLE_RE = /<title[^>]*>([\s\S]*?)<\/title>/iu;
var WHITESPACE_RE = /\s+/gu;
function extractTitle(html) {
  const m = html.match(TITLE_RE);
  if (!m) return void 0;
  return m[1].replaceAll(WHITESPACE_RE, " ").trim() || void 0;
}
function htmlToMarkdown(body) {
  return turndown.turndown(trimTo(body, MAX_HTML_INPUT_CHARS));
}
function isTextual(mediaType) {
  return mediaType.startsWith("text/") || mediaType.endsWith("+xml") || mediaType === "application/json";
}
var InProcessFetchExecutor = class {
  async fetch(url, opts = {}) {
    const maxChars = opts.maxChars ?? DEFAULT_MAX_CHARS;
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          // Identify as a Mozilla-class UA so cooperative servers don't
          // 403 us. No need to lie about a specific browser version.
          "User-Agent": "Mozilla/5.0 (compatible; maximal-proxy/0.1)",
          Accept: "text/html, text/plain, application/xhtml+xml; q=0.9, */*; q=0.5"
        }
      });
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === "AbortError") {
        return { ok: false, code: "url_not_accessible" };
      }
      return { ok: false, code: "url_not_accessible" };
    }
    clearTimeout(timer);
    if (!response.ok) return { ok: false, code: "url_not_accessible" };
    const ct = (response.headers.get("content-type") ?? "").toLowerCase();
    const mediaType = ct.split(";")[0].trim();
    if (!isTextual(mediaType)) {
      return { ok: false, code: "unsupported_content_type" };
    }
    let body;
    try {
      body = await response.text();
    } catch {
      return { ok: false, code: "url_not_accessible" };
    }
    const isHtml = mediaType === "text/html" || mediaType === "application/xhtml+xml";
    const title = isHtml ? extractTitle(body) : void 0;
    const markdown = isHtml ? htmlToMarkdown(body) : body;
    return { ok: true, markdown: trimTo(markdown, maxChars), title };
  }
  // Falls back to scraping DuckDuckGo's server-rendered HTML results page —
  // no API key required, matching the no-key philosophy of fetch() above.
  // Configure OLLAMA_API_KEY for a real search API at better quality.
  search(query, opts = {}) {
    return ddgHtmlSearch(
      withDomainOperators(query, opts),
      opts.maxResults ?? DEFAULT_SEARCH_MAX_RESULTS
    );
  }
};
var CopilotResponsesExecutor = class {
  model;
  createResponsesFn;
  fetchExecutor;
  recordUsage;
  now;
  constructor(opts) {
    this.model = opts.model;
    this.createResponsesFn = opts.createResponsesFn ?? createResponses;
    this.fetchExecutor = opts.fetchExecutor ?? new InProcessFetchExecutor();
    this.recordUsage = opts.recordUsage ?? createCopilotTokenUsageRecorder({
      endpoint: "responses",
      model: opts.model
    });
    this.now = opts.now ?? (() => /* @__PURE__ */ new Date());
  }
  // Copilot resolves web_fetch server-side too, but a plain HTTPS GET +
  // HTML→markdown is simpler, cheaper, and already key-free, so reuse it.
  fetch(url, opts) {
    return this.fetchExecutor.fetch(url, opts);
  }
  async search(query, opts = {}) {
    const maxResults = opts.maxResults ?? DEFAULT_SEARCH_MAX_RESULTS;
    const payload = {
      model: this.model,
      // Pass the model's own query through as-is — it's already a well-formed
      // search intent (recency/site cues baked in by the caller); wrapping it
      // in steering prose would make the broker search for our wrapper text.
      // Only append today's date when the query has no date cue, so undated
      // queries skew to current results (the model has no clock).
      input: withDateHint(query, this.now()),
      tools: [{ type: "web_search", ...buildResponsesFilters(opts) }],
      // Force the search to actually run. Without this the model may answer
      // from memory (tool_choice defaults to "auto"), returning 0 sources.
      tool_choice: "required",
      // The sources array is only surfaced when explicitly included.
      include: ["web_search_call.action.sources"],
      stream: false
    };
    let result;
    try {
      result = await this.createResponsesFn(payload, {
        vision: false,
        initiator: "agent",
        requestId: randomUUID()
      });
    } catch {
      return { ok: false, code: "unavailable" };
    }
    if (!("output" in result)) {
      return { ok: false, code: "unavailable" };
    }
    this.recordUsage(
      withCopilotCost(
        normalizeResponsesUsage(result.usage),
        result.copilot_usage
      )
    );
    return { ok: true, items: harvestResponsesHits(result, maxResults) };
  }
};
function buildResponsesFilters(opts) {
  const filters = {};
  if (opts.allowedDomains?.length) filters.allowed_domains = opts.allowedDomains;
  if (opts.blockedDomains?.length) filters.blocked_domains = opts.blockedDomains;
  return Object.keys(filters).length > 0 ? { filters } : {};
}
var DATE_CUE_RE = /\b(?:19|20)\d{2}\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|\b(?:today|yesterday|tomorrow|latest|current|recent|now|this (?:week|month|year)|last (?:week|month|year))\b/iu;
function withDateHint(query, now) {
  if (DATE_CUE_RE.test(query)) return query;
  const date = now.toISOString().slice(0, 10);
  return `${query} (as of ${date})`;
}
function harvestResponsesHits(result, maxResults) {
  const items = [];
  const seen = /* @__PURE__ */ new Set();
  const output = Array.isArray(result.output) ? result.output : [];
  const push = (url, title) => {
    if (items.length >= maxResults) return;
    if (typeof url !== "string" || url.length === 0 || seen.has(url)) return;
    seen.add(url);
    items.push({
      url,
      title: typeof title === "string" && title.length > 0 ? title : url,
      page_age: null
    });
  };
  for (const item of output) harvestCitations(item, push);
  for (const item of output) harvestSearchSources(item, push);
  return items;
}
function harvestCitations(item, push) {
  if (!isRecord(item) || item.type !== "message") return;
  const content = Array.isArray(item.content) ? item.content : [];
  for (const block of content) {
    if (!isRecord(block)) continue;
    const annotations = Array.isArray(block.annotations) ? block.annotations : [];
    for (const ann of annotations) {
      if (!isRecord(ann) || ann.type !== "url_citation") continue;
      push(ann.url, ann.title);
    }
  }
}
function harvestSearchSources(item, push) {
  if (!isRecord(item) || item.type !== "web_search_call") return;
  const action = isRecord(item.action) ? item.action : {};
  const sources = Array.isArray(action.sources) ? action.sources : [];
  for (const src of sources) {
    if (!isRecord(src)) continue;
    push(src.url, void 0);
  }
}
function isRecord(v) {
  return typeof v === "object" && v !== null;
}
var DDG_HTML_SEARCH_URL = "https://html.duckduckgo.com/html/";
var DEFAULT_SEARCH_MAX_RESULTS = 5;
var SEARCH_TIMEOUT_MS = 15e3;
var RESULT_ANCHOR_RE = /<a\b([^>]*)>([\s\S]*?)<\/a>/giu;
var HREF_ATTR_RE = /href="([^"]*)"/iu;
var TAG_RE = /<[^>]+>/gu;
function stripTags(html) {
  let current = html;
  let previous;
  do {
    previous = current;
    current = current.replaceAll(TAG_RE, "");
  } while (current !== previous);
  return current.replaceAll(WHITESPACE_RE, " ").trim();
}
var HTML_ENTITY_RE = /&(amp|lt|gt|quot|#39);/gu;
var HTML_ENTITY_MAP = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  "#39": "'"
};
function decodeHtmlEntities(s) {
  return s.replaceAll(
    HTML_ENTITY_RE,
    (_, name) => HTML_ENTITY_MAP[name]
  );
}
function resolveDdgResultUrl(href) {
  if (href.includes("duckduckgo.com/l/")) {
    const query = href.slice(href.indexOf("?") + 1);
    const uddg = new URLSearchParams(query).get("uddg");
    return uddg || void 0;
  }
  if (href.startsWith("http://") || href.startsWith("https://")) return href;
  return void 0;
}
function parseDdgResults(html, maxResults) {
  const items = [];
  const seenUrls = /* @__PURE__ */ new Set();
  for (const m of html.matchAll(RESULT_ANCHOR_RE)) {
    if (items.length >= maxResults) break;
    const [, attrs, inner] = m;
    if (!attrs.includes('class="result__a"')) continue;
    const hrefMatch = attrs.match(HREF_ATTR_RE);
    if (!hrefMatch) continue;
    const url = resolveDdgResultUrl(hrefMatch[1]);
    if (!url || seenUrls.has(url)) continue;
    const title = decodeHtmlEntities(stripTags(inner));
    if (!title) continue;
    seenUrls.add(url);
    items.push({ url, title, page_age: null });
  }
  return items;
}
function withDomainOperators(query, opts) {
  const parts = [query];
  const allowed = opts.allowedDomains ?? [];
  if (allowed.length === 1) {
    parts.push(`site:${allowed[0]}`);
  } else if (allowed.length > 1) {
    parts.push(`(${allowed.map((d) => `site:${d}`).join(" OR ")})`);
  }
  for (const d of opts.blockedDomains ?? []) parts.push(`-site:${d}`);
  return parts.join(" ");
}
async function ddgHtmlSearch(query, maxResults) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(
      `${DDG_HTML_SEARCH_URL}?q=${encodeURIComponent(query)}`,
      {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; maximal-proxy/0.1)",
          Accept: "text/html"
        }
      }
    );
  } catch {
    clearTimeout(timer);
    return { ok: false, code: "unavailable" };
  }
  clearTimeout(timer);
  if (!response.ok) {
    return {
      ok: false,
      code: response.status === 429 ? "too_many_requests" : "unavailable"
    };
  }
  let html;
  try {
    html = await response.text();
  } catch {
    return { ok: false, code: "unavailable" };
  }
  return { ok: true, items: parseDdgResults(html, maxResults) };
}
var OLLAMA_DEFAULT_BASE = "https://ollama.com/api";
var OllamaWebExecutor = class {
  apiKey;
  base;
  timeoutMs;
  /** Per-request prefetch cache. Bounded at 50 entries — well above
   *  the worst-case turn × max_results product (10 × 5 = 50) so the
   *  cap is effectively a runaway guard, not a steady-state limiter.
   *  Marked transient so the global registry stays clean. */
  prefetch = new Cache({
    name: "web-tools.prefetch",
    max: 50,
    transient: true
  });
  constructor(opts) {
    this.apiKey = opts.apiKey;
    this.base = opts.baseUrl ?? OLLAMA_DEFAULT_BASE;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS * 2;
  }
  async search(query, opts = {}) {
    const body = JSON.stringify({
      query,
      max_results: opts.maxResults ?? 5
    });
    const r = await this.post("/web_search", body);
    if (!r.ok) return { ok: false, code: searchErrorFromPost(r) };
    const data = r.data;
    if (!Array.isArray(data.results)) {
      return { ok: false, code: "unavailable" };
    }
    const items = [];
    for (const raw of data.results) {
      if (typeof raw !== "object" || raw === null) continue;
      const hit = raw;
      if (typeof hit.url !== "string" || typeof hit.title !== "string") continue;
      items.push({ url: hit.url, title: hit.title, page_age: null });
      if (typeof hit.content === "string" && hit.content.length > 0) {
        this.prefetch.set(hit.url, {
          markdown: hit.content,
          title: hit.title
        });
      }
    }
    return { ok: true, items };
  }
  async fetch(url, opts = {}) {
    const maxChars = opts.maxChars ?? DEFAULT_MAX_CHARS;
    const cached = this.prefetch.get(url);
    if (cached) {
      return {
        ok: true,
        markdown: trimTo(cached.markdown, maxChars),
        title: cached.title
      };
    }
    const r = await this.post("/web_fetch", JSON.stringify({ url }));
    if (!r.ok) return { ok: false, code: fetchErrorFromPost(r) };
    const data = r.data;
    if (typeof data.content !== "string") {
      return { ok: false, code: "url_not_accessible" };
    }
    const title = typeof data.title === "string" ? data.title : void 0;
    return {
      ok: true,
      markdown: trimTo(data.content, maxChars),
      title
    };
  }
  async post(path, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response;
    try {
      response = await fetch(`${this.base}${path}`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body
      });
    } catch (err) {
      clearTimeout(timer);
      const isTimeout = err instanceof Error && err.name === "AbortError";
      return { ok: false, status: 0, reason: isTimeout ? "timeout" : "network" };
    }
    clearTimeout(timer);
    if (!response.ok) {
      const status = response.status;
      let reason;
      if (status === 401 || status === 403) reason = "auth";
      else if (status === 429) reason = "rate_limit";
      else if (status >= 500) reason = "server";
      else reason = "client";
      try {
        await response.text();
      } catch {
      }
      return { ok: false, status, reason };
    }
    let data;
    try {
      data = await response.json();
    } catch {
      return { ok: false, status: response.status, reason: "server" };
    }
    return { ok: true, data };
  }
};
function trimTo(s, maxChars) {
  return s.length > maxChars ? s.slice(0, maxChars) : s;
}
function searchErrorFromPost(err) {
  switch (err.reason) {
    case "rate_limit": {
      return "too_many_requests";
    }
    case "auth":
    case "server":
    case "network":
    case "timeout": {
      return "unavailable";
    }
    case "client": {
      return "invalid_input";
    }
    default: {
      return "unavailable";
    }
  }
}
function fetchErrorFromPost(err) {
  switch (err.reason) {
    case "rate_limit": {
      return "too_many_requests";
    }
    case "auth":
    case "server":
    case "timeout": {
      return "unavailable";
    }
    case "network":
    case "client": {
      return "url_not_accessible";
    }
    default: {
      return "unavailable";
    }
  }
}
function chooseExecutor(env = process.env, deps = {}) {
  const apiKey = env.OLLAMA_API_KEY;
  if (apiKey !== void 0 && apiKey.length > 0) {
    return {
      kind: "OllamaWebExecutor",
      base: OLLAMA_DEFAULT_BASE,
      apiKey
    };
  }
  if (deps.responsesModel) {
    return {
      kind: "CopilotResponsesExecutor",
      model: deps.responsesModel,
      notes: `search via Copilot /responses (${deps.responsesModel}); no extra key`
    };
  }
  return {
    kind: "InProcessFetchExecutor",
    notes: "search via DuckDuckGo HTML scrape (no Copilot /responses model available); set OLLAMA_API_KEY for hosted search"
  };
}
function resolveResponsesModel() {
  if (!hasCopilotToken()) return void 0;
  return pickResponsesModel(
    (state.models?.data ?? []).map((m) => ({
      id: m.id,
      supportsResponses: shouldUseResponsesApi(m)
    })),
    getSmallModel()
  );
}
function pickResponsesModel(models, configuredSmall) {
  const responsesModels = models.filter((m) => m.supportsResponses);
  if (responsesModels.length === 0) return void 0;
  if (responsesModels.some((m) => m.id === configuredSmall)) {
    return configuredSmall;
  }
  const mini = responsesModels.find((m) => m.id.toLowerCase().includes("mini"));
  if (mini) return mini.id;
  return responsesModels[0].id;
}
function selectExecutor() {
  const choice = chooseExecutor(process.env, {
    responsesModel: resolveResponsesModel()
  });
  switch (choice.kind) {
    case "OllamaWebExecutor": {
      return new OllamaWebExecutor({ apiKey: choice.apiKey });
    }
    case "CopilotResponsesExecutor": {
      return new CopilotResponsesExecutor({ model: choice.model });
    }
    case "InProcessFetchExecutor": {
      return new InProcessFetchExecutor();
    }
    default: {
      throw new Error(
        `unhandled executor kind: ${choice.kind}`
      );
    }
  }
}

// src/debug.ts
async function getPackageVersion() {
  const { BUILD_VERSION } = await import("./build-info-LLYXWEU7.js");
  return BUILD_VERSION;
}
function getRuntimeInfo() {
  const isBun = typeof Bun !== "undefined";
  return {
    name: isBun ? "bun" : "node",
    version: isBun ? Bun.version : process.version.slice(1),
    platform: os.platform(),
    arch: os.arch()
  };
}
async function checkTokenExists() {
  const record = await readDefaultRecord().catch(() => null);
  return record !== null && record.accessToken.trim().length > 0;
}
function secretStatus(input, env = process.env) {
  const value = env[input.envVar];
  if (value !== void 0 && value.length > 0) {
    if (input.fileName !== void 0 && secretIsFromFile(input.fileName, value)) {
      return { name: input.name, source: "file" };
    }
    return { name: input.name, source: "env" };
  }
  if (input.configValue !== void 0 && input.configValue.length > 0) {
    return { name: input.name, source: "config" };
  }
  return { name: input.name, source: "unset" };
}
function describeExecutor(env = process.env) {
  const choice = chooseExecutor(env, {
    responsesModel: resolveResponsesModel()
  });
  switch (choice.kind) {
    case "OllamaWebExecutor": {
      return { web_tools: choice.kind, base: choice.base };
    }
    case "CopilotResponsesExecutor": {
      return {
        web_tools: choice.kind,
        base: choice.model,
        notes: choice.notes
      };
    }
    case "InProcessFetchExecutor": {
      return { web_tools: choice.kind, notes: choice.notes };
    }
    default: {
      throw new Error(
        `unhandled executor kind: ${choice.kind}`
      );
    }
  }
}
function summarizeConfig(config) {
  return {
    use_messages_api: config.useMessagesApi,
    use_function_apply_patch: config.useFunctionApplyPatch,
    use_responses_api_web_search: config.useResponsesApiWebSearch,
    small_model: config.smallModel,
    claude_token_multiplier: config.claudeTokenMultiplier,
    log_retention_days: config.logRetentionDays ?? DEFAULT_LOG_RETENTION_DAYS,
    api_keys_configured: (config.auth?.apiKeys?.length ?? 0) > 0,
    providers_declared: Object.keys(config.providers ?? {})
  };
}
function collectSecretStatuses(config, env = process.env) {
  return SECRET_DEFS.map(
    (def) => secretStatus(
      {
        name: def.name,
        envVar: def.envVar,
        configValue: def.readConfig?.(config),
        fileName: def.fileName
      },
      env
    )
  );
}
async function getDebugInfo() {
  const [version, tokenExists] = await Promise.all([
    getPackageVersion(),
    checkTokenExists()
  ]);
  let config;
  try {
    config = getConfig();
  } catch {
    config = {};
  }
  return {
    version,
    git: getGitVersion(),
    runtime: getRuntimeInfo(),
    paths: {
      APP_DIR: PATHS.APP_DIR,
      GITHUB_TOKEN_PATH: PATHS.GITHUB_TOKEN_PATH,
      CONFIG_PATH: PATHS.CONFIG_PATH,
      LOG_DIR: `${PATHS.APP_DIR}/logs`
    },
    tokenExists,
    config: summarizeConfig(config),
    executor: describeExecutor(),
    secrets: collectSecretStatuses(config)
  };
}
function formatField(name, value) {
  const v = value === void 0 ? "<unset>" : String(value);
  return `  ${name}: ${v}`;
}
function printDebugInfoPlain(info) {
  const lines = [
    `maximal debug`,
    ``,
    `Version: ${info.version}`,
    `Git: ${shortSha(info.git.sha)}${info.git.branch ? ` (${info.git.branch})` : ""}`,
    `Runtime: ${info.runtime.name} ${info.runtime.version} (${info.runtime.platform} ${info.runtime.arch})`,
    ``,
    `Paths:`,
    `  APP_DIR: ${info.paths.APP_DIR}`,
    `  CONFIG_PATH: ${info.paths.CONFIG_PATH}`,
    `  GITHUB_TOKEN_PATH: ${info.paths.GITHUB_TOKEN_PATH}`,
    `  LOG_DIR: ${info.paths.LOG_DIR}`,
    ``,
    `GitHub token: ${info.tokenExists ? "<set>" : "<unset>"}`,
    ``,
    `Config:`,
    formatField("use_messages_api", info.config.use_messages_api),
    formatField(
      "use_function_apply_patch",
      info.config.use_function_apply_patch
    ),
    formatField(
      "use_responses_api_web_search",
      info.config.use_responses_api_web_search
    ),
    formatField("small_model", info.config.small_model),
    formatField("claude_token_multiplier", info.config.claude_token_multiplier),
    formatField("log_retention_days", info.config.log_retention_days),
    formatField("api_keys_configured", info.config.api_keys_configured),
    formatField(
      "providers_declared",
      info.config.providers_declared.length > 0 ? info.config.providers_declared.join(", ") : "<none>"
    ),
    ``,
    `Web-tools executor: ${info.executor.web_tools}`,
    ...info.executor.base ? [`  base: ${info.executor.base}`] : [],
    ...info.executor.notes ? [`  ${info.executor.notes}`] : [],
    ``,
    `Secrets:`,
    ...info.secrets.map((s) => `  ${s.name}: <${s.source}>`)
  ];
  consola4.info(lines.join("\n"));
}
function printDebugInfoJson(info) {
  console.log(JSON.stringify(info, null, 2));
}
async function runDebug(options) {
  const debugInfo = await getDebugInfo();
  if (options.json) {
    printDebugInfoJson(debugInfo);
  } else {
    printDebugInfoPlain(debugInfo);
  }
}
var debug = defineCommand({
  meta: {
    name: "debug",
    description: "Print debug information about the application"
  },
  args: {
    json: {
      type: "boolean",
      default: false,
      description: "Output debug information as JSON"
    }
  },
  run({ args }) {
    return runDebug({
      json: args.json
    });
  }
});

export {
  requireCopilotToken,
  buildCopilotHeaders,
  finishUpstreamResponse,
  shouldUseResponsesApi,
  shouldUseMessagesApi,
  createResponses,
  buildResponsesFilters,
  selectExecutor,
  secretStatus,
  describeExecutor,
  summarizeConfig,
  collectSecretStatuses,
  runDebug,
  debug
};
