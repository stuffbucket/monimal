import {
  CREDENTIAL_HEALTH,
  PATHS,
  clearLastUpstreamRejection,
  clearNetworkDiagnosis,
  clearTokenTrio,
  copilotRefreshHealth,
  copilotTokenHealth,
  emitAuthChanged,
  emitAuthChangedWithReconnect,
  getAnthropicApiKey,
  getConfig,
  getLogRetentionDays,
  hasGithubToken,
  hostForAccountType,
  noteCopilotRefreshFailure,
  registerAuthStatusProjector,
  setCopilotToken,
  setGithubToken,
  setModels,
  setNetworkDiagnosis,
  setUserName,
  state,
  toCopilotHost
} from "./chunk-4JX7327A.js";

// src/lib/platform/opencode.ts
import consola from "consola";
import { exec } from "child_process";
import { readFile } from "fs/promises";
import path from "path";
import { z } from "zod";
var OpencodePackageSchema = z.object({ version: z.string() }).loose();
var execAsync = (command) => {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout);
    });
  });
};
var opencodeVersionCache;
var getGlobalNpmRoot = async () => {
  const stdout = await execAsync("npm root -g");
  return stdout.trim();
};
async function resolveOpencodeVersion() {
  try {
    const npmRootPath = await getGlobalNpmRoot();
    const opencodePackagePath = path.join(
      npmRootPath,
      "opencode-ai",
      "package.json"
    );
    const packageJson = await readFile(opencodePackagePath, "utf8");
    const { version } = OpencodePackageSchema.parse(JSON.parse(packageJson));
    opencodeVersionCache = version;
  } catch (error) {
    consola.warn(`Failed to resolve opencode version`, error);
  }
}
var initOpencodeVersion = () => {
  if (process.env.COPILOT_API_OAUTH_APP?.trim() !== "opencode") {
    return Promise.resolve();
  }
  return resolveOpencodeVersion();
};
var getCachedOpencodeVersion = () => {
  return opencodeVersionCache;
};

// src/lib/platform/utils.ts
import consola10 from "consola";
import { createHash, randomUUID as randomUUID3 } from "crypto";
import { networkInterfaces } from "os";

// src/lib/auth/deviceid.ts
import consola2 from "consola";
import { randomUUID } from "crypto";
import path2 from "path";
var WINDOWS_DEVICE_ID_KEY = String.raw`\SOFTWARE\Microsoft\DeveloperTools`;
var WINDOWS_DEVICE_ID_NAME = "deviceid";
var windows64Architectures = /* @__PURE__ */ new Set(["AMD64", "ARM64", "IA64"]);
var getPosixHomeDir = () => {
  if (!process.env.HOME) {
    throw new Error("Home directory not found");
  }
  return process.env.HOME;
};
var getDeviceIdFilePath = () => {
  let folder;
  switch (process.platform) {
    case "darwin": {
      folder = path2.posix.join(
        getPosixHomeDir(),
        "Library",
        "Application Support"
      );
      break;
    }
    case "linux": {
      folder = process.env.XDG_CACHE_HOME ?? path2.posix.join(getPosixHomeDir(), ".cache");
      break;
    }
    default: {
      throw new Error("Unsupported platform");
    }
  }
  return path2.posix.join(folder, "Microsoft", "DeveloperTools", "deviceid");
};
var isMissingFileError = (error) => {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
};
var readStoredDeviceIdFile = async (filePath) => {
  const { readFile: readFile2 } = await import("fs/promises");
  try {
    return await readFile2(filePath, "utf8");
  } catch (error) {
    if (isMissingFileError(error)) {
      return void 0;
    }
    throw error;
  }
};
var writeStoredDeviceIdFile = async (filePath, deviceId) => {
  const { mkdir, writeFile } = await import("fs/promises");
  await mkdir(path2.posix.dirname(filePath), { recursive: true });
  await writeFile(filePath, deviceId, "utf8");
};
var getWindowsRegistryArch = () => {
  const architecture = (process.env.PROCESSOR_ARCHITEW6432 ?? process.env.PROCESSOR_ARCHITECTURE)?.toUpperCase();
  return architecture && windows64Architectures.has(architecture) ? "x64" : void 0;
};
var loadWinreg = async () => {
  const module = await import("winreg");
  const winreg = "default" in module ? module.default : module;
  return winreg;
};
var isMissingRegistryError = (error) => {
  if (!error) {
    return false;
  }
  const errorCode = Number(error.code);
  return Number.isFinite(errorCode) && errorCode === 1;
};
var createWindowsRegistry = async () => {
  const Winreg = await loadWinreg();
  return {
    registry: new Winreg({
      hive: Winreg.HKCU,
      key: WINDOWS_DEVICE_ID_KEY,
      arch: getWindowsRegistryArch()
    }),
    regSz: Winreg.REG_SZ
  };
};
var readRegistryString = async (registry, name) => {
  return new Promise((resolve, reject) => {
    registry.get(name, (error, item) => {
      if (isMissingRegistryError(error)) {
        resolve(void 0);
        return;
      }
      if (error) {
        reject(
          error instanceof Error ? error : new Error("Unknown registry error")
        );
        return;
      }
      resolve(item?.value);
    });
  });
};
var writeRegistryString = async ({
  registry,
  regSz,
  name,
  value
}) => {
  return new Promise((resolve, reject) => {
    registry.set(name, regSz, value, (error) => {
      if (error) {
        reject(
          error instanceof Error ? error : new Error("Unknown registry error")
        );
        return;
      }
      resolve();
    });
  });
};
var getStoredVSCodeDeviceId = async () => {
  switch (process.platform) {
    case "win32": {
      const { registry } = await createWindowsRegistry();
      return readRegistryString(registry, WINDOWS_DEVICE_ID_NAME);
    }
    case "darwin":
    case "linux": {
      return readStoredDeviceIdFile(getDeviceIdFilePath());
    }
    default: {
      throw new Error("Unsupported platform");
    }
  }
};
var setStoredVSCodeDeviceId = async (deviceId) => {
  switch (process.platform) {
    case "win32": {
      const { registry, regSz } = await createWindowsRegistry();
      await writeRegistryString({
        registry,
        regSz,
        name: WINDOWS_DEVICE_ID_NAME,
        value: deviceId
      });
      return;
    }
    case "darwin":
    case "linux": {
      await writeStoredDeviceIdFile(getDeviceIdFilePath(), deviceId);
      return;
    }
    default: {
      throw new Error("Unsupported platform");
    }
  }
};
var createVSCodeDeviceId = () => randomUUID().toLowerCase();
async function getVSCodeDeviceId() {
  let deviceId;
  try {
    deviceId = await getStoredVSCodeDeviceId();
  } catch (error) {
    consola2.debug("Failed to read VSCode device id", error);
  }
  if (deviceId) {
    return deviceId;
  }
  const newDeviceId = createVSCodeDeviceId();
  try {
    await setStoredVSCodeDeviceId(newDeviceId);
  } catch (error) {
    consola2.warn(
      "Failed to persist VSCode device id, using ephemeral id",
      error
    );
  }
  return newDeviceId;
}

// src/services/copilot/get-models.ts
import consola9 from "consola";

// src/lib/config/api-config.ts
import { randomUUID as randomUUID2 } from "crypto";

// src/lib/http/request-context.ts
import { AsyncLocalStorage } from "async_hooks";
var TRACE_ID_MAX_LENGTH = 64;
var TRACE_ID_PATTERN = /^\w[\w.-]*$/;
var asyncLocalStorage = new AsyncLocalStorage();
var requestContext = {
  getStore: () => asyncLocalStorage.getStore(),
  run: (context, callback) => asyncLocalStorage.run(context, callback)
};
function generateTraceId() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `${timestamp}-${random}`;
}
function resolveTraceId(traceId) {
  const candidate = traceId?.trim();
  if (!candidate || candidate.length > TRACE_ID_MAX_LENGTH || !TRACE_ID_PATTERN.test(candidate)) {
    return generateTraceId();
  }
  return candidate;
}

// src/lib/models/compact.ts
var COMPACT_REQUEST = 1;
var COMPACT_AUTO_CONTINUE = 2;
var compactSystemPromptStart = "You are a helpful AI assistant tasked with summarizing conversations";
var compactOpenCodeSystemPromptStart = "You are an anchored context summarization assistant for coding sessions.";
var compactSystemPromptStarts = [
  compactSystemPromptStart,
  compactOpenCodeSystemPromptStart
];
var compactTextOnlyGuard = "CRITICAL: Respond with TEXT ONLY. Do NOT call any tools.";
var compactSummaryPromptStart = "Your task is to create a detailed summary of the conversation so far";
var compactAutoContinueClaudeCodePromptStart = "This session is being continued from a previous conversation that ran out of context. The summary below covers the earlier portion of the conversation.";
var compactAutoContinueOpenCodePromptStart = "Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed.";
var compactAutoContinueOpenCodePromptStart2 = "The previous request exceeded the provider's size limit due to large media attachments. The conversation was compacted and media files were removed from context.";
var compactAutoContinuePromptStarts = [
  compactAutoContinueClaudeCodePromptStart,
  compactAutoContinueOpenCodePromptStart,
  compactAutoContinueOpenCodePromptStart2
];
var compactMessageSections = [
  "Pending Tasks:",
  "Current Work:"
];

