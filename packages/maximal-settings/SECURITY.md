# Dependency And Data Security

- Runtime dependency versions, transitive edges, licenses, lifecycle scripts,
  and registry integrity MUST match `dependency-review.json`.
- Dependency updates MUST receive an explicit review; the review baseline MUST
  NOT be refreshed automatically to silence a failing check.
- The pnpm hook MUST verify the resolved closure and integrity before lockfile
  serialization. Full installed manifests MUST also pass `security:check`.
- SBOM generation MUST resolve dependencies from each package's own Node search
  paths, preserve multiple installed versions, and reject missing artifacts.
- SBOM checks MUST compare the deterministic CycloneDX inventory with the
  committed `SBOM.cdx.json`.
- Reviewers MUST run `security:audit` and record its time-sensitive result;
  zero known advisories MUST NOT be reported as proof of security.
- Reviewers MUST distinguish registry-served SHA-1 integrity from a locally
  computed stronger fingerprint and from authenticated publisher provenance.
- The lilconfig fingerprint MUST refer to the reviewed registry tarball; source
  review MUST compare installed files with that artifact before relying on it.
- Reviewers MUST distinguish a published `prepare` script from install lifecycle
  execution; registry tarballs MUST NOT be substituted with Git dependencies.

## Loader Boundary

- The adapter MUST use explicit JSON paths, an explicit `JSON.parse` loader,
  disabled search, and disabled caching.
- The adapter MUST NOT enable lilconfig's default JavaScript or synchronous
  `require` loaders for configuration documents.
- The adapter MUST reject symlink leaf files, nonregular files, oversized files,
  import directives, and unsafe prototype keys.
- Error messages MUST NOT contain configuration values or raw parser errors.
- Consumers MUST keep secrets out of setting path names and filesystem names;
  validation errors MAY identify a path without its value.
- Consumers MUST provide trusted storage directories and bound mutation work;
  this package MUST NOT be treated as a sandbox for malicious same-user writers.
- Tests MUST cover transient-value nonpersistence, invalid-change rollback,
  singleton conflicts, and separate-process writes.