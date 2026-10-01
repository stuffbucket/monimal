# Maximal

Maximal is an AI-assisted development environment available as a command-line
tool and desktop application. It brings an agentic coding workflow, configurable
model providers, and a native macOS experience into one product.

## Get Maximal

Signed, notarized macOS releases are published on
[GitHub Releases](../../releases).

## Documentation

The Maximal guide and product documentation are available in the
[`packages/maximal/docs/guide`](packages/maximal/docs/guide) directory.

## Development

Run workspace workflows from the repository root:

| Task | Command |
| --- | --- |
| Run the desktop app | `pnpm dev` |
| Run the headless server in watch mode | `pnpm dev:server` |
| Analyze package architecture | `pnpm analyze` |
| Build the workspace | `pnpm build` |
| Run native build, type, and lint checks | `pnpm check:static` |
| Run the complete gate | `pnpm check` |
| Run isolated affected native tests | `pnpm test` |
| Run the pinned Docker test graph | `pnpm run test:docker` |
| Package the desktop app | `pnpm package` |
| Exercise every workspace packager | `pnpm package:all` |

These root scripts are the supported workflow entry points. Reusable product
features, controls, and shared contracts live in
[`packages/maximal-client`](packages/maximal-client); app-level renderer
composition, the Electron host, sidecar, and packaging live in
[`apps/desktop`](apps/desktop). `pnpm dev` builds the desktop app and its
workspace dependencies before Electron starts, and remains attached until the
app closes or you press Ctrl+C. Use
`pnpm --filter <package> run <script>` for package-specific diagnostics and
maintenance commands.

### Runtime settings environment catalog

Turbo catalogs these variables in [`turbo.json`](turbo.json) so their values
are available to workspace tasks and participate in cache hashes. Settings-backed
variables use the environment value when present, then fall back to the named
key in `$XDG_CONFIG_HOME/maximal/settings.json` (or
`~/.config/maximal/settings.json`).

| Variable | `settings.json` key | Consumed by | Effect |
| --- | --- | --- | --- |
| `COPILOT_API_CREDENTIAL_HOME` | — | [`packages/maximal-core/src/lib/platform/paths.ts`](packages/maximal-core/src/lib/platform/paths.ts) | Overrides the directory containing GitHub token and account files without moving the rest of the Maximal data home. The desktop sidecar sets it when credentials must live outside its isolated data directory. |
| `COPILOT_API_ENTERPRISE_URL` | — | [`packages/maximal-core/src/lib/config/api-config.ts`](packages/maximal-core/src/lib/config/api-config.ts), [`packages/maximal-core/src/lib/auth/github-host.ts`](packages/maximal-core/src/lib/auth/github-host.ts), and [`packages/maximal-core/src/lib/platform/paths.ts`](packages/maximal-core/src/lib/platform/paths.ts) | Selects GitHub Enterprise login, API, and Copilot hosts; identifies accounts by the enterprise host; and prefixes enterprise credential files with `ent_`. |
| `MAXIMAL_HOME` | `home` | [`packages/maximal-core/src/lib/config/runtime-settings.ts`](packages/maximal-core/src/lib/config/runtime-settings.ts) and [`packages/maximal-core/src/lib/platform/paths.ts`](packages/maximal-core/src/lib/platform/paths.ts) | Overrides the Maximal data root used for configuration, state, logs, and the default SQLite database. The desktop sidecar sets it to an app-scoped directory. |
| `MAXIMAL_HOME_POLICY` | `homePolicy` | [`packages/maximal-core/src/lib/config/runtime-settings.ts`](packages/maximal-core/src/lib/config/runtime-settings.ts) and [`packages/maximal-core/src/lib/platform/paths.ts`](packages/maximal-core/src/lib/platform/paths.ts) | Controls handling of the data root: `create` (the default) creates it as needed, while `require` rejects a missing, non-directory, or unwritable root. |
| `COPILOT_API_OAUTH_APP` | — | [`packages/maximal-core/src/lib/platform/paths.ts`](packages/maximal-core/src/lib/platform/paths.ts), [`packages/maximal-core/src/lib/config/api-config.ts`](packages/maximal-core/src/lib/config/api-config.ts), and [`packages/maximal-core/src/lib/platform/opencode.ts`](packages/maximal-core/src/lib/platform/opencode.ts) | Namespaces credentials by OAuth app. The special value `opencode` enables the OpenCode OAuth/token behavior and loads the installed OpenCode version for request metadata. |
| `MAXIMAL_API_SQLITE_DB_PATH` | `apiSqliteDbPath` | [`packages/maximal-core/src/lib/config/runtime-settings.ts`](packages/maximal-core/src/lib/config/runtime-settings.ts), [`packages/maximal-core/src/lib/observability/store.ts`](packages/maximal-core/src/lib/observability/store.ts), and [`packages/maximal-core/src/lib/token-usage/store.ts`](packages/maximal-core/src/lib/token-usage/store.ts) | Overrides the shared SQLite database path used for traffic observability and token-usage records. |

See [`docs/testing-in-docker.md`](docs/testing-in-docker.md) for the test
boundary, [`docs/terminal-connection-demo.md`](docs/terminal-connection-demo.md)
for the tmux, SSH, Pipe, and browser connection demo, and
[RELEASING.md](RELEASING.md) for release procedures.

`pnpm analyze` runs the Turbo-cached package architecture graph: Knip
reachability and dependency hygiene, dependency-cruiser package/source cycle
checks, and the jscpd cross-file production clone ratchet. Import boundaries
run as part of `pnpm lint` through the shared ESLint profile.
