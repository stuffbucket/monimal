import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  createMutationContainerArguments,
  inspectMutationReport,
  parseMutationOptions,
  publishMutationReport,
} from "../scripts/docker-mutate.mjs";
import {
  publishTurboBuildCache,
  readTurboBuildGraph,
  selectTurboCacheHashes,
} from "../scripts/copy-turbo-build-cache.mjs";
import {
  assertHostStateCanaryUnchanged,
  buildDockerArguments,
  containerBoundaryArguments,
  createHostStateCanary,
  innerScriptForSuite,
  isGitWorktreeDirty,
  parseOptions,
  parseTrace,
  readToolPins,
  runDockerArguments,
} from "../scripts/docker-test.mjs";

const root = path.resolve(import.meta.dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function runLockfileHostStrip(...arguments_) {
  return spawnSync(process.execPath, ["scripts/strip-lockfile-hosts.mjs", ...arguments_], {
    cwd: root,
    encoding: "utf8",
  });
}

function withShardHost(lockfile) {
  return lockfile.replace(
    /^(    resolution: \{[^\n}]*)(\})$/m,
    "$1, tarball: https://ms-feed-7.pkgs.visualstudio.com/tarball.tgz$2",
  );
}

test("lockfile host check accepts clean input without mutation", () => {
  const before = read("pnpm-lock.yaml");
  const result = runLockfileHostStrip("--check");

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /pnpm-lock\.yaml: clean/);
  assert.equal(read("pnpm-lock.yaml"), before);
});

test("lockfile host check rejects repairable input without mutation", () => {
  const clean = read("pnpm-lock.yaml");
  const dirty = withShardHost(clean);
  assert.notEqual(dirty, clean, "fixture needs a lockfile resolution");

  try {
    fs.writeFileSync(path.join(root, "pnpm-lock.yaml"), dirty);
    const result = runLockfileHostStrip("--check");

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Run node scripts\/strip-lockfile-hosts\.mjs/);
    assert.match(result.stderr, /commit the repaired lockfile/);
    assert.match(result.stderr, /retag the release/);
    assert.equal(read("pnpm-lock.yaml"), dirty);
  } finally {
    fs.writeFileSync(path.join(root, "pnpm-lock.yaml"), clean);
  }
});

test("lockfile host repair retains the default mutating behavior", () => {
  const clean = read("pnpm-lock.yaml");
  const dirty = withShardHost(clean);
  assert.notEqual(dirty, clean, "fixture needs a lockfile resolution");

  try {
    fs.writeFileSync(path.join(root, "pnpm-lock.yaml"), dirty);
    const result = runLockfileHostStrip();

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /stripped 1 shard-host URL/);
    assert.equal(read("pnpm-lock.yaml"), clean);
  } finally {
    fs.writeFileSync(path.join(root, "pnpm-lock.yaml"), clean);
  }
});

