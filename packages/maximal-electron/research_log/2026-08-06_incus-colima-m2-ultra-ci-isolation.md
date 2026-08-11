# Research: Container/VM substrate for build/CI isolation on Apple Silicon M2 Ultra (Incus vs Docker vs UTM)
Started: 2026-08-06T13:47:17-07:00 | Status: complete | ended: 2026-08-06T14:40:00-07:00

## Problem
Host is macOS on an M2 Ultra, using colima to provide both Docker and Incus. User wants to know what container/VM substrate gives the most useful build/CI isolation and its hard limits, specifically evaluating Incus system containers, given nested virtualization is likely limited on Apple Silicon (M1/M2). Grounded against what maximal-core actually built (PR #91, a pinned Docker toolchain container) and the documented UTM Windows VM approach (issue #90, docs/dev/windows-vm-utm.md). Read-only research spike, no changes made.

## Awesome Lists Checked
Not a fruitful angle for this topic (hardware virtualization limits + one org's internal engineering decisions, not a library ecosystem). Substituted with first-party vendor docs (Apple Developer docs, colima.run, lima-vm.io, Incus/linuxcontainers.org) as the equivalent "pre-vetted" tier.

## Searches
1. "Apple Silicon nested virtualization M3 M4 Virtualization framework macOS 15" | fresh: none | findings: Apple's `isNestedVirtualizationSupported` API, UTM issue #6700, Eclectic Light explainer — all point to M3+ / macOS 15 requirement.
2. "colima Incus macOS system containers" | findings: colima's official runtime docs, linuxcontainers.org forum thread "Easy way to try Incus on macOS with Colima" (the origin of this feature).
3. "colima vz-rosetta linux binfmt x86_64 AVX2" | findings: colima issue #315 (AVX flags not honored under QEMU TCG), jms1.info walkthrough, Stockfish AVX2/Rosetta crash issue.
4. "github actions outage self-hosted runners control plane dispatch down" | fresh: pw (this week) | findings: confirmed a live Aug 6 2026 Actions incident, exactly matching the user's framing.
5. "self-hosted github actions runner Apple Silicon macOS arm64 setup" | findings: standard actions/runner install path, nothing Apple-Silicon-specific (it's just a launchd service).
6. "rosetta linux vm AVX2 illegal instruction ELF interpreter" | findings: no single authoritative Apple page enumerates supported ISA extensions in fetchable form; corroborated via Stockfish crash + QEMU TCG issue instead.
7. "Rosetta 2 does not support AVX AVX2 instructions translate" | findings: consistent secondary corroboration (HN threads referencing Apple statements), primary confirmation via empirical crash report (Stockfish #5707).
8. "incus launch --vm nested virtualization not supported error colima apple silicon" | findings: no additional detail beyond colima's own docs statement already captured.

## Sources

[1] Apple Developer — `isNestedVirtualizationSupported`
https://developer.apple.com/documentation/virtualization/vzgenericplatformconfiguration/isnestedvirtualizationsupported | 2026-08-06 | official docs | high
- Page body did not render via fetch (title only); treated as a pointer, not relied on directly for the chip-version claim. Corroborated instead via [2] and [3].

[2] Eclectic Light Co. — "How Sequoia changes virtualisation on Apple silicon"
https://eclecticlight.co/2024/06/17/how-sequoia-changes-virtualisation-on-apple-silicon/ | 2024-06-17 | independent technical blog, well-regarded in the macOS-internals community | high
- Nested virtualization requires **M3 or later**; explicitly *not* M1 or M2.
- Docs are ambiguous on whether this extends to macOS guests; nesting is documented for **Linux guests**, per the linked follow-up.
- Even on Ultra chips, Apple's simultaneous-macOS-VM licensing cap (2) is untouched by Sequoia.

[3] UTM GitHub issue #6700 — "Enable Nested Virtualization on Mac OS 15"
https://github.com/utmapp/UTM/issues/6700 | 2024-09-25, closed | maintainer-adjacent GitHub issue | high
- Direct quote: "Mac's Hypervisor.Framework supports nested virtualization starting with Mac OS 15.0 (Sequoia), if the host CPU is M3 or later." Confirms M1/M2 are excluded, not merely slower.

[4] linuxcontainers.org forum — "Easy way to try Incus on macOS with Colima"
https://discuss.linuxcontainers.org/t/easy-way-to-try-incus-on-macos-with-colima/21153 | thread active since Jul 2024 | primary source, author is the colima maintainer | high
- Mechanism: colima boots an Ubuntu VM (QEMU or Apple's VZ) with Incus preinstalled; the Incus unix socket is forwarded to macOS; the macOS Incus *client* talks to a Linux *server* over that socket. Incus itself only runs on Linux — "Incus requires a Linux system to work."
- Colima maintainer, on adoption: "I assume I'm pretty much the only user" — signals this is a niche/community feature, not something linuxcontainers.org or Incus upstream ships or supports directly.
- Original release: "Only containers are supported, no virtual machines" (VM support and host-bridge networking came later).
- Nested-virt gating explicitly called out: "Nested Virtualization is now supported on m3 Macs running macOS 15 or later" — i.e., pre-existing (M1/M2) hosts are containers-only for Incus.
- A container inside the Incus Linux VM reports the *VM's* kernel (Ubuntu), regardless of the container's own distro — normal shared-kernel container behavior, occasionally confusing.

[5] colima.run — "Runtimes" (official docs)
https://colima.run/docs/runtimes/ | current | official project docs | high
- Runtime comparison table: only Incus supports **system containers** and **VMs**; Docker/Containerd/Kubernetes runtimes are containers-only (OCI application containers).
- Direct quote: "Running Incus virtual machines requires nested virtualization. On Apple Silicon Macs, this feature is only available on M3 chips or newer." — i.e., on an M2 Ultra, `incus launch --vm` is a documented dead end for hardware-accelerated VMs.
- Incus lacks Compose-equivalent tooling and orchestration (no Swarm/Kubernetes-equivalent); its restore-after-crash path requires manual `incus admin recover` steps (unlike Docker/containerd's automatic recovery).

[6] Stockfish GitHub issue #5707
https://github.com/official-stockfish/Stockfish/issues/5707 | Dec 2024, closed not-planned | user bug report | medium
- Official x86-64-AVX2 macOS binary run via Rosetta on an M4 running macOS 15.1.1 crashes: `zsh: illegal hardware instruction`. No graceful fallback — hard SIGILL.
- Maintainers closed it as not-planned rather than a fixable bug on their end, i.e., treated as an inherent Rosetta limitation, not a Stockfish defect.

[7] colima GitHub issue #315 — "Enabling AVX instructions on x86_64 arch VM with colima on M1 Mac"
https://github.com/abiosoft/colima/issues/315 | opened Jun 2022, still open, no resolution | primary source | high
- Reporter passed `-cpu max,+avx,+avx2` explicitly to QEMU (confirmed in the actual invocation) and still got no `avx` flag in `/proc/cpuinfo` inside the VM.
- Cites a QEMU maintainer comment that QEMU advertising AVX2-capable CPU models under TCG "definitely looks like a bug."
- This is QEMU **software emulation (TCG)** on an ARM host, not Rosetta — a different mechanism, same practical result: no working AVX2.

[8] QEMU GitLab issue #844 — TCG x86_64-v3 ABI gap
https://gitlab.com/qemu-project/qemu/-/issues/844 | | QEMU project issue tracker | high
- Explicit, current-as-of-report statement: TCG does not implement `fma`, `f16c`, `avx`, or `avx2` CPUID bits — "the strict bare minimum TCG needs in order to satisfy x86_64-v3 is fma, f16c, avx and avx2 support" (not yet met at time of writing).
- Confirms AVX2 is a **known, tracked, unresolved gap in QEMU's software CPU emulation**, independent of host architecture — this is the mechanism colima's default `--vm-type qemu` path (or any x86_64-on-arm64 VM without Rosetta) relies on.

[9] Lima docs — "Intel-on-ARM and ARM-on-Intel"
https://lima-vm.io/docs/config/multi-arch/ | current | official docs (colima is built on Lima) | high
- Confirms Rosetta ("`--vz-rosetta`" in colima, `rosetta.enabled` in Lima) is "much faster than QEMU User Mode Emulation."
- Full-system emulation of a foreign architecture (i.e., no Rosetta, no user-mode QEMU) is called "extremely slow."
- Says nothing about AVX/AVX2 specifically — silence here is notable given Lima documents almost everything else about the Rosetta path in detail; combined with [6] and [7]/[8], the working assumption should be "AVX2 is not a instruction set either translation path reliably guarantees," not "undocumented but fine."

[10] blog.inoki.cc — "Things You Might Want to Know About Apple's Rosetta 2 for Linux VMs"
https://blog.inoki.cc/2026/02/28/Apple-Rosetta-Linux-VM-Secret-en/ | 2026-02-28 | independent technical blog, reverse-engineering detail | medium
- Confirms Rosetta intercepts and **hardcodes** the `/proc/cpuinfo` flags a translated Linux process sees — "not dynamically generated based on actual CPU information." The presence of `avx`/`avx2` strings inside the Rosetta binary itself does not mean translation of those instructions is implemented or correct; it's cosmetic CPUID reporting, not a guarantee.
- Reinforces: don't trust `/proc/cpuinfo` under Rosetta or QEMU as a signal of real support — test with an actual AVX2-using binary.

[11] jms1.info — "colima - x86 Containers on ARM"
https://jms1.info/linux/colima-arm-x86.html | | independent practitioner blog | medium
- Practical how-to for both QEMU and VZ+Rosetta x86_64 profiles; confirms `--cpu-type max` is required or common distros (AlmaLinux/RHEL9, anything targeting x86-64-v2+) simply refuse to boot/run — a correctness cliff-edge, not a performance one.
- No throughput benchmarking; doesn't resolve the AVX2 question either way.

[12] Tart issue #1231 — nested virtualization failing on an M3
https://github.com/openai/tart/issues/1231 | 2026-05, closed not-planned | GitHub issue | medium (outlier check)
- On inspection this is a *macOS-guest-in-macOS-guest* nested case (running Docker/Podman inside a macOS VM), which Apple's nested virt does not cover even on M3 — it's scoped to Linux guests per [2]. Not evidence that M3 nested virt is flaky; it's evidence of a narrower scope than "nested virt just works everywhere on M3+."

[13] The Register — "Latest GitHub outage squeezes Actions, Pages to death"
https://www.theregister.com/devops/2026/08/06/latest-github-outage-squeezes-actions-pages-to-death/5284297 | 2026-08-06 | tech trade press | medium-high
- Confirms the incident's own language: "workflow runs were failing to start, or failing partway through execution," Actions REST API erroring, unexpected rate limiting.
- Frames this as part of a pattern: 26 incidents in July 2026, 23 in June, 23 in May, 26 in April; GitHub's SVP promised in June fixes to "permanently remove failure modes" — the author is openly skeptical those landed, given this incident.

[14] GitHub Status incident page — qcvjkzcs7j74
https://www.githubstatus.com/incidents/qcvjkzcs7j74 | 2026-08-06, live/unresolved as captured | primary/official, real-time incident record | high
- 15:22 UTC: "investigating reports of degraded performance for Actions."
- Progression shows Pages flapping (reported fixed, then degraded again), webhook throttling down to ~15% delivery, and — critically — at 20:34 UTC remaining impact narrowed to "runners that are stuck retrying jobs that are no longer available," with queued-job success recovering from 30-40% up to ~65%.
- No "Resolved" entry present as of last capture; no stated root cause.

[15] GitHub community discussion #204152 — "[2026-08-06] Incident Thread"
https://github.com/orgs/community/discussions/204152 | 2026-08-06 | GitHub's own community forum, official bot updates | high
- Direct quote, escalation: "Workflow runs are failing or delayed in starting, and some queued jobs may time out."
- Self-hosted runners explicitly named: "may see errors or rate limiting when runners register."
- This directly answers the "does owning runners help during a control-plane outage" question: **no** — the failure is upstream of any runner, in run creation/dispatch and runner registration against GitHub's API. A self-hosted runner sitting idle has nothing to pull if the control plane never creates/dispatches the run, and may not even be able to *register* during the incident.

[16] maximal-core PR #91 (via `gh pr view 91 -R stuffbucket/maximal-core`)
https://github.com/stuffbucket/maximal-core/pull/91 | 2026-08-06, open | first-party, primary source | high
- Ships `.github/docker/ci.Dockerfile`: `node:24-bookworm-slim` + Bun installed via the same install line CI uses; `BUN_VERSION` is a **required build arg with no default** — the tag itself (`maximal-core-ci:bun-<version>`) is the version pin, so there is no floating/stale-but-addressable image.
- Two deliberate run-time choices: `node_modules` as a **named volume**, never bind-mounted from the host (platform-specific native binaries — oxlint, esbuild/tsup, jscpd — would otherwise cross-contaminate macOS/Linux); and the container **runs as the host uid, not root**, because root bypasses DAC and would make `tests/config-unwritable-boot.test.ts` (chmod 0o400 + `accessSync(W_OK)`) silently stop testing what it claims to test — explicitly called "this repo's most-repeated defect shape."
- Explicitly rejected `act`: "two approximations" (act's images approximate GitHub's runner images, and that gap is the bug class they keep hitting late) and, decisively, **act cannot run `windows-latest` at all** — which is where every historical Windows defect in the repo lives.
- Verified fully offline same-day, during the live Actions outage: full test suite green on Linux (1635 pass), e2e green, `bindings:check` reporting a genuine match (not "could not verify") between a Linux-built and the committed macOS-built `dist/main.js` — first time this had ever been demonstrated locally rather than asserted by policy doc.

[17] maximal-core issue #90 (via `gh issue view 90 -R stuffbucket/maximal-core`)
https://github.com/stuffbucket/maximal-core/issues/90 | open | first-party, primary source | high
- Catalogs four real Windows-only defects that shipped or nearly shipped because there was no local repro path: a `prepare` script using bash-isms Bun's Windows shell rejects (shipped in v0.4.2 with **no binaries**), an SQLite handle leak that's an invisible fd leak on POSIX but a **file-locking EBUSY** on Windows, a Windows-only secrets-loader bug, and a shebang-based test fixture that throws ENOENT on Windows before any assertion runs.
- Explicitly references `docs/dev/windows-vm-utm.md` as "the" answer for this, but flags its stated goal (installer iteration) as partly stale since the installer effort (#81) died — the doc's premise "needs revisiting rather than following as-is."

[18] maximal-core `docs/dev/windows-vm-utm.md` (via `gh api .../contents/... --jq .content | base64 -d`)
(same repo, path docs/dev/windows-vm-utm.md) | first-party, primary source | high
- UTM (QEMU-backed) running **Windows 11 ARM64** — not x86_64-on-ARM emulation — as the guest; this sidesteps the nested-virtualization question entirely because it's a same-architecture (arm64 guest on arm64 host) VM, not nested hardware virtualization of a second hypervisor.
- Documents real, load-bearing constraints of UTM 4.7.4 on this hardware: no scriptable AppleScript snapshot/revert (only `start`/`suspend`/`stop`/`export`), sandbox blocks raw `qemu-img snapshot`, so the workflow is "export-as-baseline, delete-and-reimport to revert" — acknowledged as not fully hands-off ("There's no public API to script those clicks in 4.7.x").
- Key workaround for iteration speed: **cross-compile the Windows x64 binary on the Mac** (`bun build --compile --target=bun-windows-x64`) and drop it into the VM via a shared folder — avoids compiling inside the VM at all, cutting the loop from ~30s to ~5s.
- Explicitly documents that the Windows binary is **x64**, running under **Microsoft's own x64-on-ARM emulation inside Windows** — "fine for installer validation but a poor target for performance regression testing." This is a second, independent instance of "ARM64 host running x86_64 payloads via an emulation/translation layer," this time on the Windows side, with the same class of caveat as Rosetta/QEMU on the macOS side.
- Explicitly scopes itself out for anything needing "full corp-IT-image fidelity (group policy, MDM, Defender ATP)" — defers to Azure Dev Box for that tier.

## Approaches

### A. Docker (colima's default runtime) — pinned Linux toolchain container
**Pros:** Already built and verified working end-to-end same-day, offline, during a live Actions outage [16]. Solves the actual problem in this repo (bindings reproducibility, `check:deep` on Linux, e2e on Linux) with an image whose tag *is* the version pin. Ordinary Docker tooling, ordinary colima VM (arm64, native — no cross-arch tax for this workload since the toolchain container is presumably arm64-native too, matching host).
**Cons:** Application containers only — no systemd, no true multi-process VM-like semantics, root-in-container is a foot-gun they had to specifically design around (host-uid, not root) [16].
**Complexity:** Low — this is the "boring, works" option, and it's done.
**Supporting sources:** [16] is the whole case for this; [4]/[5] describe what Incus would add on top and none of it is something this repo's problem statement (bindings parity, DAC-sensitive tests, offline Linux CI parity) needs.
**Best scenarios:** Any workload that is "run this build/test suite on Linux, get a real Linux filesystem/DAC/kernel," which is the entire stated need here.

### B. Incus system containers (via colima's `--runtime incus`)
**Pros:** Real systemd/multi-process semantics if a workload genuinely needs a running init system, multiple cooperating daemons, or LXC-style "feels like a VM" isolation without paying for actual hardware virtualization [4][5]. VM-in-container branching is available *if* nested virt is present (it isn't here).
**Cons:** Colima's Incus integration is a community feature with a self-described tiny user base ("pretty much the only user") [4] — not something linuxcontainers.org, Incus upstream, or (as far as could be found) any CI vendor documents as a supported combination. No Compose-equivalent, manual recovery steps after crashes [5]. Delivers nothing this repo's Docker container doesn't already deliver for its actual problem (Linux bindings parity, DAC semantics, offline reproducibility) — those all work fine in an unprivileged Docker container as already demonstrated [16].
**Complexity:** Medium — an extra colima runtime, an extra CLI, an extra socket-forwarding layer, for a semantics upgrade (systemd/multi-process) the stated problem doesn't need.
**Supporting sources:** [4][5] describe the mechanism and its niche status plainly; no source found recommending Incus-via-colima specifically for *CI build isolation* as opposed to "trying Incus out on a Mac."
**Best scenarios:** Genuinely wanting a systemd-in-a-box or LXC-style system container locally for its own sake (e.g., replicating a systemd-managed multi-service Linux host). Not a fit for "reproduce GitHub's Linux runner for a Bun/Node build."

### C. UTM Windows-on-ARM VM (already documented, `docs/dev/windows-vm-utm.md`)
**Pros:** Solves a problem containers structurally cannot touch — Windows-only defects (`#38`, `#71`/EBUSY, `#55`, shebang/ENOENT) [17] that live in Windows's shell, filesystem locking semantics, and DAC-equivalent behavior. Because it's an ARM64 Windows guest on an ARM64 host, it sidesteps the nested-virtualization ceiling entirely — no hardware nested virt is invoked. Cross-compile-on-Mac trick keeps the iteration loop fast (~5s vs ~30s) [18].
**Cons:** Not scriptable/headless in any strong sense on UTM 4.7.4 — no AppleScript snapshot/restore, sandboxed out of raw `qemu-img`, so state reset is "export baseline, delete VM, reimport, two GUI clicks" [18]. The *artifact under test* is x64 (via `bun build --compile --target=bun-windows-x64`), which then runs under Microsoft's own x64-on-ARM emulation inside the guest — explicitly flagged as fine for install/artifact validation but a poor perf-regression target [18]. VM RAM isn't shared with the host, so it's not something to run continuously alongside heavy Mac workloads [18].
**Complexity:** Medium (one-time bring-up is fiddly — disk resize, OOBE bypass, toolchain install — but the steady-state loop is simple and already scripted via `scripts/dev/utm.sh`).
**Supporting sources:** [18] is authoritative and already in production use by this org (issue #90 references it as the live plan, just flags the doc's original *goal* — installer work — as partly stale since #81 killed installers; the VM itself remains the only way to get Windows semantics locally).
**Best scenarios:** Exactly what it's used for: pre-push Windows sanity checks (install, `bun test`, `e2e`) that CI would otherwise be the only place to catch, at CI-cycle cost.

## Recommendation

**For the Linux half: Docker is already sufficient. Incus is a detour, not an upgrade, for this repo's actual problem.**

The concrete evidence is PR #91 [16]: a pinned, tag-as-version-pin Docker container already gets bit-for-bit bindings parity, a full green `check:deep` on Linux, and green e2e — verified same-day, offline, during a live Actions outage. Nothing in that verification needed systemd, multi-process orchestration, or VM-like semantics; the two things that actually mattered (platform-specific `node_modules` binaries, and DAC semantics for a permission test) were solved with an unprivileged Docker container plus two deliberate, already-implemented decisions (named volume, host-uid not root). Incus-via-colima [4][5] would add a systemd/multi-process capability this repo doesn't need, on top of an integration that is itself a niche community feature ("pretty much the only user") rather than a documented, common configuration. If a future workload genuinely needs a running init system or several cooperating long-lived daemons, Incus system containers are the right escalation *then* — not now, and not as a general substitute for the Docker container that already works.

**For the Windows half: the UTM VM is the pragmatic, already-correct answer, and containers cannot substitute for it.** Container isolation (Docker or Incus) only ever gets you Linux semantics — a DAC-emulating test, a Linux kernel, a Linux filesystem. Every cataloged Windows defect [17] is Windows-specific: Bun's Windows shell rejecting bash-isms, Windows file-locking on an open SQLite handle (POSIX just leaks silently), a Windows-only secrets bug, and Windows's total absence of shebang handling. None of that is reachable from a Linux container, an Incus system container, or `act` (which additionally, per [16], cannot run `windows-latest` at all). The UTM VM is arm64-native (Windows 11 ARM), so it also isn't blocked by the nested-virtualization ceiling on M2 — it never invokes nested hardware virtualization in the first place.

**Self-hosted runners do not fix the thing today's outage broke.** [14][15] show the failure was in workflow-run creation/dispatch and runner *registration* against GitHub's own control plane — not in runner capacity. A self-hosted M2 Ultra runner has nothing to pull if GitHub never creates or dispatches the run, and per the incident thread may not even be able to register while the incident is active. Self-hosted runners solve "we need more/faster/differently-shaped compute"; they do not solve "GitHub's control plane is down," which is precisely the scenario PR #91 was verified under — and precisely why the pinned local container (runs entirely offline, no GitHub API dependency) was valuable *that day*, in a way no runner topology could have been.

## Implementation
Not applicable — this is a research spike; PR #91 already implements the recommended Linux-side approach, and `docs/dev/windows-vm-utm.md` already implements the recommended Windows-side approach. No code changes proposed here.

If asked to act on this later, the only concrete follow-ups implied by the sources:
1. Do not pursue `colima --runtime incus` for CI/build isolation; it solves a problem (systemd/multi-process/VM-like semantics) this repo doesn't have.
2. If x86_64 Linux binaries are ever needed in the toolchain container (e.g., a dependency with no arm64 build), test AVX2 explicitly before trusting either QEMU (`--vm-type qemu`, TCG has a tracked, unresolved AVX2 gap [8][7]) or Rosetta (`--vz-rosetta`, cosmetically reports AVX2 in `/proc/cpuinfo` per [10] but at least one real-world AVX2 binary crashes under Rosetta translation [6]) — don't trust `/proc/cpuinfo` flags as a signal either way.
3. Windows-side: issue #90's own point 1 stands — revisit whether `windows-vm-utm.md`'s stated goal (installer iteration) should be rewritten around `bun test`/`e2e` now that installers (`#81`) are dead, since that's what the doc is actually being used for per PR #91's context.

## Risks
- **Incus-via-colima has a support surface of one maintainer's side project** [4] — if adopted anyway for some future need, expect to be the one filing upstream issues, not finding existing answers.
- **Rosetta's cosmetic CPUID reporting** [10] means any future dependency on x86_64-under-Rosetta for AVX2-using code (llama.cpp and similar are explicitly named as a risk in the user's question) needs an actual execution smoke-test in CI/local verification, not a `/proc/cpuinfo` grep — the flag can be present while the instruction still faults [6].
- **UTM's lack of scriptable snapshot/restore** [18] means Windows-VM state hygiene is manual (delete + reimport); if this become a bottleneck, the doc's own escape hatch (Azure Dev Box) is the documented next tier, not a fancier UTM automation attempt.
- **The Aug 6 2026 incident was still unresolved at last capture** [14] — the "self-hosted runners don't help during control-plane outages" conclusion is drawn from an in-progress incident, not a postmortem; the general pattern (28+ incidents/month cadence per [13]) is the more durable evidence than this single incident's eventual root cause.

METRICS: searches=8 fetches=17 high_quality=11 ratio=1.0
CHECKS: [x] freshness [x] went_deep [x] found_outlier [x] checked_awesome

## Feedback
usefulness: | implemented: | result: | notes:
</content>
