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
  resolveMutationTargets,
} from "../scripts/docker-mutate.mjs";
import { parseDockerWorkspaceOptions } from "../scripts/docker-workspace-test.mjs";
import {
  buildDockerArguments,
  checkoutMountArguments,
  containerBoundaryArguments,
  expectedImageLabels,
  gitMetadataMountArguments,
  imageLabels,
  imageTagForArchitecture,
  innerScriptForSuite,
  isLinkedGitWorktree,
  parseOptions,
  parseTrace,
  readToolPins,
  runDockerArguments,
  stagedCommandArguments,
  turboCacheLabels,
  turboCacheMountArguments,
  turboCacheVolumeCreateArguments,
  validatedTurboCacheVolumeName,
  validatedImageId,
} from "../scripts/docker-test.mjs";
import {
  parseStageOptions,
  shouldStagePath,
  stageCheckout,
  validateCheckoutPath,
} from "../scripts/stage-test-checkout.mjs";
import {
  imageIsOldEnough,
  isManagedTestImage,
  isManagedTurboCacheVolume,
  parsePruneOptions,
  selectRetainedImage,
  volumeIsOldEnough,
} from "../scripts/prune-test-images.mjs";
import {
  affectedBase,
  createIsolatedTestEnvironment,
  formatPerformanceMarker,
  measurePerformancePhase,
  parseTestOptions,
  turboTestArguments,
} from "../scripts/test-workspace.mjs";
import {
  auditWorkspacePackages,
  auditWorkspaceReferences,
  discoverPackageManifests,
  inferredTasks,
  pnpmWorkspacePaths,
} from "../scripts/workspace-packages.mjs";

const root = path.resolve(import.meta.dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function writeManifest(rootPath, packagePath, manifest) {
  const directory = path.join(rootPath, packagePath);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "package.json"), JSON.stringify(manifest));
}

function createPackageFixture(prefix) {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.writeFileSync(path.join(fixture, ".gitignore"), "dist/\nout/\n");
  const initialized = spawnSync("git", ["init", "--quiet"], {
    cwd: fixture,
    encoding: "utf8",
  });
  assert.equal(initialized.status, 0, initialized.stderr);
  return fixture;
}

