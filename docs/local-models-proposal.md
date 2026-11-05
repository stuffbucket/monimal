# Proposal: agent-led local model exploration

- **Author:** Oleg Melnychuk
- **Date:** 2026-10-16

This proposal explores how Maximal could help people find, set up, and use local models through its proxy or a supported adapter.

Most people using this will be new to local models, so discovery should start from what they want to do and what their device can handle. Frontier models are easy to reach through Substrate, so Maximal should focus on models that go beyond general chat.

## 1. Experience and interaction

### 1.1 Exploration gallery

The gallery is the main entry point for local models in the app. It shows experience cards, such as image, video, 3D, audio, vision, or quick classification, instead of a list of popular models. Each card has a title, a one-sentence outcome, and a device-fit label. A card may include a reviewed example image.

Selecting a card starts a short guided conversation. Users can skip the cards and describe their goal instead. The agent asks only the questions that change which models fit. Nothing is downloaded or configured at this stage.

### 1.2 Guided flow

Selecting an experience follows these steps:

1. Ask what the user wants to do and what limits matter to them.
2. Check what the device can run and which tools are already installed.
3. Look up models the user is allowed to use, including company ones.
4. Show a short list of good options, with reasons.
5. Ask the user to approve before anything is installed or changed.
6. Install and test the model.
7. Show how to connect the user's app or script.
8. Offer an optional speed test, which does not judge output quality.

Setup MUST run only fixed, checked steps, never arbitrary shell commands. Maximal MUST NOT scan the whole disk. Before any download, the user MUST see the size, where it goes, and where it comes from.

### 1.2.1 Discovery scope

- Entering discovery MUST inspect this device's configured stores, runtimes, and bounded supported-service inventory.
- The view MUST offer a **Local network** toggle, off by default, that adds local-network discovery to this-device discovery; known machines MUST NOT form a separate user-facing mode.
- Enabling local-network discovery MUST show the intended interface/address scope. Discovery MUST NOT extend silently to VPNs, other routed networks, or unselected interfaces.
- Discovery MUST be bounded, cancellable, and limited to reviewed service advertisements and supported endpoint probes.
- Inventory requests MUST fetch metadata only; discovery MUST NOT load models, execute inference, install packages, publish inventory, or enable sharing.
- Discovered services MUST NOT receive saved credentials until the user explicitly approves that destination.
- Results MUST retain separate deployment identities, execution locations, and evidence freshness across machines. Server aliases MUST NOT be treated as verified artifact variants.
- Missing isolation evidence MUST display **Isolation unverified**, not a sandboxed or safe label.
- Manual endpoint entry MUST remain available when discovery cannot find a service.

### 1.3 Model selection cards

A shortlist shows at most three cards. Each card names the exact model variant and what it's good at, then says whether it runs on this device or elsewhere, whether it fits this device, how big the download is, and whether the user must approve anything first. Cards link to the model page for details. They also have a slot for up to two opted-in people who have loaded the model, with a **Contact** action, plus a count of any others. The slot is reserved in Phase 1 and stays empty until the directory exists (Phase 2).

The primary action is **Set up** or **Connect**. A card that can't run on this device shows **Unavailable** with a short reason, such as "Needs 32 GB memory", and no action. Different variants never merge into one item. Cards must work with the keyboard and show their status as text.

A **Show all models** toggle sits above the shortlist. It is off by default. When on, models outside this device's hardware appear below the shortlist with the same reason label. Models blocked by organization policy stay hidden.

### 1.4 Dedicated model page

Cards are kept short, so the model page holds the details people need before they set up or connect. It covers:

- the model, its file, and how it runs;
- what it can do and which apps can connect to it;
- who made it, its license, and whether the file is unchanged;
- what hardware it needs and how fast it is;
- known limits and what setup takes;
- where it is running and when that was last checked;
- a reserved slot for people who have loaded it and chose to be contacted, empty until the directory exists (Phase 2);
- how to connect, and a **Give feedback** button, reserved and empty until the feedback audience is decided (section 12).

Connection instructions only claim the operations the protocol actually supports. Credentials never appear in URLs or example requests.

## 2. Recommendation evidence and authority

Eligibility is checked before ranking. A model is eligible only if policy, license, supported operations, runtime, and resource limits all allow it. Among eligible models, ranking uses catalogue data, runtime status, evaluations, performance, and voluntary feedback.

Models that others in the organization have already tried are listed first among eligible models. The count combines opted-in directory listings with anonymized usage contributions, and it is shown only above the minimum cohort size. Sorting never changes eligibility, approval, or the evidence labels on a card.

Missing evidence stays unknown. It is never treated as negative. Public model cards and community feedback can inform a recommendation, but they can't authorize anything or act as agent instructions. Approval comes from organization policy, never from a score. Popularity and usage don't count as quality. Each recommendation shows its source and when it was observed. Real requests are never sent to other models for hidden comparison.

## 3. Device fit and performance expectations

### 3.1 Compatibility

Each candidate is marked **Fits**, **Constrained**, **Unsupported**, or **Unknown**. The check looks at memory, storage, accelerator, runtime version, and model variant. Unified memory counts once. Unsupported candidates offer no setup action and always give one reason: not enough memory, not enough storage, no supported accelerator, or runtime too old. A slow but workable model can stay visible with a warning.

