# Commands

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
pnpm test            # From monorepo root: run all tests in disposable Docker

# Aggregates
bun run check:fast   # lint:fast + typecheck + lint:all (the per-edit inner loop)
pnpm check           # From monorepo root: build, type, lint, and Docker tests
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

Tests must go through the monorepo-root Docker wrapper. Raw `bun test`
invocations—including single-file paths—and `bun run check:deep` fail closed
outside that container. The wrapper does not support forwarding arbitrary test
paths; use the full `pnpm test` or `pnpm check` root commands shown above.

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
pnpm test                                 # Test the full workspace in Docker
pnpm --filter maximal-client start       # electron-forge start
pnpm package                              # Package the Electron client via Turbo
```

Bun is invoked internally by `build:core` to compile the composed
`@stuffbucket/maximal-core` proxy into a sidecar binary. The client Vitest suite
belongs to the root Docker/Turbo test graph; do not invoke it directly on the
host. Client build, lint, typecheck, and test coverage run in the root
`.github/workflows/ci.yml`, which also owns the Electron packaging job.
