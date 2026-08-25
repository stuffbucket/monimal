import {
  HELPER_LABEL,
  applyProxyBaseUrl,
  atomicWriteJson,
  detectClaudeInstalls,
  getClaudeCodeSettingsPath,
  isProxyBaseUrlConfigured,
  reconcileClaudeCodeOnBoot,
  reconcileClaudeCodeOnShutdown,
  resolveApiKeyHelperCommand,
  revertProxyBaseUrl,
  setClaudeCodeRoutingIntent
} from "./chunk-SMHXZYWZ.js";
import {
  ensureDefaultEndpointKey
} from "./chunk-LIOSYQNE.js";

// src/apps/claude-code/index.ts
var CLAUDE_CODE_INSTALL_COMMAND = "curl -fsSL https://claude.ai/install.sh | sh";
function createClaudeCodeApp(options = {}) {
  const resolveApiKeyHelper = options.resolveApiKeyHelper ?? resolveApiKeyHelperCommand;
  return {
    id: "claude-code",
    name: "Claude Code",
    kind: "config",
    apiKeyLabel: HELPER_LABEL,
    detect() {
      const installs = detectClaudeInstalls();
      return Promise.resolve(installs.length > 0);
    },
    getDetails(conflict = null) {
      const installs = detectClaudeInstalls();
      return Promise.resolve({
        id: "claude-code",
        name: "Claude Code",
        kind: "config",
        enabled: isProxyBaseUrlConfigured(),
        status: installs.length > 0 ? "ready" : "not-installed",
        installs: installs.map((i) => ({
          path: i.path,
          version: i.version,
          source: i.source
        })),
        install: installs.length === 0 ? { method: "curl", command: CLAUDE_CODE_INSTALL_COMMAND } : null,
        conflict
      });
    },
    enable() {
      const result = applyProxyBaseUrl(void 0, resolveApiKeyHelper);
      const conflict = result.skippedReason === "foreign-base-url" || result.skippedReason === "foreign-api-key-helper" || result.skippedReason === "invalid-api-key-helper" ? result.skippedReason : null;
      if (conflict !== null) {
        return Promise.resolve({ success: false, conflict });
      }
      setClaudeCodeRoutingIntent(true);
      ensureDefaultEndpointKey();
      return Promise.resolve({ success: true, conflict: null });
    },
    disable() {
      const result = revertProxyBaseUrl();
      setClaudeCodeRoutingIntent(false);
      return Promise.resolve({ success: result.wrote });
    },
    uninstall() {
      const reverted = [];
      const result = revertProxyBaseUrl();
      if (result.wrote) {
        reverted.push(`reverted ${getClaudeCodeSettingsPath()}`);
      }
      return Promise.resolve({ reverted });
    },
    isEnabled() {
      return isProxyBaseUrlConfigured();
    },
    onBoot() {
      reconcileClaudeCodeOnBoot(void 0, void 0, resolveApiKeyHelper);
      return Promise.resolve();
    },
    onShutdown() {
      reconcileClaudeCodeOnShutdown();
      return Promise.resolve();
    }
  };
}
var claudeCodeApp = createClaudeCodeApp();

// src/apps/claude-desktop/cli.ts
import consola from "consola";
import fs3 from "fs";
import path3 from "path";

