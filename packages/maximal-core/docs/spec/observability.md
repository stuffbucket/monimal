# Traffic observability: embedded dashboard and optional OTel/SigNoz — PRD

Status: Embedded dashboard approved for implementation; optional export and
operations proposed (not scheduled), updated 2026-09-07.
Owner: bstucker.
Scope: Two deliberately separate local-first surfaces: a packaged dashboard
backed by embedded SQLite, and an optional OpenTelemetry export to a locally
operated SigNoz stack. The first has no external-service dependency. The second
remains deferred until one of its listed triggers fires.

## TL;DR

- The product dashboard reads metadata-only request history and aggregates from
  an embedded SQLite store. It is part of the desktop product and requires no
  collector, ClickHouse, SigNoz, or network export.
- `@stuffbucket/maximal-observability-contract` defines the durable query,
  result, invalidation, and passive-observer boundary;
  `@stuffbucket/maximal-observability` supplies renderer-only surfaces. The
  contract keeps Core independent of the store, transport, and UI.
- OpenTelemetry and SigNoz are an optional future export and operations path for
  cross-source correlation, external querying, retention, and dashboards. They
  do not replace or enable the embedded dashboard.
- The mounted usage surfaces (`/usage`, `/token-usage`) do not have to be
  removed. `maximal debug`, `/_debug/state`, and daily logs remain the
  cold-debugging authorities.

## Product boundary

| Concern      | Embedded dashboard                                                                         | Optional OTel/SigNoz                                                                 |
| ------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Purpose      | Product request history, detail, aggregates, and live refresh                              | Cross-process traces, external queries, operational dashboards, and retention        |
| Storage      | SQLite inside the local application-data boundary                                          | OTel Collector and ClickHouse managed by the operator                                |
| Delivery     | Versioned control reads plus bounded invalidation hints                                    | Explicitly enabled OTLP export                                                       |
| Availability | Packaged product feature; no service to start                                              | Disabled by default; stack and exporter are separately operated                      |
| Privacy      | Bounded request metadata only; no prompts, bodies, headers, auth material, or stack traces | Must preserve the same metadata-only allowlist; export is a separate opt-in boundary |

The O1–O4 plan below describes only the optional export and operations layer.
It is not an implementation plan for the embedded SQLite store or packaged
renderer.

## Problem addressed by optional export

The embedded dashboard covers Maximal's local metadata history. It does not
create a shared telemetry backend, and it deliberately carries no dependency on
one. Optional export is justified only when an operator needs to:

1. correlate client and proxy traces across process boundaries;
2. run external or ad hoc queries beyond the packaged product views;
3. choose operations-specific retention, sampling, dashboards, or alerting; or
4. collect OTel telemetry that another client already emits.

Those needs do not change the embedded dashboard's storage, availability, or
authority boundary.

## Goals for optional export

