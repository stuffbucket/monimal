import {
  attemptAutoRecovery
} from "./chunk-46RLBQDX.js";
import {
  reconcileClaudeCodeOnBoot,
  reconcileClaudeCodeOnShutdown,
  removeLegacyShimIfPresent
} from "./chunk-SMHXZYWZ.js";
import {
  resolveSmallToolModel
} from "./chunk-SRWM5VCG.js";
import {
  SECRET_DEFS,
  ensureSecretsDir,
  getGitVersion,
  loadSecretIntoEnv,
  shortSha,
  startTokenUsageRetention
} from "./chunk-GMUJZD4A.js";
import {
  CopilotAuthFatalError,
  cacheMacMachineId,
  cacheModels,
  cacheVSCodeVersion,
  cacheVsCodeDeviceId,
  cacheVsCodeSessionId,
  createHandlerLogger,
  currentGitHubHost,
  getGitHubUser,
  initOpencodeVersion,
  logUser,
  markAuthDegraded,
  markSignedIn,
  markSignedOut,
  migrateLegacyRecord,
  readDefaultRecord,
  registerAutoRecovery,
  scheduleCopilotOnlineRetry,
  setupCopilotToken
} from "./chunk-UQM4JUWE.js";
import {
  ConfigReloadError,
  DEFAULT_PORT_POLICY,
  PATHS,
  clearTokenTrio,
  ensurePaths,
  getConfig,
  hasGithubToken,
  isAutoRecoverAccountEnabled,
  mergeConfigWithDefaults,
  reloadConfigFromDisk,
  setGithubToken,
  state,
  subscribeConfig
} from "./chunk-4JX7327A.js";
import {
  READY_LINE_VERSION,
  emitBootStatus,
  emitReadyLine
} from "./chunk-7GPE5USJ.js";

// src/lib/start/run-server.ts
import consola8 from "consola";
import { serve } from "srvx";

// src/lib/config/provider-host-source.ts
import consola from "consola";
import fs from "fs";
import path from "path";
var deepFreeze = (value) => {
  if (value === null || typeof value !== "object") return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
};
var isolatedSnapshotValue = (value) => deepFreeze(structuredClone(value));
var readonlyProvidersFor = (config) => isolatedSnapshotValue(config.providers ?? {});
var snapshotFor = (config, appDataDirectory) => Object.freeze({
  appDataDirectory,
  defaultProfileDirectory: path.join(appDataDirectory, "provider-host"),
  configStatus: Object.freeze({ state: "ready" }),
  providerHost: Object.freeze({
    mode: config.providerHost?.mode ?? "legacy",
    profileDirectory: config.providerHost?.profileDirectory
  }),
  providers: readonlyProvidersFor(config),
  providerPlugins: config.providerPlugins === void 0 ? void 0 : isolatedSnapshotValue(config.providerPlugins)
});
var failureReasonFor = (error) => error instanceof ConfigReloadError ? error.reason : "unknown";
var fileIdentity = (filePath) => {
  try {
    const stats = fs.statSync(filePath);
    return [
      stats.dev,
      stats.ino,
      stats.size,
      stats.mtimeMs,
      stats.ctimeMs
    ].join(":");
  } catch {
    return void 0;
  }
};
function createProviderHostConfigSource(options = {}) {
  const appDataDirectory = options.appDataDirectory ?? PATHS.APP_DIR;
  const configPath = options.configPath ?? PATHS.CONFIG_PATH;
  const configDirectory = path.dirname(configPath);
  const configFilename = path.basename(configPath);
  const readConfig = options.readConfig ?? getConfig;
  const reloadConfig = options.reloadConfig ?? reloadConfigFromDisk;
  const subscribeValidatedConfig = options.subscribeValidatedConfig ?? subscribeConfig;
  const listeners = /* @__PURE__ */ new Set();
  let observedConfigIdentity = fileIdentity(configPath);
  let snapshot = snapshotFor(readConfig(), appDataDirectory);
  let fingerprint = JSON.stringify(snapshot);
  let disposed = false;
  let reloadTimer;
  const publish = (next) => {
    if (disposed) return;
    const nextFingerprint = JSON.stringify(next);
    if (nextFingerprint === fingerprint) return;
    snapshot = next;
    fingerprint = nextFingerprint;
    for (const listener of listeners) listener(snapshot);
  };
  const update = (config) => {
    publish(snapshotFor(config, appDataDirectory));
  };
  const publishReloadFailure = (error) => {
    const reason = failureReasonFor(error);
    consola.error(
      `Failed to reload externally changed config (${reason}); retaining last validated config`
    );
    publish(
      Object.freeze({
        ...snapshot,
        configStatus: Object.freeze({ state: "error", reason })
      })
    );
  };
  const scheduleReload = () => {
    if (reloadTimer) clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => {
      reloadTimer = void 0;
      try {
        update(reloadConfig());
      } catch (error) {
        publishReloadFailure(error);
      }
    }, 25);
    reloadTimer.unref();
  };
  const refreshObservedConfigIdentity = () => {
    const nextIdentity = fileIdentity(configPath);
    if (nextIdentity === observedConfigIdentity) return false;
    observedConfigIdentity = nextIdentity;
    return true;
  };
  const unsubscribeConfig = subscribeValidatedConfig(update);
  let watcher;
  if (options.watchExternalWrites !== false) {
    try {
      watcher = fs.watch(configDirectory, (_eventType, filename) => {
        const changedConfig = refreshObservedConfigIdentity();
        if (filename !== null && filename !== configFilename && !changedConfig) {
          return;
        }
        scheduleReload();
      });
      watcher.unref();
      if (refreshObservedConfigIdentity()) scheduleReload();
    } catch (error) {
      consola.warn("Could not watch config for external changes", error);
    }
  }
  return {
    getSnapshot() {
      return snapshot;
    },
    subscribe(listener) {
      if (disposed) return () => void 0;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      if (disposed) return Promise.resolve();
      disposed = true;
      unsubscribeConfig();
      watcher?.close();
      if (reloadTimer) clearTimeout(reloadTimer);
      listeners.clear();
      return Promise.resolve();
    }
  };
}

