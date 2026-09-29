import { type ExecException, execFile } from "node:child_process";

export interface GhAccount {
  login: string;
  host: string;
  active: boolean;
  scopes: ReadonlyArray<string>;
}

export interface GhCliStatus {
  installed: boolean;
  version: string | null;
  accounts: ReadonlyArray<GhAccount>;
}

export interface GhRunResult {
  stdout: string;
  stderr: string;
  code: number;
  notFound: boolean;
}

export type GhRunner = (args: ReadonlyArray<string>) => Promise<GhRunResult>;

const GH_TIMEOUT_MS = 5_000;

function isSafeGhValue(value: string | undefined): value is string {
  return (
    value !== undefined &&
    value.length > 0 &&
    value.trim() === value &&
    !value.startsWith("-") &&
    !/[\0\r\n]/u.test(value)
  );
}

export function isReadOnlyGhArgs(args: ReadonlyArray<string>): boolean {
  if (args.length === 1 && args[0] === "--version") return true;
  if (
    args.length === 4 &&
    args[0] === "auth" &&
    args[1] === "status" &&
    args[2] === "--json" &&
    args[3] === "hosts"
  ) {
    return true;
  }
  return (
    args.length === 6 &&
    args[0] === "auth" &&
    args[1] === "token" &&
    args[2] === "--hostname" &&
    isSafeGhValue(args[3]) &&
    args[4] === "--user" &&
    isSafeGhValue(args[5])
  );
}

const defaultRunner: GhRunner = (args) => {
  if (!isReadOnlyGhArgs(args)) {
    return Promise.reject(
      new Error(
        `Refusing to run a non-read-only gh command: gh ${args.join(" ")}`,
      ),
    );
  }
  return new Promise<GhRunResult>((resolve) => {
    execFile(
      "gh",
      [...args],
      { encoding: "utf8", timeout: GH_TIMEOUT_MS, maxBuffer: 1_000_000 },
      (error: ExecException | null, stdout, stderr) => {
        if (error?.code === "ENOENT") {
          resolve({
            stdout: "",
            stderr: "",
            code: 127,
            notFound: true,
          });
          return;
        }
        resolve({
          stdout,
          stderr,
          code: error && typeof error.code === "number" ? error.code : 0,
          notFound: false,
        });
      },
    );
  });
};

function parseVersion(stdout: string): string | null {
  return /gh version (\S+)/u.exec(stdout)?.[1] ?? null;
}

function parseScopes(scopes: unknown): ReadonlyArray<string> {
  if (typeof scopes !== "string") return [];
  return scopes
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);
}

interface GhHostsJson {
  hosts?: Record<
    string,
    ReadonlyArray<{
      login?: string;
      host?: string;
      active?: boolean;
      scopes?: string;
      state?: string;
    }>
  >;
}

async function readGhAccounts(
  run: GhRunner,
): Promise<ReadonlyArray<GhAccount>> {
  const result = await run(["auth", "status", "--json", "hosts"]);
  if (result.notFound || result.code !== 0 || !result.stdout.trim()) return [];

  let parsed: GhHostsJson;
  try {
    parsed = JSON.parse(result.stdout) as GhHostsJson;
  } catch {
    return [];
  }

  const accounts: Array<GhAccount> = [];
  for (const [host, entries] of Object.entries(parsed.hosts ?? {})) {
    for (const entry of entries) {
      if (entry.state && entry.state !== "success") continue;
      if (typeof entry.login !== "string" || !entry.login) continue;
      accounts.push({
        login: entry.login,
        host: entry.host ?? host,
        active: entry.active === true,
        scopes: parseScopes(entry.scopes),
      });
    }
  }
  return accounts;
}

export async function detectGhCli(
  run: GhRunner = defaultRunner,
): Promise<GhCliStatus> {
  const version = await run(["--version"]).catch((): GhRunResult => ({
    stdout: "",
    stderr: "",
    code: 1,
    notFound: true,
  }));
  if (version.notFound) {
    return { installed: false, version: null, accounts: [] };
  }

  const accounts = await readGhAccounts(run).catch(() => []);
  return {
    installed: true,
    version: parseVersion(version.stdout),
    accounts,
  };
}

export async function getGhAccountToken(
  login: string,
  host: string,
  run: GhRunner = defaultRunner,
): Promise<string | null> {
  if (!isSafeGhValue(login) || !isSafeGhValue(host)) {
    throw new Error("GitHub CLI account login and host must be safe values");
  }
  const result = await run([
    "auth",
    "token",
    "--hostname",
    host,
    "--user",
    login,
  ]).catch((): GhRunResult => ({
    stdout: "",
    stderr: "",
    code: 1,
    notFound: true,
  }));
  if (result.notFound || result.code !== 0) return null;
  const token = result.stdout.trim();
  return token || null;
}