| Goal                                                           | Acceptance signal                                                                                                                                                |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local stack starts in one command                              | `docker compose up signoz` brings up dashboard + collector + ClickHouse, browser at `localhost:3301`                                                             |
| Proxy emits semantic spans + metrics                           | Every `/v1/messages` request creates a parent span with `claude.session_id`, `claude.model`, `claude.subagent`, `claude.input_tokens`, `claude.context_used_pct` |
| Claude Desktop's own OTel exports land in the same pipeline    | Both sources visible in the SigNoz trace explorer; `traceparent` propagates from client into proxy spans                                                         |
| User's five specific questions are answerable from a dashboard | "Active sessions / subagent count / context fullness / session activity / sessions idle" — each as a panel                                                       |
| MIT-licensed end to end                                        | SigNoz (MIT), OTel Collector (Apache 2.0 — kept since it's industry standard, not a UI), proxy SDK code (MIT)                                                    |
| Doesn't replace embedded or cold diagnostics                   | SQLite dashboard remains available without OTel; `maximal debug`, `/_debug/state`, and daily logs remain authoritative for cold inspection                       |

## Non-goals

- **Replacing or operating the embedded dashboard.** SQLite collection,
  retention, migrations, control reads, and renderer delivery belong to the
  packaged product. The OTel plan neither gates nor configures them.
- **Production-grade SRE alerting.** This is a personal/team-of-few
  observability stack. PagerDuty integration, escalation policies,
  SLO definitions are out.
- **Multi-tenant data isolation.** Single user, single proxy, single
  ClickHouse. If the proxy ever serves multiple users this PRD
  needs revisiting alongside the deferred `RuntimeContext` refactor.
- **Hosted backend.** The point is local. Grafana Cloud / Honeycomb /
  Datadog are explicitly out — they're fine paths but not what this
  PRD scopes.
- **Replacing `maximal debug` or `/_debug/state`.** Those answer
  "right now" questions in one command; observability adds history
  on top, not as a replacement.
- **Replacing the daily log.** Logs stay; logs are the source of
  truth for compliance / forensics. Bridging logs into the
  observability stack is a separate (deferred) item.
- **Replacing `/usage` / `/token-usage`.** Leave them; link out from
  README.

## Optional OTel/SigNoz scope

If the export trigger fires, the optional stack is four additive changes. They
are ordered to make each commit independently reviewable without coupling the
embedded dashboard to their runtime.

### O1. `feat(observability): docker-compose for SigNoz + OTel Collector`

**Change:** add a `signoz` profile in a sibling
`docker-compose.observability.yml` (the repo has no `docker-compose.yml`
to extend today) that brings up:

- SigNoz frontend + query-service (one container each)
- ClickHouse (their default config)
- OTel Collector with a minimal config: OTLP/HTTP and OTLP/gRPC
  receivers, ClickHouse exporter to SigNoz

Plus `scripts/install-claude-otel.sh` (modeled on
`install-cowork-egress.sh`) that sets the relevant Claude Desktop env
vars / plist keys to point at the local collector.

**Acceptance:**

- `docker compose --profile signoz up -d` starts five services and
  exits with all healthy.
- Browser at `http://localhost:3301` shows the SigNoz UI.
- `curl localhost:4318/v1/traces` (the collector) returns 200 for a
  valid OTLP payload, 4xx for malformed.
- `scripts/install-claude-otel.sh` is idempotent and `defaults read`
  shows the expected keys after running.

**Estimate:** ~150 LOC of compose + collector YAML + the install
script.

### O2. `feat(observability): instrument proxy with OpenTelemetry`

**Change:** wire the OTel SDK into the proxy startup path. Two layers:

- **Auto-instrumentation** for `http`, `fetch` via
  `@opentelemetry/auto-instrumentations-node`. Free coverage of every
  inbound request and every outbound Copilot/Ollama call.
- **Manual spans** at the natural boundaries:
  - `messages.handle` — root span per `/v1/messages` request
  - `web_tools.agent` / `web_tools.stream` — per agent loop
  - `web_tools.turn` — per turn
  - `web_tools.execute` — per tool call (search/fetch)

**Manual metrics:**

- Counters: `claude.requests_total`, `claude.tokens_total`,
  `claude.web_tools.outcomes`, `claude.cache.{hits,misses,evictions}`
- Histograms: `claude.context_used_ratio` (input_tokens /
  model_max_context, bucketed by model)
- Gauges (via `ObservableGauge`): bridge `allCacheMetrics()` so cache
  state polls into the observability layer for free

**Span attributes** on the request span:

- `claude.session_id` (from `getRootSessionId`)
- `claude.subagent` (boolean from subagent-marker detector)
- `claude.model` (post-rewrite)
- `claude.compact_type` (if compacting)
- `claude.input_tokens`, `claude.output_tokens`,
  `claude.context_used_pct`, `claude.context_max`
- `claude.tool_use_count`

**Cardinality discipline:** `session_id` is a span attribute (high
cardinality, fine for traces) but **never** a metric label.

**Trace context propagation:** Hono middleware extracts `traceparent`
from incoming requests so Claude Desktop's traces correlate with
proxy spans. Outgoing Copilot calls already get the headers via
auto-instrumentation.

**Configuration:**

- New env var: `OTEL_EXPORTER_OTLP_ENDPOINT` (default unset; when
  unset, the OTel SDK is a no-op while embedded SQLite observability
  continues normally).
- Optional: `OTEL_SERVICE_NAME` (defaults to `copilot-api`).
- Logged at startup alongside the existing executor banner.

**Acceptance:**

- With the stack from O1 running, every `/v1/messages` request
  creates a span visible in SigNoz within 2s.
- The five specific user questions resolve to concrete queries:
  1. **Active sessions** = `count_distinct(claude.session_id)` over
     last N minutes
  2. **Subagent count** = `count` filtered by
     `claude.subagent=true` over last N
  3. **Context fullness** = histogram of `claude.context_used_ratio`
     by `claude.model`
  4. **Session activity** = trace explorer filtered by
     `claude.session_id`
  5. **Sessions waiting** = `(now - max(timestamp) by claude.session_id) > X`
- With `OTEL_EXPORTER_OTLP_ENDPOINT` unset, `bun test` and `bun
start` are unchanged in behavior — no leftover async work, no
  network calls.

**Estimate:** ~250 LOC across `src/lib/otel.ts` (init), `src/server.ts`
(middleware), `src/routes/messages/handler.ts` (root span attrs),
`src/routes/messages/web-tools/{agent,stream}.ts` (web-tools spans).
Plus tests for the metric-emission paths.

### O3. `feat(observability): default SigNoz dashboards`

**Change:** export three SigNoz dashboards as JSON, committed to
`docs/observability/dashboards/`. Loaded via SigNoz's import UI on
first run, or auto-provisioned if their compose supports it.

**Three dashboards:**

| Dashboard               | Panels                                                                                                                              | Audience                            |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| **Overview**            | RPS by endpoint; p50/p95/p99 latency; error rate; current active sessions; subagent share; cache hit rate                           | "is the proxy healthy"              |
| **Sessions**            | Per-session activity (table sorted by last_seen); session model mix; sessions idle > N min; time-to-first-token by session          | "what is each user / agent doing"   |
| **Context engineering** | `context_used_pct` heatmap by model; histogram of input_tokens; compaction rate; web-tools turns distribution; tokens-per-tool-call | "where is the context budget going" |

**Acceptance:** importing the JSON in a fresh SigNoz install
produces three working dashboards with no manual configuration.

**Estimate:** ~half-day of dashboard authoring + tuning. The JSON
files are large (hundreds of lines each) but generated by SigNoz's
export.

### O4. `docs: observability admin guide`

**Change:** new `docs/admin/observability.md` covering:

- How to start the stack (`docker compose --profile signoz up`)
- How to configure Claude Desktop OTel exports
- How to enable proxy instrumentation (`OTEL_EXPORTER_OTLP_ENDPOINT`)
- What each dashboard shows + how to interpret it
- Cardinality and retention notes (ClickHouse defaults; how to tune)

**Estimate:** documentation-only. ~80 lines.

## Optional operations deferred beyond O1–O4

| Item                                                                   | Defer reason                                                                                     | Trigger to revisit                                                             |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Tail sampling in the collector (drop boring traces, keep slow / error) | Default sampling is fine at single-user volume; complexity isn't paid for yet                    | Storage growth becomes a problem (>1 GB/day) or trace volume drowns out signal |
| Alerting / notification routing                                        | Personal stack, no on-call rotation                                                              | Multiple operators using the same proxy                                        |
| Bridging the daily log into Loki / SigNoz logs                         | Logs are already structured and grep-friendly; double-storing is cost without payoff             | Log search across days becomes a routine task                                  |
| Replacing `/usage` / `/token-usage`                                    | The dashboard subsumes their function, but removing the mounted endpoints is a separate decision | Confirmed nobody calls `/usage` or `/token-usage`                              |
| Trace context propagation from Claude Code (the CLI, not Desktop)      | CLI doesn't currently emit OTel; would need to instrument it ourselves                           | Claude Code adds OTel support upstream                                         |
| Multi-host setup (collector on a different machine)                    | Single-machine is the point                                                                      | Proxy moves to a shared host                                                   |
| Switching backend (Tempo + Mimir + Loki + Grafana)                     | SigNoz is the simpler MIT path                                                                   | If SigNoz becomes neglected or licensing changes                               |
| Log redaction processor in the collector                               | Span attributes are deliberately limited to non-secret values; not a current risk                | A regression accidentally puts a token / key on a span                         |
| Hosted-backend alternative (Grafana Cloud, Honeycomb, Azure Monitor)   | Stated non-goal                                                                                  | If the user wants observability without the local-stack burden                 |

## Risks

- **ClickHouse footprint.** ~500 MB RAM, ~1 GB disk to start, grows
  with retention. Acceptable on a developer Mac but not free.
  Mitigation: SigNoz's default retention is 15 days for traces, 30
  for metrics — adequate without tuning. Document the tunables in
  the admin guide.
- **Cardinality blow-up.** Putting `session_id` or `request_id` on
  metric labels is the classic mistake. Mitigation: per-attribute
  rule documented in O2; lint check possible later (custom rule:
  `metric.attribute.session_id` is forbidden).
- **OTel SDK init order.** Auto-instrumentation must run before any
  module that imports `http` / `fetch`. In Bun's ESM, this means the
  init has to happen at the very top of `src/main.ts` before other
  imports — easy to break with a future refactor. Mitigation:
  `src/lib/otel.ts` init runs in a side-effect import at the top of
  `main.ts`, with an inline comment guarding the order.
- **Bun ↔ OTel SDK compatibility.** OTel's Node SDK has historically
  trailed Bun support by a release or two. Mitigation: pin to a known-
  working version, validate before committing. If Bun breaks the
  SDK, fall back to OpenTelemetry's HTTP-only exporter (no
  auto-instrumentation) — coverage drops but nothing else.
