---
id: ADR-0025
title: Local traffic observability is passive, metadata-only, and contract-first
status: accepted
date: 2026-09-07
authors:
  - stuffbucket
depends_on:
  - docs/decisions/0024-electron-main-control-boundary.md
links:
  contract_package: ../../../maximal-observability-contract/README.md
  observability_spec: ../spec/observability.md
---

# Local traffic observability is passive, metadata-only, and contract-first

## Context

The desktop product needs request history, aggregate traffic views, and live
invalidation without making request processing depend on a renderer, database,
or telemetry service. The same facts may later feed an opt-in OpenTelemetry
exporter, but the embedded dashboard must work without running SigNoz,
ClickHouse, an OTel Collector, or any other external service.

Observability touches a sensitive path. A hook with a return value, a thrown
error, or access to mutable request state could accidentally become routing or
response policy. Persisting payload content would also turn a local diagnostic
feature into a transcript store. A durable boundary is therefore required
before choosing storage, transport, or presentation details.

## Decision

1. **The contract is the dependency root.**
   `@stuffbucket/maximal-observability-contract` contains only serializable
   schemas, inferred types, bounds, query/result shapes, live invalidation
   hints, and the passive observer interfaces. It MUST NOT depend on Maximal
   Core, a database, HTTP, Electron, React, or any implementation package.

   Core and storage/control adapters MAY depend on the contract. The
   renderer-only `@stuffbucket/maximal-observability` package depends on the
   contract and exposes an `ObservabilitySource` consumer interface. It MUST NOT
   import Core or a concrete store. A desktop composition MAY adapt named
   main-process capabilities to that source. Dependencies never point from the
   contract or Core into the renderer package.

2. **The serialized contract is durable and explicitly versioned.** Every
   query response and live invalidation crossing a process, transport, or
   persistence adapter carries `TRAFFIC_OBSERVABILITY_CONTRACT_VERSION`.
   Consumers validate at the boundary and fail closed on an unsupported
   version. Cursors are opaque and version-scoped; clients MUST NOT parse or
   synthesize them. Package versions and database schema versions MAY advance
   independently of the traffic contract version. A breaking wire-shape or
   semantic change increments the contract version and requires an explicit
   compatibility or migration decision; it is never inferred from package
   semver.

3. **Observation is passive and has no request authority.** Core reports
   immutable snapshots through `TrafficObserver`. Observer methods are
   synchronous notifications, return no control value, and MUST NOT mutate a
   request, select a provider or model, delay dispatch, alter streaming, cancel
   work, or change a response. Implementations MUST contain their own failures:
   persistence, export, or subscriber errors MUST NOT throw into the request
   path. Completion is terminal, and late observations are ignored.

4. **The embedded product boundary is local and metadata-only.** The local
   store records bounded correlation, timing, route, attribution, dispatch,
   token, size, response-semantic, and normalized error metadata. It MUST NOT
   retain prompts, message content, tool definitions or results, response
   bodies or chunks, authorization material, headers, upstream URLs, raw
   transport objects, stack traces, or exception causes. SQLite remains local
   to the application data boundary. Reads reach the renderer only through the
   explicitly named Electron-main capabilities established by ADR-0024; the
   private control origin and direct database access do not cross IPC.

5. **The embedded dashboard and external telemetry are separate products.**
   SQLite-backed history and the packaged renderer surfaces require no external
   collector. OpenTelemetry export, SigNoz dashboards, ClickHouse retention,
   and their operational tooling are optional, disabled by default, and must
   preserve the same metadata-only boundary. Enabling or losing an exporter
   MUST NOT change embedded collection or request behavior.

6. **Traffic shaping is a separate future policy seam.** Rate limiting,
   admission control, retry or provider choice, prioritization, cancellation,
   and any policy derived from observed traffic are intentionally outside
   `TrafficObserver`. If shaping is added, it receives a separate contract,
   authority model, configuration, failure semantics, and architecture
   decision. It MUST NOT be introduced by giving the passive observer a return
   value or by making request progress wait for persistence.

## Consequences

- The dashboard remains available offline and does not inherit the footprint or
  lifecycle of an OTel operations stack.
- Core can emit one stable set of metadata while storage, IPC/control adapters,
  renderer components, and a future exporter evolve independently.
- A renderer compromise does not gain the private control origin or direct SQL
  access merely because it can display traffic data.
- Rich payload inspection and replay are unavailable by design. A future need
  for either requires a separate privacy and retention decision rather than a
  contract extension by convenience.
- Observability loss is diagnosable but never request-fatal. Implementations
  need their own bounded queues, error reporting, retention, and cleanup.

## Rejected alternatives

- **Make SigNoz the product dashboard.** This adds multiple services and an
  operations lifecycle to a feature that must work in the packaged desktop app.
- **Let Core import the renderer package or database types.** This reverses the
  dependency direction and couples request processing to presentation or
  persistence choices.
- **Store request and response bodies for better debugging.** This creates a
  local transcript and secret-retention surface outside the stated product
  need.
- **Use the observer to shape traffic later.** A nominally diagnostic hook would
  silently acquire request authority and make failures or latency in storage
  affect serving.
