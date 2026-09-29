# Local project catalog

The desktop application maintains a local-first project catalog. GitHub
metadata is optional enrichment and MUST NOT define local project identity.

## Ownership

- `packages/project-catalog` owns catalog contracts, bounded directory
  discovery, native Git interrogation, and fuzzy ranking.
- `apps/desktop` owns the SQLite database, directory picker, refresh lifecycle,
  and validated IPC.
- `packages/maximal-client` owns the project browser and Projects settings.

## Discovery

Discovery MUST start only from user-selected roots. Scans MUST be breadth-first,
bounded by depth, entry count, and elapsed time, and MUST NOT follow symbolic
links or descend into `.git` or dependency/build directories.

An explicitly selected root is a project. Descendants are projects when they
are Git repositories or contain a supported project marker. Git facts MUST
come from the installed `git` executable with optional locks disabled.

Partial, denied, missing, invalid, and available states MUST remain distinct.
A partial scan MUST NOT delete last-known projects.

## Trust

New roots MUST start untrusted. Trusting a root permits opening that root in a
terminal. Trust applies to discovered descendants only when **Trust subtrees**
is enabled. Discovery and trust are independent: an untrusted project remains
searchable and appears in restricted mode.

Trust decisions MUST use canonical catalog roots and MUST NOT mutate Git
configuration or filesystem permissions.

## Refresh and search

The catalog refreshes at startup and on demand. Watchers are deferred until
measured freshness requirements justify their lifecycle and packaging cost.

SQLite is the durable fact store. Search uses an in-memory project summary with
`fuzzysort`; empty searches rank pinned and recently opened projects first.
