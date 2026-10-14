# Proposal: agent-led local model exploration

This proposal explores how Maximal could help people find, set up, and manage local models, then connect to them through its proxy or a supported adapter.

People should be able to use these models from other apps and scripts without having to view generated results in Maximal. Discovery should extend beyond general chat to image, video, 3D, audio, vision, and quick classification or decision-making. They should be able to explore these uses without first setting up the corporate frontier LLMs they already have access to.

## 1. Experience and interaction

### 1.1 Exploration gallery

The client shows experience cards separately from model selection, so people start from what they want to do rather than from a model name. The first screen shows up to four cards and an **Explore more** action. The cards should cover different kinds of work, such as image, video, 3D, audio, vision, and quick classification or decision-making, rather than just the most popular models. Each card has a title, a one-sentence outcome, a device-fit label, and a select action. A card may also include a reviewed example image.

Selecting a card starts a guided discovery conversation. It does not download or configure anything. The agent asks only the questions that change which models fit, and it asks permission before looking at any documents or repositories. The gallery must not suggest that Maximal has an editor or result viewer. Results go to the user's own apps and scripts.

### 1.2 Guided flow

Selecting an experience starts this sequence:

1. Capture the selected experience and relevant constraints.
2. Discover device capabilities and installed, authorized runtimes.
3. Query authorized catalogue and corporate directory sources.
4. Present a small, evidence-backed model shortlist.
5. Obtain required approval for provisioning or configuration.
6. Provision and validate the selected model and runtime.
7. Provide connection details for the user's application or script.
8. Offer optional, bounded calibration, which is not treated as a quality verdict.

Inventory stays within configured model stores and supported runtime APIs. It never scans arbitrary filesystem roots or network ranges. Setup uses typed, validated operations only, never arbitrary shell commands or unreviewed scripts. Finding an eligible model that is already installed should happen automatically.

Before any download, the user sees the artifact size, destination, and source. Standing download consent may be granted, but only within explicit resource limits. Installing a runtime, publishing an endpoint, and changing where data may go each need their own separate approval. The agent never changes usage-sharing consent. Configuration is idempotent and leaves unrelated settings alone. If setup fails, the user can recover without being left with a half-running service.

### 1.3 Model selection cards

A shortlist shows at most three model cards. Each card names the exact model variant and shows its capability, where it runs, device fit, and a performance estimate or an explicit "unknown." It also shows download size when relevant and one primary action. Remote execution and any consent requirement are always disclosed on the card. Cards link to a dedicated model page and stay brief, so they omit full benchmark tables, provenance chains, and long descriptions.

The primary action is **Set up**, **Connect**, or **Unavailable**. Different variants never merge into one actionable item. The agent emits structured card data, not arbitrary HTML, and chat and directory browsing use the same renderer. Cards must work with the keyboard and expose their status as text.

### 1.4 Dedicated model page

The model page shows:

- exact model, artifact, quantization, and supported runtime identities;
- supported operations and external-client protocols;
- model and deployment approval scope;
- license, provenance, and artifact integrity information;
- hardware requirements and performance evidence;
- known limitations and setup requirements;
- authorized deployments with status and observation freshness;
- connection instructions and an explicit **Give feedback** action.

Connection instructions name the protocol and the operations it supports. They never claim OpenAI or Anthropic compatibility for image, video, 3D, or other operations those APIs don't cover. Credentials never appear in URLs or example requests. Capability-specific adapters may expose their own APIs when standard proxy operations can't represent the workload.

## 2. Recommendation evidence and authority

Eligibility is checked before ranking. A model is eligible only if policy, license terms, supported operations, runtime compatibility, and resource limits all allow it. Among eligible models, recommendations combine catalogue data, runtime status, evaluations, aggregate performance, and voluntary feedback.

Missing evidence stays unknown. It is never treated as a negative result. Public model cards and community feedback are untrusted data. They can inform a recommendation, but they cannot become agent instructions or authorize anything. Catalogue descriptions never override what the runtime actually reports.

Approval comes from organization policy, not from a recommendation score. Ranking does not treat speed, popularity, repeat use, or request success as quality, and feedback and usage data have capped influence. Each recommendation keeps its source, revision, observation time, and confidence. The agent explains the main selection factors in plain language, and users can pick another eligible candidate. When the evidence supports it, the shortlist offers a balanced, a lightweight, and a higher-capability option. Real requests are never sent to other models for hidden comparison.

## 3. Device fit and performance expectations

### 3.1 Compatibility

