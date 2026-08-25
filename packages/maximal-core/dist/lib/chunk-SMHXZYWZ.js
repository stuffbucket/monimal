import {
  apiKeyHelperCommand,
  ensureDefaultEndpointKey,
  isOwnedApiKeyHelper,
  isWritableApiKeyHelper
} from "./chunk-LIOSYQNE.js";
import {
  assertIsolatedTestPath,
  getConfig,
  writeConfig
} from "./chunk-4JX7327A.js";

// src/apps/claude-code/detect.ts
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
var SHIM_MARKER = "# __MAXIMAL_CLAUDE_SHIM__";
function legacyShimPath(homeDir = os.homedir()) {
  return path.join(homeDir, ".local", "share", "maximal", "shims", "claude");
}
function removeLegacyShimIfPresent(homeDir = os.homedir()) {
  const shimPath = legacyShimPath(homeDir);
  try {
    if (!fs.existsSync(shimPath)) return null;
    if (!fileStartsWithContains(shimPath, SHIM_MARKER)) return null;
    fs.unlinkSync(shimPath);
    return shimPath;
  } catch {
    return null;
  }
}
function claudeBasenames(platform) {
  if (platform === "win32") {
    return ["claude.exe", "claude.cmd", "claude.ps1", "claude"];
  }
  return ["claude"];
}
function inspectDir(probe, ctx) {
  for (const base of ctx.basenames) {
    const inst = inspectCandidate(
      { raw: path.join(probe.dir, base), origin: probe.origin },
      ctx
    );
    if (inst) return inst;
  }
  return null;
}
function defaultPathDirs() {
  const raw = process.env.PATH ?? "";
  return raw.split(path.delimiter).filter((d) => d.length > 0);
}
function defaultNpmPrefix() {
  try {
    const out = execFileSync("npm", ["prefix", "-g"], {
      encoding: "utf8",
      timeout: 5e3,
      stdio: ["ignore", "pipe", "ignore"]
    });
    const trimmed = out.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}
function readClaudeVersion(binPath) {
  let out;
  try {
    out = execFileSync(binPath, ["--version"], {
      encoding: "utf8",
      timeout: 5e3,
      stdio: ["ignore", "pipe", "ignore"]
    });
  } catch {
    return null;
  }
  const trimmed = out.trim();
  if (!trimmed) return null;
  const semver = /\d+\.\d+\.\d+/u.exec(trimmed);
  return semver ? semver[0] : trimmed;
}
function fileStartsWithContains(filePath, needle) {
  let fd;
  try {
    fd = fs.openSync(filePath, "r");
  } catch {
    return false;
  }
  try {
    const buf = Buffer.alloc(4096);
    const bytes = fs.readSync(fd, buf, 0, buf.length, 0);
    return buf.toString("utf8", 0, bytes).includes(needle);
  } catch {
    return false;
  } finally {
    fs.closeSync(fd);
  }
}
function realpathOrSelf(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return p;
  }
}
function classifySource(resolved, ctx) {
  const { origin, isWin } = ctx;
  const sep = path.sep;
  const home = realpathOrSelf(ctx.home);
  const npmBin = ctx.npmBin === null ? null : realpathOrSelf(ctx.npmBin);
  const norm = (p) => isWin ? p.toLowerCase() : p;
  const res = norm(resolved);
  const startsWith = (prefix) => res.startsWith(norm(prefix));
  if (startsWith(path.join(home, ".claude") + sep)) {
    return "claude-local";
  }
  if (startsWith(path.join(home, ".local", "bin") + sep)) {
    return "local-bin";
  }
  if (origin !== "path") {
    return origin;
  }
  if (npmBin && startsWith(npmBin + sep)) {
    return "npm-global";
  }
  if (!isWin && (resolved.startsWith("/opt/homebrew/") || resolved.startsWith("/usr/local/"))) {
    return "homebrew";
  }
  return "path";
}
function inspectCandidate(candidate, ctx) {
  let stat;
  try {
    stat = fs.statSync(candidate.raw);
  } catch {
    return null;
  }
  if (!stat.isFile()) return null;
  if (fileStartsWithContains(candidate.raw, SHIM_MARKER)) return null;
  let resolved;
  try {
    resolved = fs.realpathSync(candidate.raw);
  } catch {
    resolved = candidate.raw;
  }
  if (fileStartsWithContains(resolved, SHIM_MARKER)) return null;
  if (ctx.seen.has(resolved)) return null;
  ctx.seen.add(resolved);
  return {
    path: candidate.raw,
    resolvedPath: resolved,
    version: ctx.readVersion(candidate.raw),
    source: classifySource(resolved, {
      origin: candidate.origin,
      home: ctx.home,
      npmBin: ctx.npmBin,
      isWin: ctx.isWin
    })
  };
}
function detectClaudeInstalls(options = {}) {
  const home = options.homeDir ?? os.homedir();
  const pathDirs = options.pathDirs ?? defaultPathDirs();
  const readVersion = options.readVersion ?? readClaudeVersion;
  const platform = options.platform ?? process.platform;
  const isWin = platform === "win32";
  const basenames = claudeBasenames(platform);
  const seen = /* @__PURE__ */ new Set();
  const npmBinOf = (prefix) => isWin ? prefix : path.join(prefix, "bin");
  const explicitNpm = options.npmPrefix;
  const phase1NpmBin = typeof explicitNpm === "string" ? npmBinOf(explicitNpm) : null;
  for (const dir of pathDirs) {
    const inst = inspectDir(
      { dir, origin: "path" },
      { home, npmBin: phase1NpmBin, readVersion, seen, isWin, basenames }
    );
    if (inst) return [inst];
  }
  const npmPrefix = explicitNpm === void 0 ? defaultNpmPrefix() : explicitNpm;
  const npmBin = npmPrefix ? npmBinOf(npmPrefix) : null;
  const probeDirs = [];
  if (!isWin) {
    probeDirs.push(
      { dir: "/opt/homebrew/bin", origin: "homebrew" },
      { dir: "/usr/local/bin", origin: "homebrew" }
    );
  }
  probeDirs.push(
    { dir: path.join(home, ".local", "bin"), origin: "local-bin" },
    { dir: path.join(home, ".claude", "local"), origin: "claude-local" },
    { dir: path.join(home, ".claude", "bin"), origin: "claude-local" },
    { dir: path.join(home, ".claude"), origin: "claude-local" }
  );
  if (npmBin) {
    probeDirs.push({ dir: npmBin, origin: "npm-global" });
  }
  const installs = [];
  for (const probe of probeDirs) {
    const inst = inspectDir(probe, {
      home,
      npmBin,
      readVersion,
      seen,
      isWin,
      basenames
    });
    if (inst) installs.push(inst);
  }
  return installs;
}

