import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const affectedFilter = /^--filter=\.\.\.\[[0-9a-f]{40}\]$/u;
const usage = "Usage: docker-workspace-test.mjs [--filter=...[<merge-base>]]";

export function parseDockerWorkspaceOptions(arguments_) {
  const options = arguments_[0] === "--" ? arguments_.slice(1) : arguments_;
  if (options.length > 1 || (options[0] && !affectedFilter.test(options[0]))) {
    throw new Error(usage);
  }
  return options;
}

function run(command, arguments_, label) {
  const result = spawnSync(command, arguments_, {
    cwd: repositoryRoot,
    stdio: "inherit",
  });
  if (result.error) {
    throw new Error(`${label} could not start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `${label} failed with exit code ${result.status ?? "unknown"}`,
    );
  }
}

export function main(arguments_ = process.argv.slice(2)) {
  const options = parseDockerWorkspaceOptions(arguments_);
  run(
    process.execPath,
    ["scripts/assert-test-container.mjs"],
    "Container check",
  );
  run(
    process.execPath,
    ["--test", "tests/docker-test-policy.test.mjs"],
    "Root policy tests",
  );
  run(
    path.join(repositoryRoot, "node_modules/.bin/turbo"),
    ["run", "test", "--concurrency=1", ...options],
    "Workspace tests",
  );
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
