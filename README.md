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

Run the desktop client from the repository root:

```bash
pnpm start
```

Turborepo builds the client and its workspace dependencies before Electron
starts. The command remains attached to the development process until the app
closes or you press Ctrl+C.

Repository setup, workspace commands, testing, packaging, and release guidance
are documented in the developer documentation. See
[`docs/testing-in-docker.md`](docs/testing-in-docker.md) for the test workflow
and [RELEASING.md](RELEASING.md) for release procedures.