// src/apps/claude-desktop/config.ts
import { randomUUID } from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
var USERDATA_3P_SUFFIX = "-3p";
var CLAUDE_3P_PREF_DOMAIN = "com.anthropic.claudefordesktop";
function gatewayProfile(home = os.homedir(), baseUrl = "http://127.0.0.1:4141") {
  return {
    inferenceProvider: "gateway",
    inferenceGatewayBaseUrl: baseUrl,
    inferenceGatewayApiKey: "anything",
    inferenceGatewayAuthScheme: "bearer",
    disableDeploymentModeChooser: true,
    coworkEgressAllowedHosts: ["*"],
    allowedWorkspaceFolders: [path.join(home, "Claude")],
    disableEssentialTelemetry: true,
    disableNonessentialTelemetry: true,
    // Artifacts preview (favicon/iframe fetch), NOT a telemetry knob despite
    // the name — must stay false or Artifacts previews break.
    disableNonessentialServices: false,
    disableAutoUpdates: false,
    // MCP/extension surface, dropped by 3a36604 (PR #159) while it fixed the
    // configLibrary directory bug (#160). Their absence collapses to a locked
    // default once any managed config source is present, which is what
    // blocked MCPs and Plugins in Claude Desktop (#188).
    isLocalDevMcpEnabled: true,
    isDesktopExtensionEnabled: true,
    isDesktopExtensionDirectoryEnabled: true,
    isDesktopExtensionSignatureRequired: false,
    isClaudeCodeForDesktopEnabled: true
  };
}
function getClaude3pDir(home = os.homedir(), platform = process.platform) {
  if (platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA ?? path.join(home, "AppData", "Local");
    return path.join(localAppData, `Claude${USERDATA_3P_SUFFIX}`);
  }
  return path.join(
    home,
    "Library",
    "Application Support",
    `Claude${USERDATA_3P_SUFFIX}`
  );
}
function readMetaFile(file) {
  const raw = readJsonObject(file);
  const entries = raw?.entries;
  return {
    appliedId: typeof raw?.appliedId === "string" ? raw.appliedId : "",
    entries: Array.isArray(entries) ? entries.filter(
      (e) => typeof e === "object" && e !== null && typeof e.id === "string" && typeof e.name === "string"
    ) : []
  };
}
function profileMatches(existing, values) {
  if (!existing) return false;
  return Object.keys(values).every(
    (k) => JSON.stringify(existing[k]) === JSON.stringify(values[k])
  );
}
function readJsonObject(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
function atomicWriteJson2(file, value) {
  atomicWriteJson(file, value, { label: "Claude Desktop config" });
}
var OWNED_PREFERENCES = { coworkWebSearchEnabled: true };
var OWNED_PREFERENCE_KEYS = Object.keys(OWNED_PREFERENCES);
function applyConfigLibraryProfile(home = os.homedir(), values = gatewayProfile(home)) {
  const dir = getClaude3pDir(home);
  const libDir = path.join(dir, "configLibrary");
  const metaPath = path.join(libDir, "_meta.json");
  const meta = readMetaFile(metaPath);
  const profileId = meta.appliedId || randomUUID();
  const profilePath = path.join(libDir, `${profileId}.json`);
  const ensuredWorkspaceFolders = ensureWorkspaceFolders(
    values.allowedWorkspaceFolders
  );
  const existingProfile = readJsonObject(profilePath);
  const topPath = path.join(dir, "claude_desktop_config.json");
  const top = readJsonObject(topPath) ?? {};
  const alreadyApplied = meta.appliedId === profileId && profileMatches(existingProfile, values) && top.deploymentMode === "3p";
  if (alreadyApplied) {
    return { dir, profileId, wrote: false, ensuredWorkspaceFolders };
  }
  atomicWriteJson2(profilePath, values);
  const entries = meta.entries.some((e) => e.id === profileId) ? meta.entries : [...meta.entries, { id: profileId, name: "Default" }];
  atomicWriteJson2(metaPath, { appliedId: profileId, entries });
  top.deploymentMode = "3p";
  const prefs = typeof top.preferences === "object" && top.preferences !== null ? top.preferences : {};
  top.preferences = { ...prefs, ...OWNED_PREFERENCES };
  atomicWriteJson2(topPath, top);
  return { dir, profileId, wrote: true, ensuredWorkspaceFolders };
}
function isConfigLibraryApplied(home = os.homedir(), values = gatewayProfile(home)) {
  const dir = getClaude3pDir(home);
  const libDir = path.join(dir, "configLibrary");
  const meta = readJsonObject(
    path.join(libDir, "_meta.json")
  );
  if (!meta?.appliedId) return false;
  const profile = readJsonObject(path.join(libDir, `${meta.appliedId}.json`));
  if (!profileMatches(profile, values)) return false;
  const top = readJsonObject(path.join(dir, "claude_desktop_config.json"));
  return top?.deploymentMode === "3p";
}
function stripOwnedPreferences(top) {
  const prefs = top.preferences;
  if (typeof prefs !== "object" || prefs === null || Array.isArray(prefs)) {
    return false;
  }
  const entries = Object.entries(prefs);
  const kept = entries.filter(([key]) => !OWNED_PREFERENCE_KEYS.includes(key));
  if (kept.length === entries.length) return false;
  if (kept.length === 0) {
    delete top.preferences;
  } else {
    top.preferences = Object.fromEntries(kept);
  }
  return true;
}
function revertConfigLibraryProfile(home = os.homedir()) {
  const dir = getClaude3pDir(home);
  const libDir = path.join(dir, "configLibrary");
  const metaPath = path.join(libDir, "_meta.json");
  const meta = readJsonObject(metaPath);
  let reverted = false;
  if (meta?.appliedId) {
    try {
      fs.rmSync(path.join(libDir, `${meta.appliedId}.json`), { force: true });
    } catch {
    }
    const entries = meta.entries.filter((e) => e.id !== meta.appliedId);
    atomicWriteJson2(metaPath, { appliedId: "", entries });
    reverted = true;
  }
  const topPath = path.join(dir, "claude_desktop_config.json");
  const top = readJsonObject(topPath);
  if (top) {
    let dirty = false;
    if ("deploymentMode" in top) {
      delete top.deploymentMode;
      dirty = true;
    }
    if (stripOwnedPreferences(top)) dirty = true;
    if (dirty) {
      atomicWriteJson2(topPath, top);
      reverted = true;
    }
  }
  return { dir, reverted };
}
function ensureWorkspaceFolders(folders) {
  const created = [];
  for (const folder of folders) {
    try {
      fs.mkdirSync(folder, { recursive: true });
      created.push(folder);
    } catch {
    }
  }
  return created;
}
function plistEscape(s) {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
function plistValue(v, indent) {
  const pad = "  ".repeat(indent);
  if (typeof v === "string") return `${pad}<string>${plistEscape(v)}</string>`;
  if (typeof v === "boolean") return `${pad}<${v ? "true" : "false"}/>`;
  if (Array.isArray(v)) {
    const items = v.map((x) => plistValue(x, indent + 1)).join("\n");
    return `${pad}<array>
${items}
${pad}</array>`;
  }
  if (typeof v === "object" && v !== null) {
    const body = Object.entries(v).map(
      ([k, val]) => `${pad}  <key>${plistEscape(k)}</key>
${plistValue(val, indent + 1)}`
    ).join("\n");
    return `${pad}<dict>
${body}
${pad}</dict>`;
  }
  throw new Error(`unsupported plist value: ${typeof v}`);
}
function generateManagedProfile(home = os.homedir(), values = gatewayProfile(home), opts = {}) {
  const profileUUID = opts.profileUUID ?? randomUUID();
  const payloadUUID = opts.payloadUUID ?? randomUUID();
  const scope = opts.scope ?? "User";
  const settings = plistValue(values, 8);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>PayloadType</key>
      <string>com.apple.ManagedClient.preferences</string>
      <key>PayloadVersion</key>
      <integer>1</integer>
      <key>PayloadIdentifier</key>
      <string>com.maximal.claude3p.mcx</string>
      <key>PayloadUUID</key>
      <string>${payloadUUID}</string>
      <key>PayloadEnabled</key>
      <true/>
      <key>PayloadContent</key>
      <dict>
        <key>${CLAUDE_3P_PREF_DOMAIN}</key>
        <dict>
          <key>Forced</key>
          <array>
            <dict>
              <key>mcx_preference_settings</key>
${settings}
            </dict>
          </array>
        </dict>
      </dict>
    </dict>
  </array>
  <key>PayloadType</key>
  <string>Configuration</string>
  <key>PayloadVersion</key>
  <integer>1</integer>
  <key>PayloadIdentifier</key>
  <string>com.maximal.claude3p</string>
  <key>PayloadUUID</key>
  <string>${profileUUID}</string>
  <key>PayloadDisplayName</key>
  <string>maximal \u2014 Claude Desktop third-party gateway</string>
  <key>PayloadDescription</key>
  <string>Routes Claude Desktop (Cowork 3P) at the local maximal gateway (${plistEscape(values.inferenceGatewayBaseUrl)}). No Anthropic sign-in required.</string>
  <key>PayloadOrganization</key>
  <string>maximal</string>
  <key>PayloadScope</key>
  <string>${scope}</string>
</dict>
</plist>
`;
}

// src/apps/claude-desktop/detect.ts
import fs2 from "fs";
import os2 from "os";
import path2 from "path";
var CLAUDE_APP_PATH = "/Applications/Claude.app";
function claudeAppCandidates(platform = process.platform, home = os2.homedir()) {
  if (platform === "darwin") return [CLAUDE_APP_PATH];
  if (platform === "win32") {
    const localAppData = windowsLocalAppData(home);
    return [
      path2.join(localAppData, "AnthropicClaude"),
      path2.join(localAppData, "Microsoft", "WindowsApps", "Claude.exe"),
      path2.join(localAppData, "Packages", "Claude_pzs8sxrjxfjjc")
    ];
  }
  return [];
}
function windowsLocalAppData(home) {
  return process.env.LOCALAPPDATA ?? path2.join(home, "AppData", "Local");
}
function windowsMsixClaudeInstalled(home) {
  const packages = path2.join(windowsLocalAppData(home), "Packages");
  try {
    return fs2.readdirSync(packages).some(
      (name) => name.startsWith("Claude_") || name.startsWith("AnthropicPBC.Claude")
    );
  } catch {
    return false;
  }
}
function claudeAppInstalled(platform = process.platform, home = os2.homedir()) {
  const candidates = claudeAppCandidates(platform, home);
  if (candidates.length === 0) return true;
  const hasCandidate = candidates.some((p) => {
    try {
      fs2.statSync(p);
      return true;
    } catch {
      return false;
    }
  });
  if (hasCandidate) return true;
  if (platform === "win32") return windowsMsixClaudeInstalled(home);
  return false;
}

// src/apps/claude-desktop/cli.ts
var MANAGED_PROFILE_OUT = "maximal-claude-3p.mobileconfig";
var claudeDesktopCli = {
  extraArgs: {
    force: {
      type: "boolean",
      default: false,
      description: "Enable even if /Applications/Claude.app is missing (write anyway)."
    },
    managed: {
      type: "boolean",
      default: false,
      description: `Emit a managed-preferences .mobileconfig (${MANAGED_PROFILE_OUT}) for MDM fleets instead of writing the config library.`
    }
  },
  handle(op, args) {
    if (op !== "enable") return false;
    if (args.managed === true) {
      writeManagedProfile();
      return true;
    }
    if (!claudeAppInstalled() && args.force !== true) {
      const where = claudeAppCandidates().join(" or ") || "the usual location";
      consola.warn(
        `Claude Desktop not found (looked at ${where}). Install it from https://claude.ai/download, then re-run. To write the config anyway (e.g. before installing), pass --force.`
      );
      return true;
    }
    apply();
    return true;
  }
};
function apply() {
  try {
    const result = applyConfigLibraryProfile();
    if (result.wrote) {
      consola.success(
        `Claude Desktop wired at the gateway (${result.dir}, profile ${result.profileId})`
      );
    } else {
      consola.success("Claude Desktop already configured");
    }
    if (result.ensuredWorkspaceFolders.length > 0) {
      consola.info(
        `  workspace folders: ${result.ensuredWorkspaceFolders.join(", ")}`
      );
    }
    consola.info(
      "  Quit & relaunch Claude Desktop for the change to take effect."
    );
  } catch (err) {
    consola.error("Could not update Claude Desktop config", err);
  }
}
function writeManagedProfile() {
  try {
    fs3.writeFileSync(MANAGED_PROFILE_OUT, generateManagedProfile(), {
      mode: 384
    });
    const abs = path3.resolve(MANAGED_PROFILE_OUT);
    consola.success(`Wrote managed-preferences profile to ${abs}`);
    consola.info(
      `  Install it (no Anthropic sign-in needed) via either:
    sudo profiles install -path ${abs}
  \u2026or push it through your MDM (Intune/Jamf). It is read
  regardless of Claude Desktop's data dir and outranks file config.`
    );
  } catch (err) {
    consola.error("Could not write managed profile", err);
  }
}

