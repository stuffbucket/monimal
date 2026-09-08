import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { affectedBase } from "./git-changes.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const dockerfile = path.join(repositoryRoot, "Dockerfile");
const stageScript = "/opt/monimal/stage-test-checkout.mjs";
export const imageLabels = Object.freeze({
  architecture: "io.stuffbucket.monimal.architecture",
  mutation: "io.stuffbucket.monimal.mutation",
  purpose: "io.stuffbucket.monimal.purpose",
});

function readRequired(filePath) {
  const value = fs.readFileSync(filePath, "utf8").trim();
  if (!value) throw new Error(`${filePath} is empty`);
  return value;
}

function requireMatch(value, pattern, label) {
  if (!pattern.test(value)) throw new Error(`Invalid ${label}: ${value}`);
  return value;
}

function readPnpmChecksum(lock, platform) {
  const escaped = platform.replaceAll("-", "\\-");
  const section = new RegExp(
    `\\[tools\\.pnpm\\."platforms\\.${escaped}"\\]\\n` +
      `checksum = "sha256:([0-9a-f]{64})"`,
  );
  const match = lock.match(section);
  if (!match?.[1]) throw new Error(`Missing pnpm checksum for ${platform}`);
  return match[1];
}

export function readToolPins(root = repositoryRoot) {
  const packageJson = JSON.parse(readRequired(path.join(root, "package.json")));
  const packageManager = packageJson.packageManager;
  if (typeof packageManager !== "string") {
    throw new Error("package.json does not declare packageManager");
  }
  const pnpmMatch = packageManager.match(/^pnpm@(\d+\.\d+\.\d+)$/);
  if (!pnpmMatch?.[1]) {
    throw new Error(`Invalid packageManager pin: ${packageManager}`);
  }

  const nodeMajor = requireMatch(
    readRequired(path.join(root, ".nvmrc")),
    /^\d+$/,
    "Node major pin",
  );
  const bunVersion = requireMatch(
    readRequired(path.join(root, ".bun-version")),
    /^\d+\.\d+\.\d+$/,
    "Bun version pin",
  );
  const pnpmVersion = pnpmMatch[1];
  const lock = readRequired(path.join(root, "mise.lock"));
  const lockedVersion = lock.match(
    /\[\[tools\.pnpm\]\]\nversion = "(\d+\.\d+\.\d+)"/,
  )?.[1];
  if (lockedVersion !== pnpmVersion) {
    throw new Error(
      `mise.lock pnpm ${lockedVersion ?? "missing"} does not match` +
        ` package.json ${pnpmVersion}`,
    );
  }

  return {
    nodeMajor,
    bunVersion,
    pnpmVersion,
    pnpmSha256Amd64: readPnpmChecksum(lock, "linux-x64"),
    pnpmSha256Arm64: readPnpmChecksum(lock, "linux-arm64"),
  };
}

const suites = Object.freeze({
  workspace: { innerScript: "test:inner", rebuild: "workspace" },
  "maximal-core": {
    innerScript: "test:maximal-core:inner",
    rebuild: "core",
  },
  "maximal-dsh-host": {
    innerScript: "test:maximal-dsh-host:inner",
    rebuild: "maximal-dsh-host",
  },
  policy: { innerScript: "test:policy:inner", rebuild: "policy" },
});

const usage =
  "Usage: pnpm run test:docker -- [--all] [--suite=workspace|maximal-core|maximal-dsh-host|policy] [--trace=off|tests|all]";

export function parseOptions(arguments_) {
  const options = arguments_[0] === "--" ? arguments_.slice(1) : arguments_;
  let suite = "workspace";
  let scope = "affected";
  let trace = "off";
  let sawSuite = false;
  let sawTrace = false;

  for (const option of options) {
    if (option === "--all") {
      if (scope === "all") throw new Error("Duplicate --all option");
      scope = "all";
      continue;
    }
    if (option.startsWith("--suite=")) {
      if (sawSuite) throw new Error("Duplicate --suite option");
      sawSuite = true;
      suite = option.slice("--suite=".length);
      if (!Object.hasOwn(suites, suite)) {
        throw new Error(`Invalid test suite: ${suite}`);
      }
      continue;
    }
    if (option.startsWith("--trace=")) {
      if (sawTrace) throw new Error("Duplicate --trace option");
      sawTrace = true;
      trace = option.slice("--trace=".length);
      if (trace !== "off" && trace !== "tests" && trace !== "all") {
        throw new Error(`Invalid test trace mode: ${trace}`);
      }
      continue;
    }
    throw new Error(usage);
  }

  if (scope === "all" && suite !== "workspace") {
    throw new Error("--all only applies to the workspace Docker suite");
  }
  return { scope, suite, trace };
}