Each candidate is marked **Fits**, **Constrained**, **Unsupported**, or **Unknown**. The check considers usable memory, storage, accelerator support, runtime version, model variant, and workload preset. Unified memory is counted once, not as both RAM and VRAM. Device specifications are not proof of the capacity that is free right now. Unsupported candidates offer no local setup action. A slow but workable experience may stay discoverable with a clear warning.

### 3.2 Estimates

Performance is expressed in units that make sense for the experience, and each estimate names the workload preset it assumes. Download, cold load, queue wait, and warm execution time are shown separately. Cards show the most relevant execution range and a resource-impact label.

Each figure is labeled **Measured here**, **Similar hardware**, or **Estimate**. Details show sample freshness, cohort size where it can be published, and confidence. When evidence is thin, the card shows unknown rather than an invented timing. Estimates depend on model variant, runtime, acceleration backend, and settings. Synthetic and real-workload measurements stay separate, and outliers or failed runs are never dropped to make speeds look better.

Experience metrics:

| Experience | Metric and required workload qualifier |
| --- | --- |
| Image | Time per image; resolution, batch size, and generation preset |
| Video | Time per clip; duration, resolution, frame count, and preset |
| 3D | Time to draft asset; input type and output representation |
| System-1 | Latency or throughput; input size and batch size |
| Audio | Processing time relative to input duration; task and preset |

### 3.3 Calibration

Calibration is optional, bounded, cancellable, and discloses the resources it uses. It runs reviewed synthetic inputs with conservative device presets, and it measures only technical compatibility and performance. It says nothing about output quality or user satisfaction, and it never triggers a feedback prompt. Calibration results stay useful locally even when usage sharing is off.

## 4. Organization directory and availability

Corporate discovery uses an organization directory that an admin configures explicitly. Users sign in with corporate identity, and the directory returns only the entries that person is authorized to see. Inference endpoints check authorization again on their own. Directory access alone is never enough.

Directory metadata is versioned and signed, and it has a defined expiry and revocation policy. The directory never receives inference inputs or outputs. Browsing it never loads a model or wakes a device. Health reports come only from authenticated, authorized reporters, and clients never publish their private inventory automatically.

Model identity, immutable artifact identity, and deployment identity stay distinct. Each deployment declares its owner, location, model binding, supported operations, access policy, retention policy, and allowed data classes. Its health includes an observation time and an expiry. Stale health shows **Unknown / stale** and never keeps an unqualified **Ready** label. A directory outage must not mark observed local models as unavailable. Revoked or expired authorization blocks new remote requests. Cached descriptions may stay browsable, labeled as stale.

The UI derives display states from separate facts: lifecycle, reachability, whether the model is loaded, capacity, and freshness.

| Display state | Required meaning |
| --- | --- |
| Ready | Model loaded, service healthy, accepting requests |
| Available · needs loading | Service healthy; model can be loaded |
| Busy | Service healthy; admission capacity constrained |
| Installed · stopped | Installation known; runtime stopped |
| Unavailable | Fresh observation establishes failure |
| Unknown / stale | Evidence missing or expired |

## 5. Local-first routing

Users get a simple **Local first** toggle. It means a preference for running on this device, not on the corporate network. **Device only** is a separate, hard constraint. Routing preferences can be scoped to an experience, scenario, model, or session, but a narrower preference never weakens a privacy or organization rule.

Routing checks eligibility first, then task fit, capacity, performance, and preferences. A device-only request fails explicitly if no eligible local target exists. Falling back to corporate infrastructure requires an allowed data destination and an applicable user policy. Local-first routing never silently introduces an external provider. Retries and failover re-check policy against the full payload being sent.

Active conversations and jobs keep their selected target where possible. Running jobs don't move to another target unless the adapter explicitly supports it. Users can see which target was chosen and why. Clients can request an explicit target or a hard device-only constraint. A client-supplied model identifier is never silently replaced with an unrelated model. Every side-effecting tool enforces the task's destination policy on its own. Device-only inference doesn't prove that external tools are private.

## 6. Provisioning and sharing

### 6.1 Artifacts and runtimes

Downloads use reviewed, immutable revisions and content hashes. Corporate deployments can point at an approved internal artifact mirror. Files go to staging, pass integrity verification, and only then activate atomically. Interrupted downloads resume safely where possible. Users see progress, can cancel, and get storage checks and cleanup.

Model downloads never execute model-supplied code or install runtime plugins implicitly. Runtimes install through a separate, reviewed, pinned path. Passing an integrity check doesn't mean a model is safe or approved for licensing.

