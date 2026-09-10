# Tiered test workflow

This document owns the normal test boundary for the monorepo. Package documents
MUST link here instead of defining another workspace test workflow.

The workflow has three tiers:

| Tier                   | Command                                       | Purpose                                                                                  |
| ---------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Affected native        | `pnpm test`                                   | Fast default for a change in any checkout, including a linked worktree.                  |
| Full or focused native | `pnpm test -- --all` or `pnpm test -- --core` | Complete workspace admission or a focused Core rerun in the same isolated host boundary. |
| Pinned Docker          | `pnpm run test:docker`                        | Linux rerun with container-owned dependencies and toolchains from any checkout.          |

Raw package test commands are inner scripts, not supported host entry points. In
particular, do not run `bun test`, a package-local `test` script, or a test file
directly to bypass the root wrapper.

## Native tiers

`pnpm test` creates a fresh mode-0700 temporary root and then runs the root policy
tests followed by the Turbo test graph. It sets `MAXIMAL_TEST_HOST=1` and places
all user-state paths below that root:

- `HOME`, `USERPROFILE`, `APPDATA`, and `LOCALAPPDATA`;
- every XDG cache, config, data, and state directory;
- `COPILOT_API_HOME` and `CLAUDE_CONFIG_DIR`.

The wrapper removes inherited API credentials, GitHub credentials, and proxy
variables before it starts the graph. It also removes any inherited
`MAXIMAL_TEST_CONTAINER` marker. Package preloads admit native Bun tests only when
the host marker is present, the test root is absolute, and every required path
resolves inside that root. The wrapper removes the root after the run.

The default affected tier requires `origin/main`. It resolves the merge base of
`HEAD` and `origin/main`, then passes Turbo's `...[<merge-base>]` filter. The root
policy tests always run. A missing remote ref or merge base fails closed; use
`pnpm test -- --all` only when a full graph is intended, not to hide an invalid
checkout.

The native options are closed:

```sh
pnpm test
pnpm test -- --all
pnpm test -- --core
pnpm test -- --trace=tests
pnpm test -- --core --trace=all
```

`off`, `tests`, and `all` are the only trace values. `--all` and `--core` are
mutually exclusive. Unknown, duplicate, positional, or split-form options fail.
The wrapper does not forward arbitrary package names, runner flags, commands, or
test paths.

CI MUST set `MONIMAL_PERF_MARKERS=1` on the native wrapper. When enabled, the
wrapper MUST emit one `perf-marker` line for affected-base resolution, root
policy tests, workspace tests, cleanup, and the total run where each phase
applies. The wrapper MUST NOT forward this control variable to package tests.

`pnpm run test:all` and `pnpm run test:core` are fixed script aliases for the two
explicit scopes. CI uses `pnpm run test:all`; the separate Docker policy workflow
builds the pinned dependency image weekly and when its declared inputs change.
GitHub-hosted runners use the same isolated native wrapper rather than an ambient
marker.

The aggregate gates remain native:

- `pnpm run check:core` runs Core's complete non-test `check:deep:host` gate and
  then the focused native Core suite.
- `pnpm run check` runs workspace build, typecheck, and lint, Core's host-only
  deep checks, and the default affected native test tier.

Neither aggregate proves that the workspace also passes with the pinned Linux
dependencies and toolchains.

The Docker tier mounts the checkout read-only and stages its Git-visible files
into each disposable container. The writable workspace, test home, and XDG
state disappear with that container. A dependency-image-scoped Docker volume is
mounted only at `/workspace/.turbo`, allowing Turbo to restore its declared
Linux outputs on later runs without sharing `node_modules`, source files, or
generated output directories with the host. Docker mounts linked-worktree Git
metadata separately and read-only; a standalone clone is not required.
The existing Docker cleanup retains the current image's cache volume and removes
only strictly labeled stale cache volumes after the same concurrency grace
period used for dependency images.

## Test graph parallelism

The native and Docker workspace graphs MUST use `--concurrency=1` while package
tasks share one isolated home and suites can bind machine-wide ports. A package
MUST receive an independent test root and pass repeated socket-free and
home-state-free runs before admission to a parallel lane.

The first experimental lane SHOULD be limited to:

- `@stuffbucket/maximal-observability-contract`;
- `@stuffbucket/maximal-provider-contract`;
- `@stuffbucket/omlx`;
- `@stuffbucket/anthropic-provider`;
- `@stuffbucket/maximal-observability`.

A parallel lane MUST NOT include Core, DSH host, or maximal until their port and
user-state boundaries no longer overlap another package task.

## Docker dependency boundary

`pnpm run test:docker` builds or reuses a dependency image, mounts the primary
checkout read-only at `/checkout`, and stages the current Git-visible files into
the container-owned `/workspace`. It is an explicit Linux rerun, not the
edit-test inner loop. CI runs only its policy suite on the weekly and
Docker-input-triggered workflow.

Docker tests and Core mutations refuse linked worktrees. Run the native tiers in
the linked worktree, integrate the change into the primary checkout, and run the
Docker command there. The primary-checkout rule keeps Git discovery and source
staging on one supported layout.

The runtime container:

- receives one read-only checkout bind mount and no named volume, Docker socket,
  env-file, host UID, or forwarded host environment;
- copies tracked and non-ignored untracked files into writable container storage;
- preserves the image-owned root and package `node_modules` trees instead of
  reading host dependencies;
- runs as the image-owned non-root `maximal` user with `HOME` and XDG directories
  under `/home/maximal`;
- starts with `--network=none`, `--cap-drop=ALL`,
  `--security-opt=no-new-privileges`, `--init`, and `--rm`;
- discards staged source and every test-time write with the container overlay.