- **Claude Desktop OTel surface drift.** Anthropic could change
  what they emit between releases; dashboards built against
  `claude_desktop.*` attributes might break. Mitigation: dashboards
  are committed JSON — easy to fix forward. Don't build alerts on
  Claude Desktop attributes (the proxy's own attributes are stable
  because we own them).
- **`OTEL_EXPORTER_OTLP_ENDPOINT` without a running collector.**
  When the env is set but the collector is down, the SDK retries and
  buffers. Mitigation: SDK config sets a tight `BatchSpanProcessor`
  timeout and bounded queue so a stalled collector doesn't leak
  memory in the proxy.
- **The embedded and cold-debugging surfaces may already be enough.**
  Risk that optional export adds operational burden (a Docker stack) for
  marginal value. Mitigation: keep OTel gated on the env var; without it, the
  embedded dashboard continues with no exporter or external network calls.

## Optional export success criteria

End-to-end test for the originating motivation:

```
$ docker compose --profile signoz up -d
$ scripts/install-claude-otel.sh
$ OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 maximal start
$ open http://localhost:3301

# In the SigNoz UI:
#   1. Active sessions panel shows 1 (this terminal)
#   2. After running Claude Code, claude.session_id appears
#   3. After running Claude Desktop with Cowork, a second session appears
#   4. Context fullness panel shows a per-model histogram with real data
#   5. Sessions panel reveals which one is currently waiting on a tool result
```