// src/lib/config/api-config.ts
var isOpencodeOauthApp = () => {
  return process.env.COPILOT_API_OAUTH_APP?.trim() === "opencode";
};
var normalizeDomain = (input) => {
  return input.trim().replace(/^https?:\/\//u, "").replace(/\/+$/u, "");
};
var getEnterpriseDomain = () => {
  const raw = (process.env.COPILOT_API_ENTERPRISE_URL ?? "").trim();
  if (!raw) return null;
  const normalized = normalizeDomain(raw);
  return normalized || null;
};
var LOOPBACK_OVERRIDE_HOSTNAMES = /* @__PURE__ */ new Set([
  "127.0.0.1",
  // `URL.hostname` brackets an IPv6 literal; the bare `::1` never appears here.
  "[::1]"
]);
var getGitHubApiBaseOverride = () => {
  if (process.env.NODE_ENV !== "test") return null;
  const raw = (process.env.GITHUB_API_BASE ?? "").trim();
  if (!raw) return null;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:") return null;
  if (!LOOPBACK_OVERRIDE_HOSTNAMES.has(parsed.hostname)) return null;
  if (parsed.username !== "" || parsed.password !== "") return null;
  if (parsed.pathname !== "/") return null;
  if (parsed.search !== "" || parsed.hash !== "") return null;
  return parsed.origin;
};
var getGitHubBaseUrl = () => {
  const override = getGitHubApiBaseOverride();
  if (override) return override;
  const resolvedDomain = getEnterpriseDomain();
  return resolvedDomain ? `https://${resolvedDomain}` : GITHUB_BASE_URL;
};
var getGitHubApiBaseUrl = () => {
  const override = getGitHubApiBaseOverride();
  if (override) return override;
  const resolvedDomain = getEnterpriseDomain();
  return resolvedDomain ? `https://api.${resolvedDomain}` : GITHUB_API_BASE_URL;
};
var COPILOT_TOKEN_PATH = "/copilot_internal/v2/token";
var getCopilotTokenUrl = () => `${getGitHubApiBaseUrl()}${COPILOT_TOKEN_PATH}`;
var getOpencodeOauthHeaders = () => {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    "User-Agent": getOpencodeVersion()
  };
};
var getOpencodeLLMHeaders = () => {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    "User-Agent": OPENCODE_LLM_USER_AGENT
  };
};
var normalizeOpencodeUserAgent = (userAgent) => {
  const candidate = userAgent.trim();
  const opencodeProduct = candidate.match(/^opencode\/[^\s,]+/u)?.[0];
  if (!opencodeProduct || candidate.includes(`, ${opencodeProduct}`)) {
    return candidate;
  }
  return `${candidate}, ${opencodeProduct}`;
};
var getOauthUrls = () => {
  const githubBaseUrl = getGitHubBaseUrl();
  return {
    deviceCodeUrl: `${githubBaseUrl}/login/device/code`,
    accessTokenUrl: `${githubBaseUrl}/login/oauth/access_token`
  };
};
var getOauthAppConfig = () => {
  if (isOpencodeOauthApp()) {
    return {
      clientId: OPENCODE_GITHUB_CLIENT_ID,
      headers: getOpencodeOauthHeaders(),
      scope: GITHUB_APP_SCOPES
    };
  }
  return {
    clientId: GITHUB_CLIENT_ID,
    headers: standardHeaders(),
    scope: GITHUB_APP_SCOPES
  };
};
var prepareForCompact = (headers, compactType) => {
  if (compactType) {
    headers["x-initiator"] = "agent";
    if (!isOpencodeOauthApp() && compactType === COMPACT_REQUEST) {
      headers["x-interaction-type"] = "conversation-other";
      headers["openai-intent"] = "conversation-other";
    }
  }
};
var prepareInteractionHeaders = (sessionId, isSubagent, headers) => {
  const sendInteractionHeaders = !isOpencodeOauthApp();
  if (isSubagent) {
    headers["x-initiator"] = "agent";
    if (sendInteractionHeaders) {
      headers["x-interaction-type"] = "conversation-subagent";
    }
  }
  if (sessionId && sendInteractionHeaders) {
    headers["x-interaction-id"] = sessionId;
  }
};
var standardHeaders = () => ({
  "content-type": "application/json",
  accept: "application/json"
});
var getOpencodeVersion = () => {
  const version = getCachedOpencodeVersion();
  if (version) {
    return "opencode/" + version;
  }
  return OPENCODE_VERSION;
};
var OPENCODE_SEMVER = "1.18.15";
var OPENCODE_VERSION = `opencode/${OPENCODE_SEMVER}`;
var OPENCODE_LLM_USER_AGENT = `opencode/${OPENCODE_SEMVER} ai-sdk/provider-utils/4.0.23 runtime/bun/1.3.14, opencode/${OPENCODE_SEMVER}`;
var COPILOT_VERSION = "0.46.0";
var EDITOR_PLUGIN_VERSION = `copilot-chat/${COPILOT_VERSION}`;
var USER_AGENT = `GitHubCopilotChat/${COPILOT_VERSION}`;
var CLAUDE_AGENT_SEMVER = "2.1.226";
var CLAUDE_AGENT_SDK_MINOR = "0.3";
var CLAUDE_AGENT_SDK_SEMVER = `${CLAUDE_AGENT_SDK_MINOR}.${CLAUDE_AGENT_SEMVER.split(".")[2]}`;
var CLAUDE_AGENT_USER_AGENT = `vscode_claude_code/${CLAUDE_AGENT_SEMVER} (external, sdk-ts, agent-sdk/${CLAUDE_AGENT_SDK_SEMVER})`;
var API_VERSION = "2025-10-01";
var copilotBaseUrl = (state2) => {
  const enterpriseDomain = getEnterpriseDomain();
  if (enterpriseDomain) {
    return `https://copilot-api.${enterpriseDomain}`;
  }
  if (isOpencodeOauthApp()) {
    return "https://api.githubcopilot.com";
  }
  if (state2.copilotApiUrl) {
    return state2.copilotApiUrl;
  }
  return hostForAccountType(state2.accountType);
};
var prepareMessageProxyHeaders = (headers) => {
  if (isOpencodeOauthApp()) {
    return;
  }
  const requestIdValue = randomUUID2();
  headers["x-agent-task-id"] = requestIdValue;
  headers["x-request-id"] = requestIdValue;
  headers["x-interaction-type"] = "messages-proxy";
  headers["openai-intent"] = "messages-proxy";
  headers["user-agent"] = CLAUDE_AGENT_USER_AGENT;
  delete headers["copilot-integration-id"];
};
var githubUserHeaders = () => {
  if (isOpencodeOauthApp()) {
    return {
      "User-Agent": getOpencodeVersion()
    };
  }
  return {
    accept: "application/vnd.github+json",
    "user-agent": USER_AGENT,
    "x-github-api-version": "2022-11-28",
    "x-vscode-user-agent-library-version": "electron-fetch"
  };
};
var copilotModelsHeaders = (state2) => {
  if (isOpencodeOauthApp()) {
    return {
      "User-Agent": getOpencodeVersion()
    };
  }
  const headers = githubCopilotHeaders(state2);
  headers["x-interaction-type"] = "model-access";
  headers["openai-intent"] = "model-access";
  delete headers["x-interaction-id"];
  delete headers["content-type"];
  return headers;
};
var copilotHeaders = (state2, requestId, vision = false) => {
  if (isOpencodeOauthApp()) {
    const headers = {
      ...getOpencodeLLMHeaders(),
      "Openai-Intent": "conversation-edits"
    };
    const store = requestContext.getStore();
    const userAgent = store?.userAgent.trim();
    if (userAgent?.startsWith("opencode/")) {
      headers["User-Agent"] = normalizeOpencodeUserAgent(userAgent);
    }
    if (store?.sessionAffinity) {
      headers["x-session-affinity"] = store.sessionAffinity;
    }
    if (store?.parentSessionId) {
      headers["x-parent-session-id"] = store.parentSessionId;
    }
    if (vision) headers["Copilot-Vision-Request"] = "true";
    return headers;
  }
  return githubCopilotHeaders(state2, requestId, vision);
};
var githubCopilotHeaders = (state2, requestId, vision = false) => {
  const requestIdValue = requestId ?? randomUUID2();
  const headers = {
    "content-type": standardHeaders()["content-type"],
    "copilot-integration-id": "vscode-chat",
    "editor-device-id": state2.vsCodeDeviceId,
    "editor-version": `vscode/${state2.vsCodeVersion}`,
    "editor-plugin-version": EDITOR_PLUGIN_VERSION,
    "user-agent": USER_AGENT,
    "openai-intent": "conversation-agent",
    "x-github-api-version": API_VERSION,
    "x-request-id": requestIdValue,
    "x-vscode-user-agent-library-version": "electron-fetch",
    "x-agent-task-id": requestIdValue,
    "x-interaction-type": "conversation-agent"
  };
  if (vision) headers["copilot-vision-request"] = "true";
  if (state2.macMachineId) {
    headers["vscode-machineid"] = state2.macMachineId;
  }
  if (state2.vsCodeSessionId) {
    headers["vscode-sessionid"] = state2.vsCodeSessionId;
  }
  return headers;
};
var GITHUB_API_BASE_URL = "https://api.github.com";
var githubHeaders = () => {
  if (isOpencodeOauthApp()) {
    return {
      ...getOpencodeOauthHeaders()
    };
  }
  return {
    "user-agent": USER_AGENT,
    "x-github-api-version": "2025-04-01",
    "x-vscode-user-agent-library-version": "electron-fetch"
  };
};
var GITHUB_BASE_URL = "https://github.com";
var GITHUB_CLIENT_ID = "Iv1.b507a08c87ecfe98";
var GITHUB_APP_SCOPES = ["read:user"].join(" ");
var OPENCODE_GITHUB_CLIENT_ID = "Ov23li8tweQw6odWQebz";

// src/lib/errors/error.ts
import consola8 from "consola";

// src/lib/auth/copilot-online-retry.ts
import { setTimeout as delay2 } from "timers/promises";

// src/lib/platform/logger.ts
import consola3 from "consola";
import fs from "fs";
import path3 from "path";
import util from "util";

// src/lib/platform/log-redact.ts
var STRUCTURAL_STRING_KEYS = new Set(
  [
    // Routing / model identity
    "model",
    "object",
    "provider",
    "kind",
    "status",
    "source",
    "service_tier",
    "encoding",
    // Message / block structure
    "role",
    "type",
    "name",
    // tool names, block names — definitions, not content
    "tool_name",
    "function_name",
    // Termination / outcome
    "stop_reason",
    "finish_reason",
    "stop",
    // OpenAI stop-sequence marker echoes (sequences themselves redacted)
    // Identifiers / protocol versions
    "id",
    "request_id",
    "session_id",
    "trace_id",
    "tool_use_id",
    "tool_call_id",
    "anthropic_version",
    "anthropic_beta",
    "version",
    "schema_version",
    // Media descriptors (the bytes/data live under other keys and are redacted)
    "media_type",
    "mime_type",
    "detail",
    // Reasoning / effort configuration
    "reasoning_effort",
    "effort",
    "authtype",
    // Transport/socket error diagnostics. These keys only ever carry
    // structural network-error values (the failing syscall, the resolver
    // host, a socket peer address/port) — never request/response content — so
    // they're safe to surface for auth/network debugging. `code` and `path`
    // are deliberately NOT here: they collide with content keys (source-code
    // payloads, file paths). Transport errors on the auth path are instead
    // logged via `formatTransportError` (network-diagnostics.ts), which emits
    // only known-safe fields as a plain string.
    "syscall",
    "hostname",
    "address"
  ].map((k) => k.toLowerCase())
);
function redactString(value) {
  return `[redacted ${value.length} chars]`;
}
function isStructuralKey(key) {
  return key !== void 0 && STRUCTURAL_STRING_KEYS.has(key.toLowerCase());
}
function redactValue(value, keyContext, seen) {
  if (typeof value === "string") {
    return isStructuralKey(keyContext) ? value : redactString(value);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (seen.has(value)) {
    return "[circular]";
  }
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, keyContext, seen));
  }
  const out = {};
  for (const [key, inner] of Object.entries(value)) {
    out[key] = redactValue(inner, key, seen);
  }
  return out;
}
function redactForLog(value) {
  return redactValue(value, void 0, /* @__PURE__ */ new WeakSet());
}
function scrubSecrets(text) {
  return text.replaceAll(/\bgh[oprsu]_[A-Za-z0-9]{20,}\b/g, "[redacted github token]").replaceAll(/\btid=[\w;=:./-]{20,}/g, "[redacted copilot token]");
}

// src/lib/platform/process-cleanup.ts
var cleanupHandlers = /* @__PURE__ */ new Set();
var cleanupPromise = null;
var cleanupState = "idle";
var runtimeInitialized = false;
function initializeProcessCleanupRuntime() {
  if (runtimeInitialized) {
    return;
  }
  runtimeInitialized = true;
  process.once("beforeExit", () => {
    void runProcessCleanups();
  });
  process.once("exit", runProcessCleanupsSync);
  process.once("SIGINT", () => {
    void shutdownProcess(0);
  });
  process.once("SIGTERM", () => {
    void shutdownProcess(0);
  });
}
function runProcessCleanupsSync() {
  if (cleanupState !== "idle") {
    return;
  }
  cleanupState = "done";
  for (const handler of Array.from(cleanupHandlers)) {
    try {
      void handler();
    } catch {
    }
  }
}
async function runProcessCleanups() {
  if (cleanupPromise) {
    return cleanupPromise;
  }
  if (cleanupState === "done") {
    return;
  }
  cleanupState = "running";
  cleanupPromise = (async () => {
    for (const handler of Array.from(cleanupHandlers)) {
      await handler();
    }
    cleanupState = "done";
  })();
  return cleanupPromise;
}
async function shutdownProcess(exitCode) {
  try {
    await runProcessCleanups();
  } finally {
    process.exit(exitCode);
  }
}
function registerProcessCleanup(handler) {
  initializeProcessCleanupRuntime();
  cleanupHandlers.add(handler);
  return () => {
    cleanupHandlers.delete(handler);
  };
}

// src/lib/platform/logger.ts
var ONE_DAY_MS = 24 * 60 * 60 * 1e3;
var CLEANUP_INTERVAL_MS = ONE_DAY_MS;
var LOG_DIR = path3.join(PATHS.APP_DIR, "logs");
var FLUSH_INTERVAL_MS = 1e3;
var MAX_BUFFER_SIZE = 100;
var logStreams = /* @__PURE__ */ new Map();
var logBuffers = /* @__PURE__ */ new Map();
var runtimeInitialized2 = false;
var flushInterval;
var cleanupInterval;
var ensureLogDirectory = () => {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
};
var cleanupOldLogs = () => {
  if (!fs.existsSync(LOG_DIR)) {
    return;
  }
  const retentionMs = getLogRetentionDays() * ONE_DAY_MS;
  const now = Date.now();
  for (const entry of fs.readdirSync(LOG_DIR)) {
    const filePath = path3.join(LOG_DIR, entry);
    let stats;
    try {
      stats = fs.statSync(filePath);
    } catch {
      continue;
    }
    if (!stats.isFile()) {
      continue;
    }
    if (retentionMs === 0 || now - stats.mtimeMs > retentionMs) {
      try {
        fs.rmSync(filePath);
      } catch {
        continue;
      }
    }
  }
};
var formatArgs = (args) => args.map(
  (arg) => typeof arg === "string" ? arg : util.inspect(arg, { depth: null, colors: false })
).join(" ");
var sanitizeName = (name) => {
  const normalized = name.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/^-+|-+$/g, "");
  return normalized === "" ? "handler" : normalized;
};
var maybeUnref = (timer) => {
  timer.unref();
};
var flushBuffer = (filePath) => {
  const buffer = logBuffers.get(filePath);
  if (!buffer || buffer.length === 0) {
    return;
  }
  const stream = getLogStream(filePath);
  const content = buffer.join("\n") + "\n";
  stream.write(content, (error) => {
    if (error) {
      console.warn("Failed to write handler log", error);
    }
  });
  logBuffers.set(filePath, []);
};
var flushAllBuffers = () => {
  for (const filePath of logBuffers.keys()) {
    flushBuffer(filePath);
  }
};
var cleanup = () => {
  if (flushInterval) {
    clearInterval(flushInterval);
    flushInterval = void 0;
  }
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = void 0;
  }
  flushAllBuffers();
  for (const stream of logStreams.values()) {
    stream.end();
  }
  logStreams.clear();
  logBuffers.clear();
};
var initializeLoggerRuntime = () => {
  if (runtimeInitialized2) {
    return;
  }
  runtimeInitialized2 = true;
  ensureLogDirectory();
  cleanupOldLogs();
  flushInterval = setInterval(flushAllBuffers, FLUSH_INTERVAL_MS);
  maybeUnref(flushInterval);
  cleanupInterval = setInterval(cleanupOldLogs, CLEANUP_INTERVAL_MS);
  maybeUnref(cleanupInterval);
  registerProcessCleanup(cleanup);
};
var getLogStream = (filePath) => {
  initializeLoggerRuntime();
  let stream = logStreams.get(filePath);
  if (!stream || stream.destroyed) {
    stream = fs.createWriteStream(filePath, { flags: "a" });
    logStreams.set(filePath, stream);
    stream.on("error", (error) => {
      console.warn("Log stream error", error);
      logStreams.delete(filePath);
    });
  }
  return stream;
};
var appendLine = (filePath, line) => {
  let buffer = logBuffers.get(filePath);
  if (!buffer) {
    buffer = [];
    logBuffers.set(filePath, buffer);
  }
  buffer.push(line);
  if (buffer.length >= MAX_BUFFER_SIZE) {
    flushBuffer(filePath);
  }
};
var redactArgs = (args) => {
  return args.map(
    (arg) => typeof arg === "string" ? arg : redactForLog(arg)
  );
};
var debugLazy = (logger, factory) => {
  if (!state.verbose) {
    return;
  }
  logger.debug(...redactArgs(factory()));
};
var debugJson = (logger, label, value) => {
  debugLazy(logger, () => [label, JSON.stringify(redactForLog(value))]);
};
var debugJsonTail = (logger, label, { value, tailLength = 400 }) => {
  debugLazy(logger, () => [
    label,
    JSON.stringify(redactForLog(value)).slice(-tailLength)
  ]);
};
var createTeeLogger = (name) => {
  const sanitizedName = sanitizeName(name);
  const c = consola3;
  const writeFile = (type, args) => {
    initializeLoggerRuntime();
    const context = requestContext.getStore();
    const traceId = context?.traceId;
    const now = /* @__PURE__ */ new Date();
    const dateKey = now.toLocaleDateString("sv-SE");
    const timestamp = now.toLocaleString("sv-SE", { hour12: false });
    const filePath = path3.join(LOG_DIR, `${sanitizedName}-${dateKey}.log`);
    const redacted = args.map(
      (arg) => typeof arg === "string" ? scrubSecrets(arg) : redactForLog(arg)
    );
    const message = formatArgs(redacted);
    const traceIdStr = traceId ? ` [${traceId}]` : "";
    appendLine(
      filePath,
      `[${timestamp}] [${type}] [${name}]${traceIdStr}${message ? ` ${message}` : ""}`
    );
  };
  const tee = (type) => (...args) => {
    c[type](
      ...args.map(
        (arg) => typeof arg === "string" ? scrubSecrets(arg) : arg
      )
    );
    writeFile(type, args);
  };
  return {
    info: tee("info"),
    warn: tee("warn"),
    error: tee("error"),
    debug: (...args) => {
      if (!state.verbose) return;
      tee("debug")(...args);
    }
  };
};
var createHandlerLogger = (name) => {
  const sanitizedName = sanitizeName(name);
  const instance = consola3.withTag(name);
  if (state.verbose) {
    instance.level = 5;
  }
  instance.setReporters([]);
  instance.addReporter({
    log(logObj) {
      initializeLoggerRuntime();
      const context = requestContext.getStore();
      const traceId = context?.traceId;
      const date = logObj.date;
      const dateKey = date.toLocaleDateString("sv-SE");
      const timestamp = date.toLocaleString("sv-SE", { hour12: false });
      const filePath = path3.join(LOG_DIR, `${sanitizedName}-${dateKey}.log`);
      const message = formatArgs(logObj.args);
      const traceIdStr = traceId ? ` [${traceId}]` : "";
      const line = `[${timestamp}] [${logObj.type}] [${logObj.tag || name}]${traceIdStr}${message ? ` ${message}` : ""}`;
      appendLine(filePath, line);
    }
  });
  return instance;
};

