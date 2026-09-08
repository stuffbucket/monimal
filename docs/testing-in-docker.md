# Tiered test workflow

This document owns the normal test boundary for the monorepo. Package documents
MUST link here instead of defining another workspace test workflow.

The workflow has three tiers:

| Tier                   | Command                                       | Purpose                                                                                  |
| ---------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Affected native        | `pnpm test`                                   | Fast default for a change in any checkout, including a linked worktree.                  |
| Full or focused native | `pnpm test -- --all` or `pnpm test -- --core` | Complete workspace admission or a focused Core rerun in the same isolated host boundary. |
| Mountless Docker       | `pnpm run test:docker`                        | Final host-state boundary from the primary checkout.                                     |

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

`pnpm run test:all` and `pnpm run test:core` are fixed script aliases for the two
explicit scopes. CI uses `pnpm run test:all`; ordinary CI does not build the
Docker image. GitHub-hosted runners use the same isolated native wrapper rather
than an ambient marker.

The aggregate gates remain native:

- `pnpm run check:core` runs Core's complete non-test `check:deep:host` gate and
  then the focused native Core suite.
- `pnpm run check` runs workspace build, typecheck, and lint, Core's host-only
  deep checks, and the default affected native test tier.

Neither aggregate is proof of the mountless Docker boundary.

## Docker final gate

`pnpm run test:docker` builds or reuses an immutable image from the exact checkout
state, then starts it without a source bind mount. It is an explicit final gate,
not the edit-test inner loop and not an ordinary CI job.

Docker tests and Core mutations refuse linked worktrees. Run the native tiers in
the linked worktree, integrate the change into the primary checkout, and run the
Docker gate there. This prevents a linked worktree's host-absolute `.git` pointer
from entering the filtered build context.

The runtime container:

- receives no bind mount, named volume, Docker socket, env-file, host UID, or
  forwarded host environment;
- runs as the image-owned non-root `maximal` user;
- owns empty `HOME` and XDG directories under `/home/maximal`;
- starts with `--network=none`, `--cap-drop=ALL`,
  `--security-opt=no-new-privileges`, `--init`, and `--rm`;
- discards every test-time write with the container overlay.

This is a host-state safety boundary, not a sandbox for untrusted code. Docker
may use the network while building the image. The runtime test phase has no
network interface beyond loopback.

The wrapper creates temporary host-side Claude and Maximal canaries outside the
build context. After the container run it verifies their bytes, device, inode,
mode, size, and nanosecond modification time before removing them.

### Docker suites and tracing

```sh
pnpm run test:docker
pnpm run test:docker -- --suite=maximal-core
pnpm run test:docker -- --suite=maximal-dsh-host
pnpm run test:docker -- --suite=policy
pnpm run test:docker -- --suite=maximal-core --trace=tests
pnpm run test:docker -- --trace=all
```

`workspace` is the default suite. The wrapper maps each accepted suite to one
fixed root-owned inner script:

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

The image copies workspace manifests and performs a script-free frozen install
before it copies source. Source-only changes can therefore reuse the dependency
layer. Architecture-scoped BuildKit mounts hold pnpm's store and Turborepo cache;
mount contents are not image-layer content.

After the source copy, the build:

1. runs deferred dependency and workspace install scripts with `pnpm rebuild`;
2. verifies the installed workspace and mutation runner;
3. builds the workspace;
4. copies only the Turbo cache artifacts produced for that exact build graph into
   the ordinary image filesystem.

The Git SHA enters after the dependency layer. Build inputs exclude nested
`dist`, `.turbo`, and generated `resources/bin` trees so outputs do not change
their own hashes.

A reusable image must match all of these values:

- the complete current Git SHA;
- clean or dirty state;
- a SHA-256 digest of `HEAD`, the binary tracked diff, and every untracked file;
- Docker server architecture;
- the workspace-test purpose and mutation-capable labels.

The convenience tag is
`monimal-test:<12-character-sha>-clean|dirty`, but containers run by immutable
image ID. A matching labeled image is reused; a tag alone is insufficient.

Use the repository-owned cleanup command rather than a builder-wide prune:

```sh
pnpm run docker:prune:test-images
```

It keeps the exact current image when available, otherwise the newest compatible
Monimal test image. It removes other labeled test images only when no container
references them. It never invokes `docker builder prune`, which would affect
other projects.

The root `.dockerignore` is part of the boundary. It removes Git metadata, local
Claude state, dependencies, build output, generated sidecars, environment files,
credential-shaped state files, and temporary oMLX material before Docker receives
the context. The context retains `.npmrc` and vendored package workflow fixtures
required by workspace verification. The Linux sidecar is rebuilt in the image.

## Mutation testing

Core mutation testing reuses the exact mutation-capable image admitted by the
Docker gate. It never builds an image implicitly:

```sh
pnpm run test:docker
pnpm run mutate:core
pnpm run mutate:core -- --mutate=src/routes/messages/utils.ts --concurrency=4
```

The image must still match the current source digest and architecture. If the
checkout changes after `test:docker`, run that gate again before mutation.

The mutation wrapper uses the same isolation flags and host-state canary. It uses
`docker create`, `start --attach`, `cp`, and `rm --force` because the report must
survive the disposable container. The report copy into
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
