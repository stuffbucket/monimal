import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const checkoutRoot = "/checkout";
const workspaceRoot = "/workspace";
const excludedSegments = new Set([
  ".pnpm-store",
  ".stryker-tmp",
  ".turbo",
  "coverage",
  "dist",
  "node_modules",
  "out",
]);
const workspaceRebuild = ["rebuild", "--recursive", "--pending"];
const rebuildArguments = Object.freeze({
  workspace: workspaceRebuild,
  core: workspaceRebuild,
  "maximal-models": workspaceRebuild,
  policy: workspaceRebuild,
});
const buildArguments = Object.freeze({
  workspace: ["run", "build", "--concurrency=1"],
  core: [
    "run",
    "build",
    "--concurrency=1",
    "--filter=@stuffbucket/maximal-core...",
  ],
  "maximal-models": [
    "run",
    "build",
    "--concurrency=1",
    "--filter=@stuffbucket/maximal-models...",
  ],
  policy: undefined,
});

function gitOutput(arguments_, root, encoding = "utf8") {
  return execFileSync("git", arguments_, {
    cwd: root,
    encoding,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

export function validateCheckoutPath(relativePath) {
  if (
    !relativePath ||
    relativePath.includes("\0") ||
    path.isAbsolute(relativePath) ||
    relativePath.split("/").includes("..") ||
    path.normalize(relativePath) !== relativePath
  ) {
    throw new Error(`Invalid checkout path: ${relativePath}`);
  }
  return relativePath;
}

export function shouldStagePath(relativePath) {
  const segments = validateCheckoutPath(relativePath).split("/");
  if (segments.some((segment) => excludedSegments.has(segment))) return false;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const pair = `${segments[index]}/${segments[index + 1]}`;
    if (pair === "reports/mutation" || pair === "resources/bin") return false;
  }
  return true;
}

export function checkoutPaths(root = checkoutRoot) {
  return gitOutput(
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    root,
    "buffer",
  )
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .filter(shouldStagePath)
    .sort();
}

function targetPath(root, relativePath) {
  const target = path.resolve(root, validateCheckoutPath(relativePath));
  const relative = path.relative(root, target);
  if (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Invalid checkout path: ${relativePath}`);
  }
  return target;
}

function stageGitMetadata(checkout, workspace) {
  const checkoutGit = path.join(checkout, ".git");
  const workspaceGit = path.join(workspace, ".git");
  const stat = fs.statSync(checkoutGit, { throwIfNoEntry: false });
  if (!stat?.isDirectory() && !stat?.isFile()) {
    throw new Error("The checkout does not have Git metadata");
  }
  fs.rmSync(workspaceGit, { force: true, recursive: true });
  if (stat.isDirectory()) {
    fs.symlinkSync(checkoutGit, workspaceGit, "dir");
    return;
  }

  const sourceGitDirectory = gitOutput(
    ["rev-parse", "--path-format=absolute", "--git-dir"],
    checkout,
  ).trim();
  const commonDirectory = gitOutput(
    ["rev-parse", "--path-format=absolute", "--git-common-dir"],
    checkout,
  ).trim();
  const stagedGitDirectory = path.join(workspace, ".git-worktree");
  fs.rmSync(stagedGitDirectory, { force: true, recursive: true });
  fs.cpSync(sourceGitDirectory, stagedGitDirectory, { recursive: true });
  fs.writeFileSync(path.join(stagedGitDirectory, "commondir"), `${commonDirectory}\n`);
  fs.writeFileSync(path.join(stagedGitDirectory, "gitdir"), `${workspaceGit}\n`);
  fs.writeFileSync(workspaceGit, `gitdir: ${stagedGitDirectory}\n`);
}

export function stageCheckout({
  checkout = checkoutRoot,
  workspace = workspaceRoot,
} = {}) {
  let count = 0;
  for (const relativePath of checkoutPaths(checkout)) {
    const source = targetPath(checkout, relativePath);
    const destination = targetPath(workspace, relativePath);
    const stat = fs.lstatSync(source, { throwIfNoEntry: false });
    if (!stat) continue;

    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.rmSync(destination, { force: true, recursive: true });
    if (stat.isSymbolicLink()) {
      fs.symlinkSync(fs.readlinkSync(source), destination);
    } else if (stat.isFile()) {
      fs.copyFileSync(source, destination);
      fs.chmodSync(destination, stat.mode & 0o777);
    } else {
      throw new Error(`Unsupported checkout entry: ${relativePath}`);
    }
    count += 1;
  }
  if (count === 0) throw new Error("The checkout has no files to stage");
  stageGitMetadata(checkout, workspace);
  return count;
}

function run(command, arguments_, environment, label) {
  const result = spawnSync(command, arguments_, {
    cwd: workspaceRoot,
    env: environment,
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

export function parseStageOptions(arguments_) {
  const [rebuildOption, separator, command, ...commandArguments] = arguments_;
  if (
    !rebuildOption?.startsWith("--rebuild=") ||
    separator !== "--" ||
    !command
  ) {
    throw new Error(
      "Usage: stage-test-checkout.mjs --rebuild=workspace|core|maximal-models|policy -- <command> [arguments]",
    );
  }
  const rebuild = rebuildOption.slice("--rebuild=".length);
  if (!Object.hasOwn(rebuildArguments, rebuild)) {
    throw new Error(`Invalid rebuild scope: ${rebuild}`);
  }
  return { command, commandArguments, rebuild };
}

export function main(arguments_ = process.argv.slice(2)) {
  const options = parseStageOptions(arguments_);
  stageCheckout();
  const environment = {
    ...process.env,
    MAXIMAL_GIT_SHA: gitOutput(["rev-parse", "HEAD"], checkoutRoot).trim(),
  };
  delete environment.GIT_DIR;
  delete environment.GIT_WORK_TREE;
  const rebuild = rebuildArguments[options.rebuild];
  if (rebuild) run("pnpm", rebuild, environment, "Dependency rebuild");
  const build = buildArguments[options.rebuild];
  if (build) {
    run(
      path.join(workspaceRoot, "node_modules/.bin/turbo"),
      build,
      environment,
      "Workspace build",
    );
  }
  run(
    "pnpm",
    ["run", "verify:workspace"],
    environment,
    "Workspace verification",
  );
  run(
    options.command,
    options.commandArguments,
    environment,
    "Container command",
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
