import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const dockerfile = path.join(repositoryRoot, "Dockerfile");
export const imageLabels = Object.freeze({
  architecture: "io.stuffbucket.monimal.architecture",
  dirty: "io.stuffbucket.monimal.dirty",
  mutation: "io.stuffbucket.monimal.mutation",
  purpose: "io.stuffbucket.monimal.purpose",
  revision: "org.opencontainers.image.revision",
  sourceDigest: "io.stuffbucket.monimal.source-digest",
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

const innerScripts = Object.freeze({
  workspace: "test:inner",
  "maximal-core": "test:maximal-core:inner",
  "maximal-dsh-host": "test:maximal-dsh-host:inner",
  policy: "test:policy:inner",
});

const usage =
  "Usage: pnpm run test:docker -- [--suite=workspace|maximal-core|maximal-dsh-host|policy] [--trace=off|tests|all]";

export function parseOptions(arguments_) {
  const options = arguments_[0] === "--" ? arguments_.slice(1) : arguments_;
  let suite = "workspace";
  let trace = "off";
  let sawSuite = false;
  let sawTrace = false;

  for (const option of options) {
    if (option.startsWith("--suite=")) {
      if (sawSuite) throw new Error("Duplicate --suite option");
      sawSuite = true;
      suite = option.slice("--suite=".length);
      if (!Object.hasOwn(innerScripts, suite)) {
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

  return { suite, trace };
}

export function parseTrace(arguments_) {
  return parseOptions(arguments_).trace;
}

export function innerScriptForSuite(suite) {
  const script = innerScripts[suite];
  if (!script) throw new Error(`Invalid test suite: ${suite}`);
  return script;
}

function snapshotCanaryFile(filePath) {
  const stat = fs.statSync(filePath, { bigint: true });
  return {
    filePath,
    bytes: fs.readFileSync(filePath),
    device: stat.dev,
    inode: stat.ino,
    mode: stat.mode,
    size: stat.size,
    modifiedAt: stat.mtimeNs,
  };
}

export function createHostStateCanary() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "maximal-host-state-canary-"),
  );
  const paths = [
    path.join(root, "home/.claude/settings.json"),
    path.join(root, "xdg-data/maximal/accounts.json"),
  ];
  for (const filePath of paths) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
    fs.writeFileSync(filePath, "maximal-docker-test-host-canary\n", {
      mode: 0o600,
    });
  }
  return { root, files: paths.map(snapshotCanaryFile) };
}

export function assertHostStateCanaryUnchanged(canary) {
  for (const before of canary.files) {
    const after = snapshotCanaryFile(before.filePath);
    if (
      !after.bytes.equals(before.bytes) ||
      after.device !== before.device ||
      after.inode !== before.inode ||
      after.mode !== before.mode ||
      after.size !== before.size ||
      after.modifiedAt !== before.modifiedAt
    ) {
      throw new Error("The Docker test run changed a host-state canary");
    }
  }
}

export function imageTagForState(gitSha, dirty) {
  requireMatch(gitSha, /^[0-9a-f]{40}$/u, "Git SHA");
  if (typeof dirty !== "boolean") {
    throw new Error("Docker image dirty state must be a boolean");
  }
  return `monimal-test:${gitSha.slice(0, 12)}-${dirty ? "dirty" : "clean"}`;
}

function gitBuffer(arguments_, root = repositoryRoot) {
  return execFileSync("git", arguments_, {
    cwd: root,
    encoding: "buffer",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

export function sourceDigest(root = repositoryRoot) {
  const hash = createHash("sha256");
  const sha = currentGitSha(root);
  hash.update("head\0").update(sha).update("\0diff\0");
  hash.update(
    gitBuffer(["diff", "--binary", "--no-ext-diff", "HEAD", "--"], root),
  );

  const untracked = gitBuffer(
    ["ls-files", "--others", "--exclude-standard", "-z"],
    root,
  )
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .sort();
  for (const relativePath of untracked) {
    const filePath = path.resolve(root, relativePath);
    const relative = path.relative(root, filePath);
    if (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error(`Invalid untracked path: ${relativePath}`);
    }
    const stat = fs.lstatSync(filePath);
    hash.update("\0untracked\0").update(relativePath).update("\0");
    hash.update(String(stat.mode)).update("\0");
    if (stat.isFile()) {
      hash.update(fs.readFileSync(filePath));
    } else if (stat.isSymbolicLink()) {
      hash.update(fs.readlinkSync(filePath));
    } else {
      throw new Error(`Unsupported untracked entry: ${relativePath}`);
    }
  }
  return hash.digest("hex");
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
        " here, then run `pnpm run test:docker` from the primary checkout.",
    );
  }
}

export function expectedImageLabels({ gitSha, dirty, digest, targetArch }) {
  return {
    [imageLabels.architecture]: targetArch,
    [imageLabels.dirty]: String(dirty),
    [imageLabels.mutation]: "stryker",
    [imageLabels.purpose]: "workspace-test",
    [imageLabels.revision]: gitSha,
    [imageLabels.sourceDigest]: digest,
  };
}

export function validatedImageId(image, expected) {
  if (!image || !/^sha256:[0-9a-f]{64}$/u.test(image.Id)) return undefined;
  if (image.Architecture !== expected[imageLabels.architecture])
    return undefined;
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
  gitSha,
  dirty,
  digest,
  pins,
  targetArch,
  cache = "off",
}) {
  if (cache !== "off" && cache !== "gha") {
    throw new Error(`Invalid Docker cache mode: ${cache}`);
  }
  const imageTag = imageTagForState(gitSha, dirty);
  requireMatch(digest, /^[0-9a-f]{64}$/u, "source digest");
  if (targetArch !== "amd64" && targetArch !== "arm64") {
    throw new Error(`Unsupported Docker target architecture: ${targetArch}`);
  }
  const labels = expectedImageLabels({ gitSha, dirty, digest, targetArch });
  const arguments_ = [
    ...(cache === "gha" ? ["buildx", "build", "--load"] : ["build"]),
    "--file",
    dockerfile,
    "--iidfile",
    iidFile,
    "--tag",
    imageTag,
    "--label",
    "org.opencontainers.image.title=monimal-test",
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
    `GIT_SHA=${gitSha}`,
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

export function runDockerArguments(imageId, options = {}) {
  const { suite = "workspace", trace = "off" } = options;
  const arguments_ = ["run", "--rm", ...containerBoundaryArguments()];
  if (trace !== "off") {
    arguments_.push(
      "--env",
      `MAXIMAL_TEST_TRACE=${trace === "all" ? "all" : "1"}`,
    );
  }
  arguments_.push(imageId, "pnpm", "run", innerScriptForSuite(suite));
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

export function reusableImageId(state) {
  const tag = imageTagForState(state.gitSha, state.dirty);
  return validatedImageId(inspectDockerImage(tag), expectedImageLabels(state));
}

export function requireReusableImage(state) {
  const imageId = reusableImageId(state);
  if (!imageId) {
    throw new Error(
      "No matching mutation-capable test image exists. Run `pnpm run test:docker`" +
        " from the primary checkout first.",
    );
  }
  return imageId;
}

export function ensureTestImage({ cache = "off", pins, ...state }) {
  const existing = reusableImageId(state);
  if (existing) {
    console.error(`Reusing Docker test image ${existing}`);
    return existing;
  }

  const iidDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "maximal-test-iid-"),
  );
  const iidFile = path.join(iidDirectory, "image-id");
  try {
    runDocker(
      buildDockerArguments({ iidFile, pins, cache, ...state }),
      "Docker test image build",
    );
    const builtId = requireMatch(
      readRequired(iidFile),
      /^sha256:[0-9a-f]{64}$/u,
      "Docker image ID",
    );
    const inspectedId = reusableImageId(state);
    if (inspectedId !== builtId) {
      throw new Error(
        "Built Docker image metadata does not match the source state",
      );
    }
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
    throw new Error(
      "Docker is unavailable. Start Docker and rerun `pnpm run test:docker`.",
    );
  }
  if (architecture !== "amd64" && architecture !== "arm64") {
    throw new Error(`Unsupported Docker server architecture: ${architecture}`);
  }
  return architecture;
}

export function currentGitSha(root = repositoryRoot) {
  const sha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  return requireMatch(sha, /^[0-9a-f]{40}$/, "Git SHA");
}

export function isGitWorktreeDirty(root = repositoryRoot) {
  const status = execFileSync(
    "git",
    ["status", "--porcelain=v1", "--untracked-files=all"],
    { cwd: root, encoding: "utf8" },
  );
  return status.trim().length > 0;
}

export function currentImageState(root = repositoryRoot) {
  const gitSha = currentGitSha(root);
  return {
    gitSha,
    dirty: isGitWorktreeDirty(root),
    digest: sourceDigest(root),
  };
}

export function main(arguments_ = process.argv.slice(2)) {
  const options = parseOptions(arguments_);
  assertPrimaryCheckout();
  const cache = process.env.MAXIMAL_DOCKER_CACHE || "off";
  const targetArch = dockerServerArchitecture();
  const pins = readToolPins();
  const state = { ...currentImageState(), targetArch };
  const imageId = ensureTestImage({ cache, pins, ...state });
  const hostStateCanary = createHostStateCanary();

  try {
    runDocker(runDockerArguments(imageId, options), "Docker test container");
  } finally {
    try {
      assertHostStateCanaryUnchanged(hostStateCanary);
    } finally {
      fs.rmSync(hostStateCanary.root, { recursive: true, force: true });
    }
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
