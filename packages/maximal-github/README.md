# `@maximal/maximal-github`

This package owns GitHub host profiles, runtime-neutral account and repository
contracts, the Node/Electron-main Octokit adapter, normalized GitHub failures,
device-code request construction and validation, and read-only GitHub CLI
interoperability.

Import renderer-safe types from `@maximal/maximal-github/contracts`. Import the
Octokit adapter only in a trusted Node process. The package MUST NOT expose
credentials to a renderer or use GitHub APIs as a replacement for native Git.
Trusted processes MAY use `@maximal/maximal-github/device-auth` with an injected
HTTP requester to begin device authentication without coupling the package to a
runtime-specific transport.

See [GitHub integration](../../docs/github-integration.md) for architecture,
host, authentication, EMU, and operation ownership requirements.