export function parseTrace(arguments_) {
  return parseOptions(arguments_).trace;
}

export function innerScriptForSuite(suite) {
  const script = suites[suite]?.innerScript;
  if (!script) throw new Error(`Invalid test suite: ${suite}`);
  return script;
}

function rebuildScopeForSuite(suite) {
  const rebuild = suites[suite]?.rebuild;
  if (!rebuild) throw new Error(`Invalid test suite: ${suite}`);
  return rebuild;
}

export function imageTagForArchitecture(targetArch) {
  if (targetArch !== "amd64" && targetArch !== "arm64") {
    throw new Error(`Unsupported Docker target architecture: ${targetArch}`);
  }
  return `monimal-test:dependencies-${targetArch}`;
}

export function expectedImageLabels({ targetArch }) {
  return {
    [imageLabels.architecture]: targetArch,
    [imageLabels.mutation]: "stryker",
    [imageLabels.purpose]: "workspace-test",
  };
}

export function validatedImageId(image, expected) {
  if (!image || !/^sha256:[0-9a-f]{64}$/u.test(image.Id)) return undefined;
  if (image.Architecture !== expected[imageLabels.architecture]) {
    return undefined;
  }
  const labels = image.Config?.Labels;
  if (!labels || typeof labels !== "object") return undefined;
  for (const [name, value] of Object.entries(expected)) {
    if (labels[name] !== value) return undefined;
  }
  return image.Id;
}