// src/apps/claude-desktop/index.ts
var claudeDesktopApp = {
  id: "claude-desktop",
  name: "Claude Desktop",
  kind: "config",
  apiKeyLabel: "claude-desktop",
  detect() {
    return Promise.resolve(claudeAppInstalled());
  },
  getDetails() {
    const installed = claudeAppInstalled();
    const configured = isConfigLibraryApplied();
    return Promise.resolve({
      id: "claude-desktop",
      name: "Claude Desktop",
      kind: "config",
      enabled: configured,
      status: installed ? "ready" : "not-installed",
      installs: [],
      install: null,
      conflict: null
    });
  },
  enable() {
    applyConfigLibraryProfile();
    return Promise.resolve({ success: true });
  },
  disable() {
    revertConfigLibraryProfile();
    return Promise.resolve({ success: true });
  },
  uninstall() {
    const reverted = [];
    const result = revertConfigLibraryProfile();
    if (result.reverted) {
      reverted.push(`removed our gateway profile from ${result.dir}`);
    }
    return Promise.resolve({ reverted });
  },
  isEnabled() {
    return isConfigLibraryApplied();
  },
  cli: claudeDesktopCli
};

// src/apps/coming-soon.ts
import consola2 from "consola";
function comingSoonCli(name) {
  return {
    handle(op) {
      if (op === "status") return false;
      consola2.info(`${name} is coming soon; not available yet.`);
      return true;
    }
  };
}
function defineComingSoonApp(spec) {
  const { id, name } = spec;
  return {
    id,
    name,
    kind: "coming-soon",
    detect: () => Promise.resolve(false),
    getDetails: () => Promise.resolve({
      id,
      name,
      kind: "coming-soon",
      enabled: false,
      status: "coming-soon",
      installs: [],
      install: null,
      conflict: null
    }),
    enable: () => Promise.resolve({ success: false }),
    disable: () => Promise.resolve({ success: true }),
    uninstall: () => Promise.resolve({ reverted: [] }),
    isEnabled: () => false,
    cli: comingSoonCli(name)
  };
}

// src/apps/copilot-cli/index.ts
var copilotCliApp = defineComingSoonApp({
  id: "copilot-cli",
  name: "Copilot CLI"
});

// src/apps/registry.ts
var apps = {
  "claude-code": claudeCodeApp,
  "claude-desktop": claudeDesktopApp,
  "copilot-cli": copilotCliApp
};
function getAllApps() {
  return [apps["claude-code"], apps["claude-desktop"], apps["copilot-cli"]];
}
function getApp(id) {
  return apps[id];
}

export {
  getAllApps,
  getApp
};
