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
| `packages/maximal-browser` | Agent-shareable browser sessions, native Electron views, and browser-tab renderer UI. |
| `packages/maximal-terminal` | Electron-free terminal hosts, tmux control and projection, launch connectors, and the terminal renderer. |
| `packages/maximal-settings` | Typed layered settings, process-owned JSON stores, plugin-schema validation, and the settings migration ratchet. |
| `packages/local-model-registry` | Local-model registration and provisioning. |
| `packages/maximal-assets` | Brand assets and visual configuration. |
| `packages/maximal-configurators` | First-party client configurators. |
| `packages/maximal-context-window` | Context-window derivation and UI. |
| `packages/maximal-recording` | Optional video capture engine and developer recording tools; desktop owns consent and output selection. |
| `packages/maximal-data-visualization` | Visualization primitives and styles. |
| `packages/maximal-harness` | Local agent orchestration and renderer. |
| `packages/maximal-llama-cpp` | Standalone Electron-hosted llama.cpp provider, worker, and packaging policy. |
| `packages/maximal-search` | Search connector contract, first-party providers, and provider settings manifest. |
| `packages/maximal-logging` | Persistent structured runtime logging and log discovery. |
| `packages/maximal-model-contract` | Runtime-neutral model gateway contract. |
| `packages/maximal-core-contract` | Core's settings wire types and control-plane contract; Core republishes them. |
| `packages/maximal-models` | Model runtime lifecycle and DSH dispatch. |
| `packages/maximal-observability-contract` | Traffic schemas and observer interfaces. |
| `packages/maximal-observability` | Traffic explorer UI. |
| `packages/maximal-ollama` | Node-native Ollama runtime management and renderer-safe status contract. |
| `packages/maximal-client` (`@maximal/maximal-client`) | Product renderer, UI controls, and shared desktop contracts. |
| `packages/project-catalog` (`@maximal/project-catalog`) | Local project discovery, Git interrogation, catalog contracts, and ranking. |
| `packages/model-qwen3-0.6b-q8-gguf` | Qwen3 artifact metadata and provisioning. |
| `packages/model-runtimes/anthropic` | Anthropic Messages adapter. |
| `packages/model-runtimes/omlx` | oMLX HTTP adapter. |

## Asset provenance

| Assets | Source | Commit | License |
| --- | --- | --- | --- |
| Claude, Claude Code, GitHub Copilot, and Codex terminal icons | `lobehub/lobe-icons` | `329f378cbd1a88f45b60cd096b9111ce16f3ea39` | MIT |
| Maximal terminal icon | `apps/desktop/build/icon.icns` | Workspace-owned | Workspace license |

## Rules

