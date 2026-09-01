import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const dockerfile = path.join(repositoryRoot, "Dockerfile");

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
  "Usage: pnpm test -- [--suite=workspace|maximal-core|maximal-dsh-host|policy] [--trace=off|tests|all]";

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

export function buildDockerArguments({ iidFile, gitSha, pins, targetArch }) {
  return [
    "build",
    "--file",
    dockerfile,
    "--iidfile",
    iidFile,
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
}

export function runDockerArguments(imageId, options = {}) {
  const { suite = "workspace", trace = "off" } = options;
  const arguments_ = [
    "run",
    "--rm",
    "--init",
    "--network=none",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges",
  ];
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

function dockerServerArchitecture() {
  const result = spawnSync(
    "docker",
    ["version", "--format", "{{.Server.Arch}}"],
    { encoding: "utf8" },
  );
  const architecture = result.stdout?.trim();
  if (result.error || result.status !== 0 || !architecture) {
    throw new Error(
      "Docker is unavailable. Start Docker and rerun `pnpm test`.",
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

export function main(arguments_ = process.argv.slice(2)) {
  const options = parseOptions(arguments_);
  const targetArch = dockerServerArchitecture();
  const pins = readToolPins();
  const gitSha = currentGitSha();
  const iidDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "maximal-test-iid-"),
  );
  const iidFile = path.join(iidDirectory, "image-id");
  const hostStateCanary = createHostStateCanary();

  try {
    runDocker(
      buildDockerArguments({ iidFile, gitSha, pins, targetArch }),
      "Docker test image build",
    );
    const imageId = readRequired(iidFile);
    requireMatch(imageId, /^sha256:[0-9a-f]{64}$/, "Docker image ID");
    runDocker(runDockerArguments(imageId, options), "Docker test container");
  } finally {
    try {
      assertHostStateCanaryUnchanged(hostStateCanary);
    } finally {
      fs.rmSync(iidDirectory, { recursive: true, force: true });
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