test("package onboarding is dynamically discovered and fails closed", () => {
  const fixture = createPackageFixture("monimal-packages-");
  try {
    writeManifest(fixture, "packages/library", {
      name: "library",
      scripts: Object.fromEntries(
        ["build", "lint", "test", "typecheck"].map((task) => [task, task]),
      ),
    });
    writeManifest(fixture, "packages/feature/nested", {
      name: "nested",
      scripts: {},
    });
    let audit = auditWorkspacePackages(fixture, ["packages/library"]);
    assert.deepEqual(audit.issues, [
      "packages/feature/nested is not included in the pnpm workspace",
    ]);

    writeManifest(fixture, "packages/feature/nested", {
      name: "nested",
      private: true,
      monimal: {
        workspace: false,
        workspaceReason: "Independent fixture.",
      },
    });
    audit = auditWorkspacePackages(fixture, ["packages/library"]);
    assert.deepEqual(audit.issues, []);

    audit = auditWorkspacePackages(fixture, [
      "packages/library",
      "packages/feature/nested",
    ]);
    assert.match(audit.issues[0], /workspace package but declares/);

    writeManifest(fixture, "packages/library/dist/generated", {
      name: "ignored-output",
    });
    assert.deepEqual(discoverPackageManifests(fixture), [
      "packages/feature/nested",
      "packages/library",
    ]);

    fs.rmSync(path.join(fixture, "packages/library/package.json"));
    assert.deepEqual(discoverPackageManifests(fixture), [
      "packages/feature/nested",
    ]);
    audit = auditWorkspacePackages(fixture, []);
    assert.deepEqual(audit.issues, []);
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

test("package tasks are inferred from independent manifest capabilities", () => {
  assert.deepEqual(inferredTasks({}), ["build", "lint", "test", "typecheck"]);
  assert.deepEqual(inferredTasks({ devDependencies: { electron: "1" } }), [
    "build",
    "lint",
    "test",
    "typecheck",
    "package",
    "start",
  ]);
  assert.deepEqual(inferredTasks({ bin: { cli: "dist/cli.js" } }), [
    "build",
    "lint",
    "test",
    "typecheck",
    "dev",
    "start",
  ]);
  assert.deepEqual(inferredTasks({ bin: {} }), [
    "build",
    "lint",
    "test",
    "typecheck",
  ]);

  const fixture = createPackageFixture("monimal-tasks-");
  try {
    writeManifest(fixture, "packages/desktop", {
      name: "desktop",
      devDependencies: { electron: "1" },
      scripts: {},
    });
    const missing = auditWorkspacePackages(fixture, ["packages/desktop"]);
    assert.deepEqual(missing.issues, [
      "packages/desktop is missing inferred build script; add scripts.build",
      "packages/desktop is missing inferred lint script; add scripts.lint",
      "packages/desktop is missing inferred test script; add scripts.test",
      "packages/desktop is missing inferred typecheck script; add scripts.typecheck",
      "packages/desktop is missing inferred package script; add scripts.package",
      "packages/desktop is missing inferred start script; add scripts.start",
    ]);

    writeManifest(fixture, "packages/desktop", {
      name: "desktop",
      devDependencies: { electron: "1" },
      scripts: {
        build: " ",
        lint: "lint",
        test: "test",
        typecheck: "typecheck",
        package: "package",
        start: "start",
      },
      monimal: {
        taskExemptions: {
          test: "",
          unknown: "No such required task.",
        },
      },
    });
    const bypasses = auditWorkspacePackages(fixture, ["packages/desktop"]);
    assert.deepEqual(bypasses.issues, [
      "packages/desktop exempts test without a reason",
      "packages/desktop has stale unknown task exemption",
      "packages/desktop is missing inferred build script; add scripts.build",
    ]);
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }

  const audit = auditWorkspacePackages(root, pnpmWorkspacePaths(root));
  assert.deepEqual(audit.issues, []);
});

test("removed packages cannot retain root workflow or Turbo references", () => {
  const fixture = createPackageFixture("monimal-references-");
  try {
    writeManifest(fixture, "packages/library", {
      name: "library",
      scripts: {
        build: "build",
        lint: "lint",
        test: "test",
        typecheck: "typecheck",
      },
    });
    fs.writeFileSync(
      path.join(fixture, "package.json"),
      JSON.stringify({
        scripts: {
          dev: "turbo run dev --filter=removed-app",
          check: "pnpm --filter library test",
        },
      }),
    );
    fs.writeFileSync(
      path.join(fixture, "turbo.json"),
      JSON.stringify({ tasks: { build: {}, "removed-app#build": {} } }),
    );
    assert.deepEqual(
      auditWorkspaceReferences(fixture, ["packages/library"]),
      [
        "removed-app#build targets a package outside the pnpm workspace",
        "scripts.dev filters a package outside the pnpm workspace: removed-app",
      ],
    );
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }

  assert.deepEqual(
    auditWorkspaceReferences(root, pnpmWorkspacePaths(root)),
    [],
  );
});

function runLockfileHostStrip(...arguments_) {
  return spawnSync(
    process.execPath,
    ["scripts/strip-lockfile-hosts.mjs", ...arguments_],
    {
      cwd: root,
      encoding: "utf8",
    },
  );
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
  assert.equal(manifest.scripts.test, "node scripts/test-workspace.mjs");
  assert.equal(
    manifest.scripts["test:all"],
    "node scripts/test-workspace.mjs --all",
  );
  assert.equal(
    manifest.scripts["test:core"],
    "node scripts/test-workspace.mjs --core",
  );
  assert.equal(manifest.scripts["test:docker"], "node scripts/docker-test.mjs");
  assert.equal(
    manifest.scripts["docker:prune:test-images"],
    "node scripts/prune-test-images.mjs",
  );
  assert.equal(
    manifest.scripts["mutate:core"],
    "node scripts/docker-mutate.mjs",
  );
  assert.equal(
    coreManifest.scripts.mutate,
    "node ../../scripts/docker-mutate.mjs",
  );
  assert.deepEqual(
    {
      "test:inner": manifest.scripts["test:inner"],
      "test:maximal-core:inner": manifest.scripts["test:maximal-core:inner"],
      "test:maximal-models:inner":
        manifest.scripts["test:maximal-models:inner"],
      "test:policy:inner": manifest.scripts["test:policy:inner"],
      "mutate:core:inner": manifest.scripts["mutate:core:inner"],
    },
    {
      "test:inner": "node scripts/docker-workspace-test.mjs",
      "test:maximal-core:inner":
        "node scripts/assert-test-container.mjs && pnpm --filter @stuffbucket/maximal-core test",
      "test:maximal-models:inner":
        "node scripts/assert-test-container.mjs && pnpm --filter @stuffbucket/maximal-models test",
      "test:policy:inner":
        "node scripts/assert-test-container.mjs && node --test tests/docker-test-policy.test.mjs",
      "mutate:core:inner":
        "node scripts/assert-test-container.mjs && pnpm --filter @stuffbucket/maximal-core exec stryker run",
    },
  );
  for (const [name, script] of Object.entries(manifest.scripts)) {
    if (/^test:.+:inner$/.test(name) || name === "mutate:core:inner") {
      assert.match(script, /^node scripts\/assert-test-container\.mjs /);
      assert.doesNotMatch(script, /pnpm (?:run )?(?:test|mutate:core)(?:\s|$)/);
    }
  }
  assert.equal(
    manifest.scripts["check:core"],
    "pnpm --filter @stuffbucket/maximal-core run check:deep:host && pnpm run test:core",
  );
  assert.equal(
    manifest.scripts["check:static"],
    "turbo run build typecheck lint",
  );
  assert.equal(
    manifest.scripts.check,
    "pnpm run check:static && pnpm --filter @stuffbucket/maximal-core run check:deep:host && pnpm test",
  );
  assert.equal(
    (manifest.scripts.check.match(/(?:^|&& )pnpm test(?: |$)/g) ?? []).length,
    1,
  );
  assert.doesNotMatch(manifest.scripts.check, /pnpm run check:core/);
  assert.deepEqual(turbo.tasks["maximal-client#build"].env, [
    "MAXIMAL_CORE_OUT",
    "MAXIMAL_CORE_REF",
    "MAXIMAL_CORE_TARGET",
    "MAXIMAL_GIT_SHA",
  ]);
  assert.ok(turbo.tasks.build.inputs.includes("!**/dist/**"));
  assert.ok(turbo.tasks.build.inputs.includes("!**/.turbo/**"));
  assert.ok(turbo.tasks.build.inputs.includes("!**/resources/bin/**"));
  assert.deepEqual(turbo.tasks.test.env, [
    "MAXIMAL_TEST_CONTAINER",
    "MAXIMAL_TEST_HOST",
    "MAXIMAL_TEST_TRACE",
  ]);
  assert.deepEqual(turbo.tasks.test.passThroughEnv, [
    "APPDATA",
    "CLAUDE_CONFIG_DIR",
    "COPILOT_API_HOME",
    "HOME",
    "LOCALAPPDATA",
    "MAXIMAL_TEST_ROOT",
    "USERPROFILE",
    "XDG_CACHE_HOME",
    "XDG_CONFIG_HOME",
    "XDG_DATA_HOME",
    "XDG_STATE_HOME",
  ]);
  assert.equal(turbo.tasks.package.cache, false);
  assert.equal(turbo.tasks.package.outputs, undefined);
});

test("root workflows select the intended package and task graphs", () => {
  const manifest = JSON.parse(read("package.json"));
  const client = JSON.parse(read("packages/maximal/client/package.json"));
  const turbo = JSON.parse(read("turbo.json"));

  assert.deepEqual(
    {
      dev: manifest.scripts.dev,
      "dev:server": manifest.scripts["dev:server"],
      package: manifest.scripts.package,
      "package:all": manifest.scripts["package:all"],
    },
    {
      dev: "turbo run dev --filter=maximal-client",
      "dev:server":
        "turbo run dev --filter=@stuffbucket/maximal -- start",
      package: "turbo run package --filter=maximal-client",
      "package:all": "turbo run package",
    },
  );
  assert.equal(client.scripts.dev, "node scripts/start.mjs");
  assert.equal(client.scripts.predev, "node scripts/gen-icon-png.mjs");
  assert.deepEqual(turbo.tasks.transit.dependsOn, ["^transit"]);
  assert.deepEqual(turbo.tasks.lint.dependsOn, ["transit", "^build"]);
  assert.deepEqual(turbo.tasks.dev.dependsOn, ["^build"]);
  assert.equal(turbo.tasks.dev.cache, false);
  assert.equal(turbo.tasks.dev.persistent, true);
  assert.deepEqual(turbo.tasks["maximal-client#dev"].dependsOn, ["build"]);
  assert.equal(turbo.tasks["maximal-client#dev"].cache, false);
  assert.equal(turbo.tasks["maximal-client#dev"].persistent, true);
});

test("architecture analysis has one cacheable Turbo execution path", () => {
  const manifest = JSON.parse(read("package.json"));
  const turbo = JSON.parse(read("turbo.json"));
  const workflow = read(".github/workflows/ci.yml");

  assert.equal(manifest.scripts.analyze, "turbo run analyze");
  assert.doesNotMatch(manifest.scripts.check, /pnpm (?:run )?analyze/);
  assert.equal(
    turbo.tasks.test.dependsOn.filter((dependency) => dependency === "analyze")
      .length,
    1,
  );
  assert.deepEqual(turbo.tasks.analyze, {
    outputs: [],
    inputs: [
      "$TURBO_DEFAULT$",
      "$TURBO_ROOT$/architecture-analysis.json",
      "$TURBO_ROOT$/architecture-analysis.schema.json",
      "$TURBO_ROOT$/packages/maximal-core/scripts/analysis/**",
      "$TURBO_ROOT$/packages/maximal-core/scripts/analyze.ts",
      "$TURBO_ROOT$/scripts/architecture-graph.mjs",
      "!research_log/**",
      "!.claude/**",
      "!.github/**",
    ],
  });
  assert.doesNotMatch(workflow, /\b(?:knip|jscpd|dependency-cruiser)\b/);
});

test("required CI runs native checks before Docker and has one cache writer", () => {
  const workflow = read(".github/workflows/ci.yml");
  const staticGate = "pnpm exec turbo run build typecheck lint";
  const hostGate =
    "pnpm --filter @stuffbucket/maximal-core run check:deep:host:after-workspace";
  const packageMechanics =
    "pnpm --filter @stuffbucket/maximal-electron run verify:fixture-imports";
  const sidecarProvenance =
    "LINK=packages/maximal/client/node_modules/@stuffbucket/maximal-core";
  const testGate =
    "pnpm run test:all -- --trace=${{ inputs.test_trace || 'off' }}";
  const packageGate = "pnpm run package:all";
  assert.equal(workflow.split(staticGate).length - 1, 1);
  assert.equal(workflow.split(hostGate).length - 1, 1);
  assert.equal(workflow.split(packageMechanics).length - 1, 1);
  assert.equal(workflow.split(sidecarProvenance).length - 1, 1);
  assert.equal(workflow.split(testGate).length - 1, 1);
  assert.equal(workflow.split(packageGate).length - 1, 1);
  assert.equal(workflow.split("MONIMAL_PERF_MARKERS: 1").length - 1, 1);
  assert.equal(
    workflow.split("if: always() && steps.workspace-check-start.outcome == 'success'")
      .length - 1,
    1,
  );
  assert.equal(
    workflow.split("perf-marker phase=workspace-check-window").length - 1,
    1,
  );
  assert.equal(
    workflow.split("perf-marker phase=core-host-after-workspace").length - 1,
    1,
  );
  assert.doesNotMatch(workflow, /pnpm (?:run )?check:core/);
  assert.doesNotMatch(workflow, /\bbun (?:run )?test\b/);
  assert.doesNotMatch(
    workflow,
    /MAXIMAL_DOCKER_CACHE|MAXIMAL_TEST_CONTAINER|docker\/setup-buildx-action|ghaction-github-runtime/,
  );
  assert.ok(workflow.indexOf(hostGate) < workflow.indexOf(testGate));
  assert.ok(workflow.indexOf(packageMechanics) < workflow.indexOf(testGate));
  assert.ok(workflow.indexOf(sidecarProvenance) < workflow.indexOf(testGate));
  assert.equal(workflow.split("uses: actions/cache/save@").length - 1, 1);
  assert.equal(workflow.split("uses: actions/cache@").length - 1, 1);
  assert.equal(workflow.split("uses: actions/cache/restore@").length - 1, 2);
  assert.match(workflow, /if: github\.event_name == 'push'/);
  assert.equal(workflow.split("turbo-v2-").length - 1, 6);
});

test("root automation schedules Docker and keeps CodeQL lean and pinned", () => {
  const dockerWorkflow = read(".github/workflows/docker-policy.yml");
  const codeqlWorkflow = read(".github/workflows/codeql.yml");
  const codeqlConfig = read(".github/codeql/codeql-config.yml");
  const dependabot = read(".github/dependabot.yml");
  const rootWorkflows = fs
    .readdirSync(path.join(root, ".github/workflows"))
    .filter((name) => name.endsWith(".yml"))
    .map((name) => read(`.github/workflows/${name}`))
    .join("\n");

  assert.match(dockerWorkflow, /^  schedule:\n    - cron: /m);
  assert.match(dockerWorkflow, /^  workflow_dispatch:\n    inputs:/m);
  assert.doesNotMatch(dockerWorkflow, /^  (?:pull_request|push):/m);
  assert.equal(
    dockerWorkflow.split("node scripts/docker-test.mjs --suite=policy").length - 1,
    1,
  );
  assert.equal(
    dockerWorkflow.split("node scripts/docker-test.mjs --all").length - 1,
    1,
  );
  assert.match(codeqlWorkflow, /languages: javascript-typescript/);
  assert.doesNotMatch(codeqlWorkflow, /security-and-quality/);
  assert.doesNotMatch(codeqlWorkflow, /uses: github\/codeql-action\/autobuild@/);
  assert.match(codeqlConfig, /^paths:\n  - packages\n  - scripts/m);
  assert.match(codeqlConfig, /packages\/\*\*\/tests/);
  assert.match(codeqlConfig, /packages\/\*\*\/dist/);
  assert.match(
    dependabot,
    /package-ecosystem: docker\n    directory: \/\n    schedule:\n      interval: weekly/,
  );
  assert.doesNotMatch(rootWorkflows, /runs-on: ubuntu-latest/);
  for (const reference of rootWorkflows.matchAll(/uses: ([^\s#]+)/g)) {
    if (reference[1]?.startsWith("./")) continue;
    assert.match(reference[1] ?? "", /@[0-9a-f]{40}$/);
  }
});

test("Docker builds use a reusable dependency image and optional Actions cache", () => {
  const input = {
    iidFile: "/tmp/image-id",
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
  assert.deepEqual(local.slice(0, 5), [
    "buildx",
    "build",
    "--builder",
    "monimal-test",
    "--load",
  ]);
  assert.ok(local.includes("--provenance=false"));
  assert.ok(local.includes("monimal-test:dependencies-amd64"));
  assert.ok(
    local.includes("org.opencontainers.image.title=monimal-test-dependencies"),
  );
  assert.ok(local.includes("io.stuffbucket.monimal.purpose=workspace-test"));
  assert.ok(local.includes("io.stuffbucket.monimal.architecture=amd64"));
  assert.ok(local.includes("io.stuffbucket.monimal.mutation=stryker"));
  assert.doesNotMatch(local.join(" "), /GIT_SHA|source-digest|dirty|revision/);
  assert.equal(
    imageTagForArchitecture("arm64"),
    "monimal-test:dependencies-arm64",
  );

  const cached = buildDockerArguments({ ...input, cache: "gha" });
  assert.deepEqual(cached.slice(0, 5), local.slice(0, 5));
  assert.ok(cached.includes("type=gha,scope=workspace-test"));
  assert.ok(cached.includes("type=gha,mode=max,scope=workspace-test"));
  assert.throws(
    () => buildDockerArguments({ ...input, cache: "type=local,dest=/tmp" }),
    /Invalid Docker cache mode/,
  );
  assert.throws(() => imageTagForArchitecture("ppc64"), /Unsupported Docker/);
});

test("native test selection is closed and uses affected dependents", () => {
  const base = "a".repeat(40);
  assert.deepEqual(parseTestOptions([]), { scope: "affected", trace: "off" });
  assert.deepEqual(parseTestOptions(["--all", "--trace=tests"]), {
    scope: "all",
    trace: "tests",
  });
  assert.deepEqual(parseTestOptions(["--", "--core"]), {
    scope: "core",
    trace: "off",
  });
  assert.deepEqual(parseTestOptions(["--all", "--", "--trace=tests"]), {
    scope: "all",
    trace: "tests",
  });
  assert.deepEqual(turboTestArguments({ scope: "affected" }, base), [
    "run",
    "test",
    "--concurrency=1",
    `--filter=...[${base}]`,
  ]);
  assert.deepEqual(turboTestArguments({ scope: "all" }), [
    "run",
    "test",
    "--concurrency=1",
  ]);
  assert.deepEqual(turboTestArguments({ scope: "core" }), [
    "run",
    "test",
    "--concurrency=1",
    "--filter=@stuffbucket/maximal-core",
  ]);
  assert.throws(
    () => parseTestOptions(["--all", "--core"]),
    /Duplicate test scope/,
  );
  assert.throws(
    () => parseTestOptions(["--", "--", "--trace=tests"]),
    /Usage:/,
  );
  assert.throws(() => parseTestOptions(["--filter=x"]), /Usage:/);
});

test("native performance markers are deterministic, optional, and failure-aware", () => {
  const lines = [];
  const times = [
    new Date("2026-09-08T12:00:00.000Z"),
    new Date("2026-09-08T12:00:01.250Z"),
  ];
  const ticks = [100, 1350];
  const result = measurePerformancePhase(
    "test-workspace",
    () => "passed",
    {
      enabled: true,
      now: () => times.shift(),
      monotonicNow: () => ticks.shift(),
      write: (line) => lines.push(line),
    },
  );

  assert.equal(result, "passed");
  assert.equal(
    lines[0],
    formatPerformanceMarker({
      phase: "test-workspace",
      startedAt: new Date("2026-09-08T12:00:00.000Z"),
      endedAt: new Date("2026-09-08T12:00:01.250Z"),
      elapsedMilliseconds: 1250,
      status: "success",
    }),
  );
  assert.equal(
    lines[0],
    "perf-marker phase=test-workspace started_at=2026-09-08T12:00:00.000Z ended_at=2026-09-08T12:00:01.250Z elapsed_seconds=1.250 status=success",
  );

  let disabledRan = false;
  measurePerformancePhase(
    "test-disabled",
    () => {
      disabledRan = true;
    },
    { enabled: false, write: (line) => lines.push(line) },
  );
  assert.equal(disabledRan, true);
  assert.equal(lines.length, 1);

  const failureTimes = [
    new Date("2026-09-08T12:00:02.000Z"),
    new Date("2026-09-08T12:00:02.500Z"),
  ];
  const failureTicks = [2000, 2500];
  assert.throws(
    () =>
      measurePerformancePhase(
        "test-root-policy",
        () => {
          throw new Error("fixture failure");
        },
        {
          enabled: true,
          now: () => failureTimes.shift(),
          monotonicNow: () => failureTicks.shift(),
          write: (line) => lines.push(line),
        },
      ),
    /fixture failure/,
  );
  assert.match(lines[1], /phase=test-root-policy .* status=failure$/);
});

test("native test isolation redirects state and scrubs credentials", () => {
  const parent = fs.mkdtempSync(
    path.join(os.tmpdir(), "monimal-native-policy-"),
  );
  const priorToken = process.env.GITHUB_TOKEN;
  const priorProxy = process.env.HTTPS_PROXY;
  const priorPerformanceMarkers = process.env.MONIMAL_PERF_MARKERS;
  process.env.GITHUB_TOKEN = "secret";
  process.env.HTTPS_PROXY = "https://proxy.invalid";
  process.env.MONIMAL_PERF_MARKERS = "1";
  try {
    const isolated = createIsolatedTestEnvironment(parent);
    assert.equal(fs.statSync(isolated.root).mode & 0o777, 0o700);
    assert.equal(isolated.environment.MAXIMAL_TEST_HOST, "1");
    assert.equal(isolated.environment.MAXIMAL_TEST_ROOT, isolated.root);
    assert.equal(isolated.environment.MAXIMAL_TEST_CONTAINER, undefined);
    assert.equal(isolated.environment.GITHUB_TOKEN, undefined);
    assert.equal(isolated.environment.HTTPS_PROXY, undefined);
    assert.equal(isolated.environment.MONIMAL_PERF_MARKERS, undefined);
    for (const name of [
      "HOME",
      "XDG_CACHE_HOME",
      "XDG_CONFIG_HOME",
      "XDG_DATA_HOME",
      "XDG_STATE_HOME",
      "USERPROFILE",
      "APPDATA",
      "LOCALAPPDATA",
      "COPILOT_API_HOME",
      "CLAUDE_CONFIG_DIR",
    ]) {
      const relative = path.relative(isolated.root, isolated.environment[name]);
      assert.ok(
        relative && !relative.startsWith("..") && !path.isAbsolute(relative),
      );
    }
  } finally {
    if (priorToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = priorToken;
    if (priorProxy === undefined) delete process.env.HTTPS_PROXY;
    else process.env.HTTPS_PROXY = priorProxy;
    if (priorPerformanceMarkers === undefined)
      delete process.env.MONIMAL_PERF_MARKERS;
    else process.env.MONIMAL_PERF_MARKERS = priorPerformanceMarkers;
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("affected base and linked worktree detection use Git state", () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "monimal-git-policy-"),
  );
  const linked = `${directory}-linked`;
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
    assert.throws(() => affectedBase(directory), /git fetch origin main/);
    assert.equal(git("remote", "add", "origin", directory).status, 0);
    assert.equal(
      git("fetch", "--quiet", "origin", "HEAD:refs/remotes/origin/main").status,
      0,
    );
    assert.equal(
      affectedBase(directory),
      git("rev-parse", "HEAD").stdout.trim(),
    );
    assert.equal(isLinkedGitWorktree(directory), false);

    assert.equal(git("worktree", "add", "--quiet", linked).status, 0);
    assert.equal(isLinkedGitWorktree(linked), true);
  } finally {
    spawnSync("git", ["worktree", "remove", "--force", linked], {
      cwd: directory,
      encoding: "utf8",
    });
    fs.rmSync(linked, { recursive: true, force: true });
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("Docker image validation and retention require reusable Stryker metadata", () => {
  const labels = expectedImageLabels({ targetArch: "arm64" });
  const exactId = `sha256:${"c".repeat(64)}`;
  const fallbackId = `sha256:${"d".repeat(64)}`;
  const exact = {
    Id: exactId,
    Architecture: "arm64",
    Created: "2026-09-01T00:00:00Z",
    Config: { Labels: labels },
  };
  const fallback = {
    Id: fallbackId,
    Architecture: "amd64",
    Created: "2026-09-02T00:00:00Z",
    Config: {
      Labels: {
        [imageLabels.architecture]: "amd64",
        [imageLabels.purpose]: "workspace-test",
        [imageLabels.mutation]: "stryker",
      },
    },
  };
  assert.equal(validatedImageId(exact, labels), exactId);
  assert.equal(isManagedTestImage(exact), true);
  assert.equal(
    isManagedTestImage({
      ...exact,
      Config: {
        Labels: {
          [imageLabels.purpose]: "workspace-test",
          [imageLabels.mutation]: "stryker",
        },
      },
    }),
    false,
  );
  assert.equal(
    validatedImageId({ ...exact, Architecture: "amd64" }, labels),
    undefined,
  );
  assert.equal(selectRetainedImage([fallback, exact], exactId), exactId);
  assert.equal(selectRetainedImage([exact, fallback]), fallbackId);
  assert.equal(
    selectRetainedImage([
      { ...fallback, Config: { Labels: { [imageLabels.purpose]: "other" } } },
    ]),
    undefined,
  );
});

test("automatic image cleanup leaves a concurrency grace period", () => {
  assert.deepEqual(parsePruneOptions([]), { minAgeMilliseconds: 0 });
  assert.deepEqual(parsePruneOptions(["--min-age=3600"]), {
    minAgeMilliseconds: 3_600_000,
  });
  assert.throws(() => parsePruneOptions(["--min-age=one"]), /Usage:/);
  const image = { Created: "2026-09-08T12:00:00.000Z" };
  const now = Date.parse("2026-09-08T12:30:00.000Z");
  assert.equal(imageIsOldEnough(image, 3_600_000, now), false);
  assert.equal(imageIsOldEnough(image, 1_800_000, now), true);

  const imageId = `sha256:${"e".repeat(64)}`;
  const volume = {
    Name: `monimal-test-turbo-${"e".repeat(64)}`,
    CreatedAt: "2026-09-08T12:00:00.000Z",
    Labels: {
      [turboCacheLabels.dependencyImage]: imageId,
      [turboCacheLabels.purpose]: "turbo-cache",
    },
  };
  assert.equal(isManagedTurboCacheVolume(volume), true);
  assert.equal(volumeIsOldEnough(volume, 3_600_000, now), false);
  assert.equal(volumeIsOldEnough(volume, 1_800_000, now), true);
  assert.equal(
    isManagedTurboCacheVolume({ ...volume, Name: "unrelated-cache" }),
    false,
  );
});

test("runtime arguments mount the checkout read-only behind the offline boundary", () => {
  assert.deepEqual(containerBoundaryArguments(), [
    "--init",
    "--network=none",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges",
  ]);
  assert.deepEqual(checkoutMountArguments("/repo"), [
    "--mount",
    "type=bind,source=/repo,target=/checkout,readonly",
  ]);
  const imageId = "sha256:" + "a".repeat(64);
  assert.deepEqual(turboCacheMountArguments(imageId), [
    "--mount",
    `type=volume,source=monimal-test-turbo-${"a".repeat(64)},target=/workspace/.turbo`,
  ]);
  assert.deepEqual(turboCacheVolumeCreateArguments(imageId), [
    "volume",
    "create",
    "--label",
    `${turboCacheLabels.purpose}=turbo-cache`,
    "--label",
    `${turboCacheLabels.dependencyImage}=${imageId}`,
    `monimal-test-turbo-${"a".repeat(64)}`,
  ]);
  const volume = {
    Name: `monimal-test-turbo-${"a".repeat(64)}`,
    Labels: {
      [turboCacheLabels.dependencyImage]: imageId,
      [turboCacheLabels.purpose]: "turbo-cache",
    },
  };
  assert.equal(validatedTurboCacheVolumeName(volume, imageId), volume.Name);
  assert.equal(
    validatedTurboCacheVolumeName({ ...volume, Labels: {} }, imageId),
    undefined,
  );
  assert.throws(
    () => turboCacheMountArguments("monimal-test:dependencies-arm64"),
    /Invalid Docker image ID/,
  );
  const base = "b".repeat(40);
  const arguments_ = runDockerArguments(imageId, { base });
  const gitMount = gitMetadataMountArguments(root);
  assert.deepEqual(arguments_, [
    "run",
    "--rm",
    "--init",
    "--network=none",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges",
    "--mount",
    `type=bind,source=${root},target=/checkout,readonly`,
    ...gitMount,
    "--mount",
    `type=volume,source=monimal-test-turbo-${"a".repeat(64)},target=/workspace/.turbo`,
    imageId,
    "node",
    "/opt/monimal/stage-test-checkout.mjs",
    "--rebuild=workspace",
    "--",
    "pnpm",
    "run",
    "test:inner",
    "--",
    `--filter=...[${base}]`,
  ]);
  const joined = arguments_.join(" ");
  assert.match(joined, /target=\/checkout,readonly/);
  assert.doesNotMatch(joined, /--env-file|docker\.sock|--network=host/);
  assert.doesNotMatch(
    runDockerArguments(imageId, { scope: "all" }).join(" "),
    /--filter=/,
  );
});

test("mutation arguments use the same mounted dependency boundary", () => {
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
    "--mount",
    `type=bind,source=${root},target=/checkout,readonly`,
    ...gitMetadataMountArguments(root),
    "--mount",
    `type=volume,source=monimal-test-turbo-${"d".repeat(64)},target=/workspace/.turbo`,
    "--env",
    "MAXIMAL_MUTATION_LEDGER=/workspace/packages/maximal-core/reports/mutation/incomplete-runs.log",
    imageId,
    "node",
    "/opt/monimal/stage-test-checkout.mjs",
    "--rebuild=core",
    "--",
    "pnpm",
    "run",
    "mutate:core:inner",
    "--mutate",
    options.mutate,
    "--concurrency",
    "10",
  ]);
  const joined = arguments_.join(" ");
  assert.match(joined, /target=\/checkout,readonly/);
  assert.doesNotMatch(joined, /--env-file|docker\.sock|--network=host/);
});

test("mutation selectors validate affected, explicit, and full source scopes", () => {
  assert.deepEqual(parseMutationOptions([]), {
    all: false,
    concurrency: undefined,
    mutate: undefined,
  });
  const explicit = parseMutationOptions([
    "--",
    "--mutate=src/lib/observability/query.ts:43-65,src/lib/observability/schema.ts",
    "--concurrency=4",
  ]);
  assert.deepEqual(explicit, {
    all: false,
    concurrency: 4,
    mutate:
      "src/lib/observability/query.ts:43-65,src/lib/observability/schema.ts",
  });
  const all = parseMutationOptions(["--all"]);
  assert.equal(resolveMutationTargets(explicit), explicit.mutate);
  assert.equal(resolveMutationTargets(all), "src/**/*.ts");
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
    () => parseMutationOptions(["--all", "--mutate=src/a.ts"]),
    /mutually exclusive/,
  );
  assert.throws(
    () => parseMutationOptions(["--all", "--all"]),
    /Duplicate --all/,
  );
  assert.throws(
    () => parseMutationOptions(["--mutate=src/a.ts", "--mutate=src/b.ts"]),
    /Duplicate --mutate/,
  );
  assert.throws(
    () => parseMutationOptions(["--concurrency=4", "--concurrency=10"]),
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

test("checkout staging copies Git-visible source without host dependencies", () => {
  const checkout = fs.mkdtempSync(path.join(os.tmpdir(), "monimal-checkout-"));
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "monimal-workspace-"),
  );
  const git = (...arguments_) =>
    spawnSync("git", arguments_, { cwd: checkout, encoding: "utf8" });
  try {
    assert.equal(git("init", "--quiet").status, 0);
    assert.equal(git("config", "user.name", "Docker Policy Test").status, 0);
    assert.equal(
      git("config", "user.email", "docker-policy@example.invalid").status,
      0,
    );
    fs.writeFileSync(
      path.join(checkout, ".gitignore"),
      "node_modules\ndist\nreports/mutation\n",
    );
    fs.mkdirSync(path.join(checkout, "packages/core"), { recursive: true });
    fs.writeFileSync(
      path.join(checkout, "packages/core/source.ts"),
      "tracked\n",
    );
    assert.equal(git("add", ".").status, 0);
    assert.equal(
      git("commit", "--quiet", "--no-gpg-sign", "-m", "fixture").status,
      0,
    );
    fs.writeFileSync(
      path.join(checkout, "packages/core/new.ts"),
      "untracked\n",
    );
    fs.mkdirSync(path.join(checkout, "node_modules"));
    fs.writeFileSync(path.join(checkout, "node_modules/host"), "forbidden\n");
    fs.mkdirSync(path.join(workspace, "node_modules"));
    fs.writeFileSync(path.join(workspace, "node_modules/image"), "owned\n");

    assert.equal(stageCheckout({ checkout, workspace }), 3);
    assert.equal(
      fs.realpathSync(path.join(workspace, ".git")),
      fs.realpathSync(path.join(checkout, ".git")),
    );
    assert.equal(
      fs.readFileSync(path.join(workspace, "packages/core/source.ts"), "utf8"),
      "tracked\n",
    );
    assert.equal(
      fs.readFileSync(path.join(workspace, "packages/core/new.ts"), "utf8"),
      "untracked\n",
    );
    assert.equal(
      fs.readFileSync(path.join(workspace, "node_modules/image"), "utf8"),
      "owned\n",
    );
    assert.equal(
      fs.statSync(path.join(workspace, "node_modules/host"), {
        throwIfNoEntry: false,
      }),
      undefined,
    );
    assert.equal(shouldStagePath("packages/core/source.ts"), true);
    assert.equal(shouldStagePath("packages/core/dist/index.js"), false);
    assert.throws(() => validateCheckoutPath("../outside"), /Invalid checkout/);
    assert.deepEqual(
      parseStageOptions(["--rebuild=core", "--", "pnpm", "test"]),
      { command: "pnpm", commandArguments: ["test"], rebuild: "core" },
    );
    assert.deepEqual(stagedCommandArguments("core", "pnpm", ["test"]), [
      "node",
      "/opt/monimal/stage-test-checkout.mjs",
      "--rebuild=core",
      "--",
      "pnpm",
      "test",
    ]);
  } finally {
    fs.rmSync(checkout, { recursive: true, force: true });
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test("checkout staging gives a linked worktree a container-local Git root", () => {
  const repository = fs.mkdtempSync(path.join(os.tmpdir(), "monimal-stage-repository-"));
  const checkout = `${repository}-linked`;
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "monimal-stage-workspace-"));
  const git = (cwd, ...arguments_) =>
    spawnSync("git", arguments_, { cwd, encoding: "utf8" });
  try {
    assert.equal(git(repository, "init", "--quiet").status, 0);
    assert.equal(git(repository, "config", "user.name", "Docker Policy Test").status, 0);
    assert.equal(
      git(repository, "config", "user.email", "docker-policy@example.invalid").status,
      0,
    );
    fs.writeFileSync(path.join(repository, "tracked.txt"), "linked\n");
    assert.equal(git(repository, "add", "tracked.txt").status, 0);
    assert.equal(
      git(repository, "commit", "--quiet", "--no-gpg-sign", "-m", "fixture").status,
      0,
    );
    assert.equal(git(repository, "worktree", "add", "--quiet", checkout).status, 0);

    assert.equal(stageCheckout({ checkout, workspace }), 1);
    assert.equal(
      git(workspace, "rev-parse", "--show-toplevel").stdout.trim(),
      fs.realpathSync(workspace),
    );
    assert.equal(
      git(workspace, "rev-parse", "HEAD").stdout.trim(),
      git(checkout, "rev-parse", "HEAD").stdout.trim(),
    );
  } finally {
    spawnSync("git", ["worktree", "remove", "--force", checkout], {
      cwd: repository,
      encoding: "utf8",
    });
    fs.rmSync(checkout, { recursive: true, force: true });
    fs.rmSync(repository, { recursive: true, force: true });
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test("the Docker workspace runner accepts only one affected Turbo filter", () => {
  const filter = `--filter=...[${"a".repeat(40)}]`;
  assert.deepEqual(parseDockerWorkspaceOptions([]), []);
  assert.deepEqual(parseDockerWorkspaceOptions(["--", filter]), [filter]);
  assert.throws(
    () => parseDockerWorkspaceOptions(["--filter=package"]),
    /Usage: docker-workspace-test/,
  );
  assert.throws(
    () => parseDockerWorkspaceOptions([filter, filter]),
    /Usage: docker-workspace-test/,
  );
});

test("suite and trace selectors are closed and do not forward arguments", () => {
  assert.deepEqual(parseOptions([]), {
    scope: "affected",
    suite: "workspace",
    trace: "off",
  });
  assert.deepEqual(parseOptions(["--"]), {
    scope: "affected",
    suite: "workspace",
    trace: "off",
  });
  assert.deepEqual(parseOptions(["--suite=maximal-core"]), {
    scope: "affected",
    suite: "maximal-core",
    trace: "off",
  });
  assert.deepEqual(parseOptions(["--all"]), {
    scope: "all",
    suite: "workspace",
    trace: "off",
  });
  assert.deepEqual(
    parseOptions(["--", "--trace=all", "--suite=maximal-models"]),
    { scope: "affected", suite: "maximal-models", trace: "all" },
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
  assert.throws(() => parseOptions(["--all", "--all"]), /Duplicate --all/);
  assert.throws(
    () => parseOptions(["--all", "--suite=maximal-core"]),
    /only applies to the workspace/,
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
      ["workspace", "maximal-core", "maximal-models", "policy"].map(
        (suite) => [suite, innerScriptForSuite(suite)],
      ),
    ),
    {
      workspace: "test:inner",
      "maximal-core": "test:maximal-core:inner",
      "maximal-models": "test:maximal-models:inner",
      policy: "test:policy:inner",
    },
  );
  assert.throws(() => innerScriptForSuite("other"), /Invalid test suite/);

  const imageId = "sha256:" + "b".repeat(64);
  const arguments_ = runDockerArguments(imageId, {
    suite: "maximal-core",
    trace: "tests",
  });
  assert.deepEqual(arguments_.slice(-8), [
    imageId,
    "node",
    "/opt/monimal/stage-test-checkout.mjs",
    "--rebuild=core",
    "--",
    "pnpm",
    "run",
    "test:maximal-core:inner",
  ]);
  assert.ok(arguments_.includes("MAXIMAL_TEST_TRACE=1"));
});

test("tool pins and Docker artifacts come from their owner files", () => {
  const pins = readToolPins(root);
  const manifest = JSON.parse(read("package.json"));
  assert.equal(pins.nodeMajor, read(".nvmrc").trim());
  assert.match(pins.nodeVersion, new RegExp(`^${pins.nodeMajor}\\.`));
  assert.equal(pins.bunVersion, read(".bun-version").trim());
  assert.equal(pins.pnpmVersion, manifest.packageManager.slice("pnpm@".length));
  assert.match(pins.bunUrlAmd64, /bun-linux-x64\.zip$/);
  assert.match(pins.bunUrlArm64, /bun-linux-aarch64\.zip$/);
  assert.match(pins.bunSha256Amd64, /^[0-9a-f]{64}$/);
  assert.match(pins.bunSha256Arm64, /^[0-9a-f]{64}$/);
  assert.match(pins.pnpmUrlAmd64, /pnpm-linux-x64\.tar\.gz$/);
  assert.match(pins.pnpmUrlArm64, /pnpm-linux-arm64\.tar\.gz$/);
  assert.match(pins.pnpmSha256Amd64, /^[0-9a-f]{64}$/);
  assert.match(pins.pnpmSha256Arm64, /^[0-9a-f]{64}$/);

  const arguments_ = buildDockerArguments({
    iidFile: "/tmp/image-id",
    pins,
    targetArch: "arm64",
  });
  assert.ok(arguments_.includes(`NODE_MAJOR=${pins.nodeMajor}`));
  assert.ok(arguments_.includes(`NODE_VERSION=${pins.nodeVersion}`));
  assert.ok(arguments_.includes(`BUN_VERSION=${pins.bunVersion}`));
  assert.ok(arguments_.includes(`BUN_URL_AMD64=${pins.bunUrlAmd64}`));
  assert.ok(arguments_.includes(`BUN_URL_ARM64=${pins.bunUrlArm64}`));
  assert.ok(arguments_.includes(`BUN_SHA256_AMD64=${pins.bunSha256Amd64}`));
  assert.ok(arguments_.includes(`BUN_SHA256_ARM64=${pins.bunSha256Arm64}`));
  assert.ok(arguments_.includes(`PNPM_VERSION=${pins.pnpmVersion}`));
  assert.ok(arguments_.includes(`PNPM_URL_AMD64=${pins.pnpmUrlAmd64}`));
  assert.ok(arguments_.includes(`PNPM_URL_ARM64=${pins.pnpmUrlArm64}`));
  assert.doesNotMatch(arguments_.join(" "), /GIT_SHA=/);
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
  assert.match(
    producer,
    /PNPM_SPEC="\$\(node -p "require\('\.\/package\.json'\)\.packageManager"\)"/,
  );
  assert.match(producer, /\[tools\.pnpm\.\\"platforms\.macos-arm64\\"\]/);
  assert.match(
    producer,
    /curl --fail --location --retry 3 --output "\$PNPM_ARCHIVE" "\$PNPM_URL"/,
  );
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
    assert.ok(
      isIgnored(sensitivePath),
      `build context includes ${sensitivePath}`,
    );
  }

  for (const requiredPath of [
    ".npmrc",
    ".github/workflows/ci.yml",
    "packages/maximal-core/tests/fixtures/isolation/maximal-path-probe.test-fixture.ts",
    "packages/maximal-electron/e2e/fixtures/demo-shell/index.html",
  ]) {
    assert.ok(
      fs.existsSync(path.join(root, requiredPath)),
      `missing ${requiredPath}`,
    );
    assert.ok(
      !isIgnored(requiredPath),
      `build context excludes ${requiredPath}`,
    );
  }
});

test("the reusable Docker dependency image includes every workspace manifest", () => {
  const dockerfile = read("Dockerfile");
  const manifests = discoverPackageManifests(root).map(
    (packagePath) => `${packagePath}/package.json`,
  ).sort();

  const install = dockerfile.indexOf(
    "pnpm install --frozen-lockfile --ignore-scripts",
  );
  for (const manifest of manifests) {
    const copy = dockerfile.indexOf(
      `COPY --chown=maximal:maximal ${manifest} ${manifest}`,
    );
    assert.ok(copy >= 0, `${manifest} is missing from the metadata layer`);
    assert.ok(copy < install, `${manifest} must be copied before the install`);
  }
  const copiedManifests = [
    ...dockerfile.matchAll(
      /^COPY --chown=maximal:maximal (packages\/[^ ]+\/package\.json) \1$/gm,
    ),
  ].map((match) => match[1]).sort();
  assert.deepEqual(copiedManifests, manifests);
  assert.ok(install >= 0);
  assert.match(
    dockerfile,
    /COPY --chown=maximal:maximal scripts\/stage-test-checkout\.mjs \/opt\/monimal\/stage-test-checkout\.mjs/,
  );
  assert.doesNotMatch(dockerfile, /COPY --chown=maximal:maximal \. \./);
  assert.doesNotMatch(
    dockerfile,
    /GIT_SHA|turbo run build/,
  );
  const pnpmStoreMount =
    "--mount=type=cache,id=maximal-pnpm-${TARGETARCH},target=/workspace/.pnpm-store,uid=10001,gid=10001,sharing=locked";
  const pnpmCacheMount =
    "--mount=type=cache,id=maximal-pnpm-cache-${TARGETARCH},target=/home/maximal/.cache/pnpm,uid=10001,gid=10001,sharing=locked";
  const pnpmStateMount =
    "--mount=type=cache,id=maximal-pnpm-state-${TARGETARCH},target=/home/maximal/.local/state/pnpm,uid=10001,gid=10001,sharing=locked";
  assert.equal(dockerfile.split(pnpmStoreMount).length - 1, 1);
  assert.equal(dockerfile.split(pnpmCacheMount).length - 1, 1);
  assert.equal(dockerfile.split(pnpmStateMount).length - 1, 1);
  assert.match(
    dockerfile,
    /pnpm install --frozen-lockfile --ignore-scripts --store-dir=\/workspace\/\.pnpm-store/,
  );
});

test("the image owns test homes and stages commands as non-root", () => {
  const dockerfile = read("Dockerfile");
  assert.match(dockerfile, /^FROM node:24-bookworm-slim@sha256:[0-9a-f]{64}$/m);
  assert.match(dockerfile, /test "\$\(node --version\)" = "v\$\{NODE_VERSION\}"/);
  assert.doesNotMatch(dockerfile, /https:\/\/bun\.sh\/install/);
  assert.match(dockerfile, /curl -fsSL "\$\{bun_url\}"/);
  assert.match(dockerfile, /bun_sha.*sha256sum -c -/s);
  assert.match(dockerfile, /USER maximal/);
  assert.match(dockerfile, /MAXIMAL_TEST_CONTAINER=1/);
  assert.match(dockerfile, /TURBO_CACHE_DIR=\/workspace\/\.turbo\/cache/);
  assert.match(dockerfile, /XDG_CONFIG_HOME=\/home\/maximal\/\.config/);
  assert.match(
    dockerfile,
    /git config --system --add safe\.directory \/checkout/,
  );
  assert.match(
    dockerfile,
    /git config --system --add safe\.directory \/workspace/,
  );
  assert.match(dockerfile, /sha256sum -c -/);
  assert.match(dockerfile, /\bprocps\b/);
  assert.match(
    dockerfile,
    /pnpm --filter @stuffbucket\/maximal-core exec stryker --version/,
  );
  assert.match(
    dockerfile,
    /CMD \["node", "\/opt\/monimal\/stage-test-checkout\.mjs", "--rebuild=workspace", "--", "pnpm", "run", "test:inner"\]/,
  );
});

test("mutation prepares the dependency image and pruning stays label-scoped", () => {
  const mutation = read("scripts/docker-mutate.mjs");
  const dockerTest = read("scripts/docker-test.mjs");
  const prune = read("scripts/prune-test-images.mjs");
  assert.match(mutation, /ensureTestImage/);
  assert.match(mutation, /finally \{[\s\S]*pruneTestImages\(\);/);
  assert.match(dockerTest, /finally \{[\s\S]*pruneTestImages\(\);/);
  assert.match(dockerTest, /pruneScript, "--min-age=3600"/);
  assert.match(
    dockerTest,
    /moby\/buildkit@sha256:[0-9a-f]{64}/,
  );
  assert.match(dockerTest, /`image=\$\{dockerBuildkitImage\}`/);
  assert.doesNotMatch(
    mutation,
    /requireReusableImage|sourceDigest|test:docker/,
  );
  assert.match(prune, /"image", "ls", "--all", "--quiet", "--no-trunc"/);
  assert.match(prune, /\.filter\(isManagedTestImage\)/);
  assert.match(prune, /"--builder",\s*dockerBuilderName/);
  assert.match(prune, /"--max-used-space",\s*"8gb"/);
  assert.match(prune, /"--reserved-space",\s*"2gb"/);
  assert.match(prune, /\["image", "rm", image\.Id\]/);
  assert.doesNotMatch(
    prune,
    /system prune|builder prune|container prune|volume prune/,
  );
});
