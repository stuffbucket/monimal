// src/lib/auth/auth-types.ts
import { z } from "zod";
var ACCOUNT_TYPES = ["individual", "business", "enterprise"];
var accountTypeSchema = z.enum(ACCOUNT_TYPES);
function parseAccountType(input) {
  const result = accountTypeSchema.safeParse(input);
  if (!result.success) {
    throw new Error(
      `Invalid account type "${input}". Must be one of: ${ACCOUNT_TYPES.join(", ")}.`
    );
  }
  return result.data;
}
var CREDENTIAL_HEALTH = {
  healthy: "healthy",
  refreshing: "refreshing",
  needsReauth: "needsReauth",
  expired: "expired",
  unknown: "unknown"
};
function toCopilotHost(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  return parsed.origin;
}
function hostForAccountType(accountType) {
  const url = accountType === "individual" ? "https://api.githubcopilot.com" : `https://api.${accountType}.githubcopilot.com`;
  return url;
}

// src/lib/runtime-state/state.ts
import { randomUUID } from "crypto";

// src/lib/runtime-state/event-bus.ts
var EventBus = class {
  handlers = /* @__PURE__ */ new Map();
  publish(name, event) {
    const handlers = this.handlers.get(name);
    if (!handlers) {
      return;
    }
    for (const handler of Array.from(handlers)) {
      handler(event);
    }
  }
  subscribe(name, handler) {
    let handlers = this.handlers.get(name);
    if (!handlers) {
      handlers = /* @__PURE__ */ new Set();
      this.handlers.set(name, handlers);
    }
    const registeredHandler = handler;
    handlers.add(registeredHandler);
    return () => {
      handlers.delete(registeredHandler);
      if (handlers.size === 0) {
        this.handlers.delete(name);
      }
    };
  }
};

// src/lib/config/settings-events.ts
var settingsEventBus = new EventBus();
var authStatusProjector = null;
function registerAuthStatusProjector(project) {
  authStatusProjector = project;
}
function emitAuthChanged() {
  if (authStatusProjector) {
    settingsEventBus.publish("auth.changed", authStatusProjector());
  }
}
function emitAuthChangedWithReconnect() {
  if (!authStatusProjector) return;
  const status = authStatusProjector();
  if (status.state === "authenticated" || status.state === "unauthenticated") {
    settingsEventBus.publish("auth.changed", {
      ...status,
      notify_on_reconnect: true
    });
    return;
  }
  settingsEventBus.publish("auth.changed", status);
}

// src/lib/runtime-state/cache.ts
var cacheRegistry = /* @__PURE__ */ new Set();
var Cache = class {
  name;
  max;
  store = /* @__PURE__ */ new Map();
  hits = 0;
  misses = 0;
  evictions = 0;
  constructor(opts) {
    this.name = opts.name;
    this.max = opts.max;
    if (!opts.transient) {
      cacheRegistry.add(this);
    }
  }
  get(key) {
    const value = this.store.get(key);
    if (value === void 0) {
      this.misses++;
      return void 0;
    }
    this.store.delete(key);
    this.store.set(key, value);
    this.hits++;
    return value;
  }
  set(key, value) {
    if (this.store.has(key)) {
      this.store.delete(key);
      this.store.set(key, value);
      return;
    }
    if (this.store.size >= this.max) {
      const firstKey = this.store.keys().next().value;
      if (firstKey !== void 0) {
        this.store.delete(firstKey);
        this.evictions++;
      }
    }
    this.store.set(key, value);
  }
  has(key) {
    return this.store.has(key);
  }
  clear() {
    this.store.clear();
  }
  get size() {
    return this.store.size;
  }
  metrics() {
    return {
      kind: "lru",
      name: this.name,
      size: this.store.size,
      max: this.max,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions
    };
  }
  /** Disconnect this instance from the global registry. Use for
   *  per-request caches that should not show up in long-lived
   *  introspection. */
  unregister() {
    cacheRegistry.delete(this);
  }
};
var SingletonCache = class {
  name;
  clock;
  value = void 0;
  refreshes = 0;
  loadedAtMs = null;
  constructor(opts) {
    this.name = opts.name;
    this.clock = opts.now ?? Date.now;
    cacheRegistry.add(this);
  }
  get() {
    return this.value;
  }
  set(value) {
    this.value = value;
    this.refreshes++;
    this.loadedAtMs = this.clock();
  }
  has() {
    return this.value !== void 0;
  }
  clear() {
    this.value = void 0;
    this.loadedAtMs = null;
  }
  metrics() {
    return {
      kind: "singleton",
      name: this.name,
      size: this.value === void 0 ? 0 : 1,
      refreshes: this.refreshes,
      loaded_at_ms: this.loadedAtMs
    };
  }
  unregister() {
    cacheRegistry.delete(this);
  }
};
function allCacheMetrics() {
  return [...cacheRegistry].map((c) => c.metrics());
}