// src/lib/http/proxy.ts
import consola2 from "consola";
import { getProxyForUrl } from "proxy-from-env";
import { Agent, ProxyAgent, setGlobalDispatcher } from "undici";
function initProxyFromEnv() {
  if (typeof Bun !== "undefined") return;
  try {
    const direct = new Agent();
    const proxies = /* @__PURE__ */ new Map();
    const dispatcher = {
      dispatch(options, handler) {
        try {
          const origin = typeof options.origin === "string" ? new URL(options.origin) : options.origin;
          const get = getProxyForUrl;
          const raw = get(origin.toString());
          const proxyUrl = raw && raw.length > 0 ? raw : void 0;
          if (!proxyUrl) {
            consola2.debug(`HTTP proxy bypass: ${origin.hostname}`);
            return direct.dispatch(options, handler);
          }
          let agent = proxies.get(proxyUrl);
          if (!agent) {
            agent = new ProxyAgent(proxyUrl);
            proxies.set(proxyUrl, agent);
          }
          let label = proxyUrl;
          try {
            const u = new URL(proxyUrl);
            label = `${u.protocol}//${u.host}`;
          } catch {
          }
          consola2.debug(`HTTP proxy route: ${origin.hostname} via ${label}`);
          return agent.dispatch(options, handler);
        } catch {
          return direct.dispatch(options, handler);
        }
      },
      close() {
        return direct.close();
      },
      destroy() {
        return direct.destroy();
      }
    };
    setGlobalDispatcher(dispatcher);
    consola2.debug("HTTP proxy configured from environment (per-URL)");
  } catch (err) {
    consola2.debug("Proxy setup skipped:", err);
  }
}

