# Disposable test container

`pnpm test` is the only supported way to run the monorepo test graph. It builds a
filtered copy of the checkout into `Dockerfile`, then starts that immutable image
with a disposable writable overlay. Tests do not run against a bind-mounted
worktree.

This is a host-state safety boundary, not a general sandbox for untrusted code.
The test container:

- receives no bind mount, named volume, Docker socket, env-file, host UID, or
  forwarded host environment;
- runs as the image-owned non-root `maximal` user;
- owns empty `HOME` and XDG directories under `/home/maximal`;
- starts with `--network=none`, `--cap-drop=ALL`,
  `--security-opt=no-new-privileges`, `--init`, and `--rm`;
- discards every test-time write with the container overlay.

The wrapper also creates temporary host-side Claude and Maximal state canaries
outside the build context. After the image build and container run, it verifies
their bytes, device, inode, mode, size, and nanosecond modification time before
removing them.

Mutation testing uses the same image construction, fixed inner-command guard,
isolation flags, and host-state canary. Because its HTML report must survive, the
root `mutate:core` wrapper uses `docker create`, `start --attach`, `cp`, and
`rm --force` instead of `run --rm`. The copy into
`packages/maximal-core/reports/mutation` is the boundary's only intentional host
write. It is staged and validated before replacing the previous report.

A mutation command succeeds only when Stryker exits zero, a valid report is
published, and `incomplete-runs.log` is absent or empty. A non-zero Stryker exit
still publishes a valid diagnostic report before the wrapper fails. A non-empty
ledger also publishes the report and fails explicitly because one or more mutant
test runs ended without Bun's completion marker. Copy or validation failure leaves
the previous host report intact.

Docker may use the network while building the image. That phase installs the
pinned toolchain, verifies pnpm's release archive against `mise.lock`, performs a
frozen workspace install, and prepares build outputs. The runtime test phase has
no network interface beyond loopback.

The image copies every workspace manifest and performs a script-free frozen
install before copying source. Source-only changes therefore reuse the dependency
layer. The architecture-scoped BuildKit mounts hold pnpm's package store, metadata
cache, and state for both install and rebuild; none of that transient download
state is committed to the image. After the source copy, `pnpm rebuild -r` runs
deferred dependency and workspace install scripts against the same mounted store,
workspace verification runs against the complete tree, and Turborepo runs
workspace builds. The Git SHA is added only after the dependency layer, preventing
a new commit from invalidating that install.

BuildKit cache mounts retain the architecture-specific pnpm and Turborepo caches
across local builds, but mount contents are not image-layer content. The build
therefore uses a separate mounted Turbo cache, asks Turbo for the current build
graph after the build, and copies only the cache triplets named by cache-enabled,
executable tasks into the image's ordinary `.turbo/cache`. A missing artifact or
malformed graph fails the build; historical entries accumulated in the mount are
not baked into each image. Build task inputs explicitly exclude nested `dist`,
`.turbo`, and generated `resources/bin` trees, so outputs do not change their own
hashes in the filtered image. Runtime test tasks can replay build prerequisites
from that bounded image-owned cache. CI additionally uses the GitHub Actions
BuildKit backend to preserve image layers across replacement hosted runners; that
backend does not export cache-mount contents. These caches change build
performance only: the final test image and its mountless runtime invocation remain
deterministic.

The root `.dockerignore` is part of the boundary. It removes Git metadata, local
Claude state, dependency and build output (including generated `resources/bin`
sidecars), environment files, credential-shaped state files, and temporary oMLX
material before Docker receives the context. The Linux sidecar is rebuilt inside
the image rather than copied from the host and overwritten. The context
intentionally retains `.npmrc` and vendored `packages/*/.github` fixtures needed
by workspace verification.

Each loaded image is tagged
`monimal-test:<12-character-sha>-clean|dirty`. The 40-character Git SHA remains the
compiled product revision; worktree dirtiness is separate metadata and includes
tracked and untracked files. Containers run by immutable image ID rather than by
the mutable convenience tag. Images also carry
`io.stuffbucket.monimal.purpose=workspace-test`, the OCI title and revision, and a
dirty-state label. List and deliberately remove unused images from this boundary
without matching unrelated projects with:

```sh
docker image ls --filter label=io.stuffbucket.monimal.purpose=workspace-test
docker image prune -a --filter label=io.stuffbucket.monimal.purpose=workspace-test
```

Docker will retain an image referenced by a running or stopped container; inspect
and remove that container separately only when its lifecycle is understood. Image
labels do not label BuildKit records. `docker builder prune` is a separate,
builder-wide operation and can discard caches belonging to other projects, so the
wrapper never invokes it automatically.

## Commands

```sh
pnpm test
pnpm test -- --suite=maximal-core
pnpm test -- --suite=maximal-dsh-host
pnpm test -- --suite=policy
pnpm test -- --suite=maximal-core --trace=tests
pnpm test -- --trace=all
```

`workspace` is the default suite. `workspace`, `maximal-core`,
`maximal-dsh-host`, and `policy` are the only suite values. The wrapper maps each
to a fixed root-owned inner script whose first command checks the container
marker; it never forwards a package name, command, or arbitrary argument into
the image. Unknown options, unknown values, duplicate selectors, positional
arguments, and the split `--suite value` form fail closed.

The fixed mapping is:

| Suite              | Root inner script             |
| ------------------ | ----------------------------- |
| `workspace`        | `test:inner`                  |
| `maximal-core`     | `test:maximal-core:inner`     |
| `maximal-dsh-host` | `test:maximal-dsh-host:inner` |
| `policy`           | `test:policy:inner`           |

`pnpm run check:core` first runs Maximal Core's `check:deep:host` against the real
Git checkout, including its bindings/index checks, and then selects the
`maximal-core` Docker suite. The root `check` gate runs workspace build,
typecheck, and lint, runs the same Core host-only deep checks, then invokes the
`workspace` Docker graph exactly once. It does not compose through `check:core`,
which would redundantly run both focused and workspace Docker suites.

`off`, `tests`, and `all` are the only trace values. Suite and trace selectors may
appear in either order. The wrapper does not forward an ambient
`MAXIMAL_TEST_TRACE`; the explicit option is the sole runtime input.

Native `bun test`, including a root-CWD invocation, fails closed and points back
to `pnpm test`. Package preloads enforce that normal path. Product-level path
guards separately reject a `bun --config /dev/null test ...` bypass before
Maximal's default data home or Claude Code's default settings path can resolve.
Those checks are defense in depth; the mountless, offline Docker invocation is
the hard host boundary.

The pre-existing Maximal Core toolchain container is different. It bind-mounts a
source checkout and keeps dependencies in a named volume for interactive
development. It is not the normal monorepo test boundary and must not be used as
proof that host state is inaccessible.