// src/lib/runtime-state/state.ts
var modelsCache = new SingletonCache({ name: "models" });
var copilotTokenCache = new SingletonCache({ name: "copilot_token" });
var state = {
  accountType: "individual",
  manualApprove: false,
  rateLimitWait: false,
  showToken: false,
  verbose: false,
  // Defaults; `runServer` overwrites both with the resolved ports at boot.
  // In-memory tests (`app.request(...)`, no runServer) see these, which match
  // the CLI's own defaults (src/lib/start/cli.ts).
  controlPort: 4141,
  proxyPort: 4141,
  vsCodeDeviceId: randomUUID(),
  shellApiKey: process.env.MAXIMAL_SHELL_KEY?.trim() || void 0
};
function setGithubToken(token) {
  state.githubToken = token;
}
function setCopilotToken(token, expiresAtMs) {
  state.copilotTokenExpiresAtMs = expiresAtMs;
  refreshHealth.lastSuccessAtMs = Date.now();
  refreshHealth.consecutiveFailures = 0;
  if (state.copilotToken === token) return;
  state.copilotToken = token;
  copilotTokenCache.set(token);
}
function setUserName(name) {
  state.userName = name;
}
function clearTokenTrio(fields = {
  github: true,
  copilot: true,
  userName: true
}) {
  if (fields.github) state.githubToken = void 0;
  if (fields.copilot) {
    state.copilotToken = void 0;
    state.copilotTokenExpiresAtMs = void 0;
    resetCopilotRefreshHealth();
  }
  if (fields.userName) state.userName = void 0;
}
var refreshHealth = {
  lastSuccessAtMs: null,
  lastFailureAtMs: null,
  lastFailureReason: null,
  consecutiveFailures: 0
};
function copilotRefreshHealth() {
  return { ...refreshHealth };
}
function noteCopilotRefreshFailure(reason, nowMs = Date.now()) {
  refreshHealth.lastFailureAtMs = nowMs;
  refreshHealth.lastFailureReason = reason;
  refreshHealth.consecutiveFailures++;
}
function resetCopilotRefreshHealth() {
  refreshHealth.lastSuccessAtMs = null;
  refreshHealth.lastFailureAtMs = null;
  refreshHealth.lastFailureReason = null;
  refreshHealth.consecutiveFailures = 0;
}
function copilotTokenHealth(nowMs = Date.now()) {
  if (state.copilotToken === void 0) return CREDENTIAL_HEALTH.unknown;
  if (refreshHealth.consecutiveFailures === 0) return CREDENTIAL_HEALTH.healthy;
  const expiresAtMs = state.copilotTokenExpiresAtMs;
  if (expiresAtMs === void 0) return CREDENTIAL_HEALTH.unknown;
  return nowMs >= expiresAtMs ? CREDENTIAL_HEALTH.expired : CREDENTIAL_HEALTH.refreshing;
}
function hasGithubToken() {
  return state.githubToken !== void 0;
}
function hasCopilotToken() {
  return state.copilotToken !== void 0;
}
function tokenPresence() {
  return { github: hasGithubToken(), copilot: hasCopilotToken() };
}
function modelsCached() {
  return state.models?.data.length ?? 0;
}
function setModels(models) {
  state.models = models;
  modelsCache.set(models);
}
function setLastUpstreamRejection(rejection) {
  const existing = state.lastUpstreamRejection;
  if (existing && existing.message === rejection.message && existing.remediationUrl === rejection.remediationUrl && existing.status === rejection.status) {
    return;
  }
  state.lastUpstreamRejection = {
    ...rejection,
    at: (/* @__PURE__ */ new Date()).toISOString()
  };
  emitAuthChanged();
}
function clearLastUpstreamRejection() {
  const hadRejection = state.lastUpstreamRejection !== void 0;
  state.lastUpstreamRejection = void 0;
  if (hadRejection) {
    emitAuthChanged();
  }
}
function setNetworkDiagnosis(value) {
  if (value === null) {
    clearNetworkDiagnosis();
    return;
  }
  const existing = state.networkDiagnosis;
  if (existing && existing.kind === value.kind && existing.scope === value.scope) {
    return;
  }
  state.networkDiagnosis = { kind: value.kind, scope: value.scope };
  emitAuthChanged();
}
function clearNetworkDiagnosis() {
  const hadDiagnosis = state.networkDiagnosis !== void 0;
  state.networkDiagnosis = void 0;
  if (hadDiagnosis) {
    emitAuthChanged();
  }
}
function getModelsLoadedAtMs() {
  return modelsCache.metrics().loaded_at_ms;
}

