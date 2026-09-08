# Commands

The [monorepo test workflow](https://github.com/stuffbucket/monimal/blob/main/docs/testing-in-docker.md)
owns native isolation, affected/full scopes, and the Docker final gate.

```sh
bun install          # Install dependencies
bun run dev          # Dev mode with watch
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
composition entry. It invokes `@stuffbucket/maximal-core`'s public CLI and may
supply the generic DSH provider host; routing and engine behavior remain in
Core, and concrete providers remain external profile packages.

## Electron client (`client/`)

`client/` is a package in the root pnpm workspace. Run its commands from the
monorepo root:

```sh
pnpm install                              # Install the workspace
pnpm --filter maximal-client build:core  # Compile the maximal-core sidecar
pnpm --filter maximal-client typecheck   # tsc --noEmit
pnpm test                                 # Run isolated affected workspace tests
pnpm --filter maximal-client start       # electron-forge start
pnpm package                              # Package the Electron client via Turbo
```

Bun is invoked internally by `build:core` to compile the composed
`@stuffbucket/maximal-core` proxy into a sidecar binary. The client Vitest suite
belongs to the root Turbo graph and must be entered through the isolated root
wrapper. CI runs the full native graph; the mountless Docker graph is the
separate final gate defined by the workflow owner linked above.