test("the outer and fixed inner test scripts cannot recurse", () => {
  const manifest = JSON.parse(read("package.json"));
  const coreManifest = JSON.parse(read("packages/maximal-core/package.json"));
  const turbo = JSON.parse(read("turbo.json"));
  assert.equal(manifest.scripts.test, "node scripts/docker-test.mjs");
  assert.equal(manifest.scripts["mutate:core"], "node scripts/docker-mutate.mjs");
  assert.equal(
    coreManifest.scripts.mutate,
    "node ../../scripts/docker-mutate.mjs",
  );
  assert.deepEqual(
    {
      "test:inner": manifest.scripts["test:inner"],
      "test:maximal-core:inner": manifest.scripts["test:maximal-core:inner"],
      "test:maximal-dsh-host:inner":
        manifest.scripts["test:maximal-dsh-host:inner"],
      "test:policy:inner": manifest.scripts["test:policy:inner"],
      "mutate:core:inner": manifest.scripts["mutate:core:inner"],
    },
    {
      "test:inner":
        "node scripts/assert-test-container.mjs && node --test tests/docker-test-policy.test.mjs && turbo run test --concurrency=1",
      "test:maximal-core:inner":
        "node scripts/assert-test-container.mjs && pnpm --filter @stuffbucket/maximal-core test",
      "test:maximal-dsh-host:inner":
        "node scripts/assert-test-container.mjs && pnpm --filter @stuffbucket/maximal-dsh-host test",
      "test:policy:inner":
        "node scripts/assert-test-container.mjs && node --test tests/docker-test-policy.test.mjs",
      "mutate:core:inner":
        "node scripts/assert-test-container.mjs && pnpm --filter @stuffbucket/maximal-core exec stryker run",
    },
  );
  for (const [name, script] of Object.entries(manifest.scripts)) {
    if (
      name === "test:inner" ||
      /^test:.+:inner$/.test(name) ||
      name === "mutate:core:inner"
    ) {
      assert.match(script, /^node scripts\/assert-test-container\.mjs /);
      assert.doesNotMatch(script, /pnpm (?:run )?(?:test|mutate:core)(?:\s|$)/);
    }
  }
  assert.equal(
    manifest.scripts["check:core"],
    "pnpm --filter @stuffbucket/maximal-core run check:deep:host && pnpm test -- --suite=maximal-core",
  );
  assert.equal(
    manifest.scripts.check,
    "turbo run build typecheck lint && pnpm --filter @stuffbucket/maximal-core run check:deep:host && pnpm test",
  );
  assert.equal(
    (manifest.scripts.check.match(/(?:^|&& )pnpm test(?: |$)/g) ?? []).length,
    1,
  );
  assert.doesNotMatch(manifest.scripts.check, /pnpm run check:core/);
  assert.deepEqual(turbo.tasks["maximal-client#build"].env, [
    "MAXIMAL_CORE_TARGET",
    "MAXIMAL_GIT_SHA",
  ]);
  for (const task of [turbo.tasks.build, turbo.tasks["maximal-site#build"]]) {
    assert.ok(task.inputs.includes("!**/dist/**"));
    assert.ok(task.inputs.includes("!**/.turbo/**"));
    assert.ok(task.inputs.includes("!**/resources/bin/**"));
  }
  assert.deepEqual(turbo.tasks.test.env, [
    "MAXIMAL_TEST_CONTAINER",
    "MAXIMAL_TEST_TRACE",
  ]);
  assert.equal(turbo.tasks.package.cache, false);
  assert.equal(turbo.tasks.package.outputs, undefined);
});

test("required CI runs native checks before Docker and has one cache writer", () => {
  const workflow = read(".github/workflows/ci.yml");
  const hostGate =
    "pnpm --filter @stuffbucket/maximal-core run check:deep:host";
  const packageMechanics =
    "pnpm --filter @stuffbucket/maximal-electron run verify:fixture-imports";
  const sidecarProvenance =
    "LINK=packages/maximal/client/node_modules/@stuffbucket/maximal-core";
  const dockerGate = 'pnpm test -- --trace="$TEST_TRACE"';
  assert.equal(workflow.split(hostGate).length - 1, 1);
  assert.equal(workflow.split(packageMechanics).length - 1, 1);
  assert.equal(workflow.split(sidecarProvenance).length - 1, 1);
  assert.equal(workflow.split(dockerGate).length - 1, 1);
  assert.doesNotMatch(workflow, /pnpm (?:run )?check:core/);
  assert.doesNotMatch(workflow, /\bbun (?:run )?test\b/);
  assert.ok(workflow.indexOf(hostGate) < workflow.indexOf(dockerGate));
  assert.ok(workflow.indexOf(packageMechanics) < workflow.indexOf(dockerGate));
  assert.ok(workflow.indexOf(sidecarProvenance) < workflow.indexOf(dockerGate));
  assert.equal(workflow.split("uses: actions/cache/save@").length - 1, 1);
  assert.equal(workflow.split("uses: actions/cache@").length - 1, 1);
  assert.equal(workflow.split("uses: actions/cache/restore@").length - 1, 2);
  assert.match(workflow, /if: github\.event_name == 'push'/);
  assert.match(workflow, /MAXIMAL_DOCKER_CACHE: gha/);
  const buildxSetup =
    "docker/setup-buildx-action@37fe631027851001ddb9b187196cc803df7f5f0e";
  const runtimeSetup =
    "crazy-max/ghaction-github-runtime@04d248b84655b509d8c44dc1d6f990c879747487";
  assert.equal(workflow.split(buildxSetup).length - 1, 1);
  assert.equal(workflow.split(runtimeSetup).length - 1, 1);
  assert.ok(workflow.indexOf(buildxSetup) < workflow.indexOf(dockerGate));
  assert.ok(workflow.indexOf(runtimeSetup) < workflow.indexOf(dockerGate));
  assert.equal(workflow.split("turbo-v2-").length - 1, 6);
});