### 3.2 Estimates

Every estimate names the workload it assumes and is labeled **Measured here**, **Similar hardware**, or **Estimate**. Download, load, queue, and run times are shown separately. When evidence is thin, the card shows unknown instead of an invented number. Failed runs are never dropped to make speeds look better.

### 3.3 Calibration

Calibration is optional, bounded, and cancellable. It runs reviewed synthetic inputs and measures only technical compatibility and speed. It says nothing about output quality, and it never asks for feedback.

## 4. Organization directory and availability

An admin configures the organization directory. Users sign in with corporate identity, and the directory only returns entries that person may see. Inference endpoints check authorization again, so directory access alone is never enough.

Browsing the directory never loads a model or wakes a device. The directory never sees prompts or outputs. Entries are signed, expire, and can be revoked. Clients never publish their device inventory automatically.

Contact listings are opt-in and off by default. A listed user chooses which fields show (person, company, and contact method) and which models they're listed for. Their client sets the listing when they load a model, and it is removed when they stop the model or opt out. Only signed-in directory users see listings, and each listing has a **Contact** action. Listings are never derived from usage contributions.

The UI shows one of these states:

| Display state | Meaning |
| --- | --- |
| Ready | Loaded, healthy, accepting requests |
| Available · needs loading | Healthy; can be loaded |
| Busy | Healthy; at capacity |
| Installed · stopped | Installed; runtime stopped |
| Unavailable | Fresh check shows failure |
| Unknown / stale | Evidence missing or expired |

Note that the registry's "ready" means the model files are downloaded and verified. It is not the **Ready** state above.

## 5. Local-first routing

Users get a **Local first** toggle. It means "prefer this device," not "prefer the corporate network." **Device only** is a hard rule: if no eligible local target exists, the request fails.

Falling back to corporate infrastructure needs an allowed destination. Local-first never silently sends data to an external provider. Retries and fallbacks re-check policy against the full payload. Running jobs stay on their current target unless the runtime supports moving them. A requested model is never silently swapped for another. Device-only inference doesn't make external tools private; those tools enforce their own rules.

### 5.1 Requests to another person's device

A request goes to a teammate's machine only when that model is listed for remote use, the user can see it in the directory, and the user has consented. The card says it runs elsewhere before anything is sent. The owner's machine checks access again on its side, so a listing alone never allows a request. Device only never sends a request to another machine.

Organization policy checks the full request payload before it leaves the device, including on retries. Credentials go only to approved endpoints. Prompts and responses stay out of exploration telemetry and logs on both sides. Runtime events follow [the workspace logging requirement](../CHURN.md).

If the owner revokes access, new requests are blocked right away, even for cached directory entries. What happens to requests already running is still open (see section 12).

## 6. Provisioning and sharing

### 6.1 Model files and runtimes

Downloads use pinned revisions and content hashes, and can come from an approved internal mirror. Files download to staging, pass verification, and only then activate. Users see progress, can cancel, and get storage checks.

Model downloads never run model code or install plugins. Runtimes install through a separate reviewed path. A passing hash check doesn't mean a model is safe or licensed. Partial downloads restart rather than resume for now, and the UI says so.

### 6.2 Publishing

Publishing model files and publishing a service are separate workflows. Each needs an owner and an access scope. Uploads go through quarantine and license review. Shared services enforce TLS, authentication, and quotas. A published service never exposes shell, filesystem, or agent-tool access.

Managed team services come first. Personal workstation sharing stays off unless the organization approves it, and must be opt-in, visible, time-limited, and revocable.

### 6.3 Sharing your machine

Personal sharing is off unless the organization turns it on. When it's on, a user shares a model from its model page with a chosen audience: specific people, a team, or the directory. Sharing is a separate step from loading, and from the contact listing in section 4, so loading a model never shares it.

A share is a standing setting for that model. It expires after a set period and must be renewed, and the owner can turn it off at any time. The owner sets the period, the limit on simultaneous requests, and whether requests pause while the owner is using the machine. The default period is still open (see section 12).

While a model is shared, the app and tray show who it's shared with and when it ends. The owner sees request counts and timing, never prompts or responses.

Before a share ends, Maximal notifies the owner and offers to extend it. Extending is the owner's choice. If the owner doesn't respond, the share expires.

Turning sharing off or letting it expire blocks new requests. Requests already running follow the rule in section 12.

Requests reach a shared machine only through an approved endpoint, using credentials that are scoped to that share and expire with it. The transport and token design are open decisions in section 12.

### 6.4 Serving isolation and exposure review

