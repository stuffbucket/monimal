# Commands

The [monorepo test workflow](https://github.com/stuffbucket/monimal/blob/main/docs/testing-in-docker.md)
owns native isolation, affected/full scopes, and the Docker final gate.

```sh
bun install          # Install dependencies
bun run dev -- start # Run the server from source with watch
bun run build        # Build to dist/ (native Bun import attributes)
bun run start        # Production start (NODE_ENV=production)

# Lint / type / test
bun run lint         # ESLint with cache (auto-fixes staged files pre-commit)
bun run lint:all     # ESLint on entire project
bun run lint:fast    # oxlint — mechanical pass, ~10ms full repo
bun run typecheck    # tsc type check only (no emit)
pnpm test            # From monorepo root: isolated affected native tests
pnpm test -- --all   # From monorepo root: isolated full native graph
pnpm run test:docker # From the primary checkout: mountless final gate

# Aggregates
bun run check:fast   # lint:fast + typecheck + lint:all (the per-edit inner loop)
pnpm check           # From monorepo root: build, type, lint, and affected tests
bun run knip         # find unused exports/files
bun run verify:build # smoke-check the built CLI

# Release tooling
bun run release:manual  # local fallback cut (bumpp + bun publish). Primary
                        # release path is release-please: merge the auto-opened
                        # release PR → tag → release.yml builds/publishes.
bun run render-formula  # regenerate the Homebrew formula
bun run sbom            # generate the SBOM
bun run scan:secrets    # trufflehog filesystem scan
```

Tests must go through the monorepo-root workflow linked above. Raw `bun test`
invocations, including single-file paths, fail closed unless the root native
wrapper or Docker boundary has admitted them. The wrappers do not forward
arbitrary test paths.

`dev`, `build`, and `start` all begin at `src/main.ts`, the package-owned
composition entry. `dev` is a watched CLI runner, so it requires a CLI
subcommand such as `start`. The composition invokes `@stuffbucket/maximal-core`'s
public CLI and may supply the generic DSH provider host and built-in
configurators; routing and engine behavior remain in Core, and concrete
providers remain external profile packages.

## Electron client (`client/`)

`client/` is a package in the root pnpm workspace. Its filtered commands are
low-level diagnostics for the client package:

```sh
pnpm --filter maximal-client build:core  # Compile the maximal-core sidecar
pnpm --filter maximal-client typecheck   # tsc --noEmit
pnpm --filter maximal-client ui:preview  # Open the real Search UI with in-memory settings
pnpm --filter maximal-client ui:check    # Check two browser widths and capture screenshots
pnpm test                                 # Run isolated affected workspace tests
pnpm --filter maximal-client start       # Launch without graph orchestration
pnpm package                              # Package the Electron client via Turbo
```

`ui:preview` and `ui:check` are renderer-only. They rebuild the shared renderer
package, then use Vite against `ui-preview.html`. They do not launch Electron,
compile or start the Core sidecar, read `window.maximal`, or bind the proxy port.
The preview supplies an in-memory `SettingsCapabilities` implementation to the
production `AppFrame`, `Settings`, and `SearchSection` components.

`ui:check` starts Vite on an ephemeral loopback port and closes it after the
run. It checks the heading hierarchy, provider count, tab order, horizontal
overflow, compact scrolling, and keyboard focus ring in Chromium. It writes
desktop and compact screenshots under `$TMPDIR/maximal-ui-check` for inspection.
The third capture opens the Copilot disclosure at compact width and records the
keyboard-focused provider-model dropdown.

Bun compiles the composed `@stuffbucket/maximal-core` proxy into a sidecar
binary. The client Vitest suite
belongs to the root Turbo graph and must be entered through the isolated root
wrapper. CI runs the full native graph; the mountless Docker graph is the
separate final gate defined by the workflow owner linked above.

`MAXIMAL_CORE_REF` overrides the provenance ref embedded in a sidecar build.
`MAXIMAL_CORE_OUT` overrides its output path. A relative output path resolves
from `packages/maximal/client`; an absolute path remains absolute. The desktop
app launches the default `resources/bin/maximal-core` path, so a custom output
is for build diagnostics rather than `pnpm dev`.
