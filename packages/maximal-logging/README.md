# Maximal logging

Runtime code MUST import `createLogger`, `resolveLogDirectory`, and
`listLogFiles` from `@stuffbucket/maximal-logging` rather than creating another
file writer. The Node-only package uses MIT-licensed Pino and writes newline
delimited JSON synchronously, so an unexpected sidecar exit does not discard
buffered lifecycle events.

```ts
import { createLogger } from "@stuffbucket/maximal-logging"

const log = createLogger("sidecar")
log.warn({ phase: "crashed", code: 1, signal: null }, "sidecar exited")
```

Log files are `<component>.log` in `$XDG_STATE_HOME/stuffbucket/logs` on Linux
(default `~/.local/state/stuffbucket/logs`),
`~/Library/Logs/stuffbucket` on macOS, and
`%LOCALAPPDATA%\stuffbucket\logs` on Windows. `directory` overrides the
default when embedding a logger in a supervised process with its own log
home. The directory is created on first logger construction. The file list
API returns metadata only, never log contents. Free-form messages MUST NOT
contain credentials: Pino redacts structured credential fields, not arbitrary
strings. Callers SHOULD reuse a logger per component and call `close()` during orderly
shutdown; synchronous writes still preserve events if shutdown is abrupt.

`pnpm lint` runs the package-owned dynamic migration scan across runtime source.
`logging.toml` owns its severity: `warn` reports remaining legacy log calls;
`enforce` blocks regressions in the migrated desktop main process already. Switch
the global level to `error` only after the scan reports zero alternatives.
Once zero is reached, lint fails until the level is promoted, preventing the
warning mode from becoming permanent.
CLI output and tests are not runtime log calls; the scanner is intentionally
limited to runtime source and excludes test files. Core's compatibility
adapter is excluded because it forwards its persisted logs through this
package while preserving its existing console contract.