- Sharing or re-exposing a deployment through Maximal MUST require a review of its serving isolation; discovery alone MUST NOT satisfy that gate.
- The review MUST cover model loaders and runtime code, filesystem mounts, process privileges, resource limits, incoming API access, and outbound network access.
- A reviewed serving sandbox MUST use an unprivileged identity, no unnecessary capabilities, no privilege escalation, syscall restrictions, and a read-only root with only explicitly bounded writable storage.
- Model artifacts MUST be mounted read-only. The serving sandbox MUST NOT receive user home directories, credentials, host control sockets, or arbitrary host files.
- Serving network access MUST be default-deny, with only reviewed ingress and explicitly allowlisted egress. Loopback binding and API authentication MUST NOT be treated as outbound-network isolation.
- LAN consumption MUST use authenticated TLS or an authenticated encrypted tunnel. Allowing inbound inference and its established replies MUST NOT grant the serving worker general access to the host, LAN, or internet.
- Download access MUST remain separate from inference-time network permissions. Model loading MUST NOT execute unreviewed repository code or unsafe serialized model code.
- Published inference APIs MUST NOT expose runtime-management, shell, filesystem, or agent-tool operations. Model output MUST remain untrusted, and any tool execution MUST enforce its own authorization and isolation.
- Container presence MUST NOT be presented as proof against host or GPU-driver compromise. Reviewers MUST define the accepted threat model and decide whether a shared GPU container or a dedicated VM/device boundary is required before exposure.
- Changes to an active deployment's sandbox or network policy MUST require explicit operator approval for any restart or workload disruption.
- Sharing and re-exposure control operations MUST invoke the [Core hardening precondition](../packages/maximal-core/src/lib/model-exposure/hardening.ts) immediately before opening or renewing ingress, under the authoritative deployment lifecycle lock.
- [Versioned hardening evidence](../packages/maximal-core-contract/src/serving-hardening.ts) MUST bind the target, deployment revision, runtime and artifact digests, serving configuration, and ingress/egress policies. Changes MUST invalidate the review.
- Evidence MUST come from an authenticated inspector through an authoritative reader, not a discovered server or an agent-supplied document. Missing, failed, unknown, stale, or untrusted evidence MUST block exposure.
- A passing hardening decision MUST NOT substitute for ownership, organization policy, or user consent. The report collector and sharing control endpoints MUST be implemented before this helper is described as an operational sharing feature.

## 7. Feedback and optional usage sharing

### 7.1 Feedback

Users start feedback themselves from the model page. Maximal never asks for a verdict after calibration. The form offers four categories: worked well, setup or compatibility issue, too slow, and output-quality issue. Users choose whether to attach hardware details, and the form warns against confidential content.

Private, organization-visible, and public feedback are separate scopes. Going public needs its own explicit consent.

### 7.2 Usage sharing

Usage sharing is off by default. Users can preview a sample payload before opting in, and turning it off discards pending uploads. Sharing never changes access to approved models.

Only reviewed operational fields are shared: model variant, runtime version, hardware class, load and run times, success or error category, and usage counts. Prompts, responses, files, names, credentials, endpoint URLs, and exact timestamps are never shared. Small groups are suppressed in aggregates.

Omitting user IDs doesn't make data anonymous, so contributions are described as de-identified. Successful runs are never reported as satisfaction. Contact listings (section 4) are a separate opt-in. The usage pipeline never reads them, and they never read usage data.

## 8. Privacy and compliance

Organization policy decides which model files, runtimes, destinations, and data classes are approved. Enforcement is deterministic and doesn't depend on the agent. Being on the corporate network is never treated as permission. Credentials go only to approved endpoints, and redirects never forward them. Request and response content stays out of exploration telemetry and logs. Runtime events follow [the workspace logging requirement](../CHURN.md).

Revoking approval blocks new activations and requests. How active jobs are cancelled on revocation must be defined before rollout. Contact details are shown only to authorized directory users who have opted in, and owners can remove their listing at any time. The first release needs a security review covering metadata leakage, credential forwarding, untrusted manifests, execution of downloaded files, and telemetry re-identification.

## 9. Contract evolution and ownership

Exploration extends the existing model, provider, and control code rather than creating a second registry. Each area has one owner:

- [Model contracts](../packages/maximal-model-contract/src/index.ts) and the [model catalogue](../packages/maximal-model-catalog/README.md): shared identities and descriptive metadata.
- [Local registry](../packages/local-model-registry/src/types.ts): model files, provisioning, and runtime assignment.
- [Provider host](../packages/maximal-models/src/host.ts) and runtime packages: activation and execution.
- Core control: setup planning, plan digests, approval checks, and operations, extending the existing `localModels` methods. Shared wire records live in [the Core control contract](../packages/maximal-core-contract/src/local-model-exploration.ts).
- [Harness](../packages/maximal-harness/src/host/toolsets.ts): conversation tools, with consent enforced outside the agent.
- [Product client](../packages/maximal-client/src/shared/host.ts): gallery, cards, model pages, and Settings, sharing one set of queries.

Key rules:

- Each thing has its own ID: the model, the exact variant, the model files (by digest), the registry entry, the runtime target, the deployment, and each setup or inference operation. A display name is never an identity.
- New versioned records cover experience definitions, device assessments, candidates, setup plans, approvals, operations, and connection descriptors. They never hold secrets or executable commands. Approval binds the exact model variant, file digests, and pinned runtime package to the plan digest; changing any of them requires new approval.
- Setup reuses the registry's verification path and activates only reviewed, pinned runtime packages. A discovered model can't name executable code.
- Media output (image, video, 3D) needs its own operation types before any gallery action is enabled. A catalogue listing alone doesn't allow setup or connection.
- Core gets methods for plan, consent, run, read, cancel, and connection descriptors. The names are still open, so they aren't documented as existing APIs. The old `ensure` action must enforce the same approval.
- Older sidecars show the feature as unsupported. They never return an empty list that looks like success.
- The renderer ignores duplicate or older events by revision number.
- If setup fails or is cancelled, only the workers it started are stopped. Unrelated settings are left alone. Every error gives a short reason and a next step.
- External clients get a connection descriptor and manual steps. The agent never writes their config files.