// src/lib/platform/replace-running.ts
import { spawnSync } from "child_process";
import fs2 from "fs/promises";
import net from "net";
import path2 from "path";
var PIDFILE_PATH = path2.join(PATHS.APP_DIR, "maximal.pid");
function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function defaultProbePort(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (held) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(held);
    };
    socket.setTimeout(100);
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(false));
    socket.connect(port, "127.0.0.1");
  });
}
async function defaultReadPidfile() {
  try {
    const raw = await fs2.readFile(PIDFILE_PATH, "utf8");
    const pid = Number.parseInt(raw.trim(), 10);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}
function looksLikeMaximalCommand(command) {
  const cmd = command.trim().toLowerCase();
  return /(?:^|\/)maximal(?:\s|$)/.test(cmd) || cmd.includes("maximal start");
}
function isMaximalProcess(pid) {
  try {
    const r = spawnSync("ps", ["-p", String(pid), "-o", "command="], {
      encoding: "utf8",
      timeout: 1e3
    });
    if (r.status !== 0) return false;
    return looksLikeMaximalCommand(r.stdout);
  } catch {
    return false;
  }
}
function defaultListenerPid(port) {
  if (process.platform === "win32") return null;
  try {
    const r = spawnSync(
      "lsof",
      ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"],
      { encoding: "utf8", timeout: 1e3 }
    );
    if (r.status !== 0 || !r.stdout.trim()) return null;
    for (const line of r.stdout.trim().split("\n")) {
      const pid = Number.parseInt(line.trim(), 10);
      if (Number.isInteger(pid) && pid > 0 && isMaximalProcess(pid)) {
        return pid;
      }
    }
    return null;
  } catch {
    return null;
  }
}
function resolveDeps(opts) {
  return {
    port: opts.port ?? 4141,
    drainTimeoutMs: opts.drainTimeoutMs ?? 3e3,
    killEscalationMs: opts.killEscalationMs ?? 1500,
    sleep: opts.sleep ?? defaultSleep,
    now: opts.now ?? Date.now,
    kill: opts.kill ?? ((pid, sig) => process.kill(pid, sig)),
    probePort: opts.probePort ?? defaultProbePort,
    readPidfile: opts.readPidfile ?? defaultReadPidfile,
    listenerPid: opts.listenerPid ?? defaultListenerPid,
    fetchImpl: opts.fetchImpl ?? fetch
  };
}
async function requestShutdown(deps) {
  const base = `http://127.0.0.1:${deps.port}`;
  try {
    await deps.fetchImpl(`${base}/setup-status`, {
      signal: AbortSignal.timeout(100)
    });
  } catch {
    return false;
  }
  try {
    await deps.fetchImpl(`${base}/_internal/shutdown`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(1e3)
    });
  } catch {
  }
  return true;
}
async function waitForPortRelease(deps) {
  const deadline = deps.now() + deps.drainTimeoutMs;
  while (deps.now() < deadline) {
    await deps.sleep(50);
    const held = await deps.probePort(deps.port);
    if (!held) return true;
  }
  return false;
}
async function evictRunning(opts) {
  const deps = resolveDeps(opts);
  const reachable = await requestShutdown(deps);
  if (reachable && await waitForPortRelease(deps)) return;
  if (!reachable && !await deps.probePort(deps.port)) return;
  const pidfilePid = await deps.readPidfile();
  if (pidfilePid !== null) await killEscalate(pidfilePid, deps);
  let lastPid = pidfilePid;
  if (await deps.probePort(deps.port)) {
    const livePid = deps.listenerPid(deps.port);
    if (livePid !== null && livePid !== pidfilePid) {
      lastPid = livePid;
      await killEscalate(livePid, deps);
    }
  }
  if (await deps.probePort(deps.port)) {
    const pidHint = lastPid !== null ? ` (last known pid ${lastPid})` : "";
    throw new Error(
      `Could not free :${deps.port}${pidHint}. Stop the holding process manually and retry.`
    );
  }
}
async function killEscalate(pid, deps) {
  const { kill, sleep, killEscalationMs } = deps;
  try {
    kill(pid, "SIGTERM");
  } catch {
    return;
  }
  await sleep(killEscalationMs);
  let stillAlive;
  try {
    kill(pid, 0);
    stillAlive = true;
  } catch {
    stillAlive = false;
  }
  if (!stillAlive) return;
  try {
    kill(pid, "SIGKILL");
  } catch {
  }
  await sleep(200);
}
async function writePidfile(pid = process.pid) {
  try {
    await fs2.writeFile(PIDFILE_PATH, String(pid), { mode: 384 });
  } catch {
  }
}
async function removePidfile() {
  try {
    await fs2.unlink(PIDFILE_PATH);
  } catch {
  }
}

// src/lib/start/boot-io.ts
import consola3 from "consola";
function initBootLogger(git, options) {
  const logger = createHandlerLogger("startup");
  logger.info(
    `maximal start pid=${process.pid} version=${git.sha ? shortSha(git.sha) : "unknown"} branch=${git.branch || "unknown"} port=${options.port} account=${options.accountType}`
  );
  return logger;
}
function printReadyBanner(proxyPort, controlPort) {
  const proxyUrl = `http://localhost:${proxyPort}`;
  const controlUrl = `http://127.0.0.1:${controlPort}`;
  consola3.box(
    [
      `Proxy:   ${proxyUrl}/v1`,
      `Status:  ${proxyUrl}/status`,
      `Control: ${controlUrl}/control/rpc`,
      ``,
      `Core is headless \u2014 point a client at the proxy, or drive it over`,
      `the control plane. The control port is separate and loopback-only`,
      `(maximal-core#10); it is ephemeral unless you pass --control-port,`,
      `so this line is the only place a CLI user can read it.`
    ].join("\n")
  );
}

