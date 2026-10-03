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
| `packages/design-tokens` (`@maximal/design-tokens`) | Workspace-wide Style Dictionary inventory and down-only design-token and icon-metric migration ratchet. |
| `packages/maximal-browser` | Agent-shareable browser sessions, native Electron views, and browser-tab renderer UI. |
| `packages/maximal-terminal` | Electron-free terminal hosts, tmux control and projection, launch connectors, and the terminal renderer. |
| `packages/maximal-settings` | Typed layered settings, process-owned JSON stores, plugin-schema validation, and the settings migration ratchet. |
| `packages/local-model-registry` | Local-model artifact registration, tokenizer metadata, operation declarations, and provisioning. |
| `packages/maximal-assets` | Brand assets and visual configuration. |
| `packages/maximal-configurators` | First-party client configurators. |
| `packages/maximal-context-window` | Context-window derivation and UI. |
| `packages/maximal-recording` | Optional video capture engine and developer recording tools; desktop owns consent and output selection. |
| `packages/maximal-data-visualization` | Visualization primitives and styles. |
| `packages/maximal-project-browser` | WASM-accelerated spatial project canvas, navigation, board tools, presence, comments, and chat UI. |
| `packages/maximal-storybook` | Workspace Storybook configuration, preview decorators, browser checks, and developer commands. |
| `packages/maximal-github` | Runtime-neutral GitHub contracts, device authentication, Octokit API adapter, host profiles, and read-only GitHub CLI interoperability. |
| `packages/maximal-harness` | Local agent orchestration and renderer. |
| `packages/maximal-runner-gliner2` | Standalone GLiNER2 classification runner and pinned Python worker contract. |
| `packages/maximal-runner-llama-cpp` | Standalone Electron-hosted llama.cpp runner, worker, and packaging policy. |
| `packages/maximal-search` | Search connector contract, first-party providers, and provider settings manifest. |
| `packages/maximal-logging` | Persistent structured runtime logging and log discovery. |
| `packages/maximal-model-catalog` | Trusted released model metadata, release verification, and runtime inventory reconciliation. |
| `packages/maximal-model-contract` | Runtime-neutral model gateway, discovery descriptor, tokenizer identity, and operation vocabulary. |
| `packages/maximal-provider-decision-model` | Decision-model provider, System One HTTP API contract, family adapters, and runtime schemas. |
| `packages/maximal-provider-gliner25` | Strict adapter from Maximal label classification to the standalone GLiNER2.5 runner HTTP API. |
| `packages/maximal-cli` | Transport-neutral command contracts, adapters, and conformance suites. |
| `packages/maximal-core-contract` | Core's settings wire types and control-plane contract; Core republishes them. |
| `packages/maximal-models` | Provider plugin lifecycle and model dispatch. |
| `packages/maximal-react-component` (`@maximal/maximal-react-component`) | Development-only React component framing and source-location connection for Vite renderers. |
| `packages/maximal-observability-contract` | Traffic schemas and observer interfaces. |
| `packages/maximal-observability` | Traffic explorer UI. |
| `packages/maximal-ollama` | Node-native Ollama runtime management and renderer-safe status contract. |
| `packages/maximal-client` (`@maximal/maximal-client`) | Product renderer, UI controls, and shared desktop contracts. |
| `packages/project-catalog` (`@maximal/project-catalog`) | Local project discovery, Git interrogation, catalog contracts, and ranking. |
| `packages/model-qwen3-0.6b-q8-gguf` | Qwen3 artifact metadata and provisioning. |
| `packages/model-runtimes/anthropic` | Anthropic Messages adapter. |
| `packages/model-runtimes/gliner25` | Cordis System One adapter for standalone GLiNER2.5 runner endpoints. |
| `packages/model-runtimes/omlx` | oMLX HTTP adapter. |

## Asset provenance