## 10. Phased delivery

### Phase 1: foundations and device advisor

Structured cards and model pages, typed agent setup tools, bounded local inventory, device assessment, and connection instructions. This phase also adds local-first and device-only constraints. It reserves the contact and feedback slots described in sections 1.3 and 1.4, which stay empty until the directory and the feedback audience are decided. Usage sharing stays off until its privacy controls are reviewed.

Gate: one supported local text or System-1 path works from setup to external use, and first-run setup doesn't require a frontier provider.

### Phase 2: corporate discovery and performance evidence

SSO-filtered directory access, opt-in contact listings, authenticated health checks, approved mirrors, revocation, performance estimates, optional calibration, and opt-in contributions. Feedback submission waits for audience and retention decisions. This phase depends on the decisions in section 12.

### Phase 3: exploration pilot

System-1, image generation, and one heavier video or 3D experience. Each needs a supported runtime, an external-client example, and real hardware timing. Gallery actions stay off until that path exists.

### Phase 4: controlled publication

Model file nomination and managed-service registration as separate steps. Personal workstation sharing needs its own approval.

## 11. Acceptance criteria

The feature is done when:

1. A user can pick an experience and set up an eligible model without editing endpoints or signing in to a frontier provider.
2. An unsupported device can't start setup from a recommendation.
3. Weak evidence shows an unknown estimate, not an invented speed.
4. A stopped deployment never shows Ready, and stale health shows Unknown / stale.
5. Browsing the directory starts no runtime and shares no device inventory.
6. Device-only requests never leave the device through retry or fallback.
7. An explicit model choice is never silently swapped.
8. Unauthorized users can't see restricted deployments or call their endpoints.
9. Revocation blocks new remote requests, even with cached directory entries.
10. Corrupt model files and unapproved runtime code never activate.
11. Interrupted setup can be recovered without touching unrelated settings.
12. Calibration never asks for feedback or reports speed as quality.
13. Disabled sharing sends nothing, and opting out removes queued uploads.
14. Contribution schemas reject content, credentials, exact timestamps, and stable identifiers.
15. Contact details appear only for opted-in users, and disappear when they opt out.
16. Models tried within the organization sort first among eligible models, and only above the minimum cohort size.

Testing follows [the existing tiered workflow](testing-in-docker.md). Contract tests and real hardware validation are reported separately.

## 12. Decisions required before implementation

Reviewers need to settle:

- who owns the directory and recommendation services, and where they're hosted;
- corporate identity and endpoint credential issuance, including how shared machines are reached and what their tokens look like;
- trust roots, version negotiation, and offline expiry;
- organization data classes and policy precedence;
- initial image, video, and 3D runtimes, their licenses, and supported hardware;
- non-text API shapes and pilot external clients;
- performance presets, minimum cohort size, and retention;
- feedback audience and moderation;
- standing-consent limits, and how revocation applies to active jobs;
- contact listing audience, visible fields, and retention;
- whether local-first is on by default, and which scenarios get defaults.

Unresolved decisions are not filled in with defaults chosen by the agent.

## 13. Implementation checkpoint and remaining work

### Stage 1: contracts and setup helpers

The first implementation slice contains:

- strict, versioned [wire schemas](../packages/maximal-core-contract/src/local-model-exploration.ts) for experiences, device assessments, candidates, plans, approvals, operations, and connection descriptors;
- Core-owned [setup helpers](../packages/maximal-core/src/lib/local-model-setup/plan.ts) that validate candidate and step compatibility, require file verification before runtime execution, and return detached, deeply immutable snapshots;
- canonical SHA-256 plan digests covering the model and variant IDs, exact files, pinned runtime package, source, destination, and steps;
- approval matching and digest-integrity checks, with regression tests for changed plans, invalid steps, and nested mutation.

These are contracts and in-process helpers, not a usable setup feature. They do not run downloads, enforce organization policy, authenticate consent, or expose control methods. An approval record alone is not authorization. Phase 1's end-to-end gate in section 10 remains open.

### Existing-deployment connection slice

- The first GPU-serving slice MUST connect an existing vLLM deployment before provisioning another model. The [vLLM connector](../packages/model-runtimes/vllm/src/index.ts) MUST reuse the shared Messages adapter and advertise only its implemented operation.
- Execution targets MUST identify the configured endpoint, runner, served model ID, and explicit location. An authenticated loopback tunnel to Perun MUST remain a remote target. Additional hosts, including Domovyk and Iskra, MUST use distinct target identities.
- Served aliases MUST NOT be treated as verified artifact variants. Configuration MUST NOT imply loaded or healthy state.
- The [explicit live check](../packages/model-runtimes/vllm/examples/check-connection.mjs) MUST be reported separately from contract tests, desktop acceptance, managed setup, and performance estimates.
- Connecting MUST NOT enable cluster discovery or sharing. Those workflows MUST retain the authorization, consent, and publication gates in sections 4–6.

### Discovery checkpoint and evidence boundaries

