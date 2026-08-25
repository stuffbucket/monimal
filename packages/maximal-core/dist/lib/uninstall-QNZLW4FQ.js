#!/usr/bin/env node
import {
  getAllApps
} from "./chunk-BFCASIWE.js";
import "./chunk-SMHXZYWZ.js";
import "./chunk-LIOSYQNE.js";
import {
  PATHS
} from "./chunk-4JX7327A.js";
import "./chunk-KCUNSZQQ.js";

// src/uninstall.ts
import { defineCommand } from "citty";
import consola from "consola";
import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
async function runUninstall(opts) {
  consola.box("maximal uninstall");
  const enabled = enabledApps();
  if (enabled.length > 0 && !opts.force) {
    const names = enabled.map((a) => a.name).join(", ");
    consola.error(`These apps are still routing through maximal: ${names}.`);
    consola.info(
      "Turn them off in Settings \u2192 Apps (or e.g. `maximal app claude-code --disable`), then re-run `maximal uninstall`. Or pass `--force` to disable them and uninstall in one step."
    );
    throw new Error(
      `Refusing to uninstall while apps are enabled: ${names}. Disable them or pass --force.`
    );
  }
  consola.info("Step 1/5: Stop the running proxy");
  stopProxy();
  consola.info("Step 2/5: Remove startup integration");
  removeStartupIntegration();
  consola.info("Step 3/5: Remove the binary");
  removeBinary();
  consola.info("Step 4/5: Revert app integrations");
  await revertAppIntegrations(enabled);
  consola.info("Step 5/5: Optional cleanup");
  await maybePurgeSecrets(opts);
  consola.box("Uninstall complete.");
}
function stopProxy() {
  if (process.platform === "darwin") {
    const r = spawnSync(
      "launchctl",
      ["bootout", `gui/${process.getuid?.() ?? 0}/co.stuffbucket.maximal`],
      { encoding: "utf8" }
    );
    if (r.status === 0) {
      consola.success("  launchd agent stopped");
    } else {
      consola.info("  launchd agent not running (or already removed)");
    }
    return;
  }
  if (process.platform === "win32") {
    const r = spawnSync("schtasks", ["/End", "/TN", "maximal"], {
      encoding: "utf8"
    });
    if (r.status === 0) {
      consola.success("  scheduled task stopped");
    } else {
      consola.info("  scheduled task not running (or already removed)");
    }
    return;
  }
  consola.info("  unsupported platform; skipping startup integration");
}
function removeStartupIntegration() {
  if (process.platform === "darwin") {
    const plist = path.join(
      os.homedir(),
      "Library",
      "LaunchAgents",
      "co.stuffbucket.maximal.plist"
    );
    if (fs.existsSync(plist)) {
      try {
        fs.rmSync(plist);
        consola.success(`  removed ${plist}`);
      } catch (err) {
        consola.warn(`  could not remove ${plist}`, err);
      }
    } else {
      consola.info("  launchd plist not found; nothing to remove");
    }
    return;
  }
  if (process.platform === "win32") {
    const r = spawnSync("schtasks", ["/Delete", "/TN", "maximal", "/F"], {
      encoding: "utf8"
    });
    if (r.status === 0) {
      consola.success("  scheduled task unregistered");
    } else {
      consola.info("  scheduled task not registered; nothing to remove");
    }
    return;
  }
  consola.info("  unsupported platform; skipping");
}
function installTargets() {
  if (process.platform === "win32") return [];
  return ["/usr/local/bin/maximal", "/opt/homebrew/bin/maximal"];
}
function removeBinary() {
  let removed = 0;
  for (const target of installTargets()) {
    try {
      fs.lstatSync(target);
    } catch {
      continue;
    }
    try {
      fs.rmSync(target);
      consola.success(`  removed ${target}`);
      removed++;
    } catch (err) {
      consola.warn(`  could not remove ${target}`, err);
    }
  }
  if (removed === 0) {
    consola.info("  no installed binary found");
  }
}
function enabledApps() {
  return getAllApps().filter((app) => app.isEnabled());
}
async function revertAppIntegrations(stillEnabled) {
  for (const app of stillEnabled) {
    try {
      await app.disable();
      consola.success(`  disabled ${app.name}`);
    } catch (err) {
      consola.warn(`  could not disable ${app.name}`, err);
    }
  }
  for (const app of getAllApps()) {
    try {
      const result = await app.uninstall();
      for (const line of result.reverted) consola.success(`  ${line}`);
    } catch (err) {
      consola.warn(`  could not revert ${app.name}`, err);
    }
  }
}
async function maybePurgeSecrets(opts) {
  const secretsDir = path.join(PATHS.APP_DIR, "secrets");
  const tokenPaths = [PATHS.GITHUB_TOKEN_PATH, PATHS.ACCOUNTS_PATH];
  const willPurge = opts.purge || await confirmPurge(opts);
  if (!willPurge) {
    consola.info(`  \u2139 secrets dir kept (${secretsDir}); use --purge to remove`);
    consola.info(`  \u2139 github tokens kept (${tokenPaths.join(", ")})`);
    return;
  }
  if (fs.existsSync(secretsDir)) {
    try {
      fs.rmSync(secretsDir, { recursive: true });
      consola.success(`  removed ${secretsDir}`);
    } catch (err) {
      consola.warn(`  could not remove ${secretsDir}`, err);
    }
  }
  for (const tokenPath of tokenPaths) {
    if (!fs.existsSync(tokenPath)) continue;
    try {
      fs.rmSync(tokenPath);
      consola.success(`  removed ${tokenPath}`);
    } catch (err) {
      consola.warn(`  could not remove ${tokenPath}`, err);
    }
  }
}
async function confirmPurge(opts) {
  if (opts.unattended) return false;
  const answer = await consola.prompt(
    "Remove secrets directory and GitHub token? (default: no)",
    { type: "confirm", initial: false }
  );
  return answer;
}
var uninstall = defineCommand({
  meta: {
    name: "uninstall",
    description: "Stop the proxy, remove the binary, and revert app integrations. Refuses while apps are enabled unless --force."
  },
  args: {
    purge: {
      type: "boolean",
      default: false,
      description: "Also remove ~/.local/share/maximal/secrets and the GitHub token"
    },
    force: {
      type: "boolean",
      default: false,
      description: "Uninstall even if apps are still enabled: disable each app, then revert and remove. Without it, uninstall refuses while any app is enabled."
    },
    unattended: {
      type: "boolean",
      default: false,
      description: "No prompts. Combined with default flags, leaves secrets untouched."
    },
    "keep-app": {
      type: "boolean",
      default: false,
      description: "Accepted for the shell's in-app uninstall, which passes it over IPC. Currently a no-op: maximal ships no application bundle, so there is no bundle to keep and the Homebrew binaries are removed either way."
    }
  },
  run({ args }) {
    return runUninstall({
      purge: args.purge,
      force: args.force,
      unattended: args.unattended,
      keepApp: args["keep-app"]
    });
  }
});
export {
  enabledApps,
  installTargets,
  revertAppIntegrations,
  runUninstall,
  uninstall
};
