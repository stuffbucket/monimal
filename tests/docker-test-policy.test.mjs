import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import {
  assertHostStateCanaryUnchanged,
  buildDockerArguments,
  createHostStateCanary,
  innerScriptForSuite,
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
  const turbo = JSON.parse(read("turbo.json"));
  assert.equal(manifest.scripts.test, "node scripts/docker-test.mjs");
  assert.deepEqual(
    {
      "test:inner": manifest.scripts["test:inner"],
      "test:maximal-core:inner": manifest.scripts["test:maximal-core:inner"],
      "test:maximal-dsh-host:inner":
        manifest.scripts["test:maximal-dsh-host:inner"],
      "test:policy:inner": manifest.scripts["test:policy:inner"],
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
    },
  );
  for (const [name, script] of Object.entries(manifest.scripts)) {
    if (name === "test:inner" || /^test:.+:inner$/.test(name)) {
      assert.match(script, /^node scripts\/assert-test-container\.mjs /);
      assert.doesNotMatch(script, /pnpm (?:run )?test(?:\s|$)/);
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
  assert.deepEqual(turbo.tasks.test.env, [
    "MAXIMAL_TEST_CONTAINER",
    "MAXIMAL_TEST_TRACE",
  ]);
});

test("required CI runs Core's host gate before the Docker test graph", () => {
  const workflow = read(".github/workflows/ci.yml");
  const hostGate =
    "pnpm --filter @stuffbucket/maximal-core run check:deep:host";
  const dockerGate = 'pnpm test -- --trace="$TEST_TRACE"';
  assert.equal(workflow.split(hostGate).length - 1, 1);
  assert.equal(workflow.split(dockerGate).length - 1, 1);
  assert.doesNotMatch(workflow, /pnpm (?:run )?check:core/);
  assert.doesNotMatch(workflow, /\bbun (?:run )?test\b/);
  assert.ok(workflow.indexOf(hostGate) < workflow.indexOf(dockerGate));
});

test("runtime arguments enforce the mountless offline boundary", () => {
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
    "**/dist",
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

test("the image owns test homes and runs the test command as non-root", () => {
  const dockerfile = read("Dockerfile");
  assert.match(dockerfile, /^FROM node:24-bookworm-slim@sha256:[0-9a-f]{64}$/m);
  assert.match(dockerfile, /COPY --chown=maximal:maximal \. \./);
  assert.match(dockerfile, /USER maximal/);
  assert.match(dockerfile, /MAXIMAL_TEST_CONTAINER=1/);
  assert.match(dockerfile, /XDG_CONFIG_HOME=\/home\/maximal\/\.config/);
  assert.match(dockerfile, /sha256sum -c -/);
  assert.match(dockerfile, /CMD \["pnpm", "run", "test:inner"\]/);
});