test("Docker builds use an optional fixed GitHub Actions cache", () => {
  const input = {
    iidFile: "/tmp/image-id",
    gitSha: "a".repeat(40),
    dirty: false,
    pins: {
      nodeMajor: "24",
      bunVersion: "1.3.14",
      pnpmVersion: "11.25.0",
      pnpmSha256Amd64: "b".repeat(64),
      pnpmSha256Arm64: "c".repeat(64),
    },
    targetArch: "amd64",
  };
  const local = buildDockerArguments(input);
  assert.equal(local[0], "build");
  assert.ok(local.includes("monimal-test:aaaaaaaaaaaa-clean"));
  assert.ok(local.includes("org.opencontainers.image.title=monimal-test"));
  assert.ok(
    local.includes(`org.opencontainers.image.revision=${"a".repeat(40)}`),
  );
  assert.ok(local.includes("io.stuffbucket.monimal.purpose=workspace-test"));
  assert.ok(local.includes("io.stuffbucket.monimal.dirty=false"));
  assert.ok(local.includes(`GIT_SHA=${"a".repeat(40)}`));

  const dirty = buildDockerArguments({ ...input, dirty: true });
  assert.ok(dirty.includes("monimal-test:aaaaaaaaaaaa-dirty"));
  assert.ok(dirty.includes("io.stuffbucket.monimal.dirty=true"));

  const cached = buildDockerArguments({ ...input, cache: "gha" });
  assert.deepEqual(cached.slice(0, 3), ["buildx", "build", "--load"]);
  assert.ok(cached.includes("type=gha,scope=workspace-test"));
  assert.ok(cached.includes("type=gha,mode=max,scope=workspace-test"));
  assert.throws(
    () => buildDockerArguments({ ...input, dirty: undefined }),
    /dirty state must be a boolean/,
  );
  assert.throws(
    () => buildDockerArguments({ ...input, cache: "type=local,dest=/tmp" }),
    /Invalid Docker cache mode/,
  );
});