// src/lib/platform/paths.ts
import nodeFs from "fs";
import fs from "fs/promises";
import os from "os";
import path from "path";

// src/lib/platform/test-isolation.ts
var TEST_CONTAINER_ENV = "MAXIMAL_TEST_CONTAINER";
var TEST_CONTAINER_VALUE = "1";
function isBunTestProcess() {
  const bun = globalThis.Bun;
  if (bun === void 0) return false;
  return process.env.NODE_ENV === "test" || process.argv.slice(1).includes("test");
}
function assertIsolatedTestPath(override, overrideName) {
  if (!isBunTestProcess()) return;
  if (process.env[TEST_CONTAINER_ENV] === TEST_CONTAINER_VALUE) return;
  if (override?.trim()) return;
  throw new Error(
    `Refusing to resolve a default user path during bun test: ${TEST_CONTAINER_ENV}=${TEST_CONTAINER_VALUE} and an explicit ${overrideName} are both absent. Run the suite through \`pnpm test\` so it executes in the disposable Docker test container.`
  );
}

// src/lib/platform/paths.ts
var AUTH_APP = process.env.COPILOT_API_OAUTH_APP?.trim() || "";
var ENTERPRISE_PREFIX = process.env.COPILOT_API_ENTERPRISE_URL ? "ent_" : "";
function resolveAppDir(env) {
  const override = env.copilotApiHome?.trim();
  if (override) {
    return override;
  }
  if (env.platform === "win32") {
    const roaming = env.appData?.trim() || path.join(env.homedir, "AppData", "Roaming");
    return path.join(roaming, "maximal");
  }
  return path.join(env.homedir, ".local", "share", "maximal");
}
var HOME_POLICY_ENV = "COPILOT_API_HOME_POLICY";
function resolveHomePolicy(raw) {
  const value = raw?.trim().toLowerCase();
  if (!value) return "create";
  if (value === "create" || value === "require") return value;
  throw new Error(
    `${HOME_POLICY_ENV} is set to "${raw}", which is not a policy. Use "create" (the default \u2014 maximal creates its data home as needed) or "require" (the home must already exist; maximal will not create it or fall back to the default).`
  );
}
function requireExistingHome(dir) {
  const shown = `"${dir}"`;
  const because = `${HOME_POLICY_ENV}=require`;
  let real;
  try {
    real = nodeFs.realpathSync(dir);
  } catch {
    throw new Error(
      `The maximal data home ${shown} does not exist, and ${because} means maximal must not create it or fall back to the default home \u2014 an explicit home is how a host guarantees isolation, so a missing one is an error, not a hint. Create the directory first, or drop ${HOME_POLICY_ENV} to let maximal create it.`
    );
  }
  if (!nodeFs.statSync(real).isDirectory()) {
    throw new Error(
      `The maximal data home ${shown} is not a directory, and ${because} requires an existing directory maximal can write to.`
    );
  }
  try {
    nodeFs.accessSync(real, nodeFs.constants.W_OK | nodeFs.constants.X_OK);
  } catch {
    throw new Error(
      `The maximal data home ${shown} (resolved to "${real}") cannot be written to by this process, and ${because} requires a writable home. Fix its permissions, or point COPILOT_API_HOME somewhere writable.`
    );
  }
  return real;
}
var HOME_OVERRIDE = process.env.COPILOT_API_HOME?.trim();
assertIsolatedTestPath(HOME_OVERRIDE, "COPILOT_API_HOME");
var APP_DIR = (() => {
  const resolved = resolveAppDir({
    platform: process.platform,
    homedir: os.homedir(),
    copilotApiHome: HOME_OVERRIDE,
    appData: process.env.APPDATA
  });
  return resolveHomePolicy(process.env[HOME_POLICY_ENV]) === "require" ? requireExistingHome(resolved) : resolved;
})();
var GITHUB_TOKEN_PATH = path.join(
  APP_DIR,
  AUTH_APP,
  ENTERPRISE_PREFIX + "github_token"
);
var ACCOUNTS_PATH = path.join(
  APP_DIR,
  AUTH_APP,
  ENTERPRISE_PREFIX + "accounts.json"
);
var CONFIG_PATH = path.join(APP_DIR, "config.json");
var PATHS = {
  APP_DIR,
  GITHUB_TOKEN_PATH,
  ACCOUNTS_PATH,
  CONFIG_PATH
};
async function ensurePaths() {
  await fs.mkdir(path.join(PATHS.APP_DIR, AUTH_APP), { recursive: true });
  await ensureFile(PATHS.GITHUB_TOKEN_PATH);
  await ensureFile(PATHS.CONFIG_PATH);
}
async function ensureFile(filePath) {
  try {
    await fs.access(filePath, fs.constants.W_OK);
  } catch {
    await fs.writeFile(filePath, "");
    await fs.chmod(filePath, 384);
  }
}

