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

Docker may use the network while building the image. That phase installs the
pinned toolchain, verifies pnpm's release archive against `mise.lock`, performs a
frozen workspace install, and prepares build outputs. The runtime test phase has
no network interface beyond loopback.

The root `.dockerignore` is part of the boundary. It removes Git metadata, local
Claude state, dependency and build output, environment files, credential-shaped
state files, and temporary oMLX material before Docker receives the context. It
intentionally retains `.npmrc` and vendored `packages/*/.github` fixtures needed
by workspace verification.

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