- Progress reports MUST identify the implemented discovery slice by its [wire contract](../packages/maximal-core-contract/src/model-discovery.ts), [host-owned service](../packages/maximal-models/src/discovery/service.ts), [Core control boundary](../packages/maximal-core/src/routes/control/model-discovery.ts), and [shared Settings surface](../packages/maximal-client/src/renderer/settings/local-models/ModelDiscoverySection.tsx).
- Discovery acceptance MUST distinguish this-device endpoint probing from opt-in, explicitly scoped LAN probing. Supported interfaces, protocol defaults, and scan budgets MUST remain owned by the discovery implementation rather than a second configuration registry.
- Progress reports MUST distinguish implemented discovery, the profile-installed vLLM connector, and [hardening checks](../packages/maximal-core/src/lib/model-exposure/hardening.ts) from the unimplemented operational Connect/Use host and UI, authenticated inspector collector, and sharing endpoints.
- Simulated HTTP and renderer tests MUST NOT count as live LAN or desktop acceptance. The Core socket harness MUST NOT count as evidence that a concrete discovery host found a real service.
- Perun's successful synthetic vLLM gateway check MUST NOT count as managed setup, standing connectivity, or serving isolation approval.
- Perun exposure approval MUST remain blocked until privileged worker containment and authenticated, current inspection evidence pass the exposure review. Inference-proxy hardening MUST NOT substitute for worker containment.
- viy SSH access and credential changes MUST remain deferred until explicitly resumed by the user.

### External-selector preparation

- External selectors MUST opt in to the versioned [Maximal model-list contract](../packages/maximal-core-contract/src/model-list.ts) through `GET /v1/models?format=maximal`; the standard OpenAI and Anthropic projections MUST remain compatible.
- Consumers MUST retain `(source, provider, id)` identity and the returned proxy-relative route. Duplicate served aliases across providers MUST NOT be collapsed. A null route MUST NOT be offered as selectable.
- Consumers MUST distinguish declared target location, availability, and lifecycle from model-list reachability. An empty target list or null limit/capability MUST remain unknown; fetching inventory MUST NOT imply a loaded model or serving-isolation approval.
- Selector progress reports MUST distinguish the [Core projection](../packages/maximal-core/src/routes/models/selector-catalog.ts) and simulated routing tests from a working Pi extension or live-host acceptance.
- The Pi integration MUST consume this model list through its dynamic provider refresh API, reuse a supported streaming implementation, and keep classifier-only offerings out of the chat selector. It MUST NOT send prompts or upstream credentials during catalog refresh, invent missing limits or prices, or write external-client configuration automatically.
- Unreviewed metadata-discovery results MUST remain outside the configured model list. Reviewed Connect/Use and live discovery acceptance MUST remain gated by the ordered work below.

### Pi CLI checkpoint

- The [Pi bridge and CLI workflow](../packages/maximal-configurators/README.md) MUST consume only configured Maximal inventory. Operators MUST select a reviewed proxy destination explicitly; the bridge MUST NOT turn discovery results into connections or change host policy.
- The bridge MUST register provider-qualified groups through Pi's config-form provider API, use native `refreshModels` for existing groups, and expose an explicit metadata-only refresh for group reconciliation. Missing limits, pricing outside an explicitly defined zero-charge policy, and unsupported chat operations MUST remain skipped with reasons.
- Reports MUST identify the isolated [Pi/Core socket smoke](../packages/maximal-configurators/scripts/pi-smoke.mjs) separately from live-provider acceptance. Its Messages text, Unicode, streamed tool-call/replay, duplicate-alias routing, and unavailable-proxy checks MUST NOT count as native Connect consent, production runtime validation, live LAN discovery, or desktop acceptance.
- Responses and Chat Completions projections MUST NOT be described as live-provider verified solely because their metadata tests pass.
- Desktop UX MUST remain deferred independently of this CLI checkpoint and the operational Connect/Use host requirements below.

### 2026-11-05 machine-local validation checkpoint

- Progress reports MUST distinguish committed selector/catalog work through `487f075` from the uncommitted device-listener discovery, session attachment, local provider grouping, and zero-price changes present during this checkpoint.
- Reports MUST record the cache-disabled affected native run as 109 successful tasks, including 38 configurator tests and 76 model lifecycle/discovery tests; this result MUST NOT imply that every workspace test or live-provider path executed.
- Reports MUST distinguish the installed Pi 1.5.0/Core smoke with synthetic inference upstreams from the operator-approved live Mavka connection below.
- Live-connection reports MUST identify `nvidia/Cosmos3-Edge` on Mavka's existing vLLM deployment, with 4,096 context tokens and a reviewed 1,024-token output cap, as one configured offering rather than discovery of every model on the machine.
- Reports MUST identify the operator's native Pi approval, persisted connection receipt, and successful HTTP 200 inference verification separately from subsequent metadata-only catalog and selector checks.
- Reports MUST record the observed live catalog and Pi available registry as containing `maximal-local.provider-vllm-device` with zero input, output, cache-read, and cache-write prices.
- Reports MUST NOT infer Ready, verified capabilities, or serving isolation from this connection: the catalog still reports unknown target availability/lifecycle and unknown capabilities.
- The machine-local `/maximal-connect-local` repair MUST be described as an excluded local extension change, not a shipped configurator feature. Its Node review worker avoids Pi's reproduced `graceful-fs` resolution failure before native confirmation; this workaround MUST NOT be treated as the trusted product host required below.
- Regression evidence for that workaround MUST distinguish six temporary simulated worker checks from real Pi confirmation rendering and Escape cancellation with unchanged configuration; synthetic approval tests MUST NOT count as real operator approval.
- Consumers MUST distinguish Maximal's authoritative offering inventory and display names from Pi's user-owned `enabledModels` scope. Reports MUST record that the observed `maximal/*` scope hid the separate local group, while switching `/model` to **all** with Tab exposed Cosmos.
- A broader local/studio scope MUST require an explicit client-side choice; the bridge MUST NOT silently change saved scope or defaults.
- Stronger device/provider display labels MUST remain proposed until changed at the authoritative metadata owner; the observed model label remains `Cosmos3-Edge (local)`.
- This checkpoint MUST NOT count as managed provisioning, complete product Connect/Use, live multi-user/LAN acceptance, sandbox inspection, or authorization to share Mavka's workstation.