// src/lib/config/config.ts
import consola from "consola";
import fs2 from "fs";

// src/lib/config/config-schema.ts
import { z as z2 } from "zod";
var ProviderAuthTypeSchema = z2.enum(["authorization", "x-api-key"]);
var ModelConfigSchema = z2.object({
  temperature: z2.number().optional(),
  topP: z2.number().optional(),
  topK: z2.number().optional()
});
var ProviderConfigSchema = z2.object({
  type: z2.string().optional(),
  enabled: z2.boolean().optional(),
  baseUrl: z2.string().optional(),
  apiKey: z2.string().optional(),
  authType: ProviderAuthTypeSchema.optional(),
  models: z2.record(z2.string(), ModelConfigSchema).optional(),
  adjustInputTokens: z2.boolean().optional()
});
var ProviderPluginSchema = z2.object({
  enabled: z2.boolean().optional(),
  // Plugin-owned data is intentionally opaque to core. `unknown()` validates
  // nothing and, unlike an enumerated object schema, preserves the value.
  config: z2.unknown().optional()
}).loose();
var ReasoningEffortSchema = z2.enum([
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max"
]);
var API_KEY_VALUE_PATTERN = /^(?:\*|[\w-]{8,128})$/;
var ApiKeyEntrySchema = z2.object({
  id: z2.string().min(1),
  label: z2.string().min(1).max(64),
  key: z2.string().regex(API_KEY_VALUE_PATTERN),
  enabled: z2.boolean(),
  created_at: z2.string()
});
var AppConfigSchema = z2.object({
  auth: z2.object({
    /**
     * Legacy free-form list of accepted bearer tokens. Kept for
     * backward compatibility with users who edit config.json by
     * hand. The Settings UI manages `apiKeyEntries` instead;
     * `getConfiguredApiKeys()` merges both.
     */
    apiKeys: z2.array(z2.string()).optional(),
    /**
     * Structured API-key registry written by the Settings UI.
     * Each entry has its own enabled flag so a key can be paused
     * without losing its label/history.
     */
    apiKeyEntries: z2.array(ApiKeyEntrySchema).optional(),
    /**
     * When false (default), the proxy accepts any request — the
     * `apiKeyEntries` registry is used purely to attribute traffic
     * to a named client. When true, requests must present a key
     * that matches an enabled entry; everything else gets 401.
     * The Settings UI exposes this as "Block unknown connections."
     */
    enforce: z2.boolean().optional()
  }).optional(),
  providers: z2.record(z2.string(), ProviderConfigSchema).optional(),
  providerHost: z2.object({
    mode: z2.enum(["legacy", "dsh"]).optional(),
    profileDirectory: z2.string().optional()
  }).optional(),
  providerPlugins: z2.record(z2.string(), ProviderPluginSchema).optional(),
  extraPrompts: z2.record(z2.string(), z2.string()).optional(),
  smallModel: z2.string().optional(),
  responsesApiContextManagementModels: z2.array(z2.string()).optional(),
  /**
   * Copilot/OpenAI-Responses-specific: extend server-side prefix-cache
   * retention on the `/responses` path (default TTL is ~5-10 min; "24h"
   * keeps the cached prefix alive across long pauses, cutting cost + TTFT
   * on repeat requests). UNSET by default — some model/endpoint combos have
   * historically rejected the param, so it is opt-in. See getPromptCacheRetention.
   */
  promptCacheRetention: z2.enum(["in_memory", "24h"]).optional(),
  modelReasoningEfforts: z2.record(z2.string(), ReasoningEffortSchema).optional(),
  useFunctionApplyPatch: z2.boolean().optional(),
  useMessagesApi: z2.boolean().optional(),
  anthropicApiKey: z2.string().optional(),
  useResponsesApiWebSearch: z2.boolean().optional(),
  claudeTokenMultiplier: z2.number().optional(),
  logRetentionDays: z2.number().int().min(0).max(3650).optional(),
  tokenUsageRetentionDays: z2.number().int().min(0).max(3650).optional(),
  autoRecoverAccount: z2.boolean().optional(),
  checkUpdates: z2.boolean().optional(),
  enforceVersionFloor: z2.boolean().optional(),
  editorVersion: z2.string().optional(),
  apps: z2.object({
    claudeCode: z2.object({
      enabled: z2.boolean().optional()
    }).optional(),
    claudeDesktop: z2.object({
      enabled: z2.boolean().optional()
    }).optional()
  }).optional(),
  server: z2.object({
    portPolicy: z2.enum(["next", "fail", "replace"]).optional()
  }).optional(),
  ui: z2.object({
    menuBarOnly: z2.boolean().optional()
  }).optional()
}).loose();
var ConfigValidationError = class extends Error {
  issues;
  constructor(issues) {
    const summary = issues.map((i) => `  ${i.path || "<root>"}: ${i.message}`).join("\n");
    super(`config validation failed:
${summary}`);
    this.name = "ConfigValidationError";
    this.issues = issues;
  }
};
function validateAppConfig(raw) {
  const result = AppConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message
    }));
    throw new ConfigValidationError(issues);
  }
  return result.data;
}
function detectUnknownKeys(raw) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return [];
  const known = new Set(Object.keys(AppConfigSchema.shape));
  return Object.keys(raw).filter(
    (k) => !known.has(k)
  );
}

