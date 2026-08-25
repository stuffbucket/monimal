// src/lib/system/gh-cli.ts
import { execFile } from "child_process";
var GH_TIMEOUT_MS = 5e3;
function isReadOnlyGhArgs(args) {
  if (args.length === 1 && args[0] === "--version") return true;
  if (args[0] === "auth" && (args[1] === "status" || args[1] === "token")) {
    return true;
  }
  return false;
}
var defaultRunner = (args) => {
  if (!isReadOnlyGhArgs(args)) {
    return Promise.reject(
      new Error(
        `Refusing to run a non-read-only gh command: gh ${args.join(" ")}`
      )
    );
  }
  return new Promise((resolve) => {
    execFile(
      "gh",
      args,
      { encoding: "utf8", timeout: GH_TIMEOUT_MS, maxBuffer: 1e6 },
      (error, stdout, stderr) => {
        if (error?.code === "ENOENT") {
          resolve({ stdout: "", stderr: "", code: 127, notFound: true });
          return;
        }
        let code = 0;
        if (error) {
          code = typeof error.code === "number" ? error.code : 1;
        }
        resolve({ stdout, stderr, code, notFound: false });
      }
    );
  });
};
function parseVersion(stdout) {
  return /gh version (\S+)/.exec(stdout)?.[1] ?? null;
}
function parseScopes(scopes) {
  if (typeof scopes !== "string") return [];
  return scopes.split(",").map((s) => s.trim()).filter(Boolean);
}
async function readGhAccounts(run) {
  const result = await run(["auth", "status", "--json", "hosts"]);
  if (result.notFound || result.code !== 0 || !result.stdout.trim()) return [];
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    return [];
  }
  const accounts = [];
  for (const [host, entries] of Object.entries(parsed.hosts ?? {})) {
    for (const entry of entries) {
      if (entry.state && entry.state !== "success") continue;
      if (typeof entry.login !== "string" || !entry.login) continue;
      accounts.push({
        login: entry.login,
        host: entry.host ?? host,
        active: entry.active === true,
        scopes: parseScopes(entry.scopes)
      });
    }
  }
  return accounts;
}
async function detectGhCli(run = defaultRunner) {
  const version = await run(["--version"]).catch(
    () => ({
      stdout: "",
      stderr: "",
      code: 1,
      notFound: true
    })
  );
  if (version.notFound) {
    return { installed: false, version: null, accounts: [] };
  }
  const accounts = await readGhAccounts(run).catch(() => []);
  return {
    installed: true,
    version: parseVersion(version.stdout),
    accounts
  };
}
async function getGhAccountToken(login, host, run = defaultRunner) {
  const result = await run([
    "auth",
    "token",
    "--hostname",
    host,
    "--user",
    login
  ]).catch(
    () => ({ stdout: "", stderr: "", code: 1, notFound: true })
  );
  if (result.notFound || result.code !== 0) return null;
  const token = result.stdout.trim();
  return token || null;
}
export {
  detectGhCli,
  getGhAccountToken,
  isReadOnlyGhArgs
};