This isolates dependencies and toolchains from the host. It is not a sandbox for
untrusted source: the container can read the mounted checkout, and Docker may use
the network while building the dependency image. The runtime test phase has no
network interface beyond loopback.

### Docker suites and tracing

```sh
pnpm run test:docker
pnpm run test:docker -- --all
pnpm run test:docker -- --suite=maximal-core
pnpm run test:docker -- --suite=maximal-dsh-host
pnpm run test:docker -- --suite=policy
pnpm run test:docker -- --suite=maximal-core --trace=tests
pnpm run test:docker -- --trace=all
```

`workspace` is the default suite. It uses the same merge-base Turbo filter as
`pnpm test`; `--all` deliberately selects its complete graph and does not combine
with a focused suite. Focused suites run their complete fixed scope. The wrapper
maps each accepted suite to one root-owned inner script:

| Suite              | Root inner script             |
| ------------------ | ----------------------------- |
| `workspace`        | `test:inner`                  |
| `maximal-core`     | `test:maximal-core:inner`     |
| `maximal-dsh-host` | `test:maximal-dsh-host:inner` |
| `policy`           | `test:policy:inner`           |

Each inner script checks the container marker before running. The Docker wrapper
accepts the same three trace values as the native wrapper and does not forward an
ambient `MAXIMAL_TEST_TRACE`. Unknown values, duplicate selectors, positional
arguments, and split selector forms fail closed.

### Image construction and reuse

The image contains the pinned Node, Bun, and pnpm toolchains plus a script-free
frozen workspace install. It validates the exact Node version and installs the
target architecture's Bun and pnpm artifacts from the URLs and checksums in
`mise.lock`. Its source inputs are the lockfile, workspace manifests, registry
and pnpm policy files, and the staging helper. Ordinary source and test files
never enter the image.

Every Docker test or mutation asks BuildKit to prepare the stable architecture tag:

```text
monimal-test:dependencies-amd64
monimal-test:dependencies-arm64
```

BuildKit reuses the install layer when the dependency inputs are unchanged and
rebuilds it when they change. Architecture-scoped cache mounts hold pnpm's store
and state during image construction; their contents are not image-layer content.
All builds use the dedicated `monimal-test` Buildx builder with a digest-pinned
BuildKit image. Cleanup caps that builder's cache at 8 GB while reserving 2 GB,
without pruning the shared default builder or another project's cache.
The wrapper validates the resulting immutable image ID against the architecture,
workspace-test purpose, and mutation-capable labels before starting a container.

At startup, the staging helper copies the checkout into `/workspace`, runs the
applicable deferred rebuilds and build graph, verifies the installed workspace,
and starts the fixed inner command. A subsequent Turbo test graph replays those
build tasks from the container's local cache. The dependency image does not
contain source-specific build output or a Turbo cache.

After each Docker test or mutation, the wrapper removes unreferenced Monimal
test images older than one hour. The grace period prevents one concurrent run
from deleting an image another run has just built but not started. The same
label-scoped cleanup is available immediately and explicitly:

```sh
pnpm run docker:prune:test-images
```

It keeps the image for the current architecture when available, otherwise the
newest compatible Monimal test image. It removes other labeled test images only
when no container references them. It never invokes `docker builder prune`, which
would affect other projects.

The root `.dockerignore` limits the dependency-image build context. It removes Git
metadata, local Claude state, dependencies, build output, generated sidecars,
environment files, credential-shaped state files, and temporary oMLX material.
Runtime staging independently uses Git's tracked and non-ignored untracked file
list, and excludes host dependencies, caches, build output, generated sidecars,
and mutation reports.

## Mutation testing

Core mutation testing is manual during test development. It does not run from CI
or either aggregate check. The wrapper prepares or reuses the dependency image
directly; no preceding Docker test is required.

```sh
pnpm run mutate:core
pnpm run mutate:core -- --mutate=src/routes/messages/utils.ts:40-57 --concurrency=4
pnpm run mutate:core -- --all
```

The default compares the current checkout with the `origin/main` merge base. It
mutates destination-side line ranges in changed Core TypeScript source, including
committed, staged, unstaged, edited-renamed, and eligible untracked files. Deleted
files, rename-only changes, and pure-deletion hunks add no targets. If no mutable
lines changed, the command fails closed instead of expanding to all source.

`--mutate` completely overrides the derived source targets. `--all` is mutually
exclusive with that override and deliberately selects the expensive
`src/**/*.ts` sweep. These options narrow only the code Stryker mutates. Every
selected mutant still runs Core's complete mutation-safe test command because the
command runner has no safe test-to-mutant coverage map.

The mutation wrapper uses the same read-only checkout mount and runtime isolation
flags. It uses `docker create`, `start --attach`, `cp`, and `rm --force` because
the report must survive the disposable container. The report copy into
`packages/maximal-core/reports/mutation` is the only intentional host write. It
is staged and validated before it replaces a previous report.

A mutation command succeeds only when Stryker exits zero, a valid HTML report is
published, and `incomplete-runs.log` is absent or empty. A non-zero Stryker exit
still publishes a valid diagnostic report before the wrapper fails. A non-empty
ledger also publishes the report and fails because one or more mutant runs ended
without Bun's completion marker. Copy or validation failure leaves the previous
host report intact.

## Boundary exclusions

The normal Turbo test graph consists of workspace package `test` tasks and their
build prerequisites. It does not replace:

- Core's real-socket end-to-end harnesses;
- Electron end-to-end, packaged smoke, visual, or platform-specific checks;
- mutation testing;
- native Windows or macOS coverage.

Use the owning package document for those gates. The normal workspace boundary
remains the root wrapper described here.
