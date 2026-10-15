# Proposal: agent-led local model exploration

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

Maximal only looks in the model stores and runtimes it is set up to use. It never scans the whole disk or the network. Setup runs only fixed, checked steps, never arbitrary shell commands. Models that are already installed and allowed are found automatically. Before any download, the user sees the size, where it goes, and where it comes from.

### 1.3 Model selection cards

A shortlist shows at most three cards. Each card names the exact model variant and what it's good at, then says whether it runs on this device or elsewhere, whether it fits this device, how big the download is, and whether the user must approve anything first. Cards link to the model page for details. They also show up to two opted-in people who have loaded the model, with a **Contact** action, plus a count of any others.

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
- people who have loaded it and chose to be contacted;
- how to connect, and a **Give feedback** button.

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
- Core control: setup operations, extending the existing `localModels` methods.
- [Harness](../packages/maximal-harness/src/host/toolsets.ts): conversation tools, with consent enforced outside the agent.
- [Product client](../packages/maximal-client/src/shared/host.ts): gallery, cards, model pages, and Settings, sharing one set of queries.

Key rules:

- Each thing has its own ID: the model, the exact variant, the model files (by digest), the registry entry, the runtime target, the deployment, and each setup or inference operation. A display name is never an identity.
- New versioned records cover experience definitions, device assessments, candidates, setup plans, approvals, operations, and connection descriptors. They never hold secrets or executable commands.
- Setup reuses the registry's verification path and activates only reviewed, pinned runtime packages. A discovered model can't name executable code.
- Media output (image, video, 3D) needs its own operation types before any gallery action is enabled. A catalogue listing alone doesn't allow setup or connection.
- Core gets methods for plan, consent, run, read, cancel, and connection descriptors. The names are still open, so they aren't documented as existing APIs. The old `ensure` action must enforce the same approval.
- Older sidecars show the feature as unsupported. They never return an empty list that looks like success.
- The renderer ignores duplicate or older events by revision number.
- If setup fails or is cancelled, only the workers it started are stopped. Unrelated settings are left alone. Every error gives a short reason and a next step.
- External clients get a connection descriptor and manual steps. The agent never writes their config files.

## 10. Phased delivery

### Phase 1: foundations and device advisor

Structured cards and model pages, typed agent setup tools, bounded local inventory, device assessment, and connection instructions. This phase also adds local-first and device-only constraints and a manual feedback link. Usage sharing stays off until its privacy controls are reviewed.

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