### Reviewed-connection control checkpoint

- The versioned [connection records](../packages/maximal-core-contract/src/model-connection.ts) and Core [review/commit controller](../packages/maximal-core/src/lib/model-connections/control.ts) MUST remain distinct from a working product Connect/Use feature.
- Hosts MUST provide the [trusted authority](../packages/maximal-core/src/lib/model-connections/authority.ts) before `modelConnections/act` reports available. The default desktop and standalone compositions MUST report unsupported until their installed-runtime reader, destination-scoped credential reader, native consent, and atomic persistence implementation exist.
- A review MUST bind discovery and deployment identity/revision, the exact endpoint, runner, installed runtime content, served IDs/target IDs, explicit execution location, supported operations, credential destination/reference, provider mode, policy revision, and evidence expiry. Renderer approval flags, discovered-server self-reports, and agent-supplied bindings MUST NOT authorize a connection.
- The host MUST obtain consent outside the agent without holding the deployment lock, then reread and compare the complete binding under that lock immediately before credential release and persistence. Persistence MUST preserve unrelated settings and advance the authoritative revision before releasing the lock.
- Commit attempts MUST invalidate the selector inventory cache, including uncertain outcomes. In-flight older inventory requests MUST NOT repopulate or clear a newer cache generation. Failed or uncertain commits MUST NOT retry automatically; cancellation MUST NOT claim to undo an in-progress atomic commit.
- Reports MUST label the injected-host transaction, consent, and selector tests as simulated evidence. They MUST NOT count as native user consent, production profile persistence, live LAN acceptance, or Pi selector integration.
- Before exposing a product Connect action, desktop MUST implement and review the trusted host authority and native review presentation, then wire the shared client query/action surface to it. This checkpoint MUST NOT be reported as completing item 2 below.

### Remaining Phase 1 work, in implementation order

1. **Discovery acceptance on real hosts.** Desktop and live LAN acceptance MUST exercise this-device defaults, explicit interface selection, refresh, cancellation, authentication-required endpoints, and unchanged existing providers. Non-default and unsupported endpoints MUST retain a reviewed manual fallback. Discovery completeness MUST NOT be inferred from the bounded scan finishing.
2. **Reviewed Connect/Use for existing deployments.** A review MUST bind the selected endpoint, runtime, deployment identity, served model IDs, explicit execution location, supported operations, and credential reference before persisting a connection. Credential release MUST require approval for that destination. LAN consumption MUST use authenticated, encrypted transport. Connecting MUST NOT install adapters, silently switch legacy provider mode, or enable publication or sharing.
3. **Device advisor and verified inventory.** Inventory MUST combine configured stores and runtimes with the bounded supported-service inventory from section 1.2.1. Assessment MUST compute Fits, Constrained, Unsupported, or Unknown from variant-specific requirements and observed resources. Unified memory MUST count once. Reviewers MUST settle whether Unknown assessments permit setup before enabling that action; the current helper permits them.
4. **One reviewed local execution path.** The managed-setup slice MUST select one pinned local text or System-1 model and runtime. Setup MUST resolve references through the existing registry and reviewed runtime packages, rather than treating candidate metadata as authority. Model files MUST pass the registry's verification path before activation.
5. **Trusted setup control and consent.** Core MUST add plan, consent, run, read, cancel, and connection-descriptor operations with explicit feature/version negotiation. The control layer MUST obtain real consent outside the agent, keep authoritative plan and approval state, and re-check eligibility and policy before side effects. Legacy `ensure` MUST use the same consent gate. Older sidecars MUST report unsupported.
6. **Execution lifecycle and recovery.** Operations MUST publish monotonically revisioned snapshots. Cancellation and failure MUST affect only resources started by that operation. Recovery MUST preserve unrelated settings and report a reason and next step. Lifecycle and health MUST remain distinct from the registry's downloaded-and-verified state.
7. **Routing and external use.** Device-only constraints MUST hold across dispatch, retry, and fallback. An explicit model choice MUST remain unchanged. Connection descriptors MUST describe only the target's supported operations and refer to credentials without including their values. One external-client example MUST exercise the selected local path.
8. **Agent and product surfaces.** Typed harness tools MUST call the trusted control layer. Gallery cards, model pages, and Settings MUST share the product client's queries and revision handling. First-run setup MUST work without frontier-provider sign-in. Contact and feedback slots MUST stay empty as specified for Phase 1.
9. **Phase 1 acceptance.** Verification MUST cover the full setup-to-external-use path, unsupported-device rejection, consent bypass attempts, corrupt artifacts, cancellation/recovery, and device-only retry/fallback. Real-hardware results MUST be reported separately from contract tests, following the workflow in section 11.