test("Docker image dirtiness includes tracked and untracked changes", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "monimal-git-status-"));
  const git = (...arguments_) =>
    spawnSync("git", arguments_, { cwd: directory, encoding: "utf8" });

  try {
    assert.equal(git("init", "--quiet").status, 0);
    assert.equal(git("config", "user.name", "Docker Policy Test").status, 0);
    assert.equal(
      git("config", "user.email", "docker-policy@example.invalid").status,
      0,
    );
    fs.writeFileSync(path.join(directory, "tracked.txt"), "clean\n");
    assert.equal(git("add", "tracked.txt").status, 0);
    assert.equal(
      git("commit", "--quiet", "--no-gpg-sign", "-m", "fixture").status,
      0,
    );
    assert.equal(isGitWorktreeDirty(directory), false);

    fs.appendFileSync(path.join(directory, "tracked.txt"), "dirty\n");
    assert.equal(isGitWorktreeDirty(directory), true);
    assert.equal(git("checkout", "--", "tracked.txt").status, 0);
    assert.equal(isGitWorktreeDirty(directory), false);

    fs.writeFileSync(path.join(directory, "untracked.txt"), "dirty\n");
    assert.equal(isGitWorktreeDirty(directory), true);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("runtime arguments enforce the mountless offline boundary", () => {
  assert.deepEqual(containerBoundaryArguments(), [
    "--init",
    "--network=none",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges",
  ]);
  const arguments_ = runDockerArguments("sha256:" + "a".repeat(64));
  assert.deepEqual(arguments_, [
    "run",
    "--rm",
    "--init",
    "--network=none",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges",
    "sha256:" + "a".repeat(64),
    "pnpm",
    "run",
    "test:inner",
  ]);
  const joined = arguments_.join(" ");
  assert.doesNotMatch(joined, /(?:--volume|-v|--mount|--env-file)/);
  assert.doesNotMatch(joined, /docker\.sock|--network=host/);
});

test("mutation arguments enforce the same mountless offline boundary", () => {
  const imageId = "sha256:" + "d".repeat(64);
  const options = {
    concurrency: 10,
    mutate: "src/lib/observability/store.ts:309-425",
  };
  const arguments_ = createMutationContainerArguments(imageId, options);
  assert.deepEqual(arguments_, [
    "create",
    "--init",
    "--network=none",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges",
    "--env",
    "MAXIMAL_MUTATION_LEDGER=/workspace/packages/maximal-core/reports/mutation/incomplete-runs.log",
    imageId,
    "pnpm",
    "run",
    "mutate:core:inner",
    "--mutate",
    options.mutate,
    "--concurrency",
    "10",
  ]);
  const joined = arguments_.join(" ");
  assert.doesNotMatch(joined, /(?:--volume|-v|--mount|--env-file)/);
  assert.doesNotMatch(joined, /docker\.sock|--network=host/);
});

test("mutation selectors validate source paths, ranges, and concurrency", () => {
  assert.deepEqual(parseMutationOptions([]), {
    concurrency: undefined,
    mutate: undefined,
  });
  assert.deepEqual(
    parseMutationOptions([
      "--",
      "--mutate=src/lib/observability/query.ts:43-65,src/lib/observability/schema.ts",
      "--concurrency=4",
    ]),
    {
      concurrency: 4,
      mutate:
        "src/lib/observability/query.ts:43-65,src/lib/observability/schema.ts",
    },
  );
  for (const option of [
    "--mutate=../outside.ts",
    "--mutate=/tmp/outside.ts",
    "--mutate=tests/observability.test.ts",
    "--mutate=src/../outside.ts",
    "--concurrency=0",
    "--concurrency=33",
    "--concurrency=1.5",
  ]) {
    assert.throws(() => parseMutationOptions([option]), /Invalid mutation/);
  }
  assert.throws(
    () =>
      parseMutationOptions([
        "--mutate=src/a.ts",
        "--mutate=src/b.ts",
      ]),
    /Duplicate --mutate/,
  );
  assert.throws(
    () =>
      parseMutationOptions(["--concurrency=4", "--concurrency=10"]),
    /Duplicate --concurrency/,
  );
});

test("mutation reports replace the prior report only after validation", () => {
  const rootDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "mutation-report-policy-"),
  );
  const destination = path.join(rootDirectory, "mutation");
  const validStaging = path.join(rootDirectory, ".mutation-stage-valid");
  const invalidStaging = path.join(rootDirectory, ".mutation-stage-invalid");
  try {
    fs.mkdirSync(destination);
    fs.writeFileSync(path.join(destination, "index.html"), "old report");
    fs.mkdirSync(invalidStaging);
    assert.throws(
      () => publishMutationReport(invalidStaging, destination),
      /index\.html/,
    );
    assert.equal(
      fs.readFileSync(path.join(destination, "index.html"), "utf8"),
      "old report",
    );

    fs.mkdirSync(validStaging);
    fs.writeFileSync(path.join(validStaging, "index.html"), "new report");
    fs.writeFileSync(path.join(validStaging, "incomplete-runs.log"), "\n");
    assert.deepEqual(inspectMutationReport(validStaging), {
      incomplete: false,
      ledgerPath: path.join(validStaging, "incomplete-runs.log"),
    });
    publishMutationReport(validStaging, destination);
    assert.equal(
      fs.readFileSync(path.join(destination, "index.html"), "utf8"),
      "new report",
    );

    fs.writeFileSync(
      path.join(destination, "incomplete-runs.log"),
      "mutant=12 exit=0\n",
    );
    assert.equal(inspectMutationReport(destination).incomplete, true);
  } finally {
    fs.rmSync(rootDirectory, { recursive: true, force: true });
  }
});

