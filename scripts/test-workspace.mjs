import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const traceValues = new Set(["off", "tests", "all"]);
const scrubbedEnvironment = [
  "ALL_PROXY",
  "ANTHROPIC_API_KEY",
  "CLAUDE_CODE_OAUTH_TOKEN",
  "GITHUB_TOKEN",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "OPENAI_API_KEY",
];
const usage = "Usage: pnpm test -- [--all|--core] [--trace=off|tests|all]";

export function parseTestOptions(arguments_) {
  const separators = arguments_.filter((option) => option === "--").length;
  if (separators > 1) throw new Error(usage);
  const options = arguments_.filter((option) => option !== "--");
  let scope = "affected";
  let trace = "off";
  let sawTrace = false;

  for (const option of options) {
    if (option === "--all" || option === "--core") {
      if (scope !== "affected") throw new Error("Duplicate test scope option");
      scope = option.slice(2);
      continue;
    }
    if (option.startsWith("--trace=")) {
      if (sawTrace) throw new Error("Duplicate --trace option");
      sawTrace = true;
      trace = option.slice("--trace=".length);
      if (!traceValues.has(trace)) {
        throw new Error(`Invalid test trace mode: ${trace}`);
      }
      continue;
    }
    throw new Error(usage);
  }

  return { scope, trace };
}

function gitOutput(arguments_, label, root = repositoryRoot) {
  try {
    return execFileSync("git", arguments_, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} could not be resolved: ${detail}`);
  }
}

export function affectedBase(root = repositoryRoot) {
  try {
    gitOutput(
      ["rev-parse", "--verify", "origin/main^{commit}"],
      "origin/main",
      root,
    );
  } catch (error) {
    throw new Error(
      "The affected test base origin/main is unavailable. Run `git fetch origin main`" +
        " and retry.",
      { cause: error },
    );
  }
  const base = gitOutput(
    ["merge-base", "HEAD", "origin/main"],
    "merge base",
    root,
  );
  if (!/^[0-9a-f]{40}$/u.test(base)) {
    throw new Error(`Invalid merge base: ${base}`);
  }
  return base;
}

export function createIsolatedTestEnvironment(parent = os.tmpdir()) {
  const root = fs.mkdtempSync(path.join(parent, "monimal-tests-"));
  fs.chmodSync(root, 0o700);
  const directories = {
    home: path.join(root, "home"),
    cache: path.join(root, "xdg-cache"),
    config: path.join(root, "xdg-config"),
    data: path.join(root, "xdg-data"),
    state: path.join(root, "xdg-state"),
    appData: path.join(root, "app-data"),
    localAppData: path.join(root, "local-app-data"),
    maximal: path.join(root, "maximal"),
    claude: path.join(root, "claude"),
  };
  for (const directory of Object.values(directories)) {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  }

  const environment = { ...process.env };
  for (const name of scrubbedEnvironment) delete environment[name];
  Object.assign(environment, {
    MAXIMAL_TEST_HOST: "1",
    MAXIMAL_TEST_ROOT: root,
    HOME: directories.home,
    XDG_CACHE_HOME: directories.cache,
    XDG_CONFIG_HOME: directories.config,
    XDG_DATA_HOME: directories.data,
    XDG_STATE_HOME: directories.state,
    USERPROFILE: directories.home,
    APPDATA: directories.appData,
    LOCALAPPDATA: directories.localAppData,
    COPILOT_API_HOME: directories.maximal,
    CLAUDE_CONFIG_DIR: directories.claude,
  });
  delete environment.MAXIMAL_TEST_CONTAINER;
  return { environment, root };
}

function run(command, arguments_, environment, label) {
  const result = spawnSync(command, arguments_, {
    cwd: repositoryRoot,
    env: environment,
    stdio: "inherit",
  });
  if (result.error)
    throw new Error(`${label} could not start: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(
      `${label} failed with exit code ${result.status ?? "unknown"}`,
    );
  }
}

export function turboTestArguments(options, base) {
  const arguments_ = ["run", "test", "--concurrency=1"];
  if (options.scope === "core") {
    arguments_.push("--filter=@stuffbucket/maximal-core");
  } else if (options.scope === "affected") {
    arguments_.push(`--filter=...[${base}]`);
  }
  return arguments_;
}

export function main(arguments_ = process.argv.slice(2)) {
  const options = parseTestOptions(arguments_);
  const base = options.scope === "affected" ? affectedBase() : undefined;
  const isolated = createIsolatedTestEnvironment();
  if (options.trace !== "off") {
    isolated.environment.MAXIMAL_TEST_TRACE =
      options.trace === "all" ? "all" : "1";
  } else {
    delete isolated.environment.MAXIMAL_TEST_TRACE;
  }

  try {
    run(
      process.execPath,
      ["--test", "tests/docker-test-policy.test.mjs"],
      isolated.environment,
      "Root policy tests",
    );
    run(
      path.join(repositoryRoot, "node_modules/.bin/turbo"),
      turboTestArguments(options, base),
      isolated.environment,
      "Workspace tests",
    );
  } finally {
    fs.rmSync(isolated.root, { recursive: true, force: true });
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (fileURLToPath(import.meta.url) === invokedPath) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