### Controlled exposure and later hosts

- An authenticated inspector collector MUST bind evidence to the current worker, runtime, artifacts, serving configuration, and ingress/egress policies before sharing endpoints use the existing hardening gate.
- Sharing controls MUST enforce ownership, organization policy, user consent, and evidence freshness at each action; a passing report alone MUST NOT authorize exposure.
- Perun worker migration MUST require privileged operator access; proxy-only changes MUST NOT be reported as completing that migration.
- Domovyk and Iskra MUST receive separate deployment identities and transport/access reviews before cluster consumption or publication is enabled.

The GLiNER runner's standalone CPU and CUDA demo runs are external-runtime evidence only. They MUST NOT be counted as Maximal end-to-end setup acceptance or promoted into general performance estimates.

Phases 2–4 remain scoped by section 10 and gated by the applicable decisions in section 12. Stage 1 does not authorize directory, sharing, telemetry, or media work ahead of those decisions.

## 14. Studio model-access implementation plan

### Authority and presentation

- Maximal SHOULD be the studio's authoritative model-access gateway; Pi and other external clients SHOULD consume its authorized inventory rather than maintain duplicate offering lists.
- Catalog contracts SHOULD describe an offering separately from model/artifact identity and deployment identity.
- Catalog contracts SHOULD carry owner/device identity, caller-relative execution location, allowed operations, accounting policy, and evidence freshness as structured metadata rather than encode those facts only in display names.
- Device and owner metadata MUST be filtered by the caller's authorization before publication to a client.
- Display labels SHOULD distinguish **This device**, **Studio device**, and **External service**; a teammate's workstation MUST NOT be labeled as the caller's local device merely because both use a loopback gateway.
- Studio accounting policy MUST distinguish a zero consumer usage charge from physical operating costs; the present Pi local zero-price projection MUST NOT define future billing authority.
- A display-name change MUST preserve offering identity and proxy routing.

### Enrollment and transport decisions

- Reviewers SHOULD prefer explicit device enrollment and opt-in service publication over general LAN scanning as the studio trust mechanism.
- Enrollment MUST establish a distinct, revocable device identity before a directory accepts its publications.
- Reviewers SHOULD evaluate outbound authenticated device tunnels as the initial connectivity design; raw runtime ports SHOULD NOT be exposed directly to the studio network.
- A relay design MUST specify whether the relay terminates encryption and can inspect inference payloads.
- Directory metadata storage MUST remain separate from inference payload transport.
- Credential issuance MUST scope short-lived grants to the caller, serving destination, share, and permitted operations.
- The owner-side gateway MUST enforce each request's grant independently of directory visibility and cached client inventory.
- Offline behavior MUST define grant expiry and revocation freshness before cached authorization is permitted.

### Privacy and threat-model decisions

- Reviewers MUST assess hostile clients/model runtimes and a potentially inspecting hardware owner as separate threats.
- Confidentiality claims MUST account for a workstation administrator's ability to inspect data processed on that machine; TLS and worker containers MUST NOT be presented as protection from that administrator.
- Project routing policy SHOULD distinguish this-device-only, approved studio infrastructure, approved teammate workstations, and approved external services.
- Personal-workstation eligibility MUST depend on the request's data classification and approved destination policy, including retries and fallbacks under section 5.
- Worker containment and inspection MUST satisfy section 6.4; a GPU container MUST NOT be promoted into a VM/device isolation guarantee.
- Runtime logging, retention, prompt caches, and cross-tenant KV-cache behavior MUST receive an explicit privacy review before multi-user service acceptance.
- Model-generated tool calls MUST remain subject to the consuming agent's independent authorization and execution sandbox.

### Sharing lifecycle decisions

- Share reviews SHOULD expose audience, expiry, concurrency/resource limits, and owner-use pause behavior before publication.
- Reviewers SHOULD distinguish **Stop sharing**, which rejects new requests and may drain bounded work, from **Revoke access**, which terminates affected active requests and streams.
- Active-job behavior on share expiry, owner pause, and security revocation MUST be settled under section 12 before rollout; these suggested lifecycle choices MUST NOT be reported as implemented behavior.
- Operational audit records SHOULD capture caller/share identity, authorization outcome, target, timing, and resource usage without prompt or response content.
- Publication and renewal MUST retain the ownership, organization policy, consent, and authenticated current-inspection gates in sections 4–6.

### Bounded studio service-access pilot (proposed)

