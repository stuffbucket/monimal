import {
  getConfig,
  hasGithubToken,
  state,
  writeConfig
} from "./chunk-4JX7327A.js";
import {
  HELPER_SUBCOMMAND,
  LEGACY_HELPER_FLAG
} from "./chunk-KCUNSZQQ.js";

// src/lib/auth/api-key-helper.ts
import { randomBytes, randomUUID } from "crypto";

// src/lib/auth/request-auth.ts
import consola from "consola";

// src/lib/http/active-clients.ts
var MAX_AGE_MS = 5 * 60 * 1e3;
var clients = /* @__PURE__ */ new Map();
function entryKey(apiKeyId, userAgent) {
  return `${apiKeyId ?? "*"}|${userAgent}`;
}
function recordClient(input) {
  const ua = input.userAgent.trim();
  if (ua.length === 0) return;
  const key = entryKey(input.apiKeyId, ua);
  clients.set(key, {
    userAgent: ua,
    apiKeyId: input.apiKeyId,
    apiKeyLabel: input.apiKeyLabel,
    lastSeenAt: Date.now()
  });
}
function listActiveClients(maxAgeSeconds = 60) {
  const now = Date.now();
  const cutoff = now - maxAgeSeconds * 1e3;
  const out = [];
  for (const [key, record] of clients.entries()) {
    if (record.lastSeenAt < cutoff) continue;
    out.push({
      key,
      label: record.apiKeyLabel ?? humanizeUserAgent(record.userAgent),
      userAgent: record.userAgent,
      ageSeconds: Math.max(0, Math.floor((now - record.lastSeenAt) / 1e3))
    });
  }
  out.sort((a, b) => a.ageSeconds - b.ageSeconds);
  return out;
}
function humanizeUserAgent(userAgent) {
  const ua = userAgent.trim();
  if (ua.length === 0) return "Unknown client";
  const patterns = [
    [/^claude-code\b/i, "Claude Code"],
    [/^cline\b/i, "Cline"],
    [/^openai\/python\b/i, "OpenAI Python SDK"],
    [/^openai\/js\b/i, "OpenAI JS SDK"],
    [/^anthropic\/python\b/i, "Anthropic Python SDK"],
    [/^anthropic\/js\b/i, "Anthropic JS SDK"],
    [/^opencode\b/i, "Opencode"],
    [/^curl\b/i, "curl"],
    [/^wget\b/i, "wget"],
    [/^httpie\b/i, "HTTPie"]
  ];
  for (const [re, label] of patterns) {
    if (re.test(ua)) return label;
  }
  const head = ua.split(/[/\s]/, 1)[0] || ua;
  return head.length > 40 ? `${head.slice(0, 37)}...` : head;
}
var pruneTimer = setInterval(() => {
  const cutoff = Date.now() - MAX_AGE_MS;
  for (const [key, record] of clients.entries()) {
    if (record.lastSeenAt < cutoff) clients.delete(key);
  }
}, 6e4);
if (typeof pruneTimer === "object" && "unref" in pruneTimer) {
  ;
  pruneTimer.unref();
}