| Assets | Source | Commit | License |
| --- | --- | --- | --- |
| Claude, Claude Code, GitHub Copilot, and Codex terminal icons | `lobehub/lobe-icons` | `329f378cbd1a88f45b60cd096b9111ce16f3ea39` | MIT |
| Maximal terminal icon | `apps/desktop/build/icon.icns` | Workspace-owned | Workspace license |
| Curated terminal font downloads and generated specimens | `ryanoasis/nerd-fonts` release assets | `v3.5.1`; SHA-256 digests and font identities in `packages/maximal-client/src/shared/terminal-font-downloads.json` | Per-font OFL-1.1 or MIT |

## API provenance

| Contract | Source | Commit |
| --- | --- | --- |
| `packages/maximal-provider-decision-model/src/index.ts` | `ollama/ollama` `docs/openapi.yaml` | `1abe35e6e6e777e858bbfbba283667ee8d516801` |
| `packages/maximal-provider-decision-model` TypeSafe profile and Jev oracle | `typesafe-ai/typesafe-sdk-js` | `66880ccded6cb642dc1809620c2b108c33730214` |
| `packages/maximal-provider-decision-model/fixtures/oracles/typesafe-jev-latest.json` | `docs.typesafe.ai` OpenAPI `0.2.0` and quick start | OpenAPI SHA-256 `a191f8a7df6bd6fedced8120dd0fd106f88575d1d1c8360d08900a6c7c0360d5` |
| `packages/maximal-provider-decision-model/fixtures/oracles/ollama-nimble.json` | Ollama `0.35.0`, `nimble:latest` | Model digest `24e550a16a7081881be2f1f0d91e8cc13a597472735c04119f035a0a85c67e0c` |
| `packages/maximal-provider-decision-model/fixtures/oracles/ollama-tev1-0.8b.json` | Ollama `0.35.0`, `tev1:0.8b` | Model digest `d45e875d63fed9465390a4eb9e55f51f470390a446667b55d0a075a15e0336bf` |
| `packages/maximal-provider-decision-model/fixtures/oracles/ollama-tev1-4b.json` | Ollama `0.35.0`, `tev1:4b` | Model digest `cef45ef93cf6df8bf32bdd689b0a8fd01f88ae9034d33ce890c54f77e4cd981e` |
| `packages/maximal-provider-decision-model` Nimble evaluation methodology | `bespokelabsai/nimble` (`public_benchmarks.py`, `evaluate_public.py`, `compare_public.py`, `summarize_public_suite.py`) | `62076b4f2d365b5879dafcf7f6dd072a1fe76df7` |
| `packages/maximal-provider-decision-model` Tev evaluation methodology | `togethercomputer/tev1` (`scripts/evaluate.py`) | `1dde7782382c9f49d627153759b8d1deab426ce0` |
| `packages/maximal-provider-decision-model` GLiNER2.5 classification adapter | `fastino-ai/GLiNER2` (`gliner2/classification`) and `fastino/GLiNER2.5-Decide` model contract | `55656fbfa01d3d4a77485e1a1eeeaf682990ccdf` |
| `packages/maximal-runner-gliner2` Python runtime | `fastino-ai/GLiNER2` release `2.0.0`; PyTorch; Transformers | GLiNER2 wheel SHA-256 `6f7c4cba0ef3173636d8bd9404aa94d4e0ccf36d4b4b9a0d27d740dd2d3236c3`; `torch==2.7.0`; `transformers==4.57.6` |
| `packages/maximal-runner-gliner2` model registry | `fastino/GLiNER2.5-Decide`; `fastino/GLiNER2.5-Decide-1B`; `fastino/GLiNER2.5-multi-Decide` | Revisions `5a7adf72a23b4d311abae6ce050d7f0012bb3416`, `688cd7ba8917a0855ad3ce929cba5a9998932e79`, `a35a0cd3b7a0f00f2effc576f454cd48fa98aa5f`; weight SHA-256 `40a5a23ff860dc3dff426cecd1048cacdd29c648c96db209dad818e9686dc997`, `02c567d791aed26550d300064c7f0c0094fd65291503c65969b45b30786e33b3`, `9efe0f88c99f2aa794452e9559dc60e98d60d9fa2bf1b60cf2710411b6da5b4e` |
| `packages/maximal-core-contract/src/settings.ts` System One default model downloads | Ollama `nimble:latest` model layer; `bartowski/togethercomputer_Tev1-4B-experimental-GGUF`; `DreamBlooms/Tev1-0.8B-experimental-GGUF` | Nimble SHA-256 `bbf1d6fc03bb0ed24d88f4c214ed7b5d1768aeb43d5cf433fb69eff0c8578013`, size `9527501312`; Tev1 4B revision `02b75e9ce9d967c52a6b0bd44e266f93e101445e`, file `togethercomputer_Tev1-4B-experimental-Q8_0.gguf`, LFS SHA-256 `a2917a77bf40b5a4eb3b933e06ac16cf1cf207c4ad7333b271060368fba534d8`, size `4622131232`; Tev1 0.8B revision `2bb70a6cb6e740a6a1a432453aa967cd4782bc0b`, file `tev1-Q8_0.gguf`, LFS SHA-256 `f5233c6dae6f5c520f4a19a48486757a8cd81eead25cc6cf0cdec1c93a1587d4`, size `811843360` |
| `packages/maximal-provider-decision-model/fixtures/evaluation` | Project-authored 600-decision corpus; live Ollama `0.35.0` captures | Corpus SHA-256 `557a91a7278fa31a37ee56b99603843e5e87b8502a071eea33c345122c73cb28` |

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
| Unsafe TypeScript assertions MUST warn through the shared ESLint config; the workspace baseline is down-only. | `unsafe-type-assertions.js`, `check-unsafe-type-assertions.mjs`, `unsafe-type-assertions-baseline.json`. |

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
| `maximal-electron` | `TextInput` owns the token-based active-service treatment, the Radix-backed `Slider` owns its track, detents, labels, and thumb geometry, `Menu` owns described and selected dropdown rows, settings action rows and divider behavior live with the shared settings components, and `ModelCardGrid` owns provider adornments, disabled-provider activation, and model-action placement so consumers do not recreate those controls. |
| `maximal-electron` | `Workbar` owns the persistent activity navigation geometry and the shared shell-icon vocabulary so consumers do not specialize collapsed side navigation or remap tab icons locally. |
| `maximal-client` | Workbar destinations MUST use product-owned workspace actions, live terminal session inventory, browser document state, project discovery, or observability surfaces rather than placeholder pages. |
| `maximal-electron` | `StatusProvider` owns keyed, ordered status registration; `StatusViewport` owns paging and per-entry dismissal; and `AppFrame` composes them so status layout follows visible content rather than a consumer-owned region flag. |
| `maximal-electron` / `apps/desktop` | Profile avatars accept authenticated HTTPS image URLs in the desktop renderer and fall back to account initials when an image cannot load; the signed-out profile identity invokes the consumer-owned account setup action. |
| `maximal-provider-decision-model` | The evaluation corpus and fixtures are project-authored internal regression material; no upstream harness code or restricted benchmark text is copied, and results MUST NOT be described as upstream benchmark equivalence. |
| `maximal-provider-gliner25` | The HTTP adapter follows the Apache-2.0 `stuffbucket/gliner-runner` API contract; the standalone repository remains the owner of its wire schema and execution behavior. |
| `maximal-electron` / `maximal-project-browser` / `maximal-client` / `apps/desktop` | `maximal-electron` owns token-driven spatial canvas presentation and control primitives; the reusable project map owns interaction and collaborative state, the client owns project discovery and opening, and desktop owns composition and shared shell stylesheet loading. |
| `maximal-electron` / `maximal-client` / `apps/desktop` | Projects tab transfers MUST use the shared document drag payload, a client-owned board and view snapshot, and a desktop-owned ready-checked window lifecycle. |
| `maximal-storybook` | Owns workspace Storybook integration while stories and deterministic fixtures remain beside the packages they exercise. |
| `maximal-electron` | `NumberInput` owns bounded numeric draft-and-commit behavior; `UnitValueInput` owns automatic/manual presentation and persisted display units while consumers own canonical conversion; `TypefaceControls` composes reusable compact typeface fields; and `TerminalTabs` forwards consumer-owned live typography to terminal views without owning its persistence or font discovery. |
| `@wterm/dom` 0.4.1 | Kitty graphics canvas backing stores scale with the bounded device pixel ratio so terminal images remain sharp on HiDPI displays. |
| `maximal-electron` | Electron hosts MAY launch trusted application-owned terminal commands through the main-only `launchTrustedTerminal` API; renderer PTY requests remain restricted to opaque session geometry. |
| `maximal-electron` | The shared shell contract owns the optional Maximal candy-paint surface tokens so consumers do not embed product palette literals. |
| Workspace | `@maximal/eslint-config` owns the shared ESLint configuration and enforced rule sets. |
| Workspace | `architecture-analysis.json` owns package coverage, the declared workspace dependency tree (`dependsOn`), external-package deny rules, and non-Core architecture baselines. |
| `maximal-settings` | The pnpm bootstrap hook MUST load its dependency-policy source before workspace packages are installed; installed consumers MUST use the exported entry point. |
| `maximal-core` / `maximal-settings` | Core preserves its synchronous `config.json` storage and locking while validating installed connector payloads through the shared settings API; unknown plugins remain opaque. |
| `maximal-settings` | Dependency changes MUST update the reviewed closure and deterministic SBOM; `.pnpmfile.cjs` MUST enforce the reviewed resolution graph and integrity. |
| `maximal-configurators` | Owns first-party Cordis registration and terminal-profile launch configuration through Core's capability-scoped configurator host. |
| `maximal` / `maximal-core` | Connector payloads remain opaque in Core and are validated by host-installed Standard Schema plugins. |
| `maximal-core/downstream` | Declares itself as an independently installed compatibility fixture. |
| Model packages | Core consumes the side-effect-free model contract; orchestration and concrete runtime adapters remain separate packages. |
| Model packages | `maximal-model-contract` owns live model-operation names and normalized provider evidence for lifecycle, selection, access, endpoints, limits, capabilities, pricing units, and typed provider details; API wire contracts and released catalog schemas project that vocabulary without becoming runtime authorities. |
| Model topology | `maximal-model-contract` owns Cordis-independent execution targets binding model IDs to provider/accounts, runners, endpoints, operation adapters, tokenizer evidence, and separately owned intrinsic/effective limits; `maximal-models` mounts the revisioned `modelTopology` Cordis service and binds target registrations to explicit lifetimes. Reviewed catalog facts remain separate from effective execution-target evidence. |
| `maximal-model-catalog` | Released catalog data is descriptive; local manifests and live provider discovery remain authoritative for runtime behavior, and runtime offering evidence resolves before release-catalog offering values without replacing canonical descriptive facts. |
| Observability packages | The contract is runtime-neutral; renderer surfaces depend on it, not the reverse. |
| `model-runtimes/gliner25` | Ships as a profile-installed Cordis adapter and delegates tensor execution and model lifecycle to an explicitly configured standalone `gliner-runner` endpoint. |
| `model-runtimes/omlx` | Ships as a profile-installed Cordis adapter, not as compiled Core code. |
| `maximal` / `apps/desktop` | Core dependencies are workspace links; the desktop sidecar builds the Maximal composition. |
| `maximal-core` / `maximal` | Desktop-spawned Core (`start --desktop-ipc`) uses inherited Node child-process IPC for control RPC and events instead of binding its private HTTP listener; standalone Core keeps its loopback control listener and public proxy unchanged. |
| `maximal-core` | Production traffic and token-usage persistence and aggregation run in a Core-owned child process over validated inherited IPC; direct SQLite construction is retained only as an injected library and test seam. |
| `maximal-core` | Ollama API keys are saved without using a malformed inference request as an authentication probe; Ollama has no dedicated key-validation endpoint. |
| `maximal-core` / `maximal-core-contract` | Ollama account probes expose a sanitized error code with unavailable results so Settings can distinguish a saved working key from a saved key whose validation failed. |
| `@maximal/maximal-client` / `maximal-core` | Ollama direct Cloud API keys are entered in Maximal and returned only through the private desktop settings control path so the password field can hide or reveal the configured value; Ollama device identities remain owned by the Ollama app or CLI. |
| `@maximal/maximal-client` / `maximal-core` / `maximal-core-contract` | Cloud model summaries identify their routing provider and local/cloud location; Ollama direct-cloud enablement is persisted separately from the local Ollama provider so Settings can preserve the documented API-key and signed-in application access paths. |
| `maximal-model-catalog` / `@maximal/maximal-client` | Shared provider identity and inventory reconciliation normalize live cloud and local observations; the renderer supplies provider access state and presentation. |
| `apps/desktop` | Packaged Linux smoke uses the `desktop-smoke` target of the pinned Docker dependency build, stages Git-visible source, and runs Electron E2E under Xvfb without container networking. |
| `maximal-ollama` | Desktop calls the package behind validated IPC. The package owns installed-process and listening-port discovery; Core owns the persisted inference endpoint. Core provider policy and Settings integration remain in their existing owners until an optional provider seam is established. |
| `apps/desktop` | The workspace build must build the Maximal composition and `@maximal/maximal-client` renderer dependencies before compiling the sidecar; Forge bundles its app entry points with product surfaces from `packages/maximal-client/src`. |
| `@maximal/maximal-client` | Its workspace build waits for dependency builds; typechecking the renderer requires their emitted contracts in a clean Linux checkout. |
| `apps/desktop` | Development Electron profiles are checkout-isolated and shutdown waits for the Core child. |
| `apps/desktop` / `maximal-core` | Development worktrees isolate application state while sharing a locked GitHub credential home; `MAXIMAL_DEV_PROFILE` MAY assign a stable explicit development profile name. Packaged and standalone Core credential paths remain unchanged. |
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
| `design-tokens` | Its package build and Turbo token inventory hash tracked application and package sources because the Style Dictionary inventory is workspace-wide. |
| `maximal-electron` | The package MUST NOT contain demo-shell or terminal-lab application composition. |
| `maximal-recording` / `apps/desktop` | Recording owns capture and encoding; desktop owns explicit initiation, destination, and window selection. |
| `apps/desktop` | The desktop application MUST own terminal integration behavior and end-to-end coverage. |
| `maximal-electron` / `maximal` | Consumers and design docs name the package `@maximal/maximal-electron`; the `stuffbucket-electron` workspace alias is removed. |
| `maximal-core` | Private workspace package, not published; the registry publish, release-tag, release-gates, and release-notes tooling are removed. |
| `maximal-core` | The settings wire types and control contract live in `maximal-core-contract`; Core's `./settings-types` and `./control-contract` exports republish them. |
| `maximal-core` / `maximal-model-contract` | Core exposes Ollama's local `/v1/systemone` decision API through model-routed and provider-qualified endpoints; the provider gateway identifies this capability as `systemone`. Model weights remain Ollama-managed and are not distributed by the workspace. |
| `maximal-core` / `cli/cli` | GitHub.com device authentication uses the GitHub CLI OAuth application's public client credentials from its MIT-licensed `internal/authflow/flow.go`; Maximal owns polling and persistence and does not require the `gh` executable. |
| Test workflow | Native tests enter through the root isolation wrapper; Docker stages Git-visible source with container-owned dependencies. |

## Excluded from copied packages

`node_modules`, build output, reports, worktrees, package lockfiles, and recorded
demo media are excluded. Demo JSON remains because documentation tests read it.
