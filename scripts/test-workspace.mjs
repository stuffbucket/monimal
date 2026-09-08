import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { affectedBase } from "./git-changes.mjs";

export { affectedBase };

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
const performanceMarkerEnvironment = "MONIMAL_PERF_MARKERS";

export function formatPerformanceMarker({
  phase,
  startedAt,
  endedAt,
  elapsedMilliseconds,
  status,
}) {
  return [
    "perf-marker",
    `phase=${phase}`,
    `started_at=${startedAt.toISOString()}`,
    `ended_at=${endedAt.toISOString()}`,
    `elapsed_seconds=${(elapsedMilliseconds / 1000).toFixed(3)}`,
    `status=${status}`,
  ].join(" ");
}

export function measurePerformancePhase(
  phase,
  operation,
  {
    enabled = process.env[performanceMarkerEnvironment] === "1",
    now = () => new Date(),
    monotonicNow = () => performance.now(),
    write = (line) => console.error(line),
  } = {},
) {
  if (!enabled) return operation();

  const startedAt = now();
  const started = monotonicNow();
  let status = "success";
  try {
    return operation();
  } catch (error) {
    status = "failure";
    throw error;
  } finally {
    write(
      formatPerformanceMarker({
        phase,
        startedAt,
        endedAt: now(),
        elapsedMilliseconds: monotonicNow() - started,
        status,
      }),
    );
  }
}

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
  delete environment[performanceMarkerEnvironment];
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
  const markersEnabled = process.env[performanceMarkerEnvironment] === "1";
  const measure = (phase, operation) =>
    measurePerformancePhase(phase, operation, { enabled: markersEnabled });

  return measure("test-total", () => {
    const options = parseTestOptions(arguments_);
    const base =
      options.scope === "affected"
        ? measure("test-affected-base", affectedBase)
        : undefined;
    const isolated = createIsolatedTestEnvironment();
    if (options.trace !== "off") {
      isolated.environment.MAXIMAL_TEST_TRACE =
        options.trace === "all" ? "all" : "1";
    } else {
      delete isolated.environment.MAXIMAL_TEST_TRACE;
    }

    try {
      measure("test-root-policy", () =>
        run(
          process.execPath,
          ["--test", "tests/docker-test-policy.test.mjs"],
          isolated.environment,
          "Root policy tests",
        ),
      );
      measure("test-workspace", () =>
        run(
          path.join(repositoryRoot, "node_modules/.bin/turbo"),
          turboTestArguments(options, base),
          isolated.environment,
          "Workspace tests",
        ),
      );
    } finally {
      measure("test-cleanup", () =>
        fs.rmSync(isolated.root, { recursive: true, force: true }),
      );
    }
  });
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