// src/lib/auth/request-auth.ts
var LOOPBACK_IPS = /* @__PURE__ */ new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
function pathMatchesPrefix(path, prefix) {
  return path === prefix || path.startsWith(prefix + "/");
}
function isLoopbackAddress(address) {
  if (!address) return false;
  return LOOPBACK_IPS.has(address);
}
function defaultGetRequestIp(c) {
  const raw = c.req.raw;
  return raw.ip ?? null;
}
function normalizeApiKeys(apiKeys) {
  if (!Array.isArray(apiKeys)) {
    if (apiKeys !== void 0) {
      consola.warn("Invalid auth.apiKeys config. Expected an array of strings.");
    }
    return [];
  }
  const normalizedKeys = apiKeys.filter((key) => typeof key === "string").map((key) => key.trim()).filter((key) => key.length > 0);
  if (normalizedKeys.length !== apiKeys.length) {
    consola.warn(
      "Invalid auth.apiKeys entries found. Only non-empty strings are allowed."
    );
  }
  return [...new Set(normalizedKeys)];
}
function getConfiguredApiKeys(config = getConfig()) {
  const legacy = normalizeApiKeys(config.auth?.apiKeys);
  const entries = config.auth?.apiKeyEntries ?? [];
  const fromEntries = entries.filter((e) => e.enabled).map((e) => e.key.trim()).filter((k) => k.length > 0);
  return [.../* @__PURE__ */ new Set([...legacy, ...fromEntries])];
}
function apiKeyAllowed(allowList, requestKey) {
  if (requestKey.length === 0) return false;
  return allowList.includes(requestKey);
}
function findApiKeyEntry(requestKey) {
  if (requestKey.length === 0) return null;
  const config = getConfig();
  const entries = config.auth?.apiKeyEntries ?? [];
  const match = entries.find((e) => e.enabled && e.key === requestKey);
  return match ? { id: match.id, label: match.label } : null;
}
function extractRequestApiKey(c) {
  const xApiKey = c.req.header("x-api-key")?.trim();
  if (xApiKey) {
    return xApiKey;
  }
  const authorization = c.req.header("authorization");
  if (authorization) {
    const [scheme, ...rest] = authorization.trim().split(/\s+/);
    if (scheme.toLowerCase() === "bearer") {
      const bearerToken = rest.join(" ").trim();
      if (bearerToken) return bearerToken;
    }
  }
  return null;
}
function isShellKey(requestApiKey) {
  return requestApiKey !== null && state.shellApiKey !== void 0 && requestApiKey === state.shellApiKey;
}
function createUnauthorizedResponse(c) {
  c.header("WWW-Authenticate", 'Bearer realm="copilot-api"');
  return c.json(
    {
      error: {
        message: "Unauthorized",
        type: "authentication_error"
      }
    },
    401
  );
}
function createAuthMiddleware(options = {}) {
  const getApiKeys = options.getApiKeys ?? getConfiguredApiKeys;
  const isEnforcing = options.isEnforcing ?? (() => getConfig().auth?.enforce === true);
  const allowUnauthenticatedPaths = options.allowUnauthenticatedPaths ?? ["/"];
  const allowUnauthenticatedPrefixes = options.allowUnauthenticatedPrefixes ?? [];
  const allowOptionsBypass = options.allowOptionsBypass ?? true;
  const loopbackOnlyPaths = options.loopbackOnlyPaths ?? [];
  const getRequestIp = options.getRequestIp ?? defaultGetRequestIp;
  const shouldBypass = (c) => {
    if (allowOptionsBypass && c.req.method === "OPTIONS") return true;
    if (allowUnauthenticatedPaths.includes(c.req.path)) return true;
    const path = c.req.path;
    if (allowUnauthenticatedPrefixes.some((p) => pathMatchesPrefix(path, p))) {
      return true;
    }
    if (loopbackOnlyPaths.includes(c.req.path) && isLoopbackAddress(getRequestIp(c))) {
      return true;
    }
    return false;
  };
  const decideAuth = (requestApiKey) => {
    if (isShellKey(requestApiKey)) {
      return { allow: true, id: null, label: "Maximal Settings" };
    }
    if (!isEnforcing()) {
      const entry2 = requestApiKey ? findApiKeyEntry(requestApiKey) : null;
      return { allow: true, id: entry2?.id ?? null, label: entry2?.label ?? null };
    }
    if (!requestApiKey || !apiKeyAllowed(getApiKeys(), requestApiKey)) {
      return { allow: false };
    }
    const entry = findApiKeyEntry(requestApiKey);
    return { allow: true, id: entry?.id ?? null, label: entry?.label ?? null };
  };
  return async (c, next) => {
    if (shouldBypass(c)) return next();
    const decision = decideAuth(extractRequestApiKey(c));
    if (!decision.allow) return createUnauthorizedResponse(c);
    recordClient({
      apiKeyId: decision.id,
      apiKeyLabel: decision.label,
      userAgent: c.req.header("user-agent") ?? ""
    });
    return next();
  };
}
var requireGithubAuth = async (c, next) => {
  if (hasGithubToken()) {
    return next();
  }
  return c.json(
    {
      error: "not_authenticated",
      // Name something core actually has. There is no Settings UI here: the CLI
      // flow is `maximal auth`, and a supervisor drives the same flow over the
      // control listener.
      hint: "Run `maximal auth` to sign in, or start the flow over the /control API."
    },
    401
  );
};

