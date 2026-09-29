# Roadmap

## Terminal portability

Native terminal behavior SHOULD be verified on every platform supported by
`apps/desktop`.

Terminal tab working-directory policy MAY be added when a product consumer
defines the expected persistence and security behavior.

`TmuxProjectionBroker` and `TmuxProjectionHost` MAY gain product UI through a
consumer-owned bridge; this package MUST NOT define product IPC channels for
that UI.

## Proposals

Scoped proposals MUST be indexed by
[`docs/proposals/`](proposals/README.md).