// src/lib/auth/token.ts
import clipboard from "clipboardy";
import consola6 from "consola";
import { setTimeout as delay } from "timers/promises";

// src/lib/auth/github-host.ts
var normalizeDomain2 = (input) => input.trim().replace(/^https?:\/\//u, "").replace(/\/+$/u, "");
var currentGitHubHost = () => {
  const raw = (process.env.COPILOT_API_ENTERPRISE_URL ?? "").trim();
  const domain = raw ? normalizeDomain2(raw) : "";
  return domain || "github.com";
};

// src/lib/auth/github-token-store.ts
import fs2 from "fs/promises";
function inferTokenType(token) {
  if (token.startsWith("ghu_")) return "ghu_";
  if (token.startsWith("gho_")) return "gho_";
  return "unknown";
}
async function readGitHubTokenRecord(filePath) {
  let raw;
  try {
    raw = await fs2.readFile(filePath, "utf8");
  } catch {
    return null;
  }
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.schemaVersion === 1 && typeof parsed.accessToken === "string" && parsed.accessToken) {
        return {
          schemaVersion: 1,
          tokenType: parsed.tokenType ?? inferTokenType(parsed.accessToken),
          accessToken: parsed.accessToken,
          refreshToken: parsed.refreshToken ?? null,
          obtainedAt: parsed.obtainedAt ?? (/* @__PURE__ */ new Date(0)).toISOString()
        };
      }
    } catch {
    }
  }
  const record = {
    schemaVersion: 1,
    tokenType: inferTokenType(trimmed),
    accessToken: trimmed,
    refreshToken: null,
    obtainedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  try {
    await writeGitHubTokenRecord(filePath, record);
  } catch {
  }
  return record;
}
async function writeJsonAtomic(filePath, value) {
  const json = `${JSON.stringify(value, null, 2)}
`;
  const tmp = `${filePath}.tmp.${process.pid}`;
  await fs2.writeFile(tmp, json, { mode: 384 });
  await fs2.rename(tmp, filePath);
}
async function writeGitHubTokenRecord(filePath, record) {
  await writeJsonAtomic(filePath, record);
}
function accountKey(login, host) {
  return `${login}@${host}`;
}
function emptyRegistry() {
  return { schemaVersion: 2, activeKey: null, accounts: {} };
}
function makeAccountRecord(opts) {
  return {
    login: opts.login,
    host: opts.host,
    token: opts.token,
    tokenType: inferTokenType(opts.token),
    addedVia: opts.addedVia,
    obtainedAt: (/* @__PURE__ */ new Date()).toISOString(),
    refreshToken: opts.refreshToken ?? null,
    accessTokenExpiresAt: opts.accessTokenExpiresAt ?? null,
    refreshTokenExpiresAt: opts.refreshTokenExpiresAt ?? null
  };
}
function addAndActivate(reg, rec) {
  const key = accountKey(rec.login, rec.host);
  return {
    schemaVersion: 2,
    activeKey: key,
    accounts: { ...reg.accounts, [key]: rec }
  };
}
function setActive(reg, key) {
  if (!(key in reg.accounts)) return reg;
  return { ...reg, activeKey: key };
}
function removeAccount(reg, key) {
  if (!(key in reg.accounts)) return reg;
  const accounts = Object.fromEntries(
    Object.entries(reg.accounts).filter(([k]) => k !== key)
  );
  return {
    schemaVersion: 2,
    activeKey: reg.activeKey === key ? null : reg.activeKey,
    accounts
  };
}
function deactivate(reg) {
  if (!reg.activeKey) return reg;
  return { ...reg, activeKey: null };
}
function markNeedsReauth(reg, key, error) {
  if (!(key in reg.accounts)) return reg;
  const rec = reg.accounts[key];
  return {
    ...reg,
    accounts: {
      ...reg.accounts,
      [key]: { ...rec, needsReauth: true, lastError: error }
    }
  };
}
function clearNeedsReauth(reg, key) {
  if (!(key in reg.accounts)) return reg;
  const rec = reg.accounts[key];
  if (!rec.needsReauth && !rec.lastError) return reg;
  return {
    ...reg,
    accounts: {
      ...reg.accounts,
      [key]: { ...rec, needsReauth: false, lastError: null }
    }
  };
}
function getActiveRecord(reg) {
  if (!reg.activeKey) return null;
  return reg.accounts[reg.activeKey] ?? null;
}
function listAccounts(reg) {
  return Object.entries(reg.accounts).map(([key, rec]) => ({
    ...rec,
    key,
    active: key === reg.activeKey
  }));
}
async function readRegistry(filePath) {
  let raw;
  try {
    raw = await fs2.readFile(filePath, "utf8");
  } catch {
    return emptyRegistry();
  }
  const trimmed = raw.trim();
  if (!trimmed) return emptyRegistry();
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed.schemaVersion === 2 && parsed.accounts && typeof parsed.accounts === "object") {
      return {
        schemaVersion: 2,
        activeKey: parsed.activeKey ?? null,
        accounts: parsed.accounts
      };
    }
  } catch {
  }
  return emptyRegistry();
}
async function writeRegistry(filePath, reg) {
  await writeJsonAtomic(filePath, reg);
}
async function migrateLegacyRecord(opts) {
  const existing = await readRegistry(opts.registryPath);
  if (Object.keys(existing.accounts).length > 0) return null;
  const legacy = await readGitHubTokenRecord(opts.legacyPath);
  if (!legacy) return null;
  const login = await opts.resolveLogin(legacy.accessToken) ?? "unknown";
  const rec = makeAccountRecord({
    login,
    host: opts.host,
    token: legacy.accessToken,
    addedVia: "migration"
  });
  rec.obtainedAt = legacy.obtainedAt;
  const migrated = addAndActivate(emptyRegistry(), rec);
  await writeRegistry(opts.registryPath, migrated);
  return migrated;
}
function registryPathFor(tokenPath) {
  return tokenPath.replace(/github_token$/, "accounts.json");
}
var readDefaultRegistry = () => readRegistry(PATHS.ACCOUNTS_PATH);
var writeDefaultRegistry = (reg) => writeRegistry(PATHS.ACCOUNTS_PATH, reg);
async function addAccountToDefaultRegistry(rec) {
  const reg = await readDefaultRegistry();
  await writeDefaultRegistry(addAndActivate(reg, rec));
}
async function deactivateActiveInDefaultRegistry() {
  const reg = await readDefaultRegistry();
  if (!reg.activeKey) return;
  await writeDefaultRegistry(deactivate(reg));
}
async function markActiveNeedsReauthInDefaultRegistry(error) {
  const reg = await readDefaultRegistry();
  if (!reg.activeKey) return;
  await writeDefaultRegistry(markNeedsReauth(reg, reg.activeKey, error));
}
async function clearActiveNeedsReauthInDefaultRegistry() {
  const reg = await readDefaultRegistry();
  if (!reg.activeKey) return;
  const cleared = clearNeedsReauth(reg, reg.activeKey);
  if (cleared === reg) return;
  await writeDefaultRegistry(cleared);
}
async function markNeedsReauthInDefaultRegistry(key, error) {
  const reg = await readDefaultRegistry();
  await writeDefaultRegistry(markNeedsReauth(reg, key, error));
}
async function activateAndClearNeedsReauthInDefaultRegistry(key) {
  const reg = await readDefaultRegistry();
  await writeDefaultRegistry(clearNeedsReauth(setActive(reg, key), key));
}
var readDefaultRecord = async () => {
  const active = getActiveRecord(await readDefaultRegistry());
  if (active) {
    return {
      schemaVersion: 1,
      tokenType: active.tokenType,
      accessToken: active.token,
      refreshToken: null,
      obtainedAt: active.obtainedAt
    };
  }
  return readGitHubTokenRecord(PATHS.GITHUB_TOKEN_PATH);
};

// src/lib/net/network-diagnostics.ts
import dnsPromises from "dns/promises";
import net from "net";
import os from "os";
var IP_FAMILY = { v4: 4, v6: 6 };
var CLOUDFLARE_DNS_IPV4_PRIMARY = "1.1.1.1";
var CLOUDFLARE_DNS_IPV4_SECONDARY = "1.0.0.1";
var CLOUDFLARE_DNS_IPV6_PRIMARY = "2606:4700:4700::1111";
var CLOUDFLARE_DNS_IPV6_SECONDARY = "2606:4700:4700::1001";
var HTTPS_PORT = 443;
var PROBE_TIMEOUT_MS = 2500;
var REACHABILITY_TARGETS = [
  { host: CLOUDFLARE_DNS_IPV4_PRIMARY, family: IP_FAMILY.v4 },
  { host: CLOUDFLARE_DNS_IPV4_SECONDARY, family: IP_FAMILY.v4 },
  { host: CLOUDFLARE_DNS_IPV6_PRIMARY, family: IP_FAMILY.v6 },
  { host: CLOUDFLARE_DNS_IPV6_SECONDARY, family: IP_FAMILY.v6 }
];
var TRANSPORT_ERROR_CODES = /* @__PURE__ */ new Set([
  // Bun fetch
  "ConnectionRefused",
  "ConnectionClosed",
  "ConnectionResetByPeer",
  "ConnectionTimeout",
  "FailedToOpenSocket",
  "WouldBlock",
  // node / undici / libuv
  "ECONNREFUSED",
  "ECONNRESET",
  "ECONNABORTED",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENETDOWN",
  "EPIPE",
  "EAI_AGAIN",
  "ENOTFOUND",
  "EPROTO",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
  "UND_ERR_HEADERS_TIMEOUT"
]);
var asRecord = (value) => typeof value === "object" && value !== null ? value : null;
var str = (v) => typeof v === "string" && v.length > 0 ? v : null;
var num = (v) => typeof v === "number" ? v : null;
function isTransportError(err) {
  const rec = asRecord(err);
  if (!rec) return false;
  const name = str(rec.name);
  if (name === "AbortError") return false;
  if (name === "TimeoutError") return true;
  const code = str(rec.code);
  if (code && TRANSPORT_ERROR_CODES.has(code)) return true;
  const causeCode = str(asRecord(rec.cause)?.code);
  if (causeCode && TRANSPORT_ERROR_CODES.has(causeCode)) return true;
  if (name === "TypeError" && str(rec.message) === "fetch failed") return true;
  if ("path" in rec && "errno" in rec && code !== null) return true;
  return false;
}
function summarizeTransportError(err) {
  const rec = asRecord(err) ?? {};
  const cause = asRecord(rec.cause) ?? {};
  return {
    code: str(rec.code) ?? str(cause.code),
    errno: num(rec.errno) ?? num(cause.errno),
    syscall: str(rec.syscall) ?? str(cause.syscall),
    // Bun stores the request URL on `path`; node stores it nowhere useful.
    url: str(rec.path) ?? str(cause.path),
    name: str(rec.name),
    message: str(rec.message)
  };
}
function formatTransportError(summary) {
  const parts = [];
  if (summary.code) parts.push(`code=${summary.code}`);
  if (summary.syscall) parts.push(`syscall=${summary.syscall}`);
  if (summary.errno !== null) parts.push(`errno=${summary.errno}`);
  if (summary.url) parts.push(`url=${summary.url}`);
  if (parts.length === 0 && summary.message) parts.push(summary.message);
  return parts.join(" ");
}
var defaultTcpConnect = (host, port, family) => new Promise((resolve) => {
  let settled = false;
  const socket = net.connect({ host, port, family });
  const done = (ok) => {
    if (settled) return;
    settled = true;
    socket.destroy();
    resolve(ok);
  };
  socket.setTimeout(PROBE_TIMEOUT_MS);
  socket.once("connect", () => done(true));
  socket.once("timeout", () => done(false));
  socket.once("error", () => done(false));
});
var defaultDnsLookup = async (host) => {
  try {
    const result = await Promise.race([
      dnsPromises.lookup(host),
      new Promise(
        (_, reject) => setTimeout(() => reject(new Error("dns-timeout")), PROBE_TIMEOUT_MS)
      )
    ]);
    return Boolean(result);
  } catch {
    return false;
  }
};
var defaultInterfaces = () => {
  const out = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    if (addrs?.some((a) => !a.internal)) out.push(name);
  }
  return out;
};
function hostFromUrl(url) {
  if (!url) return null;
  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}