// src/lib/auth/api-key-helper.ts
function apiKeyHelperCommand(label, execPath = process.execPath, mainScript = resolveMainScript()) {
  const trimmed = label?.trim();
  const bin = isRuntimeExecPath(execPath) && mainScript ? `"${execPath}" "${mainScript}"` : `"${execPath}"`;
  return trimmed ? `${bin} ${HELPER_SUBCOMMAND} ${trimmed}` : `${bin} ${HELPER_SUBCOMMAND}`;
}
function isRuntimeExecPath(execPath) {
  const base = execPath.split(/[/\\]/u).pop()?.toLowerCase().replace(/\.exe$/u, "") ?? "";
  return base === "bun" || base === "node";
}
function resolveMainScript() {
  const bunMain = globalThis.Bun?.main;
  if (typeof bunMain === "string" && bunMain.length > 0) return bunMain;
  return process.argv[1];
}
function isOwnedApiKeyHelper(command, label) {
  if (typeof command !== "string") return false;
  const tokens = tokenizeCommand(command);
  if (tokens.length === 0) return false;
  const trimmed = label?.trim();
  const legacyLeading = matchTrailingSubcommand(
    tokens,
    LEGACY_HELPER_FLAG,
    trimmed
  );
  if (legacyLeading) return true;
  const apiLeading = matchTrailingSubcommand(tokens, HELPER_SUBCOMMAND, trimmed);
  if (apiLeading) return invokesMaximal(apiLeading);
  return false;
}
function isWritableApiKeyHelper(command, label) {
  if (typeof command !== "string") return false;
  const tokens = tokenizeCommand(command);
  const leading = matchTrailingSubcommand(
    tokens,
    HELPER_SUBCOMMAND,
    label?.trim()
  );
  if (leading === null) return false;
  if (leading.length === 1) {
    return isAbsoluteCommandPath(leading[0]) && isCompiledMaximalExecutable(leading[0]);
  }
  if (leading.length !== 2) return false;
  return isAbsoluteCommandPath(leading[0]) && isRuntimeExecPath(leading[0]) && isProductMainScript(leading[1]);
}
function tokenizeCommand(command) {
  return (command.match(/"[^"]*"|\S+/gu) ?? []).map(
    (tok) => tok.startsWith(`"`) && tok.endsWith(`"`) ? tok.slice(1, -1) : tok
  );
}
function matchTrailingSubcommand(tokens, subcommand, label) {
  if (label) {
    const n = tokens.length;
    if (n >= 2 && tokens[n - 2] === subcommand && tokens[n - 1] === label) {
      return tokens.slice(0, n - 2);
    }
    return null;
  }
  if (tokens.length > 0 && tokens.at(-1) === subcommand) {
    return tokens.slice(0, -1);
  }
  return null;
}
function invokesMaximal(leading) {
  if (leading.length === 0) return false;
  if (leading.some((token) => isMaximalAnchor(token))) return true;
  return isRuntimeExecPath(leading[0]);
}
function basename(p) {
  return p.split(/[/\\]/u).pop()?.toLowerCase().replace(/\.exe$/u, "") ?? "";
}
function isAbsoluteCommandPath(value) {
  return /^(?:[/\\]{1,2}|[A-Za-z]:[/\\])/u.test(value);
}
function isCompiledMaximalExecutable(value) {
  const base = basename(value);
  return base === "maximal" || base.startsWith("maximal-");
}
function isProductMainScript(value) {
  if (!isAbsoluteCommandPath(value)) return false;
  const segments = value.split(/[/\\]/u).filter(Boolean).map((segment) => segment.toLowerCase());
  const file = segments.at(-1);
  const directory = segments.at(-2);
  if (file !== "main.ts" && file !== "main.js" || directory === void 0) {
    return false;
  }
  if (directory !== "src" && directory !== "dist") return false;
  if (segments.some(
    (segment) => segment === "test" || segment === "tests" || segment === "__tests__" || /\.test\.[cm]?[jt]sx?$/u.test(segment)
  )) {
    return false;
  }
  return segments.some(
    (segment) => segment === "maximal" || segment === "maximal-core"
  );
}
function isMaximalAnchor(token) {
  const base = basename(token);
  return base === "maximal" || base.startsWith("maximal-") || base === "main.ts" || base === "main.js";
}
function normalizeLabel(value) {
  return value.trim().toLowerCase().replaceAll(/[\s_-]+/gu, " ").trim();
}
function isEnabledEntry(entry) {
  return entry.enabled && entry.key.trim().length > 0;
}
function matchScore(value, target) {
  const normalized = normalizeLabel(value);
  const t = normalizeLabel(target);
  if (!normalized || !t) return 0;
  if (normalized === t) return 100;
  if (normalized.startsWith(`${t} `)) return 90;
  if (`${t} `.startsWith(`${normalized} `)) return 80;
  return 0;
}
function findEntry(entries, label) {
  let best = null;
  for (const entry of entries) {
    if (!isEnabledEntry(entry)) continue;
    const score = Math.max(
      matchScore(entry.id, label),
      matchScore(entry.label, label)
    );
    if (score === 0) continue;
    if (!best || score > best.score) {
      best = { entry, score };
    }
  }
  return best?.entry ?? null;
}
function getDefaultEndpointApiKey(config) {
  const legacy = normalizeApiKeys(config.auth?.apiKeys);
  if (legacy[0]) return legacy[0];
  const fallbackEntry = (config.auth?.apiKeyEntries ?? []).find(
    (entry) => isEnabledEntry(entry)
  );
  return fallbackEntry?.key.trim() ?? null;
}
function generateApiKeyValue() {
  return `mxl_${randomBytes(24).toString("base64url")}`;
}
function ensureDefaultEndpointKey(deps = {}) {
  const read = deps.read ?? getConfig;
  const write = deps.write ?? writeConfig;
  const mintKey = deps.mintKey ?? generateApiKeyValue;
  const newId = deps.newId ?? randomUUID;
  const now = deps.now ?? (() => (/* @__PURE__ */ new Date()).toISOString());
  const config = read();
  if (getDefaultEndpointApiKey(config) !== null) return;
  const entry = {
    id: newId(),
    label: "Default",
    key: mintKey(),
    enabled: true,
    created_at: now()
  };
  write({
    ...config,
    auth: {
      ...config.auth,
      apiKeyEntries: [...config.auth?.apiKeyEntries ?? [], entry]
    }
  });
}
function resolveApiKey(label, config = getConfig()) {
  const wanted = label?.trim();
  const entries = config.auth?.apiKeyEntries ?? [];
  if (wanted) {
    const appEntry = findEntry(entries, wanted);
    if (appEntry) return { ok: true, key: appEntry.key.trim(), source: "app" };
  }
  const defaultKey = getDefaultEndpointApiKey(config);
  if (defaultKey) return { ok: true, key: defaultKey, source: "default" };
  return {
    ok: false,
    error: wanted ? `no API key found for "${wanted}" and no default endpoint API key is configured` : "no default endpoint API key is configured"
  };
}
function runApiKeyHelper(label) {
  const result = resolveApiKey(label);
  if (result.ok) {
    process.stdout.write(`${result.key}
`);
    return 0;
  }
  process.stderr.write(`ERROR: ${result.error}
`);
  return 1;
}

export {
  listActiveClients,
  isLoopbackAddress,
  defaultGetRequestIp,
  createAuthMiddleware,
  requireGithubAuth,
  apiKeyHelperCommand,
  isOwnedApiKeyHelper,
  isWritableApiKeyHelper,
  generateApiKeyValue,
  ensureDefaultEndpointKey,
  resolveApiKey,
  runApiKeyHelper
};
