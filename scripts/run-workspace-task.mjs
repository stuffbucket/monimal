import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const workspaceTaskEnvironment = "MONIMAL_WORKSPACE_TASK";
const supportedTasks = new Set(["lint", "typecheck"]);

export function workspaceTaskPlan({
  arguments_,
  environment,
  packageDirectory,
  packageManagerPath,
  packageName,
  rootDirectory,
}) {
  if (arguments_.length !== 1 || !supportedTasks.has(arguments_[0])) {
    throw new Error("Usage: run-workspace-task.mjs <lint|typecheck>");
  }

  const task = arguments_[0];
  if (!packageManagerPath) {
    throw new Error("The package manager path is unavailable; run this task through pnpm.");
  }

  if (
    environment.TURBO_HASH ||
    environment[workspaceTaskEnvironment] === task
  ) {
    return {
      arguments: ["run", `${task}:inner`],
      command: packageManagerPath,
      cwd: packageDirectory,
      shell: process.platform === "win32",
    };
  }

  return {
    arguments: [
      "--dir",
      rootDirectory,
      "exec",
      "turbo",
      "run",
      task,
      `--filter=${packageName}`,
    ],
    command: packageManagerPath,
    cwd: rootDirectory,
    environment: {
      ...environment,
      [workspaceTaskEnvironment]: task,
    },
    shell: false,
  };
}

export function main(arguments_ = process.argv.slice(2)) {
  const packageDirectory = process.cwd();
  const manifest = JSON.parse(
    fs.readFileSync(path.join(packageDirectory, "package.json"), "utf8"),
  );
  const plan = workspaceTaskPlan({
    arguments_,
    environment: process.env,
    packageDirectory,
    packageManagerPath: process.env.npm_execpath,
    packageName: manifest.name,
    rootDirectory: repositoryRoot,
  });
  const result = spawnSync(plan.command, plan.arguments, {
    cwd: plan.cwd,
    env: plan.environment ?? process.env,
    shell: plan.shell,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.signal) {
    process.kill(process.pid, result.signal);
    return;
  }
  process.exitCode = result.status ?? 1;
}

if (fileURLToPath(import.meta.url) === process.argv[1]) main();