async function probeNetwork(deps = {}, dnsHosts = []) {
  const tcpConnect = deps.tcpConnect ?? defaultTcpConnect;
  const dnsLookup = deps.dnsLookup ?? defaultDnsLookup;
  const interfaces = deps.interfaces ?? defaultInterfaces;
  const results = await Promise.all(
    REACHABILITY_TARGETS.map(
      (t) => tcpConnect(t.host, HTTPS_PORT, t.family).then((ok) => ({
        family: t.family,
        ok
      }))
    )
  );
  const ipv4Reachable = results.some((r) => r.family === IP_FAMILY.v4 && r.ok);
  const ipv6Reachable = results.some((r) => r.family === IP_FAMILY.v6 && r.ok);
  const dnsResults = await Promise.all(dnsHosts.map((h) => dnsLookup(h)));
  return {
    ipReachable: ipv4Reachable || ipv6Reachable,
    ipv4Reachable,
    ipv6Reachable,
    dnsResolves: dnsHosts.length === 0 || dnsResults.some(Boolean),
    activeInterfaces: interfaces()
  };
}
var NETWORK_SCOPE = {
  githubCopilotAuth: "github-copilot-auth"
};
var NETWORK_DIAGNOSIS_KIND = {
  /** No raw IP egress at all — the host can't reach the public internet. */
  offline: "offline",
  /** IP egress works but name resolution fails (captive portal / broken VPN DNS). */
  dnsFailure: "dns-failure",
  /** IP + DNS both work, yet the request to its `scope` didn't complete. */
  scopeUnreachable: "scope-unreachable",
  /** Transport failed but the probe couldn't place it in a bucket. */
  unknown: "unknown"
};
function classifyNetworkFailure(summary, probe, scope = null) {
  if (!probe.ipReachable) {
    return { kind: NETWORK_DIAGNOSIS_KIND.offline, scope, summary, probe };
  }
  if (!probe.dnsResolves) {
    return { kind: NETWORK_DIAGNOSIS_KIND.dnsFailure, scope, summary, probe };
  }
  return {
    kind: NETWORK_DIAGNOSIS_KIND.scopeUnreachable,
    scope,
    summary,
    probe
  };
}
function formatDiagnosisForLog(diagnosis) {
  const { kind, scope, probe, summary } = diagnosis;
  const parts = [kind];
  if (scope) parts.push(`scope=${scope}`);
  parts.push(
    `ip=${probe.ipReachable ? "ok" : "down"}`,
    `dns=${probe.dnsResolves ? "ok" : "down"}`,
    `ifaces=${probe.activeInterfaces.length}`
  );
  const transport = formatTransportError(summary);
  if (transport) parts.push(transport);
  return parts.join(" ");
}
var lastDiagnosis = null;
var DIAGNOSIS_CACHE_MS = 6e4;
var setLastDiagnosis = (value, at) => {
  lastDiagnosis = { at, value };
};
async function diagnoseNetworkError(err, deps = {}) {
  const summary = summarizeTransportError(err);
  const scope = deps.target?.scope ?? null;
  const now = deps.now ?? Date.now;
  const cached = lastDiagnosis;
  if (cached && now() - cached.at < DIAGNOSIS_CACHE_MS) {
    return { ...cached.value, scope, summary };
  }
  const targetHost = hostFromUrl(deps.target?.url ?? summary.url);
  const probe = await probeNetwork(deps, targetHost ? [targetHost] : []);
  const value = classifyNetworkFailure(summary, probe, scope);
  setLastDiagnosis(value, now());
  return value;
}

// src/lib/net/network-hysteresis.ts
var NETWORK_BANNER_ONSET_MS = 2e4;
var NOTIFY_ON_RECONNECT_MS = 3e4;
var initialHysteresisState = {
  firstFailureAt: null,
  active: false
};
function step(prevState, rawDiagnosis, now) {
  if (rawDiagnosis === null) {
    const wasActive = prevState.firstFailureAt !== null;
    const notifyReconnect = wasActive && now - prevState.firstFailureAt > NOTIFY_ON_RECONNECT_MS;
    return {
      state: initialHysteresisState,
      bannerDiagnosis: null,
      notifyReconnect
    };
  }
  const firstFailureAt = prevState.firstFailureAt ?? now;
  const persistedForMs = now - firstFailureAt;
  const shouldShow = persistedForMs >= NETWORK_BANNER_ONSET_MS;
  return {
    state: { firstFailureAt, active: prevState.active || shouldShow },
    bannerDiagnosis: shouldShow ? rawDiagnosis : null,
    notifyReconnect: false
  };
}
var current = initialHysteresisState;
function advanceHysteresis(rawDiagnosis, now = Date.now()) {
  const result = step(current, rawDiagnosis, now);
  current = result.state;
  return result;
}

// src/lib/platform/open-url.ts
function isHeadless() {
  if (process.platform !== "linux") return false;
  return !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY;
}
function openUrl(url) {
  if (isHeadless()) return { ok: false, reason: "headless" };
  const cmd = launchArgs(url);
  if (!cmd) return { ok: false, reason: "spawn-failed" };
  try {
    const proc = Bun.spawn(cmd, {
      stdout: "ignore",
      stderr: "ignore",
      stdin: "ignore"
    });
    proc.unref();
    return { ok: true };
  } catch {
    return { ok: false, reason: "spawn-failed" };
  }
}
function launchArgs(url) {
  switch (process.platform) {
    case "darwin": {
      return ["open", url];
    }
    case "win32": {
      return ["cmd", "/c", "start", "", url];
    }
    case "linux": {
      return ["xdg-open", url];
    }
    default: {
      return null;
    }
  }
}

// src/services/github/get-copilot-token.ts
import consola4 from "consola";
import { z as z2 } from "zod";

// src/lib/errors/copilot-error-parser.ts
function parseCopilotErrorBody(body) {
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    return {
      message: body.trim() || "Copilot returned an error.",
      remediationUrl: findGithubUrl(body)
    };
  }
  const message = extractMessage(parsed) ?? "Copilot returned an error.";
  const remediationUrl = extractRemediationUrl(parsed) ?? findGithubUrl(body);
  return { message, remediationUrl };
}
function isAuthFatal(status, parsed) {
  if (status === 401) return true;
  if (status !== 403) return false;
  const text = `${parsed.message} ${parsed.remediationUrl ?? ""}`.toLowerCase();
  const markers = [
    "terms of service",
    "terms-of-service",
    "site/terms",
    "settings/copilot",
    "copilot/signup",
    "not entitled",
    "license revoked",
    "license has been",
    "subscription has been",
    "subscription required",
    "no copilot license",
    "accept the terms"
  ];
  return markers.some((m) => text.includes(m));
}
function nonEmpty(v) {
  return typeof v === "string" && v.trim() ? v : null;
}
function nestedMessage(obj, key) {
  const nested = obj[key];
  if (typeof nested === "object" && nested !== null) {
    return nonEmpty(nested.message);
  }
  return null;
}
function extractMessage(parsed) {
  if (typeof parsed !== "object" || parsed === null) return null;
  const obj = parsed;
  return nonEmpty(obj.message) ?? nestedMessage(obj, "notification") ?? nestedMessage(obj, "error") ?? nonEmpty(obj.error) ?? nonEmpty(obj.error_description);
}
function extractRemediationUrl(parsed) {
  if (typeof parsed !== "object" || parsed === null) return null;
  const obj = parsed;
  const candidates = [
    obj.documentation_url,
    obj.message_url,
    obj.url,
    obj.notification?.url
  ];
  for (const c of candidates) {
    if (typeof c === "string" && /^https?:\/\//.test(c)) return c;
  }
  return null;
}
function findGithubUrl(text) {
  const match = /https:\/\/github\.com\/[^\s"<>)]+/.exec(text);
  return match ? match[0] : null;
}

// src/lib/http/http-timeouts.ts
var COPILOT_TOKEN_TIMEOUT_MS = 3e4;
var GITHUB_API_TIMEOUT_MS = 15e3;
var DEVICE_POLL_TIMEOUT_MS = 15e3;
var UPDATE_MANIFEST_TIMEOUT_MS = 2e3;

// src/lib/http/send-request.ts
var ANTHROPIC_API_BASE_URL = "https://api.anthropic.com";
function isSameOrigin(url, baseUrl) {
  try {
    return new URL(url).origin === new URL(baseUrl).origin;
  } catch {
    return false;
  }
}
function attachHostAuth(url, headers, githubTokenOverride) {
  if (isSameOrigin(url, copilotBaseUrl(state))) {
    headers.set("authorization", `Bearer ${state.copilotToken}`);
    return;
  }
  if (isSameOrigin(url, getGitHubApiBaseUrl())) {
    const token = githubTokenOverride ?? state.githubToken;
    headers.set(
      "authorization",
      isOpencodeOauthApp() ? `Bearer ${token}` : `token ${token}`
    );
    return;
  }
  if (isSameOrigin(url, ANTHROPIC_API_BASE_URL)) {
    const key = getAnthropicApiKey();
    if (key) headers.set("x-api-key", key);
    return;
  }
}
function attachProviderAuth(providerConfig, headers) {
  if (providerConfig.authType === "authorization") {
    headers.set("authorization", `Bearer ${providerConfig.apiKey}`);
  } else {
    headers.set("x-api-key", providerConfig.apiKey);
  }
}
function dispatch(url, authorized, init) {
  const {
    timeoutMs,
    signal,
    headers: _headers,
    githubToken: _token,
    ...rest
  } = init;
  return fetch(url, {
    // codeql[js/file-access-to-http] -- by design, the SINGLE chokepoint: the
    // proxy reads its own 0o600 GitHub/Copilot token (or a configured provider
    // key) and forwards it upstream as Authorization. Same posture as
    // gh/aws/kubectl. Every authenticated fetch funnels here, so this is the
    // only suppression. See ADR-0001.
    ...rest,
    headers: authorized,
    signal: signal ?? (timeoutMs === void 0 ? void 0 : AbortSignal.timeout(timeoutMs))
  });
}
async function sendRequest(url, init = {}) {
  const merged = new Headers(init.headers);
  attachHostAuth(url, merged, init.githubToken);
  return dispatch(url, merged, init);
}
async function sendProviderRequest(providerConfig, url, init = {}) {
  const merged = new Headers(init.headers);
  attachProviderAuth(providerConfig, merged);
  return dispatch(url, merged, init);
}
async function sendRequestJson(url, init, schema) {
  const { errorMessage, ...rest } = init;
  const response = await sendRequest(url, rest);
  if (!response.ok) throw new HTTPError(errorMessage, response);
  return schema.parse(await response.json());
}

// src/services/github/get-copilot-token.ts
var DEFAULT_REFRESH_IN_SECONDS = 1500;
var CopilotTokenResponseSchema = z2.object({
  expires_at: z2.number().catch(0),
  refresh_in: z2.number().nonnegative().catch(DEFAULT_REFRESH_IN_SECONDS),
  token: z2.string(),
  // The authoritative completion host for THIS token. GitHub can migrate an
  // account between hosts (e.g. individual → enterprise on a plan/billing
  // change); the bearer minted here is only valid against its own
  // `endpoints.api`, and POSTing it elsewhere is rejected with 421
  // Misdirected Request. We re-read this on every mint/refresh so the host
  // self-heals — and tolerate its absence, since callers already treat a
  // missing host as "keep the current one".
  endpoints: z2.object({ api: z2.string().optional() }).loose().optional().catch(void 0)
}).loose();
var getCopilotToken = async () => {
  const response = await sendRequest(getCopilotTokenUrl(), {
    headers: githubHeaders(),
    timeoutMs: COPILOT_TOKEN_TIMEOUT_MS
  });
  if (!response.ok) {
    const errorText = await response.clone().text();
    consola4.error("Failed to get Copilot token response body", errorText);
    if (response.status === 401 || response.status === 403) {
      const parsed = parseCopilotErrorBody(errorText);
      const who = state.userName ?? "your account";
      const friendlyMessage = response.status === 401 ? `GitHub rejected ${who}'s token \u2014 it may be expired or revoked. Run \`gh auth login\` and try again, or sign in with a code.` : `${who} doesn't have access to GitHub Copilot. Pick another account with an active Copilot subscription, or sign in with a code.`;
      throw new CopilotAuthFatalError(
        friendlyMessage,
        response.status,
        parsed.remediationUrl
      );
    }
    throw new HTTPError("Failed to get Copilot token", response);
  }
  return CopilotTokenResponseSchema.parse(await response.json());
};

// src/services/github/get-device-code.ts
import { z as z3 } from "zod";
var DeviceCodeResponseSchema = z3.object({
  device_code: z3.string(),
  user_code: z3.string(),
  verification_uri: z3.string(),
  /** RFC 8628 pre-filled URL with user_code in the query string. GitHub
   *  doesn't always populate it; callers fall back to composing the URL from
   *  `verification_uri` + `user_code`. */
  verification_uri_complete: z3.string().optional(),
  expires_in: z3.number().nonnegative().catch(900),
  interval: z3.number().nonnegative().catch(5)
}).loose();
async function getDeviceCode() {
  const { clientId, headers, scope } = getOauthAppConfig();
  const { deviceCodeUrl } = getOauthUrls();
  return await sendRequestJson(
    deviceCodeUrl,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        client_id: clientId,
        scope
      }),
      timeoutMs: GITHUB_API_TIMEOUT_MS,
      errorMessage: "Failed to get device code"
    },
    DeviceCodeResponseSchema
  );
}

