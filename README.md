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

These root scripts are the supported workflow entry points. Use
`pnpm --filter <package> run <script>` for package-specific diagnostics and
maintenance commands.

See [`docs/testing-in-docker.md`](docs/testing-in-docker.md) for the test
boundary and [RELEASING.md](RELEASING.md) for release procedures.

`pnpm analyze` runs the Turbo-cached package architecture graph: Knip
reachability and dependency hygiene, dependency-cruiser package/source cycle
checks, and the jscpd cross-file production clone ratchet. Import boundaries
run as part of `pnpm lint` through the shared ESLint profile.