If a future user can answer all five from one dashboard load, the
milestone delivered.

## Sequencing notes

O1 → O2 → O3 → O4. O2 depends on O1 being up so spans have
somewhere to land for tests. O3 depends on O2 producing the right
attributes. O4 wraps up.

The optional stack should land together or not at all: export without a usable
operations path is invisible overhead. This sequencing constraint does not
apply to the embedded SQLite dashboard, which is independent and useful without
any O1–O4 component.

## Trigger to schedule

The optional OTel/SigNoz work is intentionally not scheduled. Pick it up when one of:

- A user asks "what was Claude Desktop doing yesterday at 3pm" and we
  can't answer
- The cleanup PRD's deferred `RuntimeContext` work gets picked up
  (multi-session needs make observability a hard prerequisite)
- A regression slips through that would have been caught by trace
  history
- Someone wants to study context-window utilization across models
  empirically (the O3 dashboards are the cheapest way to do this)

Until then, the embedded dashboard covers interactive traffic history, while
`maximal debug` and the daily log cover cold inspection. No external operations
stack is required.

## Out of scope (this PRD)

- Web-tools work — covered by `docs/spec/archive/web-tools.md`
- Tool-bridge work — covered by `docs/spec/tool-bridge.md`
- State / config / cache cleanup — covered by
  `docs/spec/archive/state-config-cache-cleanup.md` (now closed)
- MDM / egress — covered by `docs/admin/claude-desktop-mdm.md`

## References

- SigNoz: https://github.com/SigNoz/signoz (MIT)
- OpenTelemetry JS: https://github.com/open-telemetry/opentelemetry-js (Apache 2.0)
- Auto-instrumentation: https://github.com/open-telemetry/opentelemetry-js-contrib (Apache 2.0)
- Hono OTel middleware:
  https://github.com/honojs/middleware/tree/main/packages/otel
- Claude Desktop OTel surface:
  https://docs.anthropic.com/en/docs/claude-code/monitoring-usage
  (the same env-var-driven exporter is reused by Claude Desktop)