// src/services/github/get-user.ts
import { z as z4 } from "zod";
async function getGitHubUser(githubToken) {
  const resolvedGithubToken = githubToken ?? state.githubToken;
  if (!resolvedGithubToken) {
    throw new Error("GitHub token not found");
  }
  return await sendRequestJson(
    `${getGitHubApiBaseUrl()}/user`,
    {
      githubToken: resolvedGithubToken,
      headers: githubUserHeaders(),
      timeoutMs: GITHUB_API_TIMEOUT_MS,
      errorMessage: "Failed to get GitHub user"
    },
    GithubUserResponseSchema
  );
}
var GithubUserResponseSchema = z4.object({
  login: z4.string(),
  avatar_url: z4.string().optional()
}).loose();

// src/services/github/poll-access-token.ts
import consola5 from "consola";
import { z as z5 } from "zod";
var SLOW_DOWN_BUMP_SECONDS = 5;
var MAX_CONSECUTIVE_TRANSPORT_ERRORS = 12;
var PollResponseBodySchema = z5.object({
  access_token: z5.string().optional(),
  token_type: z5.string().optional(),
  scope: z5.string().optional(),
  // Present ONLY when the GitHub App has "expiring user tokens" enabled. When
  // present, access_token is a short-lived ghu_ that must be renewed via
  // refresh_token before expiry (see refresh-access-token.ts). Absent → the
  // token never expires and there's nothing to renew.
  refresh_token: z5.string().optional(),
  expires_in: z5.number().nonnegative().optional(),
  refresh_token_expires_in: z5.number().nonnegative().optional(),
  error: z5.string().optional(),
  error_description: z5.string().optional(),
  error_uri: z5.string().optional(),
  interval: z5.number().nonnegative().optional()
}).loose();
function toDeviceTokenResult(body, nowMs = Date.now()) {
  return {
    accessToken: body.access_token ?? "",
    refreshToken: body.refresh_token ?? null,
    accessTokenExpiresAt: typeof body.expires_in === "number" ? nowMs + body.expires_in * 1e3 : null,
    refreshTokenExpiresAt: typeof body.refresh_token_expires_in === "number" ? nowMs + body.refresh_token_expires_in * 1e3 : null
  };
}
function abortError() {
  return new DOMException("Device-code poll aborted", "AbortError");
}
function pollRequestSignal(signal) {
  const timeout = AbortSignal.timeout(DEVICE_POLL_TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}
function interpretPollBody(body, intervalSeconds) {
  if (typeof body.access_token === "string" && body.access_token) {
    return { kind: "token", result: toDeviceTokenResult(body) };
  }
  switch (body.error) {
    case "authorization_pending": {
      return { kind: "retry" };
    }
    case "slow_down": {
      const nextInterval = typeof body.interval === "number" && body.interval > intervalSeconds ? body.interval + 1 : intervalSeconds + SLOW_DOWN_BUMP_SECONDS;
      consola5.debug(`Server asked for slow_down \u2192 ${nextInterval}s`);
      return { kind: "retry", nextInterval };
    }
    case "expired_token": {
      throw new Error("Device code expired before authorization. Re-run setup.");
    }
    case "access_denied": {
      throw new Error("Authorization denied by the user.");
    }
    case void 0: {
      consola5.warn("Device-code poll: empty response, retrying");
      return { kind: "retry" };
    }
    default: {
      throw new Error(
        `Device-code poll failed: ${body.error}${body.error_description ? ` \u2014 ${body.error_description}` : ""}`
      );
    }
  }
}
async function pollAccessToken(deviceCode, signal) {
  const { clientId, headers } = getOauthAppConfig();
  const { accessTokenUrl } = getOauthUrls();
  let intervalSeconds = deviceCode.interval + 1;
  consola5.debug(`Polling access token at ${intervalSeconds}s interval`);
  const deadlineMs = Date.now() + deviceCode.expires_in * 1e3;
  let consecutiveTransportErrors = 0;
  while (true) {
    if (signal?.aborted) throw abortError();
    if (Date.now() >= deadlineMs) throw new Error("expired_token");
    await abortableSleep(intervalSeconds * 1e3, signal);
    if (signal?.aborted) throw abortError();
    let response;
    try {
      response = await sendRequest(accessTokenUrl, {
        method: "POST",
        headers,
        signal: pollRequestSignal(signal),
        body: JSON.stringify({
          client_id: clientId,
          device_code: deviceCode.device_code,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code"
        })
      });
    } catch (err) {
      if (signal?.aborted) throw abortError();
      consecutiveTransportErrors++;
      if (consecutiveTransportErrors >= MAX_CONSECUTIVE_TRANSPORT_ERRORS) {
        throw new Error(
          "Device-code poll: network unreachable after repeated attempts. Check your connection and re-run setup.",
          { cause: err }
        );
      }
      consola5.warn("Device-code poll: network error, retrying", err);
      continue;
    }
    consecutiveTransportErrors = 0;
    let raw;
    try {
      raw = await response.json();
    } catch {
      consola5.warn(
        `Device-code poll: non-JSON response (HTTP ${response.status}), retrying`
      );
      continue;
    }
    const parsed = PollResponseBodySchema.safeParse(raw);
    if (!parsed.success) {
      consola5.warn(
        `Device-code poll: unexpected response shape (HTTP ${response.status}), retrying`
      );
      continue;
    }
    consola5.debug("Device-code poll response:", parsed.data);
    const outcome = interpretPollBody(parsed.data, intervalSeconds);
    if (outcome.kind === "token") return outcome.result;
    if (outcome.nextInterval !== void 0)
      intervalSeconds = outcome.nextInterval;
  }
}

// src/lib/auth/token.ts
var log = createTeeLogger("auth");
var clearActiveNeedsReauthInRegistry = clearActiveNeedsReauthInDefaultRegistry;
var clearActiveNeedsReauth = () => {
  void clearActiveNeedsReauthInRegistry().catch((err) => {
    log.warn("Couldn't clear needs-reauth flag after a successful mint:", err);
  });
};
var getCopilotToken2 = getCopilotToken;
var markAuthDegraded2 = markAuthDegraded;
var copilotRefreshLoopController = null;
var applyCopilotApiUrl = (api) => {
  if (!api) return;
  const host = toCopilotHost(api);
  if (!host) {
    log.warn(`Ignoring malformed Copilot API host from discovery: ${api}`);
    return;
  }
  if (host === state.copilotApiUrl) return;
  log.debug(`Copilot API host -> ${host}`);
  state.copilotApiUrl = host;
};
var stopCopilotRefreshLoop = () => {
  if (!copilotRefreshLoopController) {
    return;
  }
  copilotRefreshLoopController.abort();
  copilotRefreshLoopController = null;
};
var setupCopilotToken = async (opts) => {
  const githubToken = state.githubToken;
  if (githubToken && inferTokenType(githubToken) === "gho_") {
    setCopilotToken(githubToken);
    clearActiveNeedsReauth();
    log.debug("Using gho_ token directly as Copilot bearer; no refresh");
    if (state.showToken) {
      consola6.info("Copilot token:", state.copilotToken);
    }
    stopCopilotRefreshLoop();
    return;
  }
  let token;
  let refresh_in;
  let expiresAtMs;
  try {
    const result = await getCopilotToken2();
    token = result.token;
    refresh_in = result.refresh_in;
    expiresAtMs = resolveCopilotExpiryMs(result.expires_at, result.refresh_in);
    applyCopilotApiUrl(result.endpoints?.api);
  } catch (error) {
    if (error instanceof CopilotAuthFatalError) {
      log.warn(
        "Copilot rejected the GitHub token at first mint:",
        error.message
      );
      if (opts?.onAuthFatal !== "throw") {
        await markAuthDegraded2(error);
      }
      throw error;
    }
    if (isTransportError(error)) {
      await logRefreshFailure("Copilot token mint failed", error);
    }
    throw error;
  }
  setCopilotToken(token, expiresAtMs);
  clearActiveNeedsReauth();
  log.debug("GitHub Copilot Token fetched successfully!");
  if (state.showToken) {
    consola6.info("Copilot token:", token);
  }
  stopCopilotRefreshLoop();
  const controller = new AbortController();
  copilotRefreshLoopController = controller;
  runCopilotRefreshLoop(refresh_in, controller.signal).catch((err) => {
    log.error("Copilot token refresh loop crashed unexpectedly:", err);
  }).finally(() => {
    if (copilotRefreshLoopController === controller) {
      copilotRefreshLoopController = null;
    }
  });
};
var REFRESH_POLL_INTERVAL_MS = 15e3;
var EARLY_REFRESH_BUFFER_MS = 6e4;
var RETRY_REFRESH_DELAY_MS = 15e3;
var MIN_REFRESH_DELAY_MS = 1e3;
var maxFatalRefreshRetries = 3;
var getRefreshDeadlineMs = (refreshIn, nowMs = Date.now()) => nowMs + Math.max(refreshIn * 1e3 - EARLY_REFRESH_BUFFER_MS, MIN_REFRESH_DELAY_MS);
var MAX_PLAUSIBLE_TOKEN_TTL_MS = 24 * 60 * 60 * 1e3;
var REFRESH_TO_EXPIRY_SLACK_MS = 3e5;
var resolveCopilotExpiryMs = (expiresAtSeconds, refreshIn, nowMs = Date.now()) => {
  const absoluteMs = expiresAtSeconds * 1e3;
  const impliedTtlMs = absoluteMs - nowMs;
  if (impliedTtlMs > 0 && impliedTtlMs <= MAX_PLAUSIBLE_TOKEN_TTL_MS) {
    return absoluteMs;
  }
  return nowMs + refreshIn * 1e3 + REFRESH_TO_EXPIRY_SLACK_MS;
};
var getRefreshPollDelayMs = (refreshAtMs, nowMs = Date.now()) => Math.min(Math.max(refreshAtMs - nowMs, 0), REFRESH_POLL_INTERVAL_MS);
var runCopilotRefreshLoop = async (refreshIn, signal) => {
  let refreshAtMs = getRefreshDeadlineMs(refreshIn);
  let fatalRetries = 0;
  let staleAnnounced = false;
  while (!signal.aborted) {
    const nextDelayMs = getRefreshPollDelayMs(refreshAtMs);
    if (nextDelayMs > 0) {
      try {
        await delay(nextDelayMs, void 0, { signal });
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") break;
        throw err;
      }
      continue;
    }
    log.debug("Refreshing Copilot token");
    try {
      const { token, refresh_in, expires_at, endpoints } = await getCopilotToken2();
      setCopilotToken(token, resolveCopilotExpiryMs(expires_at, refresh_in));
      applyCopilotApiUrl(endpoints?.api);
      refreshAtMs = getRefreshDeadlineMs(refresh_in);
      if (fatalRetries > 0) clearActiveNeedsReauth();
      fatalRetries = 0;
      staleAnnounced = false;
      noteAuthSuccess();
      log.debug("Copilot token refreshed");
      noteConnectivityRecovered();
      if (state.showToken) {
        consola6.info("Refreshed Copilot token:", token);
      }
    } catch (error) {
      if (error instanceof CopilotAuthFatalError) {
        fatalRetries++;
        noteCopilotRefreshFailure(error.message);
        if (fatalRetries < maxFatalRefreshRetries) {
          log.warn(
            `Copilot rejected the GitHub token on refresh (attempt ${fatalRetries}/${maxFatalRefreshRetries}); retrying in ${RETRY_REFRESH_DELAY_MS / 1e3}s before treating it as fatal:`,
            error.message
          );
          refreshAtMs = Date.now() + RETRY_REFRESH_DELAY_MS;
          staleAnnounced = announceIfStale(staleAnnounced);
          continue;
        }
        log.warn(
          `Copilot persistently rejected the GitHub token (${fatalRetries} attempts); degrading without deleting the credential:`,
          error.message
        );
        noteConnectivityRecovered();
        await markAuthDegraded2(error);
        return;
      }
      const diagnosis = await logRefreshFailure(
        "Failed to refresh Copilot token",
        error
      );
      noteCopilotRefreshFailure(describeRefreshFailure(diagnosis, error));
      noteConnectivityFailure(diagnosis);
      refreshAtMs = Date.now() + RETRY_REFRESH_DELAY_MS;
      log.warn(
        `Retrying Copilot token refresh in ${RETRY_REFRESH_DELAY_MS / 1e3}s`
      );
      staleAnnounced = announceIfStale(staleAnnounced);
    }
  }
};
function describeRefreshFailure(diagnosis, error) {
  if (diagnosis) return formatDiagnosisForLog(diagnosis);
  return error instanceof Error ? error.message : String(error);
}
function announceIfStale(alreadyAnnounced) {
  if (alreadyAnnounced || copilotTokenHealth() !== CREDENTIAL_HEALTH.expired) {
    return alreadyAnnounced;
  }
  const { consecutiveFailures, lastFailureReason } = copilotRefreshHealth();
  log.error(
    `Copilot token is now PAST ITS EXPIRY and the refresh is still failing after ${consecutiveFailures} attempt(s) \u2014 requests will be failed locally (503) instead of sent with a dead credential: ${lastFailureReason ?? "unknown"}`
  );
  return true;
}
async function logRefreshFailure(label, error) {
  if (!isTransportError(error)) {
    log.error(`${label}:`, error);
    return null;
  }
  try {
    const diag = await diagnoseNetworkError(error, {
      target: {
        scope: NETWORK_SCOPE.githubCopilotAuth,
        url: getCopilotTokenUrl()
      }
    });
    log.warn(`${label}: ${formatDiagnosisForLog(diag)}`);
    return diag;
  } catch {
    log.warn(
      `${label}: ${formatTransportError(summarizeTransportError(error))}`
    );
    return null;
  }
}
function noteConnectivityFailure(diagnosis, now = Date.now()) {
  if (!diagnosis) return;
  try {
    const { bannerDiagnosis } = advanceHysteresis(
      diagnosis,
      now
    );
    setNetworkDiagnosis(
      bannerDiagnosis ? { kind: bannerDiagnosis.kind, scope: bannerDiagnosis.scope } : null
    );
  } catch (err) {
    log.warn("Couldn't update network-diagnosis banner signal:", err);
  }
}
function noteConnectivityRecovered(now = Date.now()) {
  try {
    const { notifyReconnect } = advanceHysteresis(null, now);
    clearNetworkDiagnosis();
    if (notifyReconnect) {
      emitAuthChangedWithReconnect();
    }
  } catch (err) {
    log.warn("Couldn't clear network-diagnosis banner signal:", err);
  }
}
function presentDeviceCode(response, options) {
  const verificationUrl = response.verification_uri_complete ?? response.verification_uri;
  let copiedToClipboard = false;
  try {
    clipboard.writeSync(response.user_code);
    copiedToClipboard = true;
  } catch {
  }
  consola6.info(
    copiedToClipboard ? `Code ${response.user_code} copied to clipboard \u2014 paste into the form, then approve.` : `Open the form, then enter code: ${response.user_code}`
  );
  if (!options?.noBrowser && !isHeadless()) {
    const opened = openUrl(verificationUrl);
    if (opened.ok) {
      log.info(`(Opened ${verificationUrl} in your browser.)`);
    } else {
      log.info(
        `(Couldn't open the browser automatically. Visit ${verificationUrl} manually.)`
      );
    }
  } else {
    log.info(`Visit ${verificationUrl} in any browser.`);
  }
}
async function setupGitHubToken(options) {
  try {
    const existing = await readDefaultRecord();
    if (existing && !options?.force) {
      setGithubToken(existing.accessToken);
      if (state.showToken) {
        consola6.info("GitHub token:", existing.accessToken);
      }
      await logUser();
      return;
    }
    log.info("Not logged in, requesting a new device code");
    const response = await getDeviceCode();
    log.debug("Device code response:", response);
    presentDeviceCode(response, options);
    const tokens = await pollAccessToken(response);
    const token = tokens.accessToken;
    setGithubToken(token);
    if (state.showToken) {
      consola6.info("GitHub token:", token);
    }
    let login = null;
    try {
      const user = await getGitHubUser(token);
      login = user.login;
      setUserName(user.login);
    } catch (error) {
      log.warn(
        "Couldn't fetch GitHub user; saving the account as 'unknown'.",
        error
      );
    }
    await addAccountToDefaultRegistry(
      makeAccountRecord({
        login: login ?? "unknown",
        host: currentGitHubHost(),
        token,
        addedVia: "device-code",
        refreshToken: tokens.refreshToken,
        accessTokenExpiresAt: tokens.accessTokenExpiresAt,
        refreshTokenExpiresAt: tokens.refreshTokenExpiresAt
      })
    );
    log.info(`Logged in as ${login ?? "(unknown)"}`);
  } catch (error) {
    if (error instanceof HTTPError) {
      log.error("Failed to get GitHub token:", await readErrorBody(error));
      throw error;
    }
    log.error("Failed to get GitHub token:", error);
    throw error;
  }
}
async function readErrorBody(error) {
  let text;
  try {
    text = await error.response.text();
  } catch {
    return `<unreadable ${error.response.status} body>`;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
async function logUser() {
  const user = await getGitHubUser();
  setUserName(user.login);
  log.info(`Logged in as ${user.login}`);
  return user.avatar_url;
}
var GITHUB_TOKEN_PATH = PATHS.GITHUB_TOKEN_PATH;

// src/lib/auth/copilot-online-retry.ts
var log2 = createTeeLogger("auth");
var RETRY_DELAY_MS = 15e3;
var setupCopilotTokenOverride = null;
var cacheModelsOverride = null;
var retryController = null;
var stopCopilotOnlineRetry = () => {
  if (!retryController) return;
  retryController.abort();
  retryController = null;
};
var scheduleCopilotOnlineRetry = (opts = {}) => {
  stopCopilotOnlineRetry();
  const controller = new AbortController();
  retryController = controller;
  runOnlineRetryLoop(controller.signal, opts).catch((err) => {
    log2.error("Copilot online-retry loop crashed unexpectedly:", err);
  }).finally(() => {
    if (retryController === controller) {
      retryController = null;
    }
  });
};
var runOnlineRetryLoop = async (signal, opts) => {
  const retryDelayMs = opts.retryDelayMs ?? RETRY_DELAY_MS;
  const setupCopilotToken2 = setupCopilotTokenOverride ?? setupCopilotToken;
  const cacheModels2 = cacheModelsOverride ?? cacheModels;
  while (!signal.aborted) {
    if (!hasGithubToken()) {
      log2.debug("Copilot online-retry: no GitHub token; stopping");
      return;
    }
    try {
      await delay2(retryDelayMs, void 0, { signal });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      throw err;
    }
    if (!hasGithubToken()) return;
    try {
      log2.info(
        "Retrying Copilot token mint after a transient first-mint failure"
      );
      await setupCopilotToken2();
    } catch (err) {
      if (err instanceof CopilotAuthFatalError) {
        log2.warn(
          "Copilot online-retry: mint is auth-fatal; stopping:",
          err.message
        );
        return;
      }
      log2.warn(
        `Copilot online-retry: mint still failing; retrying in ${retryDelayMs / 1e3}s`
      );
      continue;
    }
    if (!hasGithubToken()) {
      stopCopilotRefreshLoop();
      clearTokenTrio({ copilot: true });
      return;
    }
    try {
      await cacheModels2();
    } catch (err) {
      log2.warn(
        "Copilot online-retry: token minted but priming the models cache failed (best-effort; will self-heal on demand):",
        err
      );
    }
    log2.info("Copilot came online after a retry");
    opts.onOnline?.();
    return;
  }
};

// src/services/github/refresh-access-token.ts
import consola7 from "consola";
import { z as z6 } from "zod";
var RefreshResponseSchema = z6.object({
  access_token: z6.string().optional(),
  refresh_token: z6.string().optional(),
  expires_in: z6.number().nonnegative().optional(),
  refresh_token_expires_in: z6.number().nonnegative().optional(),
  error: z6.string().optional(),
  error_description: z6.string().optional()
}).loose();
async function refreshAccessToken(refreshToken) {
  const { clientId, headers } = getOauthAppConfig();
  const { accessTokenUrl } = getOauthUrls();
  const response = await sendRequest(accessTokenUrl, {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(GITHUB_API_TIMEOUT_MS),
    body: JSON.stringify({
      client_id: clientId,
      grant_type: "refresh_token",
      refresh_token: refreshToken
    })
  });
  let raw;
  try {
    raw = await response.json();
  } catch {
    throw new Error(
      `GitHub refresh-token grant returned a non-JSON response (HTTP ${response.status})`
    );
  }
  const parsed = RefreshResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("GitHub refresh-token grant: unexpected response shape");
  }
  if (!parsed.data.access_token) {
    const reason = parsed.data.error_description ?? parsed.data.error ?? "no access_token";
    throw new Error(`GitHub refresh-token grant failed: ${reason}`);
  }
  consola7.debug("GitHub access token renewed via the refresh grant");
  return toDeviceTokenResult(parsed.data);
}

// src/lib/auth/auth-controller.ts
var log3 = createTeeLogger("auth");
var pollAccessToken2 = pollAccessToken;
var addAccount = addAccountToDefaultRegistry;
var deactivateActiveAccount = deactivateActiveInDefaultRegistry;
var markActiveNeedsReauth = markActiveNeedsReauthInDefaultRegistry;
var renewGithubToken = defaultRenewGithubToken;
function captureResumeTarget(existing) {
  if (existing) return existing.resume;
  return authState.kind === "signed-in" ? {
    login: authState.login,
    avatarUrl: authState.avatarUrl,
    connectedSinceMs: authState.connectedSinceMs
  } : null;
}
var authState = { kind: "signed-out" };
function setAuthState(next) {
  authState = next;
  emitAuthChanged();
}
function currentFlow() {
  return authState.kind === "device-issued" || authState.kind === "polling" ? authState.flow : null;
}
function isFlowExpired(flow, nowMs = Date.now()) {
  return flow.expiresAt <= nowMs;
}
function authenticatedExtras(source) {
  return {
    ...source.avatarUrl ? { account_avatar_url: source.avatarUrl } : {},
    ...source.connectedSinceMs ? { connected_since: new Date(source.connectedSinceMs).toISOString() } : {}
  };
}
function getAuthStatus() {
  const rejection = state.lastUpstreamRejection;
  const rejectionPayload = rejection ? {
    last_upstream_rejection: {
      message: rejection.message,
      status: rejection.status,
      at: rejection.at,
      ...rejection.remediationUrl ? { remediation_url: rejection.remediationUrl } : {}
    }
  } : {};
  const diagnosis = state.networkDiagnosis;
  const networkPayload = diagnosis ? { network_diagnosis: { kind: diagnosis.kind, scope: diagnosis.scope } } : {};
  switch (authState.kind) {
    case "signed-in": {
      return {
        state: "authenticated",
        account_login: authState.login,
        account_type: state.accountType,
        ...authenticatedExtras(authState),
        ...rejectionPayload,
        ...networkPayload
      };
    }
    case "error": {
      return {
        state: "error",
        error: authState.message,
        ...authState.remediationUrl ? { remediation_url: authState.remediationUrl } : {}
      };
    }
    case "device-issued":
    case "polling": {
      const flow = authState.flow;
      if (isFlowExpired(flow)) {
        if (flow.resume) {
          return {
            state: "authenticated",
            account_login: flow.resume.login,
            account_type: state.accountType,
            ...authenticatedExtras(flow.resume),
            ...rejectionPayload,
            ...networkPayload
          };
        }
        return {
          state: "unauthenticated",
          ...rejectionPayload,
          ...networkPayload
        };
      }
      return {
        state: authState.kind === "polling" ? "polling" : "device_code_issued",
        user_code: flow.deviceCode.user_code,
        verification_uri: flow.deviceCode.verification_uri,
        expires_at: new Date(flow.expiresAt).toISOString()
      };
    }
    case "signed-out": {
      return {
        state: "unauthenticated",
        ...rejectionPayload,
        ...networkPayload
      };
    }
    default: {
      authState;
      return {
        state: "unauthenticated",
        ...rejectionPayload,
        ...networkPayload
      };
    }
  }
}
registerAuthStatusProjector(getAuthStatus);
async function startDeviceFlow() {
  const existing = currentFlow();
  if (existing && !isFlowExpired(existing)) {
    return {
      state: "device_code_issued",
      user_code: existing.deviceCode.user_code,
      verification_uri: existing.deviceCode.verification_uri,
      expires_at: new Date(existing.expiresAt).toISOString()
    };
  }
  const resume = captureResumeTarget(existing);
  if (existing) {
    existing.abort.abort();
  }
  const deviceCode = await getDeviceCode();
  const abort = new AbortController();
  const flow = {
    deviceCode,
    expiresAt: Date.now() + deviceCode.expires_in * 1e3,
    abort,
    resume
  };
  authState = { kind: "device-issued", flow };
  runPoller(flow).catch((err) => {
    log3.error("Auth-controller poller crashed unexpectedly:", err);
  });
  emitAuthChanged();
  return {
    state: "device_code_issued",
    user_code: deviceCode.user_code,
    verification_uri: deviceCode.verification_uri,
    expires_at: new Date(flow.expiresAt).toISOString()
  };
}
function cancelDeviceFlow() {
  const flow = currentFlow();
  if (!flow) return getAuthStatus();
  flow.abort.abort();
  setAuthState(
    flow.resume ? {
      kind: "signed-in",
      login: flow.resume.login,
      avatarUrl: flow.resume.avatarUrl,
      connectedSinceMs: flow.resume.connectedSinceMs
    } : { kind: "signed-out" }
  );
  return getAuthStatus();
}
function flowFailureState(flow, fallbackError) {
  return flow.resume ? {
    kind: "signed-in",
    login: flow.resume.login,
    avatarUrl: flow.resume.avatarUrl,
    connectedSinceMs: flow.resume.connectedSinceMs
  } : { kind: "error", ...fallbackError };
}
async function runPoller(flow) {
  if (flow.abort.signal.aborted) return;
  setAuthState({ kind: "polling", flow });
  try {
    const tokens = await pollAccessToken2(flow.deviceCode, flow.abort.signal);
    const token = tokens.accessToken;
    if (flow.abort.signal.aborted) return;
    let login;
    let avatarUrl;
    try {
      const user = await getGitHubUser(token);
      login = user.login;
      avatarUrl = user.avatar_url;
      setUserName(user.login);
    } catch (err) {
      if (flow.abort.signal.aborted) return;
      const message = err instanceof Error ? err.message : String(err);
      log3.warn(
        "Auth-controller: failed to verify GitHub account after sign-in:",
        message
      );
      setAuthState(
        flowFailureState(flow, {
          message: "Couldn't verify your GitHub account. Try signing in again.",
          remediationUrl: null
        })
      );
      return;
    }
    if (flow.abort.signal.aborted) return;
    await addAccount(
      makeAccountRecord({
        login,
        host: currentGitHubHost(),
        token,
        addedVia: "device-code",
        refreshToken: tokens.refreshToken,
        accessTokenExpiresAt: tokens.accessTokenExpiresAt,
        refreshTokenExpiresAt: tokens.refreshTokenExpiresAt
      })
    );
    setGithubToken(token);
    let copilotMinted = false;
    try {
      await setupCopilotToken();
      copilotMinted = true;
    } catch (err) {
      if (err instanceof CopilotAuthFatalError) {
        return;
      }
      log3.warn(
        "Auth-controller: Copilot token mint failed transiently after sign-in; scheduling a background retry:",
        err
      );
      scheduleCopilotOnlineRetry();
    }
    if (flow.abort.signal.aborted) return;
    try {
      await cacheModels();
    } catch (err) {
      log3.warn("Auth-controller: failed to cache models after sign-in:", err);
    }
    if (copilotMinted) stopCopilotOnlineRetry();
    setAuthState({
      kind: "signed-in",
      login,
      avatarUrl,
      connectedSinceMs: Date.now()
    });
  } catch (err) {
    if (flow.abort.signal.aborted) return;
    const message = err instanceof Error ? err.message : String(err);
    setAuthState(flowFailureState(flow, { message, remediationUrl: null }));
    log3.warn("Auth-controller: device-code poll terminated:", message);
  }
}
function markSignedIn(login, avatarUrl) {
  stopCopilotOnlineRetry();
  noteAuthSuccess();
  setAuthState({
    kind: "signed-in",
    login,
    avatarUrl,
    connectedSinceMs: Date.now()
  });
}
function markSignedOut() {
  setAuthState({ kind: "signed-out" });
}
async function signOut() {
  const flow = currentFlow();
  if (flow) {
    flow.abort.abort();
  }
  stopCopilotOnlineRetry();
  clearTokenTrio();
  clearLastUpstreamRejection();
  clearNetworkDiagnosis();
  setAuthState({ kind: "signed-out" });
  try {
    await deactivateActiveAccount();
  } catch (err) {
    log3.warn("Auth-controller: failed to update account registry:", err);
  }
  try {
    const fs3 = await import("fs/promises");
    await fs3.unlink(PATHS.GITHUB_TOKEN_PATH);
  } catch (err) {
    if (typeof err === "object" && err !== null && "code" in err && err.code !== "ENOENT") {
      log3.warn("Auth-controller: failed to delete token file:", err);
    }
  }
}
var autoRecover = null;
var degradeInFlight = null;
var lastAuthSuccessMs = 0;
var RECOVERY_GRACE_MS = 3e3;
function registerAutoRecovery(fn) {
  autoRecover = fn;
}
function noteAuthSuccess() {
  lastAuthSuccessMs = Date.now();
}
var rearmInFlight = null;
function rearmCopilotAuth() {
  if (rearmInFlight) return rearmInFlight;
  rearmInFlight = runRearm().finally(() => {
    rearmInFlight = null;
  });
  return rearmInFlight;
}
async function runRearm() {
  const githubToken = state.githubToken;
  if (!githubToken) return "auth_fatal";
  if (inferTokenType(githubToken) === "gho_") return "auth_fatal";
  const first = await attemptMint();
  if (first !== "auth_fatal") {
    return first === "online" ? finishRearmOnline() : first;
  }
  if (!await renewGithubToken()) return "auth_fatal";
  const second = await attemptMint();
  return second === "online" ? finishRearmOnline() : second;
}
async function attemptMint() {
  try {
    await setupCopilotToken({ onAuthFatal: "throw" });
    return "online";
  } catch (err) {
    if (err instanceof CopilotAuthFatalError) return "auth_fatal";
    log3.warn("Copilot token re-mint failed; treating as offline:", err);
    return "offline";
  }
}
function finishRearmOnline() {
  if (state.userName) {
    markSignedIn(state.userName);
  } else {
    noteAuthSuccess();
  }
  return "online";
}
async function defaultRenewGithubToken() {
  let registry;
  try {
    registry = await readDefaultRegistry();
  } catch (err) {
    log3.warn("Auth-controller: couldn't read the registry to renew:", err);
    return false;
  }
  const rec = registry.activeKey ? registry.accounts[registry.activeKey] : null;
  if (!rec?.refreshToken) return false;
  let renewed;
  try {
    renewed = await refreshAccessToken(rec.refreshToken);
  } catch (err) {
    log3.warn("Auth-controller: GitHub token renewal failed:", err);
    return false;
  }
  setGithubToken(renewed.accessToken);
  try {
    await addAccount(
      makeAccountRecord({
        login: rec.login,
        host: rec.host,
        token: renewed.accessToken,
        addedVia: rec.addedVia,
        // Persist the ROTATED refresh token; fall back to the old one only if
        // GitHub didn't return a new one.
        refreshToken: renewed.refreshToken ?? rec.refreshToken,
        accessTokenExpiresAt: renewed.accessTokenExpiresAt,
        refreshTokenExpiresAt: renewed.refreshTokenExpiresAt
      })
    );
  } catch (err) {
    log3.warn(
      "Auth-controller: renewed the GitHub token but couldn't persist it:",
      err
    );
  }
  log3.info("Auth-controller: renewed the GitHub token via its refresh token");
  return true;
}
function markAuthDegraded(error) {
  if (degradeInFlight) return degradeInFlight;
  if (Date.now() - lastAuthSuccessMs < RECOVERY_GRACE_MS)
    return Promise.resolve();
  degradeInFlight = runDegrade(error).finally(() => {
    degradeInFlight = null;
  });
  return degradeInFlight;
}
async function runDegrade(error) {
  const flow = currentFlow();
  if (flow) {
    flow.abort.abort();
  }
  stopCopilotRefreshLoop();
  stopCopilotOnlineRetry();
  clearTokenTrio();
  if (authState.kind === "error" && authState.message === error.message) {
    return;
  }
  try {
    await markActiveNeedsReauth({
      status: error.status,
      message: error.message,
      at: (/* @__PURE__ */ new Date()).toISOString()
    });
    log3.warn(
      `Auth degraded \u2014 active account flagged needs-reauth (status ${error.status}): ${error.message}`
    );
  } catch (err) {
    log3.warn(
      "Auth-controller: failed to flag account needs-reauth (credential retained):",
      err
    );
  }
  if (autoRecover) {
    try {
      const recovered = await autoRecover();
      if (recovered) {
        log3.info(
          "Auto-recovered onto a known-good account; no sign-out required."
        );
        return;
      }
    } catch (err) {
      log3.warn("Auth-controller: auto-recovery sweep failed:", err);
    }
  }
  setAuthState({
    kind: "error",
    message: error.message,
    remediationUrl: error.remediationUrl
  });
}
function stopAuthController() {
  const flow = currentFlow();
  if (flow) {
    flow.abort.abort();
  }
}
registerProcessCleanup(stopAuthController);

// src/lib/models/anthropic-id-rewrite.ts
var SENTINEL_DATE = "20260301";
var FORWARD_RE = /^claude-(opus|sonnet|haiku)-(\d+)\.(\d+)(?:-(.*))?$/;
var REVERSE_RE = new RegExp(
  String.raw`^claude-(opus|sonnet|haiku)-(\d+)-(\d+)(?:-(.*))?-${SENTINEL_DATE}$`
);
function forwardId(copilotId) {
  const match = FORWARD_RE.exec(copilotId);
  if (!match) {
    return copilotId;
  }
  const [, family, major, minor, suffix] = match;
  const suffixPart = suffix ? `-${suffix}` : "";
  return `claude-${family}-${major}-${minor}${suffixPart}-${SENTINEL_DATE}`;
}
function reverseId(anthropicId) {
  const match = REVERSE_RE.exec(anthropicId);
  if (!match) {
    return anthropicId;
  }
  const [, family, major, minor, suffix] = match;
  const suffixPart = suffix ? `-${suffix}` : "";
  return `claude-${family}-${major}.${minor}${suffixPart}`;
}
var VARIANT_RE = /-(?:low|medium|high|xhigh|max|1m)(?:-internal)?$/;
function isVariantId(copilotId) {
  if (!FORWARD_RE.test(copilotId)) return false;
  return VARIANT_RE.test(copilotId);
}
function pickCopilotVariantId(baseId, opts, knownIds) {
  if (isVariantId(baseId)) return baseId;
  if (!FORWARD_RE.test(baseId)) return baseId;
  const candidates = [];
  if (opts.effort && opts.effort !== "low" && opts.effort !== "medium") {
    candidates.push(`${baseId}-${opts.effort}`);
  }
  if (opts.longContext) {
    candidates.push(`${baseId}-1m-internal`, `${baseId}-1m`);
  }
  for (const candidate of candidates) {
    if (knownIds.includes(candidate)) return candidate;
  }
  return baseId;
}

// src/lib/errors/upstream-error-advice.ts
function asRecord2(value) {
  return typeof value === "object" && value !== null ? value : null;
}
function readError(parsed) {
  const obj = asRecord2(parsed);
  if (!obj) return {};
  const nested = asRecord2(obj.error);
  return {
    code: nested?.code ?? obj.code,
    message: nested?.message ?? obj.message
  };
}
function parseUpstreamError(status, body) {
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    return {
      status,
      message: body.trim() || "(no error body)",
      code: null,
      raw: body
    };
  }
  const { code, message } = readError(parsed);
  return {
    status,
    message: typeof message === "string" && message.trim() ? message.trim() : body.trim() || "(no error body)",
    code: typeof code === "string" ? code : null,
    raw: body
  };
}
var MAX_LISTED = 12;
function listAvailableModels(models) {
  return models.filter((m) => m.model_picker_enabled && !isVariantId(m.id)).map((m) => `${m.name} (${forwardId(m.id)})`);
}
var modelNotSupportedAdvisor = {
  id: "model_not_supported",
  matches: ({ upstream }) => {
    if (upstream.status !== 400) return false;
    if (upstream.code === "model_not_supported") return true;
    return /model is not supported|model_not_supported/i.test(upstream.message);
  },
  advise: ({ models }) => {
    const available = listAvailableModels(models);
    if (available.length === 0) {
      return {
        context: "GitHub Copilot doesn't offer the requested model on your plan.",
        recovery: "maximal couldn't read your Copilot model catalog right now. Restart maximal or re-check your sign-in, then retry."
      };
    }
    const shown = available.slice(0, MAX_LISTED).map((m) => `  \u2022 ${m}`);
    if (available.length > MAX_LISTED) {
      shown.push(`  \u2026and ${available.length - MAX_LISTED} more.`);
    }
    return {
      context: "GitHub Copilot doesn't offer the requested model on your plan.",
      recovery: "Switch to one of the supported models below \u2014 select it in your client's model picker, or set the model id explicitly (in Claude Code, run /model):\n" + shown.join("\n")
    };
  }
};
var ADVISORS = [modelNotSupportedAdvisor];
function composeAdvisedMessage(advice, upstream) {
  const original = upstream.code ? `${upstream.message} [${upstream.code}]` : upstream.message;
  return [
    advice.context,
    "",
    advice.recovery,
    "",
    `Upstream error (${upstream.status}): ${original}`
  ].join("\n");
}
function adviseUpstreamError(status, body, models) {
  const upstream = parseUpstreamError(status, body);
  const ctx = { upstream, models };
  const advisor = ADVISORS.find((a) => a.matches(ctx));
  if (!advisor) return null;
  return composeAdvisedMessage(advisor.advise(ctx), upstream);
}

// src/lib/errors/error.ts
var HTTPError = class extends Error {
  response;
  constructor(message, response) {
    super(message);
    this.response = response;
  }
};
var CopilotAuthFatalError = class extends Error {
  status;
  remediationUrl;
  constructor(message, status, remediationUrl) {
    super(message);
    this.status = status;
    this.remediationUrl = remediationUrl;
  }
};
var CopilotTokenStaleError = class extends Error {
  /** Why the refresh is failing, when known — carried into the client message
   *  so the user gets the actual cause instead of a bare "unavailable". */
  reason;
  constructor(reason) {
    super(
      "maximal's GitHub Copilot token expired and the background refresh is failing" + (reason ? ` (${reason})` : "") + ". This is not a problem with this client's credentials \u2014 signing in again here will not help. Requests resume automatically once the refresh succeeds; check maximal's connection to GitHub."
    );
    this.reason = reason;
  }
};
async function forwardAuthFatal(c, error) {
  let outcome = "auth_fatal";
  try {
    outcome = await rearmCopilotAuth();
  } catch (handlerErr) {
    consola8.warn(
      "rearmCopilotAuth threw while forwarding upstream error:",
      handlerErr
    );
  }
  if (outcome !== "auth_fatal") {
    return c.json(
      {
        error: {
          message: outcome === "online" ? "Re-authenticated with Copilot after a stale token; please retry the request." : "Reconnecting to Copilot; please retry the request.",
          type: "server_error"
        }
      },
      503
    );
  }
  try {
    await markAuthDegraded(error);
  } catch (handlerErr) {
    consola8.warn(
      "markAuthDegraded failed while forwarding upstream error:",
      handlerErr
    );
  }
  return c.json(
    {
      error: {
        message: error.message,
        type: "auth_fatal",
        ...error.remediationUrl ? { remediation_url: error.remediationUrl } : {}
      }
    },
    error.status
  );
}
async function forwardError(c, error) {
  consola8.error("Error occurred:", error);
  if (error instanceof CopilotTokenStaleError) {
    return c.json(
      {
        error: {
          message: error.message,
          type: "upstream_credential_stale"
        }
      },
      503
    );
  }
  if (error instanceof CopilotAuthFatalError) {
    return forwardAuthFatal(c, error);
  }
  if (error instanceof HTTPError) {
    if (error.response.status === 429) {
      for (const [name, value] of error.response.headers) {
        const lowerName = name.toLowerCase();
        if (lowerName === "retry-after" || lowerName.startsWith("x-")) {
          c.header(name, value);
        }
      }
    }
    const errorText = await error.response.text();
    let errorJson;
    try {
      errorJson = JSON.parse(errorText);
    } catch {
      errorJson = errorText;
    }
    consola8.error("HTTP error:", errorJson);
    const message = adviseUpstreamError(
      error.response.status,
      errorText,
      state.models?.data ?? []
    ) ?? errorText;
    return c.json(
      {
        error: {
          message,
          type: "error"
        }
      },
      error.response.status
    );
  }
  return c.json(
    {
      error: {
        message: error.message,
        type: "error"
      }
    },
    500
  );
}

// src/services/copilot/get-models.ts
var getModels = async () => {
  consola9.info(`Fetching models from ${copilotBaseUrl(state)}/models`);
  const response = await sendRequest(`${copilotBaseUrl(state)}/models`, {
    headers: copilotModelsHeaders(state),
    // Bounded like the other auth/discovery fetches — cacheModels runs on the
    // cold-boot critical path, so an unbounded hang here would stall boot.
    timeoutMs: GITHUB_API_TIMEOUT_MS
  });
  if (!response.ok) {
    const errorText = await response.clone().text();
    consola9.error("Failed to get models response body", errorText);
    throw new HTTPError("Failed to get models", response);
  }
  const parsed = await response.json();
  return {
    ...parsed,
    object: parsed.object ?? "list",
    data: (parsed.data ?? []).map((model) => normalizeModel(model))
  };
};
function normalizeModel(raw) {
  const capabilities = raw.capabilities ?? {};
  return {
    ...raw,
    capabilities: {
      family: capabilities.family ?? "",
      type: capabilities.type ?? "",
      tokenizer: capabilities.tokenizer ?? "o200k_base",
      object: capabilities.object ?? "model_capabilities",
      limits: capabilities.limits ?? {},
      supports: capabilities.supports ?? {}
    }
  };
}
function pricedModelIsPaid(prices) {
  if (!prices) return null;
  const rates = Object.values(prices).filter(
    (v) => typeof v === "number" && Number.isFinite(v)
  );
  if (rates.length === 0) return null;
  return rates.some((rate) => rate > 0);
}

// src/lib/platform/utils.ts
var sleep = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});
var abortableSleep = (ms, signal) => {
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
};
var isNullish = (value) => value === null || value === void 0;
async function cacheModels() {
  const models = await getModels();
  setModels({
    ...models,
    data: models.data.filter(
      (model) => model.model_picker_enabled || model.capabilities.type === "embeddings"
    )
  });
}
var cacheVSCodeVersion = () => {
  const response = getConfig().editorVersion ?? "1.124.0";
  state.vsCodeVersion = response;
  consola10.info(`Using VSCode version: ${response}`);
  return Promise.resolve();
};
var invalidMacAddresses = /* @__PURE__ */ new Set([
  "00:00:00:00:00:00",
  "ff:ff:ff:ff:ff:ff",
  "ac:de:48:00:11:22"
]);
function validateMacAddress(candidate) {
  const tempCandidate = candidate.replaceAll("-", ":").toLowerCase();
  return !invalidMacAddresses.has(tempCandidate);
}
function getMac() {
  const ifaces = networkInterfaces();
  for (const name in ifaces) {
    const networkInterface = ifaces[name];
    if (networkInterface) {
      for (const { mac } of networkInterface) {
        if (validateMacAddress(mac)) {
          return mac;
        }
      }
    }
  }
  return null;
}
var cacheMacMachineId = () => {
  const macAddress = getMac() ?? randomUUID3();
  state.macMachineId = createHash("sha256").update(macAddress, "utf8").digest("hex");
  consola10.debug(`Using machine ID: ${state.macMachineId}`);
};
var cacheVsCodeDeviceId = async () => {
  state.vsCodeDeviceId = await getVSCodeDeviceId();
  consola10.debug(`Using VSCode device ID: ${state.vsCodeDeviceId}`);
};
var SESSION_REFRESH_BASE_MS = 60 * 60 * 1e3;
var SESSION_REFRESH_JITTER_MS = 20 * 60 * 1e3;
var vsCodeSessionRefreshTimer = null;
var generateSessionId = () => {
  state.vsCodeSessionId = randomUUID3() + Date.now().toString();
  consola10.debug(`Generated VSCode session ID: ${state.vsCodeSessionId}`);
};
var stopVsCodeSessionRefreshLoop = () => {
  if (vsCodeSessionRefreshTimer) {
    clearTimeout(vsCodeSessionRefreshTimer);
    vsCodeSessionRefreshTimer = null;
  }
};
var scheduleSessionIdRefresh = () => {
  const randomDelay = Math.floor(Math.random() * SESSION_REFRESH_JITTER_MS);
  const delay3 = SESSION_REFRESH_BASE_MS + randomDelay;
  consola10.debug(
    `Scheduling next VSCode session ID refresh in ${Math.round(
      delay3 / 1e3
    )} seconds`
  );
  stopVsCodeSessionRefreshLoop();
  vsCodeSessionRefreshTimer = setTimeout(() => {
    try {
      generateSessionId();
    } catch (error) {
      consola10.error("Failed to refresh session ID, rescheduling...", error);
    } finally {
      scheduleSessionIdRefresh();
    }
  }, delay3);
};
var cacheVsCodeSessionId = () => {
  stopVsCodeSessionRefreshLoop();
  generateSessionId();
  scheduleSessionIdRefresh();
};
var isRecord = (value) => typeof value === "object" && value !== null;
var getUserIdJsonField = (userIdPayload, field) => {
  const value = userIdPayload?.[field];
  return typeof value === "string" && value.length > 0 ? value : null;
};
var parseJsonUserId = (userId) => {
  try {
    const parsed = JSON.parse(userId);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
};
var parseUserIdMetadata = (userId) => {
  if (!userId || typeof userId !== "string") {
    return { safetyIdentifier: null, sessionId: null };
  }
  const legacySafetyIdentifier = userId.match(/user_([^_]+)_account/)?.[1] ?? null;
  const legacySessionId = userId.match(/_session_(.+)$/)?.[1] ?? null;
  const parsedUserId = legacySafetyIdentifier && legacySessionId ? null : parseJsonUserId(userId);
  const safetyIdentifier = legacySafetyIdentifier ?? getUserIdJsonField(parsedUserId, "device_id") ?? getUserIdJsonField(parsedUserId, "account_uuid");
  const sessionId = legacySessionId ?? getUserIdJsonField(parsedUserId, "session_id");
  return { safetyIdentifier, sessionId };
};
var findLastUserContent = (messages) => {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === "user" && msg.content) {
      if (typeof msg.content === "string") {
        return msg.content;
      } else if (Array.isArray(msg.content)) {
        const array = msg.content.filter((n) => n.type !== "tool_result").map((n) => ({ ...n, cache_control: void 0 }));
        if (array.length > 0) {
          return JSON.stringify(array);
        }
      }
    }
  }
  return null;
};
var generateRequestIdFromPayload = (payload, sessionId) => {
  const messages = payload.messages;
  if (messages) {
    const lastUserContent = typeof messages === "string" ? messages : findLastUserContent(messages);
    if (lastUserContent) {
      return getUUID(
        (sessionId ?? "") + (state.macMachineId ?? "") + lastUserContent
      );
    }
  }
  return randomUUID3();
};
var getRootSessionId = (anthropicPayload, c) => {
  const userId = anthropicPayload.metadata?.user_id;
  const sessionId = userId ? parseUserIdMetadata(userId).sessionId || void 0 : c.req.header("x-session-id");
  return sessionId ? getUUID(sessionId) : sessionId;
};
var getUUID = (content) => {
  const uuidBytes = createHash("sha256").update(content).digest().subarray(0, 16);
  uuidBytes[6] = uuidBytes[6] & 15 | 64;
  uuidBytes[8] = uuidBytes[8] & 63 | 128;
  const uuidHex = uuidBytes.toString("hex");
  return `${uuidHex.slice(0, 8)}-${uuidHex.slice(8, 12)}-${uuidHex.slice(12, 16)}-${uuidHex.slice(16, 20)}-${uuidHex.slice(20)}`;
};

