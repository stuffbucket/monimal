# AGENTS.md

`maximal-core` is a **headless** local proxy that exposes GitHub Copilot as
OpenAI- and Anthropic-compatible HTTP endpoints. Bun + Hono + TypeScript.
There is **no UI, no `shell/`, no frontend build** in this repo — a separate
tier drives the engine over the loopback `/control` JSON-RPC 2.0 surface.

## Every turn

- From the monorepo root, run **`pnpm --filter @maximal/maximal-core run
check:fast` after each edit** — oxlint + `tsc` + ESLint. This is the native,
  non-product inner loop.
- Before you call the task done, run **`pnpm run check:core` from the monorepo
  root**. It runs Core's complete non-test gate (`check:deep:host`) and then the
  focused Core suite through the isolated native wrapper. It does **not** cover
  the pinned-dependency Docker rerun or `ci.yml`'s native Windows job. If you
  touched `scripts/ops/`, also run
  `pnpm --filter @maximal/maximal-core run check:ops`.
- To rerun only Core's tests, use **`pnpm test -- --core` from the monorepo
  root**. To rerun Core with pinned container dependencies, use **`pnpm run
test:docker -- --suite=maximal-core` from the primary checkout**. The
  [monorepo test workflow](https://github.com/stuffbucket/monimal/blob/main/docs/testing-in-docker.md)
  owns the scopes, isolation, and linked-worktree rule.
- **Never run raw host `bun test` or package-local `bun run check:deep` in this
  monorepo.** Package tests are inner commands admitted only by the isolated root
  wrapper or the Docker boundary.
- **`bun run e2e` if you changed the control plane, the ready-line, or
  shutdown.** Spawns the engine from source and drives the real socket —
  outside `bun test` because it costs seconds and a port. Every bug it has
  caught was invisible to the unit suite. `MAXIMAL_E2E_BINARY=<path> bun run e2e`
  re-runs the same seams against a compiled binary — core builds none, but
  `stuffbucket/maximal` compiles this repo's `src/main.ts` and that is what
  ships.
- Never report success on a command you did not run. If a check fails, say so
  and show the output.

## Writing code

- Import through the `~/` alias for `src/` (`~/lib/errors/error`), never a deep
  relative path.
- Strict TS: no `any`, no unused locals or parameters.
- `verbatimModuleSyntax` + `erasableSyntaxOnly` are on — type-only imports must
  be `import type`, and enums, namespaces, and parameter properties will not
  compile.
- ESM only, no CommonJS. `camelCase` values, `PascalCase` types.
- Route handlers catch and call `forwardError(c, error)`; throw `HTTPError`
  from `~/lib/errors/error`.
- Every API flow supports streaming (SSE via `streamSSE`) and non-streaming,
  switching on `payload.stream`. Implement both.

## Rules that cost a turn when broken

Each rule states the prohibition; the linked doc is its only elaboration.

- **Never `git stash pop` in a shared working tree.** It merges another
  in-flight agent's stash into yours. Isolate first —
  [`docs/architecture.md`](docs/architecture.md) → _Parallel-agent convention_.
- **Do not `mock.module` a shared module — inject instead.** The stub reaches
  every file evaluated _after_ the installing one (`bun test` interleaves
  evaluation and execution, so the leak is forward-only). An `afterAll` restore
  does run before the next file evaluates — but only works if it hands back a
  copy captured _before_ the install: `mock.module` mutates the live namespace in
  place, so `() => realModule` re-installs the stub. Capture
  `const real = { ...(await import("…")) }`. That missing spread was the whole of
  #27. Prefer a DI seam (`__setServeForTests`, `__setBootSecretsForTests`);
  `mockModuleLeakGuard` catches only some shapes —
  [`docs/dev/testing-strategy.md`](docs/dev/testing-strategy.md) §5.1.
- **Reset module-level state in BOTH `beforeEach` and `afterEach`.** A singleton
  reset only on the way in leaks to the next file; only on the way out inherits
  from the previous one. Both bugs shipped here — §5.6.
- **A PR title must be a single valid Conventional Commit.** Squash-merge uses
  it as the commit subject, so the title is the durable history entry.
  [`docs/architecture.md`](docs/architecture.md) → _PR conventions_.
- **`main` requires a PR, two green checks, and an up-to-date branch.** `test`
  and `windows` (`ci.yml`) are _required_
  status checks — a red one blocks the merge button, and so does a branch that
  has fallen behind `main` (`gh pr update-branch`; nothing rebases for you
  here). Direct pushes to `main` are rejected, and `main` cannot be deleted or
  force-pushed by anyone. There is **no exemption and no bypass actor**.
  [`docs/admin/branch-rulesets.md`](docs/admin/branch-rulesets.md).

## Read before you touch

| Area                                                                               | Read first                                                                                                                              |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Routing, middleware, model dispatch, config, token store, control API, diagnostics | [`docs/architecture.md`](docs/architecture.md)                                                                                          |
| Tests, especially mocks or mutation testing                                        | [`docs/architecture.md`](docs/architecture.md) → _Testing gotchas_, then [`docs/dev/testing-strategy.md`](docs/dev/testing-strategy.md) |
| Running scripts or setting up the dev environment                                  | [`docs/commands.md`](docs/commands.md)                                                                                                  |
| Running the checks on the pinned toolchain, off your own PATH                      | [`docs/dev/container-toolchain.md`](docs/dev/container-toolchain.md)                                                                    |
| Reproducing a Windows-only failure locally, instead of pushing and waiting         | [`docs/dev/windows-vm-qemu.md`](docs/dev/windows-vm-qemu.md)                                                                            |
| Opening a PR                                                                       | [`docs/architecture.md`](docs/architecture.md) → _PR conventions_                                                                       |
| Branch protection, required checks, or anything in repo settings                   | [`docs/admin/branch-rulesets.md`](docs/admin/branch-rulesets.md)                                                                        |
| Spawning parallel agents or using worktrees                                        | [`docs/architecture.md`](docs/architecture.md) → _Parallel-agent convention_                                                            |
| Changing the pinned Bun version                                                    | [`docs/bun-version-policy.md`](docs/bun-version-policy.md)                                                                              |
| The Claude Code or Opencode plugin                                                 | [`docs/plugins.md`](docs/plugins.md)                                                                                                    |
| Dispatching or reviewing codegen feedback loops                                    | [`docs/codegen-feedback-loops-practices.md`](docs/codegen-feedback-loops-practices.md)                                                  |

Also available, unlinked above: `docs/decisions/` (ADRs), `docs/spec/`
(feature specs), `docs/dev/`, `docs/admin/`, `docs/guide/`, and
`CONTRIBUTORS.md` (domain experts to loop in per area). Search `docs/` before
you ask or infer.