export function inspectDockerImage(tag) {
  const result = spawnSync(
    "docker",
    ["image", "inspect", "--format", "{{json .}}", tag],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  if (result.error) {
    throw new Error(
      `Docker image inspection could not start: ${result.error.message}`,
    );
  }
  if (result.status !== 0 || !result.stdout?.trim()) return undefined;
  try {
    return JSON.parse(result.stdout.trim());
  } catch (error) {
    throw new Error("Docker image inspection returned invalid JSON", {
      cause: error,
    });
  }
}

export function buildDockerArguments({
  iidFile,
  pins,
  targetArch,
  cache = "off",
}) {
  if (cache !== "off" && cache !== "gha") {
    throw new Error(`Invalid Docker cache mode: ${cache}`);
  }
  const imageTag = imageTagForArchitecture(targetArch);
  const labels = expectedImageLabels({ targetArch });
  const arguments_ = [
    ...(cache === "gha" ? ["buildx", "build", "--load"] : ["build"]),
    "--provenance=false",
    "--file",
    dockerfile,
    "--iidfile",
    iidFile,
    "--tag",
    imageTag,
    "--label",
    "org.opencontainers.image.title=monimal-test-dependencies",
    ...Object.entries(labels).flatMap(([name, value]) => [
      "--label",
      `${name}=${value}`,
    ]),
    "--build-arg",
    `NODE_MAJOR=${pins.nodeMajor}`,
    "--build-arg",
    `BUN_VERSION=${pins.bunVersion}`,
    "--build-arg",
    `PNPM_VERSION=${pins.pnpmVersion}`,
    "--build-arg",
    `PNPM_SHA256_AMD64=${pins.pnpmSha256Amd64}`,
    "--build-arg",
    `PNPM_SHA256_ARM64=${pins.pnpmSha256Arm64}`,
    "--build-arg",
    `TARGETARCH=${targetArch}`,
    repositoryRoot,
  ];
  if (cache === "gha") {
    arguments_.splice(-1, 0, "--cache-from", "type=gha,scope=workspace-test");
    arguments_.splice(
      -1,
      0,
      "--cache-to",
      "type=gha,mode=max,scope=workspace-test",
    );
  }
  return arguments_;
}

export function containerBoundaryArguments() {
  return [
    "--init",
    "--network=none",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges",
  ];
}

export function checkoutMountArguments(root = repositoryRoot) {
  if (root.includes(",")) {
    throw new Error("Docker checkout path cannot contain a comma");
  }
  return ["--mount", `type=bind,source=${root},target=/checkout,readonly`];
}

export function stagedCommandArguments(
  rebuild,
  command,
  commandArguments = [],
) {
  return [
    "node",
    stageScript,
    `--rebuild=${rebuild}`,
    "--",
    command,
    ...commandArguments,
  ];
}

export function runDockerArguments(imageId, options = {}) {
  const {
    suite = "workspace",
    scope = "affected",
    trace = "off",
    base,
  } = options;
  const arguments_ = [
    "run",
    "--rm",
    ...containerBoundaryArguments(),
    ...checkoutMountArguments(),
  ];
  if (trace !== "off") {
    arguments_.push(
      "--env",
      `MAXIMAL_TEST_TRACE=${trace === "all" ? "all" : "1"}`,
    );
  }

  const commandArguments = ["run", innerScriptForSuite(suite)];
  if (suite === "workspace" && scope === "affected") {
    requireMatch(base, /^[0-9a-f]{40}$/u, "affected test base");
    commandArguments.push("--", `--filter=...[${base}]`);
  }
  arguments_.push(
    imageId,
    ...stagedCommandArguments(
      rebuildScopeForSuite(suite),
      "pnpm",
      commandArguments,
    ),
  );
  return arguments_;
}

function runDocker(arguments_, label) {
  const result = spawnSync("docker", arguments_, {
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

export function reusableImageId({ targetArch }) {
  const tag = imageTagForArchitecture(targetArch);
  return validatedImageId(
    inspectDockerImage(tag),
    expectedImageLabels({ targetArch }),
  );
}

export function ensureTestImage({ cache = "off", pins, targetArch }) {
  const before = reusableImageId({ targetArch });
  const iidDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "maximal-test-iid-"),
  );
  const iidFile = path.join(iidDirectory, "image-id");
  try {
    runDocker(
      buildDockerArguments({ iidFile, pins, cache, targetArch }),
      "Docker dependency image build",
    );
    const builtId = requireMatch(
      readRequired(iidFile),
      /^sha256:[0-9a-f]{64}$/u,
      "Docker image ID",
    );
    const inspectedId = reusableImageId({ targetArch });
    if (inspectedId !== builtId) {
      throw new Error(
        "Built Docker image metadata does not match its contract",
      );
    }
    console.error(
      before === builtId
        ? `Reusing Docker dependency image ${builtId}`
        : `Built Docker dependency image ${builtId}`,
    );
    return builtId;
  } finally {
    fs.rmSync(iidDirectory, { recursive: true, force: true });
  }
}

export function dockerServerArchitecture() {
  const result = spawnSync(
    "docker",
    ["version", "--format", "{{.Server.Arch}}"],
    { encoding: "utf8" },
  );
  const architecture = result.stdout?.trim();
  if (result.error || result.status !== 0 || !architecture) {
    throw new Error("Docker is unavailable. Start Docker and retry.");
  }
  if (architecture !== "amd64" && architecture !== "arm64") {
    throw new Error(`Unsupported Docker server architecture: ${architecture}`);
  }
  return architecture;
}

export function isLinkedGitWorktree(root = repositoryRoot) {
  const gitDirectory = fs.realpathSync(
    execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-dir"], {
      cwd: root,
      encoding: "utf8",
    }).trim(),
  );
  const commonDirectory = fs.realpathSync(
    execFileSync(
      "git",
      ["rev-parse", "--path-format=absolute", "--git-common-dir"],
      { cwd: root, encoding: "utf8" },
    ).trim(),
  );
  return gitDirectory !== commonDirectory;
}

export function assertPrimaryCheckout(root = repositoryRoot) {
  let linked;
  try {
    linked = isLinkedGitWorktree(root);
  } catch (error) {
    throw new Error("Could not verify the primary Git checkout", {
      cause: error,
    });
  }
  if (linked) {
    throw new Error(
      "Docker tests and mutations do not run from linked worktrees. Run `pnpm test`" +
        " here, then use the primary checkout for Docker.",
    );
  }
}

export function main(arguments_ = process.argv.slice(2)) {
  const options = parseOptions(arguments_);
  assertPrimaryCheckout();
  const cache = process.env.MAXIMAL_DOCKER_CACHE || "off";
  const targetArch = dockerServerArchitecture();
  const imageId = ensureTestImage({
    cache,
    pins: readToolPins(),
    targetArch,
  });
  const base =
    options.suite === "workspace" && options.scope === "affected"
      ? affectedBase()
      : undefined;
  runDocker(
    runDockerArguments(imageId, { ...options, base }),
    "Docker test container",
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