// src/lib/start/bootstrap.ts
import consola4 from "consola";
async function bootstrapUpstream(githubTokenOverride) {
  if (isAutoRecoverAccountEnabled()) {
    registerAutoRecovery(attemptAutoRecovery);
    consola4.info("Auto-recover account: enabled");
  }
  if (githubTokenOverride) {
    setGithubToken(githubTokenOverride);
    consola4.info("Using provided GitHub token");
  } else {
    await migrateLegacyRecord({
      legacyPath: PATHS.GITHUB_TOKEN_PATH,
      registryPath: PATHS.ACCOUNTS_PATH,
      host: currentGitHubHost(),
      resolveLogin: (token) => getGitHubUser(token).then((user) => user.login).catch(() => null)
    }).catch((error) => {
      consola4.warn("Account registry migration failed (continuing):", error);
      return null;
    });
    const existing = await readDefaultRecord();
    if (existing) {
      setGithubToken(existing.accessToken);
      if (state.showToken) {
        consola4.info("GitHub token:", existing.accessToken);
      }
    }
  }
  if (hasGithubToken()) {
    let avatarUrl;
    try {
      emitBootStatus("Connecting to GitHub Copilot\u2026");
      avatarUrl = await logUser();
      await setupCopilotToken();
      await cacheModels();
      consola4.info(
        `Available models: 
${state.models?.data.map((model) => `- ${model.id}`).join("\n")}`
      );
      if (state.userName) {
        markSignedIn(state.userName, avatarUrl);
        return;
      }
      consola4.warn(
        "Bootstrap: logUser succeeded but state.userName is empty; degrading to unauthenticated."
      );
      clearTokenTrio({ github: true, copilot: true });
      markSignedOut();
      return;
    } catch (error) {
      if (error instanceof CopilotAuthFatalError) {
        consola4.warn(
          "GitHub token present but Copilot rejected it; surfacing the reason in Settings.",
          error.message
        );
        await markAuthDegraded(error);
        return;
      }
      consola4.warn(
        "GitHub token present but Copilot bootstrap failed transiently; keeping the GitHub token and scheduling a background retry.",
        error
      );
      markSignedOut();
      scheduleCopilotOnlineRetry({
        onOnline: () => {
          void (async () => {
            let avatar = avatarUrl;
            if (!state.userName) {
              try {
                avatar = await logUser();
              } catch (err) {
                consola4.warn(
                  "Bootstrap online-retry: Copilot came online but the GitHub identity lookup is still failing; staying signed-out until it recovers.",
                  err
                );
                return;
              }
            }
            if (state.userName) markSignedIn(state.userName, avatar);
          })();
        }
      });
    }
  }
  consola4.warn(
    "No GitHub token; proxy is up in unauthenticated mode \u2014 run `maximal auth` to sign in."
  );
}
function bootSecrets() {
  ensureSecretsDir();
  for (const def of SECRET_DEFS) {
    const result = loadSecretIntoEnv({
      envVar: def.envVar,
      fileName: def.fileName
    });
    if (result.source === "file") {
      consola4.info(`Loaded ${def.envVar} from secrets/${def.fileName}`);
    }
  }
}

// src/lib/start/claude-code-flow.ts
import clipboard from "clipboardy";
import consola5 from "consola";
import invariant from "tiny-invariant";

// src/lib/platform/shell.ts
import { execSync } from "child_process";
import process2 from "process";
var defaultRun = (command) => execSync(command, { stdio: "pipe" }).toString();
function getShell(probe = {}) {
  const platform = probe.platform ?? process2.platform;
  const ppid = probe.ppid ?? process2.ppid;
  const env = probe.env ?? process2.env;
  const run = probe.run ?? defaultRun;
  if (platform === "win32") {
    try {
      const output = run(`tasklist /FI "PID eq ${ppid}" /NH /FO CSV`);
      const parentImage = output.toLowerCase();
      if (parentImage.includes("powershell.exe") || parentImage.includes("pwsh.exe")) {
        return "powershell";
      }
    } catch {
      return "cmd";
    }
    return "cmd";
  } else {
    const shellPath = env.SHELL;
    if (shellPath) {
      if (shellPath.endsWith("zsh")) return "zsh";
      if (shellPath.endsWith("fish")) return "fish";
      if (shellPath.endsWith("bash")) return "bash";
    }
    return "sh";
  }
}
function generateEnvScript(envVars, commandToRun = "", probe = {}) {
  const shell = getShell(probe);
  const filteredEnvVars = Object.entries(envVars).filter(
    ([, value]) => value !== void 0
  );
  let commandBlock;
  switch (shell) {
    case "powershell": {
      commandBlock = filteredEnvVars.map(([key, value]) => `$env:${key} = ${value}`).join("; ");
      break;
    }
    case "cmd": {
      commandBlock = filteredEnvVars.map(([key, value]) => `set ${key}=${value}`).join(" & ");
      break;
    }
    case "fish": {
      commandBlock = filteredEnvVars.map(([key, value]) => `set -gx ${key} ${value}`).join("; ");
      break;
    }
    default: {
      const assignments = filteredEnvVars.map(([key, value]) => `${key}=${value}`).join(" ");
      commandBlock = filteredEnvVars.length > 0 ? `export ${assignments}` : "";
      break;
    }
  }
  if (commandBlock && commandToRun) {
    const separator = shell === "cmd" ? " & " : " && ";
    return `${commandBlock}${separator}${commandToRun}`;
  }
  return commandBlock || commandToRun;
}

