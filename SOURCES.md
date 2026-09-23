# Sources

Copied packages are edited here; synchronization with their source repositories
has ended.

## Copied packages

| Package | Source | Commit |
| --- | --- | --- |
| `packages/maximal` | `stuffbucket/maximal` | `b831d87` |
| `packages/maximal-core` | `stuffbucket/maximal-core` | `3e2b10c` |
| `packages/maximal-electron` | `stuffbucket/maximal-electron` | `c31f238` |

## Monorepo-native packages

| Package | Purpose |
| --- | --- |
| `packages/local-model-registry` | Local-model registration and provisioning. |
| `packages/maximal-assets` | Brand assets and visual configuration. |
| `packages/maximal-configurators` | First-party client configurators. |
| `packages/maximal-context-window` | Context-window derivation and UI. |
| `packages/maximal-data-visualization` | Visualization primitives and styles. |
| `packages/maximal-harness` | Local agent runtime, workers, and renderer. |
| `packages/maximal-model-contract` | Runtime-neutral model gateway contract. |
| `packages/maximal-models` | Model runtime lifecycle and DSH dispatch. |
| `packages/maximal-observability-contract` | Traffic schemas and observer interfaces. |
| `packages/maximal-observability` | Traffic explorer UI. |
| `packages/model-qwen3-0.6b-q8-gguf` | Qwen3 artifact metadata and provisioning. |
| `packages/model-runtimes/anthropic` | Anthropic Messages adapter. |
| `packages/model-runtimes/omlx` | oMLX HTTP adapter. |

## Rules

| Requirement | Owner or enforcement |
| --- | --- |
| Preserve `packages/*/.github`. | Package workflow tests. |
| Preserve `packages/maximal/.macos-builder/` as a vendored fixture; the root `.macos-builder/` is the producer. | `RELEASING.md`. |
| Use the root lockfile only; package scripts MUST use pnpm. | Workspace manifests and pnpm. |
| Root rules override package instructions; package files MUST NOT link to root-only documentation. | `AGENTS.md`. |
| Preserve package `AGENTS.md` files read by documentation checks. | `docs-reference-parity.test.ts`, `verify-docs.mjs`. |
| pnpm settings MUST live in `pnpm-workspace.yaml`; `.npmrc` owns only the registry. | `verify-workspace.mjs`. |
| `node-linker=hoisted` MUST NOT be used; `publicHoistPattern` owns required hoisting. | `pnpm-workspace.yaml`, `verify-workspace.mjs`. |
| Generated `packages/maximal-core/dist` MUST NOT be committed. | Package build and ignore rules. |
| Tool and host CLI versions MUST be pinned; package dependency majors MUST not diverge without a recorded exception. | `mise.lock`, lockfile, `verify-workspace.mjs`. |
| `verify:workflow-health` MUST NOT run in monorepo CI. | `.github/workflows/ci.yml`. |
| Non-resolving installs MUST use `--frozen-lockfile`. | CI workflows. |
| `.pnpmfile.cjs` and its `afterAllResolved` hook MUST remain; edits require a re-resolved lockfile. | pnpm checksum and lockfile policy tests. |
| `verifyDepsBeforeRun: install` MUST remain enabled. | `pnpm-workspace.yaml`, policy tests. |
| `strip-lockfile-hosts.mjs` MUST run before install and MUST NOT be a lifecycle hook. | CI workflow ordering. |
| Lockfile entries MUST retain the registry's served SHA-1 and MUST NOT record tarball shard hosts. | [Lockfile integrity](#lockfile-integrity). |
| Changes to `pnpm-workspace.yaml` MUST be followed by `node scripts/verify-workspace.mjs`. | `verify-workspace.mjs`. |
| `.nvmrc` owns Node; `package.json#packageManager` owns pnpm; `mise.lock` owns tool artifacts. | Workspace verifier and CI setup. |
| Docker dependency images MUST verify tool versions, URLs, and checksums from `mise.lock`. | `Dockerfile`, Docker policy tests. |
| Docker dependency builds MUST use the dedicated `monimal-test` builder; cleanup MUST remain builder-scoped. | Docker scripts and policy tests. |
| Network literals MUST be scanned in executable, test, and machine configuration files; the baseline is down-only. | `check-network-literals.mjs`, `network-literals-baseline.json`. |

## Lockfile integrity

- The registry in `.npmrc` is the supply-chain control.
- Lockfile hashes detect transit corruption; the registry serves SHA-1.
- Tarball shard hosts MUST NOT be serialized because pnpm validates them against
  rotating registry metadata before lifecycle scripts run.
- `.pnpmfile.cjs` removes shard hosts before serialization.
- `strip-lockfile-hosts.mjs` repairs older lockfiles before install.
- `verify-workspace.mjs` and CI verify the committed result.

## Deviations

| Scope | Deviation from copied repositories |
| --- | --- |
| Copied packages | `CLAUDE.md` includes `AGENTS.md`; root instructions take precedence. |
| Workspace | `@stuffbucket/eslint-config` owns the shared ESLint configuration and enforced rule sets. |
| Workspace | `architecture-analysis.json` owns package coverage, layer rules, and non-Core architecture baselines. |
| `maximal-configurators` | Owns first-party Cordis registration through Core's capability-scoped configurator host. |
| `maximal` / `maximal-core` | Connector payloads remain opaque in Core and are validated by host-installed Standard Schema plugins. |
| `maximal-core/downstream` | Declares itself as an independently installed compatibility fixture. |
| Model packages | Core consumes the side-effect-free model contract; orchestration and concrete runtime adapters remain separate packages. |
| Observability packages | The contract is runtime-neutral; renderer surfaces depend on it, not the reverse. |
| `model-runtimes/omlx` | Ships as a profile-installed Cordis/DSH adapter, not as compiled Core code. |
| `maximal` / `maximal/client` | Core dependencies are workspace links; the client sidecar builds the workspace composition. |
| `maximal/client` | Development Electron profiles are checkout-isolated and shutdown waits for the Core child. |
| `maximal/client` | Direct lint and typecheck commands re-enter their Turbo tasks through `run-workspace-task.mjs`. |
| `maximal-electron` | Terminal copies use a main-owned revisioned pane document and geometry controller; window transfers stage before atomic readiness-gated commit or rollback. |
| Test workflow | Native tests enter through the root isolation wrapper; Docker stages Git-visible source with container-owned dependencies. |

## Excluded from copied packages

`node_modules`, build output, reports, worktrees, package lockfiles, and recorded
demo media are excluded. Demo JSON remains because documentation tests read it.