test("host-state canaries survive without content or metadata changes", () => {
  const canary = createHostStateCanary();
  try {
    assertHostStateCanaryUnchanged(canary);
  } finally {
    fs.rmSync(canary.root, { recursive: true, force: true });
  }
});

test("suite and trace selectors are closed and do not forward arguments", () => {
  assert.deepEqual(parseOptions([]), { suite: "workspace", trace: "off" });
  assert.deepEqual(parseOptions(["--"]), { suite: "workspace", trace: "off" });
  assert.deepEqual(parseOptions(["--suite=maximal-core"]), {
    suite: "maximal-core",
    trace: "off",
  });
  assert.deepEqual(
    parseOptions(["--", "--trace=all", "--suite=maximal-dsh-host"]),
    { suite: "maximal-dsh-host", trace: "all" },
  );
  assert.equal(parseTrace(["--trace=tests"]), "tests");
  assert.throws(() => parseOptions(["--suite=other"]), /Invalid test suite/);
  assert.throws(() => parseOptions(["--trace=verbose"]), /Invalid test trace/);
  assert.throws(
    () => parseOptions(["--suite=policy", "--suite=policy"]),
    /Duplicate --suite/,
  );
  assert.throws(
    () => parseOptions(["--trace=tests", "--trace=all"]),
    /Duplicate --trace/,
  );
  for (const arguments_ of [
    ["maximal-core"],
    ["--suite", "maximal-core"],
    ["--filter=@stuffbucket/maximal-core"],
    ["--", "--", "--suite=policy"],
  ]) {
    assert.throws(() => parseOptions(arguments_), /Usage:/);
  }
});

test("each suite selects one fixed root-owned inner script", () => {
  assert.deepEqual(
    Object.fromEntries(
      ["workspace", "maximal-core", "maximal-dsh-host", "policy"].map(
        (suite) => [suite, innerScriptForSuite(suite)],
      ),
    ),
    {
      workspace: "test:inner",
      "maximal-core": "test:maximal-core:inner",
      "maximal-dsh-host": "test:maximal-dsh-host:inner",
      policy: "test:policy:inner",
    },
  );
  assert.throws(() => innerScriptForSuite("other"), /Invalid test suite/);

  const imageId = "sha256:" + "b".repeat(64);
  const arguments_ = runDockerArguments(imageId, {
    suite: "maximal-core",
    trace: "tests",
  });
  assert.deepEqual(arguments_.slice(-4), [
    imageId,
    "pnpm",
    "run",
    "test:maximal-core:inner",
  ]);
  assert.deepEqual(arguments_.slice(-6, -4), ["--env", "MAXIMAL_TEST_TRACE=1"]);
});

test("tool pins come from their owner files and pnpm checksums from mise", () => {
  const pins = readToolPins(root);
  const manifest = JSON.parse(read("package.json"));
  assert.equal(pins.nodeMajor, read(".nvmrc").trim());
  assert.equal(pins.bunVersion, read(".bun-version").trim());
  assert.equal(pins.pnpmVersion, manifest.packageManager.slice("pnpm@".length));
  assert.match(pins.pnpmSha256Amd64, /^[0-9a-f]{64}$/);
  assert.match(pins.pnpmSha256Arm64, /^[0-9a-f]{64}$/);

  const arguments_ = buildDockerArguments({
    iidFile: "/tmp/image-id",
    gitSha: "c".repeat(40),
    dirty: false,
    pins,
    targetArch: "arm64",
  });
  assert.ok(arguments_.includes(`NODE_MAJOR=${pins.nodeMajor}`));
  assert.ok(arguments_.includes(`BUN_VERSION=${pins.bunVersion}`));
  assert.ok(arguments_.includes(`PNPM_VERSION=${pins.pnpmVersion}`));
  assert.ok(arguments_.includes("GIT_SHA=" + "c".repeat(40)));
  assert.ok(arguments_.includes("TARGETARCH=arm64"));
});