### 6.2 Publishing

Publishing an artifact and publishing an inference service are separate workflows. Each needs an accountable owner and an explicit access scope. Uploaded artifacts go through quarantine, provenance, license, and policy review. Fine-tuned models are checked for exposure of sensitive training data.

Shared services enforce TLS, authentication, authorization, quotas, and resource limits. Publishing a service never exposes shell, filesystem, browser, or agent-tool access. Managed team services come before personal workstation sharing. Workstation sharing stays off unless the organization separately approves it. When it is built, it must be opt-in, visibly active, time-limited, and revocable at any time.

## 7. Feedback and optional usage sharing

### 7.1 Feedback

Users start feedback themselves, from the model page. Maximal never asks for a verdict after calibration, and it never guesses when someone has viewed a result. The form offers four categories: worked well, setup or compatibility issue, too slow, and output-quality issue. Feedback names the model variant and runtime when known.

Users choose whether to attach hardware or diagnostic measurements. Comments are optional, and the form warns against including confidential content. The form states who will see the feedback and how long it is kept. Private, organization-visible, and public feedback are separate scopes, and going public requires its own explicit consent. Moderators treat comments as untrusted content.

### 7.2 Usage sharing

Usage sharing is a separate setting, off by default. It describes which payload fields are sent, where they go, why, and how long they are kept. Users can inspect a representative payload before opting in, and they can turn sharing off at any time. Turning it off also discards pending uploads. Sharing never changes access to approved models or local recommendations.

Contributions are described as de-identified, not anonymous, unless a privacy review establishes a defensible anonymity guarantee. Only observable Maximal runtime and proxy operations are measured. Direct use outside that path is not observed.

Permitted contribution fields are limited to reviewed operational data:

- model variant, runtime version, and acceleration backend;
- coarse hardware/memory class and workload-setting buckets;
- load time, queue wait, execution duration, and modality-specific throughput;
- coarse resource peaks where observable;
- success, cancellation, or bounded error category;
- experience category and aggregate usage counts.

Contributions never include:

- prompts, responses, generated media, or request/response bodies;
- filenames, repository names, document contents, or tool arguments;
- credentials, user or device names, serial numbers, or arbitrary endpoint URLs;
- exact usage timestamps or stable cross-session analytics identifiers.

Aggregation suppresses cohorts below a privacy-reviewed minimum size, and fine-grained hardware combinations can't bypass that suppression. Collection and aggregation have rate limits and abuse controls. Authentication and transport logs have their own access and retention rules. Omitting user identifiers doesn't make data anonymous. Successful operations and repeat use are never relabeled as satisfaction, and security auditing stays separate from optional recommendation telemetry.

## 8. Privacy and compliance

Organization policy decides which artifacts, runtimes, destinations, and data classes are approved. Enforcement is deterministic and does not depend on the agent's reasoning. Managed policy stays separate from user preferences, and being on the corporate network is never treated as authorization.

Endpoint credentials are bound to an approved endpoint identity. Redirects and endpoint changes never forward credentials to an unapproved destination. Directory connections and artifact fetches enforce destination and redirect rules. Request and response content is excluded from exploration telemetry and logs. Where exploration traffic flows through existing traffic observability, that system's content-retention policy applies. It isn't assumed to be content-free. Runtime events follow [the workspace logging requirement](../CHURN.md).

Revoking approval blocks new activations and new requests. How active jobs are cancelled and how installed artifacts are quarantined on revocation must be defined by organization policy before rollout. The first release must be reviewed for metadata leakage, credential forwarding, untrusted manifests, artifact execution, feedback injection, and telemetry re-identification.

## 9. Contract evolution and ownership

The implementation extends existing identities rather than creating a competing registry. Each area has one owner:

- [Model contracts](../packages/maximal-model-contract/src/index.ts) own shared
  execution-target, operation, evidence, and runtime-neutral discovery contracts.
- [Model catalogue](../packages/maximal-model-catalog/README.md) owns trusted
  descriptive catalogue consumption and reconciliation.
- [Local registry](../packages/local-model-registry/src/types.ts) owns artifact
  registration, provisioning, and runtime assignment.
- `packages/maximal-models` owns provider activation and gateway integration.
- Runtime packages own execution, resource control, and worker lifecycle.
- `packages/maximal-client` owns the gallery, recommendation cards, model pages,
  and sidecar-backed product queries.
- `packages/maximal-settings` owns typed preferences and managed-policy settings.
- `apps/desktop` owns validated host adapters, preload wiring, and application
  composition.