- The pilot MUST require organization and operator approval of a pilot decision record before implementation.
- Recipient access MUST remain disabled until the Phase 1 end-to-end gate in section 10 passes.
- The approved decision record MUST resolve the applicable section 12 decisions explicitly for the bounded pilot scope.
- Pilot completion MUST NOT be reported as completing a section 10 phase.
- Pilot-specific decisions MUST NOT be reported as resolving section 12 for general rollout.
- The pilot SHOULD serve one approved existing text-model deployment on one dedicated studio worker.
- The pilot MUST NOT use personal workstations as serving targets.
- The Mavka machine-local connection MUST NOT count as studio-pilot acceptance evidence.
- Pi SHOULD be the first pilot client.
- Pilot access MUST be limited to a small invited group named in the decision record.
- The pilot MUST exclude artifact distribution, automatic model provisioning, public listings, contact listings, and section 7.2 usage sharing.
- The pilot inventory MUST NOT be described as the section 4 organization directory.
- Pilot inventory publication MUST retain section 4's authorization, signing, expiry, revocation, and explicit publication-consent requirements.

The pilot decision record MUST settle each of these decision groups before implementation:

- service and inventory ownership, hosting, and the trusted Connect/Use host composition for recipient and headless-worker consent;
- model/license approval, permitted operations, allowed request data classes, destination policy, and policy precedence;
- corporate identity, revocable device identity, trust roots, version negotiation, and unsupported-client behavior;
- encrypted transport, relay payload visibility, credential issuance, enforcement-point placement, and grant-holder location;
- share audience, expiry, quotas, operator pause, bounded stop/drain behavior, and termination of active requests and streams on security revocation;
- offline grant expiry, revocation freshness, participant removal, and pilot teardown;
- runtime privacy-review results, operational audit access/retention, and measurable acceptance criteria.

- Pilot connectivity MUST NOT expose raw runtime ports to recipients.
- Pilot authentication MUST NOT use shared long-lived keys.
- Opening or renewing a tunnel that enables inference ingress MUST invoke the section 6.4 hardening precondition under its deployment lifecycle lock.
- Pi MUST reach pilot offerings through the recipient's Maximal proxy.
- A relay that can inspect inference payloads MUST be an approved destination under section 5's full-payload policy.
- Studio grants MUST NOT be written into Pi configuration.
- Recipient destination approval MUST use the trusted Connect/Use consent boundary in section 13 rather than model selection in Pi.
- Pilot dispatch and retries MUST enforce the full-payload destination policy in section 5 before data leaves the recipient's device.
- Retries MUST re-check the request's grant.
- The owner-side gateway MUST reject revoked grants for new requests even when clients retain cached inventory.
- The owner-side gateway MUST reject new requests when it cannot establish current revocation state.
- Denied, stale, offline, expired, busy, and revoked outcomes MUST remain distinguishable to the recipient.
- These outcomes MUST NOT trigger fallback to another target during the pilot.
- Pilot audit records MUST remain separate from section 7.2 usage sharing.

### Pilot delivery order and acceptance gates

1. **Approve the bounded pilot.** Reviewers MUST approve the decision record above before pilot implementation.
2. **Finish supported Connect/Use.** The machine-local Pi consent/runtime workaround MUST be replaced with the trusted product host and package-owned regression coverage described in section 13.
3. **Establish trusted worker inspection.** Publication MUST remain blocked until the authenticated collector binds current worker/runtime/artifact and network-policy evidence to the deployment lifecycle gate in section 6.4.
4. **Implement enrollment and protected transport.** The pilot MUST implement the enrollment, transport, and request-authorization requirements above against the inspected worker.
5. **Implement sharing controls.** The pilot MUST implement the decision record's audience, expiry, quota, operator-pause, stop, and revocation behavior.
6. **Make authorized inventory usable.** The shared contracts and metadata owners MUST supply the authorization-filtered offering identities and caller-relative labels specified above.
7. **Exercise real multi-user and adversarial acceptance.** Acceptance MUST cover hidden restricted metadata, direct unauthorized inference, credential misdelivery, stale grants/listings, expiry and revocation during streaming, resource exhaustion, runtime filesystem/network escape attempts, and independent agent-tool authorization.
8. **Consider workstation publication separately.** Personal sharing MUST remain deferred until the dedicated-worker security review and the workstation-specific gates in sections 5–6 pass.

- Offering-identity and label work MAY proceed before enrollment implementation.
- Invited-recipient access MUST remain disabled until steps 1–7 pass.
- Step 7 MUST use approved test identities and synthetic data before invited-recipient access is enabled.
- Recipient access MUST remain disabled until the runtime privacy review above passes for the pilot deployment.
- Supported Connect/Use acceptance MUST include real native approval, cancellation without configuration changes, and atomic persistence preserving unrelated settings.
- Machine-specific paths and approval receipts MUST NOT enter shipped integration code.
- Clients MUST preserve unknown availability and isolation rather than turn successful catalog fetches into readiness claims.
- Pi scope changes MUST retain the explicit client-side choice required in section 13.
- The proposed owner flow SHOULD expose inspection results before a separate share review and confirmation.
- The proposed recipient flow SHOULD present execution location and data restrictions before destination approval and explicit model selection.
- Reports MUST NOT describe these participant flows as operational before real multi-user acceptance.
- Each delivery report MUST separate implemented contracts, simulated tests, real-device acceptance, and unresolved decisions.
- This plan MUST NOT authorize opening ingress, changing an active worker's sandbox, enrolling a device, or enabling sharing without the corresponding operator and organization approvals.