test("the macOS producer bootstraps pnpm from the committed locked artifact", () => {
  const manifest = JSON.parse(read("package.json"));
  const pnpmVersion = manifest.packageManager.slice("pnpm@".length);
  const miseToml = read("mise.toml");
  const miseLock = read("mise.lock");
  const producer = read(".macos-builder/build.sh");
  const platformEntry = miseLock.match(
    /\[tools\.pnpm\."platforms\.macos-arm64"\]\nchecksum = "sha256:([0-9a-f]{64})"\nurl = "([^"]+)"/,
  );

  assert.equal(miseToml.match(/^pnpm = "(\d+\.\d+\.\d+)"$/m)?.[1], pnpmVersion);
  assert.equal(
    miseLock.match(/\[\[tools\.pnpm\]\]\nversion = "(\d+\.\d+\.\d+)"/)?.[1],
    pnpmVersion,
  );
  assert.match(
    platformEntry?.[2] ?? "",
    new RegExp(`/v${pnpmVersion}/pnpm-darwin-arm64\\.tar\\.gz$`),
  );
  assert.match(platformEntry?.[1] ?? "", /^[0-9a-f]{64}$/);
  assert.match(producer, /PNPM_SPEC="\$\(node -p "require\('\.\/package\.json'\)\.packageManager"\)"/);
  assert.match(producer, /\[tools\.pnpm\.\\"platforms\.macos-arm64\\"\]/);
  assert.match(producer, /curl --fail --location --retry 3 --output "\$PNPM_ARCHIVE" "\$PNPM_URL"/);
  assert.match(producer, /shasum -a 256 -c -/);
  assert.match(producer, /tar -xzf "\$PNPM_ARCHIVE" -C "\$PNPM_STAGING"/);
  assert.doesNotMatch(producer, /^\s*npm install --prefix/m);
  assert.match(producer, /\[ "\$HAVE_PNPM" = "\$PNPM_VERSION" \]/);
});

test("Turbo replay cache selects only cacheable executable task hashes", () => {
  const hash = "a".repeat(16);
  const cacheable = {
    hash,
    command: "node build.mjs",
    resolvedTaskDefinition: { cache: true },
  };
  assert.deepEqual(
    selectTurboCacheHashes({
      tasks: [
        cacheable,
        { ...cacheable },
        {
          hash: "not-selected",
          command: "node build.mjs",
          resolvedTaskDefinition: { cache: false },
        },
        {
          hash: "not-selected",
          command: "<NONEXISTENT>",
          resolvedTaskDefinition: { cache: true },
        },
      ],
    }),
    [hash],
  );
  assert.throws(() => selectTurboCacheHashes({ tasks: [] }), /has no tasks/);
  assert.throws(
    () =>
      selectTurboCacheHashes({
        tasks: [{ ...cacheable, hash: "invalid" }],
      }),
    /Invalid Turbo task hash/,
  );
  assert.throws(
    () => selectTurboCacheHashes({ tasks: [{ hash }] }),
    /malformed task/,
  );
});