// src/lib/config/config.ts
var DEFAULT_PORT_POLICY = "next";
var gpt5ExplorationPrompt = `## Exploration and reading files
- **Think first.** Before any tool call, decide ALL files/resources you will need.
- **Batch everything.** If you need multiple files (even from different places), read them together.
- **multi_tool_use.parallel** Use multi_tool_use.parallel to parallelize tool calls and only this.
- **Only make sequential calls if you truly cannot know the next file without seeing a result first.**
- **Workflow:** (a) plan all needed reads \u2192 (b) issue one parallel batch \u2192 (c) analyze results \u2192 (d) repeat if new, unpredictable reads arise.`;
var gpt5CommentaryPrompt = `# Working with the user

You interact with the user through a terminal. You have 2 ways of communicating with the users:  
- Share intermediary updates in \`commentary\` channel.  
- After you have completed all your work, send a message to the \`final\` channel.  

## Intermediary updates

- Intermediary updates go to the \`commentary\` channel.
- User updates are short updates while you are working, they are NOT final answers.
- You use 1-2 sentence user updates to communicate progress and new information to the user as you are doing work.
- Do not begin responses with conversational interjections or meta commentary. Avoid openers such as acknowledgements (\u201CDone \u2014\u201D, \u201CGot it\u201D, \u201CGreat question, \u201D) or framing phrases.
- You provide user updates frequently, every 20s.
- Before exploring or doing substantial work, you start with a user update acknowledging the request and explaining your first step. You should include your understanding of the user request and explain what you will do. Avoid commenting on the request or using starters such as "Got it -" or "Understood -" etc.
- When exploring, e.g. searching, reading files, you provide user updates as you go, every 20s, explaining what context you are gathering and what you've learned. Vary your sentence structure when providing these updates to avoid sounding repetitive - in particular, don't start each sentence the same way.
- After you have sufficient context, and the work is substantial, you provide a longer plan (this is the only user update that may be longer than 2 sentences and can contain formatting).
- Before performing file edits of any kind, you provide updates explaining what edits you are making.
- As you are thinking, you very frequently provide updates even if not taking any actions, informing the user of your progress. You interrupt your thinking and send multiple updates in a row if thinking for more than 100 words.
- Tone of your updates MUST match your personality.`;
var defaultConfig = {
  auth: {
    apiKeys: []
  },
  providers: {},
  extraPrompts: {
    "gpt-5-mini": gpt5ExplorationPrompt,
    "gpt-5.3-codex": gpt5CommentaryPrompt,
    "gpt-5.4-mini": gpt5CommentaryPrompt,
    "gpt-5.4": gpt5CommentaryPrompt,
    "gpt-5.5": gpt5CommentaryPrompt,
    "gpt-5.6-sol": gpt5CommentaryPrompt,
    "gpt-5.6-terra": gpt5CommentaryPrompt,
    "gpt-5.6-luna": gpt5CommentaryPrompt
  },
  smallModel: "gpt-5-mini",
  responsesApiContextManagementModels: [],
  // Written into the user's config on first run rather than left implicit, so
  // the knob is discoverable by reading the file instead of the source.
  server: {
    portPolicy: DEFAULT_PORT_POLICY
  },
  modelReasoningEfforts: {
    "gpt-5-mini": "low",
    "gpt-5.3-codex": "xhigh",
    "gpt-5.4-mini": "xhigh",
    "gpt-5.4": "xhigh",
    "gpt-5.5": "xhigh",
    // GPT-5.6 (Sol/Terra/Luna): pinned to medium per OpenAI's 5.6 guidance,
    // which names medium the balanced baseline and reserves high/xhigh for when
    // evals show a meaningful gain. This matches the global default today, but
    // we pin it explicitly so these frontier models stay at the guided value
    // even if the global baseline is ever changed. Escalate per-variant if
    // evals justify it.
    "gpt-5.6-sol": "medium",
    "gpt-5.6-terra": "medium",
    "gpt-5.6-luna": "medium"
  },
  useFunctionApplyPatch: true,
  useMessagesApi: true,
  useResponsesApiWebSearch: true
};
var cachedConfig = null;
var configListeners = /* @__PURE__ */ new Set();
var publishConfig = (config) => {
  for (const listener of configListeners) listener(config);
};
function subscribeConfig(listener) {
  configListeners.add(listener);
  return () => configListeners.delete(listener);
}
function ensureConfigFile() {
  try {
    fs2.accessSync(PATHS.CONFIG_PATH, fs2.constants.R_OK | fs2.constants.W_OK);
  } catch {
    try {
      fs2.mkdirSync(PATHS.APP_DIR, { recursive: true });
      fs2.writeFileSync(
        PATHS.CONFIG_PATH,
        `${JSON.stringify(defaultConfig, null, 2)}
`,
        "utf8"
      );
    } catch (error) {
      consola.warn(
        `Couldn't create ${PATHS.CONFIG_PATH}; continuing with whatever is on disk`,
        error
      );
      return;
    }
    try {
      fs2.chmodSync(PATHS.CONFIG_PATH, 384);
    } catch {
      return;
    }
  }
}
var ConfigReloadError = class extends Error {
  reason;
  constructor(reason) {
    super(`external config reload failed: ${reason}`);
    this.name = "ConfigReloadError";
    this.reason = reason;
  }
};
function readConfigFromDisk(mode = "startup") {
  if (mode === "startup") ensureConfigFile();
  let raw;
  try {
    raw = fs2.readFileSync(PATHS.CONFIG_PATH, "utf8");
  } catch (error) {
    if (mode === "reload") throw new ConfigReloadError("read");
    consola.error("Failed to read config file, using default config", error);
    return defaultConfig;
  }
  if (!raw.trim()) {
    if (mode === "reload") throw new ConfigReloadError("parse");
    try {
      fs2.writeFileSync(
        PATHS.CONFIG_PATH,
        `${JSON.stringify(defaultConfig, null, 2)}
`,
        "utf8"
      );
    } catch (error) {
      consola.error("Failed to seed empty config file, using defaults", error);
    }
    return defaultConfig;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    if (mode === "reload") throw new ConfigReloadError("parse");
    consola.error("Failed to parse config file, using default config", error);
    return defaultConfig;
  }
  let config;
  try {
    config = validateAppConfig(parsed);
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      if (mode === "reload") throw new ConfigReloadError("validation");
      consola.error(
        `Invalid ${PATHS.CONFIG_PATH}:
${error.issues.map((i) => `  ${i.path || "<root>"}: ${i.message}`).join("\n")}`
      );
      process.exit(1);
    }
    throw error;
  }
  const unknown = detectUnknownKeys(parsed);
  if (unknown.length > 0) {
    consola.warn(
      `Config has unknown keys (ignored, may be deprecated): ${unknown.join(", ")}`
    );
  }
  return config;
}
function mergeDefaultConfig(config) {
  const extraPrompts = config.extraPrompts ?? {};
  const defaultExtraPrompts = defaultConfig.extraPrompts ?? {};
  const modelReasoningEfforts = config.modelReasoningEfforts ?? {};
  const defaultModelReasoningEfforts = defaultConfig.modelReasoningEfforts ?? {};
  const hasMissingExtraPrompts = Object.keys(defaultExtraPrompts).some(
    (model) => !Object.hasOwn(extraPrompts, model)
  );
  const hasMissingReasoningEfforts = Object.keys(
    defaultModelReasoningEfforts
  ).some((model) => !Object.hasOwn(modelReasoningEfforts, model));
  if (!hasMissingExtraPrompts && !hasMissingReasoningEfforts) return config;
  return {
    ...config,
    extraPrompts: {
      ...defaultExtraPrompts,
      ...extraPrompts
    },
    modelReasoningEfforts: {
      ...defaultModelReasoningEfforts,
      ...modelReasoningEfforts
    }
  };
}
function adoptConfig(config) {
  const adopted = mergeDefaultConfig(config);
  cachedConfig = adopted;
  publishConfig(adopted);
  return adopted;
}
function mergeConfigWithDefaults() {
  return adoptConfig(readConfigFromDisk());
}
function reloadConfigFromDisk() {
  return adoptConfig(readConfigFromDisk("reload"));
}
function getConfig() {
  return cachedConfig ?? adoptConfig(readConfigFromDisk());
}
function writeConfig(next) {
  const validated = validateAppConfig(next);
  fs2.mkdirSync(PATHS.APP_DIR, { recursive: true });
  const tmpPath = `${PATHS.CONFIG_PATH}.tmp-${process.pid}`;
  fs2.writeFileSync(tmpPath, `${JSON.stringify(validated, null, 2)}
`, "utf8");
  try {
    fs2.chmodSync(tmpPath, 384);
  } catch {
  }
  fs2.renameSync(tmpPath, PATHS.CONFIG_PATH);
  return adoptConfig(validated);
}
function getExtraPromptForModel(model) {
  const config = getConfig();
  return config.extraPrompts?.[model] ?? "";
}
function getSmallModel() {
  const config = getConfig();
  return config.smallModel ?? "gpt-5-mini";
}
function getResponsesApiContextManagementModels() {
  const config = getConfig();
  return config.responsesApiContextManagementModels ?? defaultConfig.responsesApiContextManagementModels ?? [];
}
function isResponsesApiContextManagementModel(model) {
  return getResponsesApiContextManagementModels().includes(model);
}
function getPromptCacheRetention() {
  const config = getConfig();
  return config.promptCacheRetention;
}
function getReasoningEffortForModel(model) {
  const config = getConfig();
  return config.modelReasoningEfforts?.[model] ?? defaultConfig.modelReasoningEfforts?.[model] ?? defaultReasoningEffortForModel(model);
}
function defaultReasoningEffortForModel(model) {
  return model.startsWith("claude") ? "high" : "medium";
}
function normalizeProviderBaseUrl(url) {
  return url.trim().replace(/\/+$/u, "");
}
function resolveProviderAuthType(providerName, authType) {
  if (authType === void 0 || authType === "x-api-key") {
    return "x-api-key";
  }
  if (authType === "authorization") {
    return authType;
  }
  consola.warn(
    `Provider ${providerName} has invalid authType '${authType}', falling back to x-api-key`
  );
  return "x-api-key";
}
function getProviderConfig(name) {
  const providerName = name.trim();
  if (!providerName) {
    return null;
  }
  const config = getConfig();
  const provider = config.providers?.[providerName];
  if (!provider) {
    return null;
  }
  if (provider.enabled === false) {
    return null;
  }
  const type = provider.type ?? "anthropic";
  if (type !== "anthropic") {
    consola.warn(
      `Provider ${providerName} is ignored because only anthropic type is supported`
    );
    return null;
  }
  const baseUrl = normalizeProviderBaseUrl(provider.baseUrl ?? "");
  const apiKey = (provider.apiKey ?? "").trim();
  const authType = resolveProviderAuthType(providerName, provider.authType);
  if (!baseUrl || !apiKey) {
    consola.warn(
      `Provider ${providerName} is enabled but missing baseUrl or apiKey`
    );
    return null;
  }
  return {
    name: providerName,
    type,
    baseUrl,
    apiKey,
    authType,
    models: provider.models,
    adjustInputTokens: provider.adjustInputTokens
  };
}
function isMessagesApiEnabled() {
  const config = getConfig();
  return config.useMessagesApi ?? true;
}
function getAnthropicApiKey() {
  const fromEnv = process.env.ANTHROPIC_API_KEY;
  if (fromEnv !== void 0 && fromEnv.length > 0) return fromEnv;
  const fromConfig = getConfig().anthropicApiKey;
  return fromConfig !== void 0 && fromConfig.length > 0 ? fromConfig : void 0;
}
function isResponsesApiWebSearchEnabled() {
  const config = getConfig();
  return config.useResponsesApiWebSearch ?? true;
}
function getClaudeTokenMultiplier() {
  const config = getConfig();
  return config.claudeTokenMultiplier ?? 1.15;
}
var DEFAULT_LOG_RETENTION_DAYS = 7;
function getLogRetentionDays() {
  const config = getConfig();
  return config.logRetentionDays ?? DEFAULT_LOG_RETENTION_DAYS;
}
var DEFAULT_TOKEN_USAGE_RETENTION_DAYS = 365;
function getTokenUsageRetentionDays() {
  const config = getConfig();
  return config.tokenUsageRetentionDays ?? DEFAULT_TOKEN_USAGE_RETENTION_DAYS;
}
function isAutoRecoverAccountEnabled() {
  const config = getConfig();
  return config.autoRecoverAccount ?? false;
}
function isUpdateCheckEnabled() {
  const config = getConfig();
  return config.checkUpdates ?? true;
}
function isVersionFloorEnforced() {
  const config = getConfig();
  return config.enforceVersionFloor ?? true;
}