export {
  forwardId,
  reverseId,
  isVariantId,
  pickCopilotVariantId,
  HTTPError,
  CopilotAuthFatalError,
  CopilotTokenStaleError,
  forwardError,
  requestContext,
  generateTraceId,
  resolveTraceId,
  registerProcessCleanup,
  debugLazy,
  debugJson,
  debugJsonTail,
  createTeeLogger,
  createHandlerLogger,
  COMPACT_REQUEST,
  COMPACT_AUTO_CONTINUE,
  compactSystemPromptStarts,
  compactTextOnlyGuard,
  compactSummaryPromptStart,
  compactAutoContinuePromptStarts,
  compactMessageSections,
  initOpencodeVersion,
  getEnterpriseDomain,
  getGitHubApiBaseUrl,
  getCopilotTokenUrl,
  prepareForCompact,
  prepareInteractionHeaders,
  copilotBaseUrl,
  prepareMessageProxyHeaders,
  copilotHeaders,
  githubHeaders,
  GITHUB_API_TIMEOUT_MS,
  UPDATE_MANIFEST_TIMEOUT_MS,
  sendRequest,
  sendProviderRequest,
  sendRequestJson,
  pricedModelIsPaid,
  sleep,
  isNullish,
  cacheModels,
  cacheVSCodeVersion,
  cacheMacMachineId,
  cacheVsCodeDeviceId,
  cacheVsCodeSessionId,
  parseUserIdMetadata,
  generateRequestIdFromPayload,
  getRootSessionId,
  getUUID,
  scheduleCopilotOnlineRetry,
  currentGitHubHost,
  readGitHubTokenRecord,
  makeAccountRecord,
  removeAccount,
  getActiveRecord,
  listAccounts,
  readRegistry,
  migrateLegacyRecord,
  registryPathFor,
  readDefaultRegistry,
  writeDefaultRegistry,
  addAccountToDefaultRegistry,
  markNeedsReauthInDefaultRegistry,
  activateAndClearNeedsReauthInDefaultRegistry,
  readDefaultRecord,
  getGitHubUser,
  getAuthStatus,
  startDeviceFlow,
  cancelDeviceFlow,
  markSignedIn,
  markSignedOut,
  signOut,
  registerAutoRecovery,
  rearmCopilotAuth,
  markAuthDegraded,
  parseCopilotErrorBody,
  isAuthFatal,
  stopCopilotRefreshLoop,
  setupCopilotToken,
  setupGitHubToken,
  logUser
};