// src/lib/start/claude-code-flow.ts
async function runClaudeCodeFlow(serverUrl) {
  consola5.log(
    "\n\u{1F4A1} Tip: The --claude-code flag simply generates a clipboard command for launching Claude Code. \nAll models remain fully accessible without this flag, just configure the model ID directly in your settings.json file."
  );
  invariant(state.models, "Models should be loaded by now");
  const modelIds = state.models.data.map((m) => m.id);
  const selectedModel = await consola5.prompt(
    "Select a model to use with Claude Code",
    { type: "select", options: modelIds }
  );
  const recommendedSmallModel = resolveSmallToolModel(
    state.models.data,
    process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL
  );
  const selectedSmallModel = await consola5.prompt(
    "Select a small model to use with Claude Code (used for subagent + background tool calls \u2014 pick a tool-capable model)",
    {
      type: "select",
      options: modelIds,
      // Pre-select a tool-competent haiku-class default when available, so the
      // user doesn't have to know that a weak small model breaks subagent tools.
      initial: recommendedSmallModel && modelIds.includes(recommendedSmallModel) ? recommendedSmallModel : void 0
    }
  );
  const command = generateEnvScript(
    {
      ANTHROPIC_BASE_URL: serverUrl,
      ANTHROPIC_AUTH_TOKEN: "dummy",
      ANTHROPIC_MODEL: selectedModel,
      ANTHROPIC_DEFAULT_SONNET_MODEL: selectedModel,
      ANTHROPIC_DEFAULT_HAIKU_MODEL: selectedSmallModel,
      DISABLE_NON_ESSENTIAL_MODEL_CALLS: "1",
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
      CLAUDE_CODE_ATTRIBUTION_HEADER: "0",
      CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION: "false",
      CLAUDE_CODE_DISABLE_TERMINAL_TITLE: "true",
      CLAUDE_CODE_ENABLE_AWAY_SUMMARY: "0",
      CLAUDE_PLUGIN_ENABLE_QUESTION_RULES: "true"
    },
    "claude"
  );
  try {
    clipboard.writeSync(command);
    consola5.success("Copied Claude Code command to clipboard!");
  } catch {
    consola5.warn(
      "Failed to copy to clipboard. Here is the Claude Code command:"
    );
    consola5.log(command);
  }
}