test("Turbo build graph is read from a pre-build snapshot", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "monimal-turbo-graph-"));
  const reportPath = path.join(directory, "graph.json");
  const report = {
    tasks: [
      {
        hash: "a".repeat(16),
        command: "node build.mjs",
        resolvedTaskDefinition: { cache: true },
      },
    ],
  };

  try {
    fs.writeFileSync(reportPath, JSON.stringify(report));
    assert.deepEqual(readTurboBuildGraph(reportPath), report);
    fs.writeFileSync(reportPath, "not JSON");
    assert.throws(() => readTurboBuildGraph(reportPath), /invalid JSON/);
    fs.rmSync(reportPath);
    assert.throws(() => readTurboBuildGraph(reportPath), /could not be read/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("Turbo replay cache publication is selective and transactional", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "monimal-turbo-cache-"));
  const source = path.join(directory, "source");
  const destination = path.join(directory, "destination");
  const suffixes = [".tar.zst", "-meta.json", "-manifest.json"];
  const hash = "b".repeat(16);
  const staleHash = "c".repeat(16);
  const report = {
    tasks: [
      {
        hash,
        command: "node build.mjs",
        resolvedTaskDefinition: { cache: true },
      },
    ],
  };

  try {
    fs.mkdirSync(source);
    fs.mkdirSync(destination);
    fs.writeFileSync(path.join(destination, "stale.txt"), "previous\n");
    for (const suffix of suffixes) {
      fs.writeFileSync(path.join(source, `${hash}${suffix}`), `${suffix}\n`);
      fs.writeFileSync(
        path.join(source, `${staleHash}${suffix}`),
        `stale ${suffix}\n`,
      );
    }

    assert.deepEqual(publishTurboBuildCache(report, source, destination), [hash]);
    assert.deepEqual(
      fs.readdirSync(destination).sort(),
      suffixes.map((suffix) => `${hash}${suffix}`).sort(),
    );

    fs.rmSync(path.join(source, `${hash}-manifest.json`));
    assert.throws(
      () => publishTurboBuildCache(report, source, destination),
      /Turbo cache artifact is missing/,
    );
    assert.deepEqual(
      fs.readdirSync(destination).sort(),
      [
        `${hash}.tar.zst`,
        `${hash}-meta.json`,
        `${hash}-manifest.json`,
      ].sort(),
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("the build context excludes local state but retains source fixtures", () => {
  const patterns = read(".dockerignore")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#"));
  const ignore = new Set(patterns);
  const isIgnored = (relativePath) => {
    let candidate = "";
    return relativePath.split("/").some((segment) => {
      candidate = candidate ? `${candidate}/${segment}` : segment;
      return patterns.some((pattern) => path.matchesGlob(candidate, pattern));
    });
  };

  for (const required of [
    ".git",
    ".claude",
    "**/.claude",
    "**/node_modules",
    "**/.pnpm-store",
    "**/dist",
    "**/resources/bin",
    "**/reports/mutation",
    "**/reports/.mutation-*",
    "**/.stryker-tmp",
    "**/.env.*",
    "**/.tmp-omlx-*",
    "**/state",
    "**/.local",
    "**/.config",
    "**/accounts.json",
    "**/github_token",
    "**/settings.json",
  ]) {
    assert.ok(ignore.has(required), `missing .dockerignore rule: ${required}`);
  }

  for (const sensitivePath of [
    "packages/maximal-core/state/runtime.json",
    "packages/maximal-core/.pnpm-store/v11/index.json",
    "packages/maximal-core/reports/.mutation-stage-123/index.html",
    "packages/maximal/client/resources/bin/maximal-core",
    "packages/maximal-core/.local/share/cache.json",
    "packages/maximal-core/.config/maximal/config.json",
    "packages/maximal-core/accounts.json",
    "packages/maximal-core/github_token",
    "packages/maximal-core/settings.json",
  ]) {
    assert.ok(isIgnored(sensitivePath), `build context includes ${sensitivePath}`);
  }

  for (const requiredPath of [
    ".npmrc",
    ".github/workflows/ci.yml",
    "packages/maximal-core/tests/fixtures/isolation/maximal-path-probe.test-fixture.ts",
    "packages/maximal-electron/e2e/fixtures/demo-shell/index.html",
  ]) {
    assert.ok(fs.existsSync(path.join(root, requiredPath)), `missing ${requiredPath}`);
    assert.ok(!isIgnored(requiredPath), `build context excludes ${requiredPath}`);
  }
});

test("the reusable Docker install layer includes every workspace manifest", () => {
  const dockerfile = read("Dockerfile");
  const manifests = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === "node_modules") continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(absolute);
      } else if (entry.name === "package.json") {
        manifests.push(path.relative(root, absolute));
      }
    }
  };
  visit(path.join(root, "packages"));

  const install = dockerfile.indexOf(
    "pnpm install --frozen-lockfile --ignore-scripts",
  );
  const sourceCopy = dockerfile.indexOf("COPY --chown=maximal:maximal . .");
  const gitShaEnvironment = dockerfile.indexOf("ENV MAXIMAL_GIT_SHA=${GIT_SHA}");
  for (const manifest of manifests) {
    const copy = dockerfile.indexOf(
      `COPY --chown=maximal:maximal ${manifest} ${manifest}`,
    );
    assert.ok(copy >= 0, `${manifest} is missing from the metadata layer`);
    assert.ok(copy < install, `${manifest} must be copied before the install`);
  }
  assert.ok(install >= 0 && install < sourceCopy);
  assert.ok(sourceCopy < gitShaEnvironment);
  const pnpmStoreMount =
    "--mount=type=cache,id=maximal-pnpm-${TARGETARCH},target=/workspace/.pnpm-store,uid=10001,gid=10001,sharing=locked";
  const pnpmCacheMount =
    "--mount=type=cache,id=maximal-pnpm-cache-${TARGETARCH},target=/home/maximal/.cache/pnpm,uid=10001,gid=10001,sharing=locked";
  const pnpmStateMount =
    "--mount=type=cache,id=maximal-pnpm-state-${TARGETARCH},target=/home/maximal/.local/state/pnpm,uid=10001,gid=10001,sharing=locked";
  assert.equal(dockerfile.split(pnpmStoreMount).length - 1, 2);
  assert.equal(dockerfile.split(pnpmCacheMount).length - 1, 2);
  assert.equal(dockerfile.split(pnpmStateMount).length - 1, 2);
  assert.match(
    dockerfile,
    /pnpm install --frozen-lockfile --ignore-scripts --store-dir=\/workspace\/\.pnpm-store/,
  );
  assert.match(
    dockerfile,
    /pnpm rebuild -r --store-dir=\/workspace\/\.pnpm-store/,
  );
  assert.match(
    dockerfile,
    /--mount=type=cache,id=maximal-turbo-v3-\$\{TARGETARCH\},target=\/workspace\/\.turbo-build-cache,uid=10001,gid=10001,sharing=locked/,
  );
  assert.doesNotMatch(dockerfile, /target=\/workspace\/\.turbo(?:,|\/)/);
  const graphSnapshot =
    "./node_modules/.bin/turbo run build --concurrency=1 --dry=json --cache-dir=/workspace/.turbo-build-cache > /tmp/turbo-build-graph.json";
  const build =
    "./node_modules/.bin/turbo run build --concurrency=1 --cache-dir=/workspace/.turbo-build-cache";
  assert.ok(dockerfile.indexOf(graphSnapshot) < dockerfile.indexOf(build));
  assert.match(
    dockerfile,
    /node scripts\/copy-turbo-build-cache\.mjs \/tmp\/turbo-build-graph\.json \/workspace\/\.turbo-build-cache \/workspace\/\.turbo\/cache/,
  );
  assert.doesNotMatch(
    dockerfile,
    /cp -a \/workspace\/\.turbo-build-cache\/. \/workspace\/\.turbo\/cache\//,
  );
});

test("the image owns test homes and runs the test command as non-root", () => {
  const dockerfile = read("Dockerfile");
  assert.match(dockerfile, /^FROM node:24-bookworm-slim@sha256:[0-9a-f]{64}$/m);
  assert.match(dockerfile, /COPY --chown=maximal:maximal \. \./);
  assert.match(dockerfile, /USER maximal/);
  assert.match(dockerfile, /MAXIMAL_TEST_CONTAINER=1/);
  assert.match(dockerfile, /XDG_CONFIG_HOME=\/home\/maximal\/\.config/);
  assert.match(dockerfile, /sha256sum -c -/);
  assert.match(dockerfile, /\bprocps\b/);
  assert.match(dockerfile, /CMD \["pnpm", "run", "test:inner"\]/);
});