export {
  parseAccountType,
  CREDENTIAL_HEALTH,
  toCopilotHost,
  hostForAccountType,
  EventBus,
  settingsEventBus,
  registerAuthStatusProjector,
  emitAuthChanged,
  emitAuthChangedWithReconnect,
  Cache,
  allCacheMetrics,
  state,
  setGithubToken,
  setCopilotToken,
  setUserName,
  clearTokenTrio,
  copilotRefreshHealth,
  noteCopilotRefreshFailure,
  copilotTokenHealth,
  hasGithubToken,
  hasCopilotToken,
  tokenPresence,
  modelsCached,
  setModels,
  setLastUpstreamRejection,
  clearLastUpstreamRejection,
  setNetworkDiagnosis,
  clearNetworkDiagnosis,
  getModelsLoadedAtMs,
  API_KEY_VALUE_PATTERN,
  AppConfigSchema,
  assertIsolatedTestPath,
  PATHS,
  ensurePaths,
  DEFAULT_PORT_POLICY,
  subscribeConfig,
  ConfigReloadError,
  mergeConfigWithDefaults,
  reloadConfigFromDisk,
  getConfig,
  writeConfig,
  getExtraPromptForModel,
  getSmallModel,
  isResponsesApiContextManagementModel,
  getPromptCacheRetention,
  getReasoningEffortForModel,
  getProviderConfig,
  isMessagesApiEnabled,
  getAnthropicApiKey,
  isResponsesApiWebSearchEnabled,
  getClaudeTokenMultiplier,
  DEFAULT_LOG_RETENTION_DAYS,
  getLogRetentionDays,
  getTokenUsageRetentionDays,
  isAutoRecoverAccountEnabled,
  isUpdateCheckEnabled,
  isVersionFloorEnforced
};