// src/apps/claude-code/reconcile.ts
import consola from "consola";

// src/apps/claude-code/config.ts
import fs3 from "fs";
import os2 from "os";
import path3 from "path";

// src/lib/platform/atomic-json.ts
import fs2 from "fs";
import path2 from "path";
function atomicWriteJson(filePath, value, opts = {}) {
  const label = opts.label ?? "file";
  fs2.mkdirSync(path2.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  const json = `${JSON.stringify(value, null, 2)}
`;
  try {
    fs2.unlinkSync(tmp);
  } catch (err) {
    if (!(err instanceof Error) || !("code" in err) || err.code !== "ENOENT") {
      throw err;
    }
  }
  let fd;
  try {
    fd = fs2.openSync(
      tmp,
      fs2.constants.O_WRONLY | fs2.constants.O_CREAT | fs2.constants.O_EXCL,
      384
    );
  } catch (err) {
    if (err instanceof Error && "code" in err && err.code === "EEXIST") {
      throw new Error(
        `refusing to write ${label}: ${tmp} already exists (possible symlink attack); remove it and retry`,
        { cause: err }
      );
    }
    throw err;
  }
  try {
    fs2.writeFileSync(fd, json);
    fs2.fsyncSync(fd);
  } finally {
    fs2.closeSync(fd);
  }
  fs2.renameSync(tmp, filePath);
}

// src/apps/claude-code/config.ts
var HELPER_LABEL = "claude-code";
var PROXY_BASE_URL = "http://127.0.0.1:4141";
function resolveApiKeyHelperCommand() {
  const command = apiKeyHelperCommand(HELPER_LABEL);
  return isWritableApiKeyHelper(command, HELPER_LABEL) ? command : null;
}
var API_KEY_HELPER_KEY = "apiKeyHelper";
var BASE_URL_KEY = "ANTHROPIC_BASE_URL";
var ENV_KEY = "env";
var PRIOR_KEY = "_maximalPrior";
var UNSET = "__UNSET__";
function readPriorSnapshot(settings) {
  const snap = settings[PRIOR_KEY];
  if (typeof snap !== "object" || snap === null || Array.isArray(snap)) {
    return null;
  }
  const s = snap;
  return {
    [BASE_URL_KEY]: BASE_URL_KEY in s ? s[BASE_URL_KEY] : UNSET,
    [API_KEY_HELPER_KEY]: API_KEY_HELPER_KEY in s ? s[API_KEY_HELPER_KEY] : UNSET
  };
}
function getClaudeCodeSettingsPath() {
  const override = process.env.CLAUDE_CONFIG_DIR?.trim();
  assertIsolatedTestPath(override, "CLAUDE_CONFIG_DIR");
  const configDir = override || path3.join(os2.homedir(), ".claude");
  return path3.join(configDir, "settings.json");
}
function readClaudeCodeSettings(filePath = getClaudeCodeSettingsPath()) {
  let raw;
  try {
    raw = fs3.readFileSync(filePath, "utf8");
  } catch {
    return {};
  }
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}
function readEnv(settings) {
  const env = settings[ENV_KEY];
  if (typeof env === "object" && env !== null && !Array.isArray(env)) {
    return env;
  }
  return {};
}
function getBaseUrlOwnership(settings) {
  const env = readEnv(settings);
  if (!(BASE_URL_KEY in env)) return "absent";
  return env[BASE_URL_KEY] === PROXY_BASE_URL ? "ours" : "foreign";
}
function getApiKeyHelperOwnership(settings) {
  if (!(API_KEY_HELPER_KEY in settings)) return "absent";
  return isOwnedApiKeyHelper(settings[API_KEY_HELPER_KEY], HELPER_LABEL) ? "ours" : "foreign";
}
function mergeBaseUrl(existing, apiKeyHelper) {
  const env = { ...readEnv(existing), [BASE_URL_KEY]: PROXY_BASE_URL };
  const priorEnvBaseUrl = readEnv(existing);
  const prior = PRIOR_KEY in existing ? existing[PRIOR_KEY] : {
    [BASE_URL_KEY]: BASE_URL_KEY in priorEnvBaseUrl ? priorEnvBaseUrl[BASE_URL_KEY] : UNSET,
    [API_KEY_HELPER_KEY]: API_KEY_HELPER_KEY in existing ? existing[API_KEY_HELPER_KEY] : UNSET
  };
  return {
    ...existing,
    [ENV_KEY]: env,
    [API_KEY_HELPER_KEY]: apiKeyHelper,
    [PRIOR_KEY]: prior
  };
}
function withRestoredField(target, key, prior) {
  if (prior === UNSET) {
    const { [key]: _dropped, ...without } = target;
    return without;
  }
  return { ...target, [key]: prior };
}
function stripBaseUrl(existing) {
  const snapshot = readPriorSnapshot(existing);
  const {
    [PRIOR_KEY]: _droppedPrior,
    [ENV_KEY]: _droppedEnv,
    ...rest
  } = existing;
  const currentEnv = readEnv(existing);
  const { [BASE_URL_KEY]: _droppedBaseUrl, ...envWithoutBaseUrl } = currentEnv;
  const { [API_KEY_HELPER_KEY]: _droppedHelper, ...withoutHelper } = rest;
  if (snapshot) {
    const env2 = withRestoredField(
      envWithoutBaseUrl,
      BASE_URL_KEY,
      snapshot[BASE_URL_KEY]
    );
    const base = withRestoredField(
      withoutHelper,
      API_KEY_HELPER_KEY,
      snapshot[API_KEY_HELPER_KEY]
    );
    if (Object.keys(env2).length === 0) return base;
    return { ...base, [ENV_KEY]: env2 };
  }
  const env = currentEnv[BASE_URL_KEY] === PROXY_BASE_URL ? envWithoutBaseUrl : currentEnv;
  const baseRest = isOwnedApiKeyHelper(existing[API_KEY_HELPER_KEY], HELPER_LABEL) ? withoutHelper : rest;
  if (Object.keys(env).length === 0) {
    return baseRest;
  }
  return { ...baseRest, [ENV_KEY]: env };
}
function isProxyBaseUrlConfigured(filePath = getClaudeCodeSettingsPath()) {
  const settings = readClaudeCodeSettings(filePath);
  return getBaseUrlOwnership(settings) === "ours" && getApiKeyHelperOwnership(settings) === "ours";
}
function writeClaudeCodeSettings(filePath, settings) {
  atomicWriteJson(filePath, settings, { label: "Claude Code settings" });
}
function applyProxyBaseUrl(filePath = getClaudeCodeSettingsPath(), resolveHelper = resolveApiKeyHelperCommand) {
  const existing = readClaudeCodeSettings(filePath);
  const baseUrlOwnership = getBaseUrlOwnership(existing);
  const helperOwnership = getApiKeyHelperOwnership(existing);
  if (baseUrlOwnership === "foreign") {
    return { path: filePath, wrote: false, skippedReason: "foreign-base-url" };
  }
  if (helperOwnership === "foreign") {
    return {
      path: filePath,
      wrote: false,
      skippedReason: "foreign-api-key-helper"
    };
  }
  const helper = resolveHelper();
  if (helper === null || !isWritableApiKeyHelper(helper, HELPER_LABEL)) {
    return {
      path: filePath,
      wrote: false,
      skippedReason: "invalid-api-key-helper"
    };
  }
  if (baseUrlOwnership === "ours" && helperOwnership === "ours") {
    if (existing[API_KEY_HELPER_KEY] === helper) {
      return { path: filePath, wrote: false, skippedReason: "already-ours" };
    }
    writeClaudeCodeSettings(filePath, mergeBaseUrl(existing, helper));
    return { path: filePath, wrote: true };
  }
  writeClaudeCodeSettings(filePath, mergeBaseUrl(existing, helper));
  return { path: filePath, wrote: true };
}
function revertProxyBaseUrl(filePath = getClaudeCodeSettingsPath()) {
  const existing = readClaudeCodeSettings(filePath);
  const baseUrlOwnership = getBaseUrlOwnership(existing);
  const helperOwnership = getApiKeyHelperOwnership(existing);
  if (baseUrlOwnership !== "ours" && helperOwnership !== "ours") {
    return {
      path: filePath,
      wrote: false,
      remainingKeys: Object.keys(existing)
    };
  }
  const stripped = stripBaseUrl(existing);
  if (Object.keys(stripped).length === 0) {
    try {
      fs3.rmSync(filePath, { force: true });
    } catch {
    }
    return { path: filePath, wrote: true, remainingKeys: [] };
  }
  writeClaudeCodeSettings(filePath, stripped);
  return {
    path: filePath,
    wrote: true,
    remainingKeys: Object.keys(stripped)
  };
}

// src/apps/claude-code/reconcile.ts
function claudeCodeRoutingIntended() {
  return getConfig().apps?.claudeCode?.enabled === true;
}
function setClaudeCodeRoutingIntent(enabled) {
  const config = getConfig();
  writeConfig({
    ...config,
    apps: {
      ...config.apps,
      claudeCode: {
        ...config.apps?.claudeCode,
        enabled
      }
    }
  });
}
function reconcileClaudeCodeOnBoot(intended = claudeCodeRoutingIntended(), filePath = getClaudeCodeSettingsPath(), resolveApiKeyHelper = resolveApiKeyHelperCommand) {
  if (!intended) return;
  try {
    const result = applyProxyBaseUrl(filePath, resolveApiKeyHelper);
    if (result.wrote) {
      consola.info(
        "claude-code: re-applied proxy base URL on boot (routing intent is on)"
      );
    } else
      switch (result.skippedReason) {
        case "foreign-base-url": {
          consola.warn(
            "claude-code: routing intent is on, but a non-proxy ANTHROPIC_BASE_URL is present \u2014 left it untouched"
          );
          return;
        }
        case "foreign-api-key-helper": {
          consola.warn(
            "claude-code: routing intent is on, but a custom apiKeyHelper is present \u2014 left it untouched"
          );
          return;
        }
        case "invalid-api-key-helper": {
          consola.warn(
            "claude-code: routing intent is on, but this maximal invocation cannot provide a safe apiKeyHelper \u2014 left settings untouched"
          );
          return;
        }
      }
    ensureDefaultEndpointKey();
  } catch (err) {
    consola.warn("claude-code: failed to reconcile base URL on boot", err);
  }
}
function reconcileClaudeCodeOnShutdown(intended = claudeCodeRoutingIntended(), filePath = getClaudeCodeSettingsPath()) {
  if (!intended) return;
  try {
    const result = revertProxyBaseUrl(filePath);
    if (result.wrote) {
      consola.info(
        "claude-code: removed proxy base URL for shutdown (routing intent persists for next boot)"
      );
    }
  } catch (err) {
    consola.warn("claude-code: failed to reconcile base URL on shutdown", err);
  }
}

export {
  removeLegacyShimIfPresent,
  detectClaudeInstalls,
  atomicWriteJson,
  HELPER_LABEL,
  resolveApiKeyHelperCommand,
  getClaudeCodeSettingsPath,
  isProxyBaseUrlConfigured,
  applyProxyBaseUrl,
  revertProxyBaseUrl,
  setClaudeCodeRoutingIntent,
  reconcileClaudeCodeOnBoot,
  reconcileClaudeCodeOnShutdown
};