// src/lib/start/port.ts
import consola6 from "consola";
import net2 from "net";
async function maybeEvictRunning(port) {
  try {
    await evictRunning({ port });
  } catch (error) {
    consola6.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
function reportPortBusyAndExit(port, occupant) {
  if (occupant === "maximal") {
    consola6.error(
      [
        `Port ${port} is already in use by another maximal instance.`,
        ``,
        `Options:`,
        `  \u2022 Re-run with --replace to evict it.`,
        `  \u2022 Stop the other instance and try again.`,
        `  \u2022 Pass --port <n> to use a different port.`
      ].join("\n")
    );
  } else {
    const lookupHint = process.platform === "darwin" || process.platform === "linux" ? `lsof -i :${port}` : `Get-Process -Id (Get-NetTCPConnection -LocalPort ${port}).OwningProcess`;
    consola6.error(
      [
        `Port ${port} is in use by another process (not maximal).`,
        ``,
        `Pass --port <n> to use a different port, or stop the other process.`,
        ``,
        `Find the offender with:`,
        `    ${lookupHint}`
      ].join("\n")
    );
  }
  process.exit(1);
}
async function probePort(port) {
  try {
    const res = await fetch(`http://localhost:${port}/`, {
      signal: AbortSignal.timeout(500)
    });
    if (!res.ok) return "other";
    const text = (await res.text()).trim();
    return text === "Server running" ? "maximal" : "other";
  } catch {
    return "free";
  }
}
var BIND_TEST_HOSTS = ["127.0.0.1", "::1", "0.0.0.0"];
var IN_USE_CODES = /* @__PURE__ */ new Set(["EADDRINUSE", "EACCES"]);
function tryListen(port, host) {
  return new Promise((resolve) => {
    const probe = net2.createServer();
    probe.unref();
    probe.once("error", (error) => {
      resolve(IN_USE_CODES.has(error.code ?? "") ? "held" : "n/a");
    });
    probe.once("listening", () => {
      probe.close(() => {
        resolve("free");
      });
    });
    try {
      probe.listen(port, host);
    } catch {
      resolve("n/a");
    }
  });
}
async function isPortBindable(port) {
  for (const host of BIND_TEST_HOSTS) {
    if (await tryListen(port, host) === "held") return false;
  }
  return true;
}
var PORT_SCAN_LIMIT = 20;
var MAX_PORT = 65535;
async function resolvePort(requested, policy, deps = {}) {
  if (requested === 0) return { ok: true, port: 0 };
  const probe = deps.probe ?? probePort;
  const bindable = deps.bindable ?? isPortBindable;
  const occupant = await probe(requested);
  if (occupant === "free" && await bindable(requested)) {
    return { ok: true, port: requested };
  }
  const holder = occupant === "free" ? "other" : occupant;
  switch (policy) {
    case "fail": {
      return { ok: false, reason: "busy", port: requested, occupant: holder };
    }
    case "replace": {
      if (holder !== "maximal") {
        return { ok: false, reason: "busy", port: requested, occupant: holder };
      }
      const evict = deps.evict ?? maybeEvictRunning;
      await evict(requested);
      if (!await bindable(requested)) {
        return { ok: false, reason: "evict-failed", port: requested };
      }
      return { ok: true, port: requested };
    }
    case "next": {
      return scanForNextFree(requested, probe, bindable);
    }
    default: {
      const unhandled = policy;
      throw new Error(`Unhandled port policy: ${String(unhandled)}`);
    }
  }
}
async function scanForNextFree(requested, probe, bindable) {
  const through = Math.min(requested + PORT_SCAN_LIMIT - 1, MAX_PORT);
  for (let candidate = requested + 1; candidate <= through; candidate++) {
    if (await probe(candidate) !== "free") continue;
    if (!await bindable(candidate)) continue;
    return { ok: true, port: candidate, movedFrom: requested };
  }
  return { ok: false, reason: "exhausted", from: requested, through };
}
function portOrExit(resolution) {
  if (resolution.ok) {
    if (resolution.movedFrom !== void 0) {
      consola6.warn(
        `Port ${resolution.movedFrom} is in use \u2014 starting on ${resolution.port} instead.`
      );
      emitBootStatus(
        `Port ${resolution.movedFrom} busy, using ${resolution.port}\u2026`
      );
    }
    return resolution.port;
  }
  switch (resolution.reason) {
    case "busy": {
      reportPortBusyAndExit(resolution.port, resolution.occupant);
      break;
    }
    case "evict-failed": {
      consola6.error(
        `Port ${resolution.port} is still held after evicting the maximal instance on it.`
      );
      process.exit(1);
      break;
    }
    case "exhausted": {
      consola6.error(
        [
          `Port ${resolution.from} is in use, and so is every port through ${resolution.through}.`,
          ``,
          `Options:`,
          `  \u2022 Pass --port <n> to start somewhere else.`,
          `  \u2022 Free one of the ports in that range.`,
          `  \u2022 Set "server": { "portPolicy": "replace" } in config to evict a maximal instance.`
        ].join("\n")
      );
      process.exit(1);
      break;
    }
    default: {
      const unhandled = resolution;
      throw new Error(`Unhandled resolution: ${String(unhandled)}`);
    }
  }
  throw new Error("unreachable: every failure branch exits");
}

// src/lib/start/session-sentinel.ts
import fs3 from "fs";
import path3 from "path";
var SENTINEL_FILENAME = "session-running";
function sentinelPath() {
  return path3.join(PATHS.APP_DIR, SENTINEL_FILENAME);
}
function markSessionRunning() {
  try {
    fs3.mkdirSync(PATHS.APP_DIR, { recursive: true });
    fs3.writeFileSync(
      sentinelPath(),
      JSON.stringify({
        pid: process.pid,
        started_at: (/* @__PURE__ */ new Date()).toISOString()
      })
    );
  } catch {
  }
}
function clearSessionRunning() {
  try {
    fs3.rmSync(sentinelPath(), { force: true });
  } catch {
  }
}
function staleSessionMarkerPresent() {
  try {
    return fs3.existsSync(sentinelPath());
  } catch {
    return false;
  }
}

// src/lib/start/shutdown.ts
import consola7 from "consola";
var shuttingDown = false;
async function initiateShutdown(servers, reason, disposeProviderGateway) {
  if (shuttingDown) return;
  shuttingDown = true;
  consola7.info(`shutdown: ${reason}, draining`);
  reconcileClaudeCodeOnShutdown();
  const watchdog = setTimeout(() => {
    consola7.warn("shutdown: watchdog tripped, forcing exit");
    process.exit(1);
  }, 2500);
  watchdog.unref();
  for (const server of servers) {
    try {
      await server.close(true);
    } catch (error) {
      consola7.warn("shutdown: server.close() threw", error);
    }
  }
  try {
    await disposeProviderGateway?.();
  } catch (error) {
    consola7.warn("shutdown: provider gateway disposal threw", error);
  }
  await removePidfile();
  clearSessionRunning();
  clearTimeout(watchdog);
  process.exit(0);
}
function installShutdownHandlers(servers, disposeProviderGateway) {
  process.on("SIGTERM", () => {
    void initiateShutdown(servers, "received SIGTERM", disposeProviderGateway);
  });
  process.on("SIGINT", () => {
    void initiateShutdown(servers, "received SIGINT", disposeProviderGateway);
  });
  process.on("exit", () => {
    try {
      reconcileClaudeCodeOnShutdown();
    } catch {
    }
    try {
      clearSessionRunning();
    } catch {
    }
  });
  const parentPidStr = process.env.MAXIMAL_SIDECAR_PARENT_PID;
  const parentPid = parentPidStr ? Number(parentPidStr) : null;
  if (parentPid && Number.isInteger(parentPid) && parentPid > 0) {
    consola7.info(`shutdown: watching parent pid ${parentPid}`);
    const interval = setInterval(() => {
      try {
        process.kill(parentPid, 0);
      } catch {
        clearInterval(interval);
        consola7.warn(`shutdown: parent ${parentPid} gone`);
        void initiateShutdown(
          servers,
          `parent ${parentPid} exited`,
          disposeProviderGateway
        );
      }
    }, 3e3);
    interval.unref();
  }
}

// src/lib/start/run-server.ts
var serveImpl = serve;
function __setServeForTests(fn) {
  serveImpl = fn ?? serve;
}
var bootSecretsImpl = bootSecrets;
function __setBootSecretsForTests(fn) {
  bootSecretsImpl = fn ?? bootSecrets;
}
async function runServer(options) {
  consola8.options.throttle = 0;
  consola8.start("Starting maximal\u2026");
  if (options.replace) {
    emitBootStatus(`Taking over port ${options.port}\u2026`);
    await maybeEvictRunning(options.port);
  }
  mergeConfigWithDefaults();
  const config = getConfig();
  const port = portOrExit(
    await resolvePort(
      options.port,
      config.server?.portPolicy ?? DEFAULT_PORT_POLICY
    )
  );
  const controlPortRequested = await resolveControlPort(options.controlPort);
  const git = getGitVersion();
  consola8.info(
    `Source revision: ${shortSha(git.sha)}${git.branch ? ` (${git.branch})` : ""}`
  );
  const bootLogger = initBootLogger(git, options);
  await initOpencodeVersion();
  if (options.proxyEnv) {
    initProxyFromEnv();
  }
  state.verbose = options.verbose;
  if (options.verbose) {
    consola8.level = 5;
    consola8.info("Verbose logging enabled");
  }
  state.accountType = options.accountType;
  if (options.accountType !== "individual") {
    consola8.info(`Using ${options.accountType} plan GitHub account`);
  }
  state.manualApprove = options.manual;
  state.rateLimitSeconds = options.rateLimit;
  state.rateLimitWait = options.rateLimitWait;
  state.showToken = options.showToken;
  state.proxyPort = port;
  state.controlPort = controlPortRequested;
  await ensurePaths();
  bootSecretsImpl();
  const staleSession = staleSessionMarkerPresent();
  if (staleSession) {
    consola8.warn(
      "Previous maximal session ended ungracefully (likely a crash, force-quit, or system shutdown). If `claude` produced connection-refused errors since then, that was why \u2014 your Claude Code config still pointed at this proxy. Routing is being re-applied now and will work again."
    );
  }
  const removedShim = removeLegacyShimIfPresent();
  if (removedShim) {
    consola8.info(`Removed legacy Claude Code shim at ${removedShim}`);
  }
  await cacheVSCodeVersion();
  cacheMacMachineId();
  cacheVsCodeSessionId();
  await cacheVsCodeDeviceId();
  await bootstrapUpstream(options.githubToken);
  const executorName = process.env.OLLAMA_API_KEY ? "OllamaWebExecutor" : "InProcessFetchExecutor (search disabled; set OLLAMA_API_KEY)";
  consola8.info(`Web-tools executor: ${executorName}`);
  const serverUrl = `http://localhost:${port}`;
  if (options.claudeCode) {
    if (state.models) {
      await runClaudeCodeFlow(serverUrl);
    } else {
      consola8.warn(
        "--claude-code requires an authenticated session; skipping helper."
      );
    }
  }
  emitBootStatus("Starting the server\u2026");
  logListening(bootLogger, serverUrl, executorName);
  const providerConfigSource = createProviderHostConfigSource();
  const { proxyServer, controlServer, providerDispatcher } = await bindListeners({
    controlPort: controlPortRequested,
    createProviderGateway: options.createProviderGateway,
    providerConfigSource,
    providerGateway: options.providerGateway,
    proxyPort: port
  });
  finalizeBoot({
    proxyServer,
    proxyRequested: port,
    controlServer,
    controlRequested: controlPortRequested,
    providerDispatcher
  });
}
function logListening(bootLogger, serverUrl, executorName) {
  bootLogger.info(
    `listening url=${serverUrl} executor=${executorName.split(" ")[0]} auth=${hasGithubToken() ? "authenticated" : "unauthenticated"}`
  );
}
async function bindListeners({
  controlPort,
  createProviderGateway,
  providerConfigSource,
  providerGateway,
  proxyPort
}) {
  let providerDispatcher;
  const listeners = [];
  const requestShutdown2 = (reason) => {
    const dispatcher = providerDispatcher;
    if (!dispatcher) return Promise.resolve();
    return initiateShutdown(listeners, reason, () => dispatcher.dispose());
  };
  try {
    const { createServerApps } = await import("./server-2VFBUTIV.js");
    const apps = createServerApps({
      createProviderGateway,
      providerConfigSource,
      providerGateway,
      requestShutdown: requestShutdown2
    });
    providerDispatcher = apps.providerDispatcher;
    await providerDispatcher.ready();
    const proxyServer = serveImpl({
      fetch: apps.publicApp.fetch,
      port: proxyPort,
      bun: { idleTimeout: 0 }
    });
    listeners.push(proxyServer);
    const controlServer = serveImpl({
      fetch: apps.controlApp.fetch,
      port: controlPort,
      hostname: "127.0.0.1",
      bun: { idleTimeout: 0 }
    });
    listeners.push(controlServer);
    return { proxyServer, controlServer, providerDispatcher };
  } catch (error) {
    for (const listener of listeners) {
      try {
        await listener.close(true);
      } catch (closeError) {
        consola8.warn("startup: server.close() threw", closeError);
      }
    }
    if (providerDispatcher) {
      await providerDispatcher.dispose();
    } else {
      await providerConfigSource.dispose();
      await providerGateway?.dispose();
    }
    throw error;
  }
}
async function resolveControlPort(requested) {
  if (requested === void 0 || !Number.isInteger(requested) || requested < 0) {
    return 0;
  }
  return portOrExit(
    await resolvePort(
      requested,
      getConfig().server?.portPolicy ?? DEFAULT_PORT_POLICY
    )
  );
}
function boundPort(httpServer, requested) {
  const url = httpServer.url;
  if (!url) return requested;
  const parsed = Number(new URL(url).port);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : requested;
}
function finalizeBoot({
  proxyServer,
  proxyRequested,
  controlServer,
  controlRequested,
  providerDispatcher
}) {
  const proxyPort = boundPort(proxyServer, proxyRequested);
  const controlPort = boundPort(controlServer, controlRequested);
  state.proxyPort = proxyPort;
  state.controlPort = controlPort;
  emitReadyLine({
    v: READY_LINE_VERSION,
    controlPort,
    proxyPort,
    pid: process.pid
  });
  printReadyBanner(proxyPort, controlPort);
  void writePidfile();
  reconcileClaudeCodeOnBoot();
  markSessionRunning();
  startTokenUsageRetention();
  installShutdownHandlers(
    [proxyServer, controlServer],
    () => providerDispatcher.dispose()
  );
}

export {
  __setServeForTests,
  __setBootSecretsForTests,
  runServer
};