`apps/desktop` owns Electron main/preload, private IPC channels, native
packaging, renderer entry points, and app-level `App` composition. It composes
`packages/maximal-client`'s `AppWorkspace`, feature surfaces, and React
controls. Main-process bindings to package-owned hosts and Core's control
transport live under `apps/desktop/src/main/adapters`; desktop preferences,
native integration, sidecar lifecycle, windows, and worker entry points live
in their matching `src/main` subdirectories. Each owns tests for its source.
Both are monorepo-native;
`packages/maximal` remains the copied CLI composition.

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
| `maximal-electron` | Uses the workspace mutation runner for changed-line and explicit local scopes, cached edit loops, and fresh complete or sharded audits. |
| `maximal-electron` | `TextInput` owns the token-based active-service treatment, the Radix-backed `Slider` owns its track, detents, labels, and thumb geometry, settings action rows and divider behavior live with the shared settings components, and `ModelCardGrid` owns provider adornments, disabled-provider activation, and model-action placement so consumers do not recreate those controls. |
| Workspace | `@maximal/eslint-config` owns the shared ESLint configuration and enforced rule sets. |
| Workspace | `architecture-analysis.json` owns package coverage, the declared workspace dependency tree (`dependsOn`), external-package deny rules, and non-Core architecture baselines. |
| `maximal-settings` | The pnpm bootstrap hook MUST load its dependency-policy source before workspace packages are installed; installed consumers MUST use the exported entry point. |
| `maximal-core` / `maximal-settings` | Core preserves its synchronous `config.json` storage and locking while validating installed connector payloads through the shared settings API; unknown plugins remain opaque. |
| `maximal-settings` | Dependency changes MUST update the reviewed closure and deterministic SBOM; `.pnpmfile.cjs` MUST enforce the reviewed resolution graph and integrity. |
| `maximal-configurators` | Owns first-party Cordis registration and terminal-profile launch configuration through Core's capability-scoped configurator host. |
| `maximal` / `maximal-core` | Connector payloads remain opaque in Core and are validated by host-installed Standard Schema plugins. |
| `maximal-core/downstream` | Declares itself as an independently installed compatibility fixture. |
| Model packages | Core consumes the side-effect-free model contract; orchestration and concrete runtime adapters remain separate packages. |
| Observability packages | The contract is runtime-neutral; renderer surfaces depend on it, not the reverse. |
| `model-runtimes/omlx` | Ships as a profile-installed Cordis/DSH adapter, not as compiled Core code. |
| `maximal` / `apps/desktop` | Core dependencies are workspace links; the desktop sidecar builds the Maximal composition. |
| `maximal-core` / `maximal` | Desktop-spawned Core (`start --desktop-ipc`) uses inherited Node child-process IPC for control RPC and events instead of binding its private HTTP listener; standalone Core keeps its loopback control listener and public proxy unchanged. |
| `maximal-core` | Ollama API keys are saved without using a malformed inference request as an authentication probe; Ollama has no dedicated key-validation endpoint. |
| `maximal-core` / `maximal-core-contract` | Ollama account probes expose a sanitized error code with unavailable results so Settings can distinguish a saved working key from a saved key whose validation failed. |
| `@maximal/maximal-client` / `maximal-core` | Ollama direct Cloud API keys are entered in Maximal and returned only through the private desktop settings control path so the password field can hide or reveal the configured value; Ollama device identities remain owned by the Ollama app or CLI. |
| `@maximal/maximal-client` / `maximal-core` / `maximal-core-contract` | Cloud model summaries identify their routing provider and local/cloud location; Ollama direct-cloud enablement is persisted separately from the local Ollama provider so Settings can preserve the documented API-key and signed-in application access paths. |
| `apps/desktop` | Packaged Linux smoke uses the `desktop-smoke` target of the pinned Docker dependency build, stages Git-visible source, and runs Electron E2E under Xvfb without container networking. |
| `maximal-ollama` | Desktop calls the package behind validated IPC. The package owns installed-process and listening-port discovery; Core owns the persisted inference endpoint. Core provider policy and Settings integration remain in their existing owners until an optional provider seam is established. |
| `apps/desktop` | The workspace build must build the Maximal composition and `@maximal/maximal-client` renderer dependencies before compiling the sidecar; Forge bundles its app entry points with product surfaces from `packages/maximal-client/src`. |
| `@maximal/maximal-client` | Its workspace build waits for dependency builds; typechecking the renderer requires their emitted contracts in a clean Linux checkout. |
| `apps/desktop` | Development Electron profiles are checkout-isolated and shutdown waits for the Core child. |
| `maximal-electron` / `apps/desktop` | Desktop imports the package host-window API directly; it has no local shell adapter. |
| `maximal-electron` / `apps/desktop` | The host export owns Electron-native system-notification support and trusted macOS notification-settings launching; desktop exposes notification status and the settings action through its typed preload bridge. |
| `apps/desktop` | Electron owns version, login-item, lifecycle, and Settings integration for General desktop behavior; `uiohook-napi` is limited to the modifier-only Ctrl-twice quick-access gesture that Electron accelerators cannot represent. |
| `maximal-browser` / `apps/desktop` | Browser pages run in sandboxed `WebContentsView` instances owned by `maximal-browser`; desktop owns IPC transport and window lifecycle. |
| `@maximal/maximal-client` / `apps/desktop` | Direct lint and typecheck commands re-enter their Turbo tasks through `run-workspace-task.mjs`. |
| `maximal-electron` | Terminal copies use a main-owned revisioned pane document and geometry controller; window transfers stage before atomic readiness-gated commit or rollback. |
| `maximal-electron` / `apps/desktop` | `ElectronPanel` accepts consumer-owned movement policy and reports completed user moves while suppressing programmatic placement events; desktop persists the assistant anchor relative to a display work area. |
| `maximal-electron` / `maximal-terminal` | Terminal code outside Electron integration lives in `maximal-terminal`; `maximal-electron` owns the fixed Maximal terminal identity and generated tmux session prefix instead of deriving either from legacy Stuffbucket identity or application settings. The desktop's validated `terminalTmuxStatus` setting selects Maximal-owned `off` or `on` styling, or inherited host styling, without accepting shell command text or restyling explicitly attached host sessions. |
| `maximal-electron` | `verify:neutral` denies imports of workspace packages outside its `dependsOn` in the root `architecture-analysis.json` instead of a fixed name list, and bare `maximal` is no longer a forbidden term. |
| `maximal-electron` | Private workspace package, not published; the registry publish, tag, and git-install checks are removed. |
| `maximal-electron` | Workspace installation MUST NOT build the package; Turbo MUST own dependency-ordered builds. |
| `maximal-electron` | The package MUST NOT contain demo-shell or terminal-lab application composition. |
| `maximal-recording` / `apps/desktop` | Recording owns capture and encoding; desktop owns explicit initiation, destination, and window selection. |
| `apps/desktop` | The desktop application MUST own terminal integration behavior and end-to-end coverage. |
| `maximal-electron` / `maximal` | Consumers and design docs name the package `@maximal/maximal-electron`; the `stuffbucket-electron` workspace alias is removed. |
| `maximal-core` | Private workspace package, not published; the registry publish, release-tag, release-gates, and release-notes tooling are removed. |
| `maximal-core` | The settings wire types and control contract live in `maximal-core-contract`; Core's `./settings-types` and `./control-contract` exports republish them. |
| Test workflow | Native tests enter through the root isolation wrapper; Docker stages Git-visible source with container-owned dependencies. |

## Excluded from copied packages

`node_modules`, build output, reports, worktrees, package lockfiles, and recorded
demo media are excluded. Demo JSON remains because documentation tests read it.
