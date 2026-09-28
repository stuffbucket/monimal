# Desktop host

The Electron main process, preload bridge, private IPC channels, renderer
entry points and app-level composition, native sidecar, and packaging for the
Maximal desktop application live here.
[`../../packages/maximal-client/`](../../packages/maximal-client/) owns the
React product surfaces (including `AppWorkspace`), controls, and shared bridge
contracts. The host bundles those surfaces without owning their components.

To verify the packaged app and compiled sidecar on macOS:

```sh
pnpm --dir apps/desktop run package
pnpm --dir apps/desktop run verify:package
pnpm --dir apps/desktop run e2e
```

On a Docker host, run `pnpm run verify:desktop:linux` from the repository
root. Its `desktop-smoke` target extends the pinned Docker dependency stage
instead of maintaining a second toolchain recipe. It stages Git-visible files
into an isolated workspace, then runs the packaged Electron suite under Xvfb
without container networking. Electron is downloaded and verified during
the image build; the runtime uses `--no-sandbox` because it runs inside the
isolated container. This check verifies window preferences, not the Linux
kernel sandbox used by an installed desktop app.