- `packages/maximal-harness` owns conversational orchestration through approved
  tools.

The directory service must be deployable independently of the desktop client. Its package placement, and that of the recommendation engine, needs approval before implementation. Policy authority never lives in renderer state.

Versioned contracts cover:

- experience definitions and bounded starter presets;
- model, artifact, and deployment identities and approval references;
- device assessment with fit state and evidence;
- performance observations and qualified aggregate estimates;
- structured recommendation cards and reasons;
- directory health, expiry, and revocation;
- plan, approve, provision, configure, validate, connect, and cancel operations;
- routing constraints and selected-target reports;
- optional telemetry and explicit feedback submissions.

New media operations need explicit request, result, cancellation, and progress shapes. Long-running media adapters declare their job lifecycle and how results are retrieved. 3D output gets its own representation rather than being labeled as text or image. Contracts distinguish a model's intrinsic limits from the runtime's effective limits. Existing text and System-1 clients keep working through version negotiation. Unsupported operations fail explicitly and are never silently translated. Runtime behavior is documented in code when implemented.

## 10. Phased delivery

### Phase 1: foundations and device advisor

Structured experience and model cards, typed agent setup tools, bounded local inventory, device assessment, and explicit-target connection instructions. This phase also includes local-first and device-only constraints, and a model-page feedback entry point with no automated prompts. Optional usage collection stays disabled until its privacy controls are reviewed.

### Phase 2: corporate discovery and performance evidence

SSO-filtered directory access, authenticated deployment health, stale-state handling, approved mirrors, and revocation tests. It also includes qualified performance estimates, optional local calibration, and opt-in de-identified contributions with cohort suppression.

### Phase 3: exploration pilot

The pilot covers System-1, image generation, and one heavier video or 3D experience. Each pilot experience has a supported runtime or adapter, an external-client example, a conservative preset, and realistic timing evidence. Marketing and actionable gallery entries wait until a supported execution path exists.

### Phase 4: controlled publication

Artifact nomination and managed-service registration as separate steps. Personal workstation sharing needs a separate security and operations approval.

## 11. Acceptance criteria

Implementation is complete when these facts are established:

1. A user can choose an experience and configure an eligible model without manual endpoint editing or mandatory frontier-chat onboarding.
2. Conversation and directory cards render the same structured candidate identity.
3. An unsupported device cannot start local provisioning from a recommendation.
4. A weak evidence set produces an explicit unknown estimate rather than fabricated speed.
5. Card timing refers to the chosen model variant, runtime, and workload preset.
6. A stopped deployment cannot display Ready; expired health displays Unknown / stale.
7. Directory browsing neither starts a runtime nor broadcasts private device inventory.
8. An external client can invoke the pilot operation and retrieve results outside Maximal.
9. A device-only request cannot cross a network inference boundary through retry or fallback.
10. Explicit model selection cannot silently substitute another model.
11. Unauthorized users cannot discover restricted deployments or invoke their endpoints.
12. Revocation blocks new remote requests despite cached directory entries.
13. Corrupt artifacts and unapproved runtime code cannot activate.
14. Interrupted setup is recoverable and preserves unrelated settings.
15. Calibration neither prompts for feedback nor labels technical success as quality.
16. Feedback is voluntary, model-page initiated, and scoped to a disclosed audience.
17. Disabled sharing emits no recommendation telemetry; opt-out removes queued uploads.
18. Contribution schemas reject content, credentials, exact timestamps, and stable identifiers.
19. Small hardware cohorts cannot expose aggregate statistics.
20. Metadata injection and endpoint redirects cannot change policy or leak credentials.

Testing follows [the existing tiered workflow](testing-in-docker.md). UI evidence covers compact cards, keyboard selection, stale states, and unknown estimates. Release evidence separates contract tests from real runtime and hardware verification.

## 12. Decisions required before implementation

Reviewers need to resolve and record:

- directory and recommendation service ownership, and the initial hosting model;
- corporate identity integration and endpoint credential issuance;
- metadata trust roots, version negotiation, and offline authorization expiry;
- organization data classes and policy precedence;
- initial image and video/3D runtimes, their licenses, and supported hardware;
- non-text API and job contracts, and the pilot external clients;
- performance preset definitions, minimum cohort size, retention, and deletion policy;
- feedback audience, moderation, and access controls;
- resource and standing-consent limits, and how revocation applies to active jobs;
- whether local-first is enabled initially, and which scenarios get defaults.

Unresolved decisions are not filled in with defaults chosen by the agent.
