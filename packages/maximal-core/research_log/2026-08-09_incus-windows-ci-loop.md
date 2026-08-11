# Research: Incus system containers for a local Windows test loop (maximal-core #90)
Started: 2026-08-09T09:46:08-07:00 | Status: complete | ended: 2026-08-09T11:05:00-07:00

## Problem
maximal-core has no local way to reproduce Windows-only CI failures (issue #90):
four historical cases (bad `prepare` shell syntax → v0.4.2 shipped with no
binaries, SQLite handle-lock EBUSY in `afterEach` (#71), secrets-loader bug
(#55), shebang-fixture ENOENT (#74)) each cost a push/CI cycle, plus a fifth
found today (a `RegExp` built with an interpolated `os.tmpdir()` path and the
`u` flag — harmless on POSIX, a hard `SyntaxError` on Windows because of the
`\`-delimited path). Separately, the required `windows` CI check is
intermittently red on unrelated tests on `main` itself, always at ~5016ms,
with the open hypothesis (issue comment, today) that both failing assertions
are first-HTTP-round-trip checks and the 5016ms is a fixed 5s test timeout
plus Windows' slower first-round-trip (63-111ms vs 3-6ms bare TCP connect,
per #78). Task: evaluate whether Incus is a viable way to get a local,
interactive Windows test loop on this specific macOS Apple Silicon dev
machine, and recommend an approach among Incus, the existing UTM doc, a
cloud Windows box, a self-hosted GH Actions Windows runner, and
windows-latest + tmate/--debug.

Verified host: `Darwin ... 25.5.0 ... RELEASE_ARM64_T6020 arm64` /
`sw_vers`: macOS 26.5 (25F71) / `system_profiler SPHardwareDataType`:
**Apple M2 Ultra, Mac Studio, Model Identifier Mac14,14**.

## Awesome Lists Checked
- Searched "awesome incus site:github.com" — no maintained `awesome-incus`
  list exists (only literal repo names containing "incus" and the
  `lxc/incus` project itself surfaced). Incus's own docs list third-party
  tools at https://linuxcontainers.org/incus/docs/main/third_party/ — the
  closest equivalent, not a community awesome-list.

## Searches
1. "awesome incus site:github.com" | no freshness filter | no awesome list found
2. "Incus repack-windows documentation Windows VM" | py | found distrobuilder source + community how-tos, no first-party "Windows VM" doc page
3. "Incus nested virtualization Apple Silicon arm64" | py | found lxc/incus#1573, Apple's isNestedVirtualizationSupported, Simos's nested-virt blog post
4. "Apple T6020 chip identifier M2 Pro Mac Studio" | no filter | T6020 = M2 Pro/Max family SoC id per kernel device-tree patches; this machine's `system_profiler` output overrides guesswork: **M2 Ultra**
5. "isNestedVirtualizationSupported requires M3 macOS 15 Apple Silicon" | py | Eclecticlight + Parallels/UTM forum threads converge on M3+/macOS 15
6. "GitHub Actions self-hosted Windows runner tmate windows-latest debug interactive SSH" | py | action-tmate confirmed as the interactive-debug mechanism for windows-latest
7. "Windows 11 dev VM licensing Azure Windows 365 monthly cost 2026" | py | Windows 365 Enterprise pricing table
8. "GitHub Actions self-hosted runner supported architectures Windows arm64 x64" | py | self-hosted runners support both; GH-hosted `windows-11-arm` now GA
9. "github windows-latest runner-images specifications x64 architecture github actions" | py | confirms windows-latest/2022/2025 = x64
10. "Azure D2s_v3 Windows VM hourly price East US 2026" | py | pricing calculators only (no first-party number fetched — see Risks/gaps)
11. "self-hosted GitHub Actions runner security risk public repository fork pwn request" | no filter | GitHub Security Lab writeup on pwn requests / compromised runners
12. "Windows on ARM x64 emulation differences testing unreliable native x64 behavior" | py | Microsoft's own emulation docs + an OpenBLAS x87-in-Prism bug report as a concrete emulation-fidelity gap

## Sources

[1] Incus — How to create instances
https://linuxcontainers.org/incus/docs/main/howto/instances_create/ | 2026-08-09 | official docs | high
- `incus launch`/`incus init` take `--vm` to get a QEMU-backed VM instead of an LXC container; example: `incus launch images:debian/12 debian-vm --vm`.
- Windows is recognized only via the `image.os` property (must start with `Windows`) so Incus can disable unsupported virtual devices, switch the RTC to local time, and use an Intel IOMMU controller.
- The generic ISO-install workflow (create empty VM, import ISO as a `--type=iso` volume, attach with `boot.priority=10`, `incus console --type=vga`) is documented; nothing Windows-specific beyond the `image.os` note, and no link to `repack-windows` or distrobuilder anywhere on this page.
- The Incus agent (guest tools) is supported on Windows VMs, installed via `install.ps1` run from a virtual CD-ROM (not the 9p share other guests use), requires local admin.

[2] distrobuilder — `main_repack-windows.go` (source)
https://github.com/lxc/distrobuilder/blob/main/distrobuilder/main_repack-windows.go | 2026-08-09 | primary source (official LXC project) | high
- `repack-windows <source-iso> <target-iso> [--drivers=DRIVERS]` injects VirtIO drivers into a Windows install ISO's `boot.wim`/`install.wim` (or `.esd`) so the installer and the installed OS can see a VirtIO disk/NIC.
- Requires external tools: `hivexregedit`, `rsync`, `wimlib-imagex`, and `genisoimage`/`mkisofs`; loop-mounts both ISOs and needs root/mount privileges.
- Downloads VirtIO drivers from the Fedora VirtIO mirror if not supplied locally.
- Nothing in this file names Incus/LXD explicitly as the consumer — that's inferred from repo ownership (`lxc/distrobuilder`) and import context, not asserted in the tool itself. There is no unattended-install/autounattend.xml logic here.

[3] lxc/incus GitHub issue #1573 — "Nested virtualization on Apple M3+ w/ UTM Ubuntu VM not working with incus"
https://github.com/lxc/incus/issues/1573 | 2025-01-14 (issue opened) | primary source, negative case | medium
- Reporter's Incus VM creation fails: `Instance type "virtual-machine" is not supported on this server: QEMU failed to run feature checks` / `Unable to locate a UEFI firmware` — a missing aarch64 UEFI firmware package, not (per the log) a raw nested-virt refusal.
- Confirms KVM itself *is* reachable inside the Ubuntu 24.04/aarch64 UTM guest on this M3 host (`kvm [1]: Hyp mode initialized successfully`), i.e., nested virt can work mechanically on M3+.
- Versions: Incus client/server 6.0.0, kernel 6.8.0-51-generic, LXC driver 5.0.3. No maintainer comment or resolution is present in the fetched content; QEMU version was never reached because the feature check failed first.

[4] eclecticlight.co — "How Sequoia changes virtualisation on Apple silicon"
https://eclecticlight.co/2024/06/17/how-sequoia-changes-virtualisation-on-apple-silicon/ | 2024-06-17 | independent technical blog (Howard Oakley, well-known Mac-internals writer) | medium-high
- States nested virtualization in macOS Sequoia works "when the host Mac has an M3 chip or later" — M1/M2 excluded.
- Notes Apple's own docs scope this to Linux guests, leaving macOS-VM nesting ambiguous; author speculates the M3 cutoff traces to ARMv8.4+ instruction-set features.

[5] discuss.linuxcontainers.org — "Easy way to try Incus on macOS with Colima"
https://discuss.linuxcontainers.org/t/easy-way-to-try-incus-on-macos-with-colima/21153 | 2024 (thread, updated through Aug 2024) | community forum, maintainer-adjacent | medium
- Confirms the only path from macOS is macOS → Colima's Linux VM (QEMU or Apple's Virtualization.framework backend) → Incus daemon *inside that VM* → the client on macOS talks to a forwarded unix socket. There is no native macOS Incus daemon.
- Originally containers-only ("Only containers are supported, no virtual machines"); VM support was added later specifically gated to "m3 Macs running macOS 15 or later" — independently corroborating source [4]'s M3 cutoff.
- Reports Debian containers show the *Ubuntu VM's* kernel, not Darwin's — containers share the outer Linux VM's kernel, a second reminder that "container" here is never going to mean "Windows."

[6] Incus — How to install Incus
https://linuxcontainers.org/incus/docs/main/installing/ | 2026-08-09 | official docs | high
- "The Incus daemon only works on Linux." macOS only ever gets the client (via Homebrew or as a Colima runtime); Windows also gets client-only packages (Chocolatey/winget).
- Version branches: LTS 6.0 (bugfix/security only), feature branch 6.x (monthly). Colima users in [5] reported client/server versions 6.3-6.5.

[7] blog.simos.info — "How to run an Incus VM inside an Incus VM (nested virtualization)"
https://blog.simos.info/how-to-run-an-incus-vm-inside-an-incus-vm-nested-virtualization/ | undated (referenced Incus 6.x era) | independent technical blog, deep and hands-on | medium-high
- Demonstrates nested Incus VMs, but entirely on **x86_64** (KVM + Incus's bundled QEMU 8.2.2, `qemu-system-x86_64`), never ARM64.
- Nested virt there is gated by host BIOS/UEFI VT-x/AMD-V and the `kvm_intel`/`kvm_amd` `nested` module parameter — a completely different gating mechanism than Apple Silicon's, where the switch is a hardware/OS capability (`isNestedVirtualizationSupported`), not a toggleable kernel module parameter.
- Also documents a Secure Boot trip-up (`--config security.secureboot=false` needed) as a second-level annoyance even when nested virt itself works.

[8] GitHub Docs — GitHub-hosted runners reference
https://docs.github.com/en/actions/reference/runners/github-hosted-runners | 2026-08-09 | official docs | high
- Confirms **`windows-latest`, `windows-2025`, `windows-2022` are all x64.** arm64 Windows exists only as separate labels, `windows-11-arm` and `windows-11-vs2026-arm` (public preview), GA'd for public repos per the Aug 2025 changelog found in search.
- Windows/Ubuntu hosted runners run on Azure; Windows runners run with admin rights and UAC disabled.

[9] Self-hosted runners docs + GitHub Security Lab pwn-request writeup
https://docs.github.com/en/actions/concepts/runners/self-hosted-runners ,
https://securitylab.github.com/resources/github-actions-preventing-pwn-requests/ | 2026-08-09 | official docs / official security research | high
- Self-hosted runners support both Windows x64 and Windows ARM64 (GA since a 2022 changelog), so a self-hosted runner *could* be pointed at a local ARM64 Windows box, but that reintroduces the same arch mismatch discussed in [8].
- Security posture: GitHub's own guidance is that self-hosted runners on **public** repos are inherently risky (anyone can open a PR and get code execution on your machine via workflow_run/pull_request_target patterns) unless carefully sandboxed and ephemeral — meaningful extra operational burden for a repo that (per AGENTS.md) already runs required-check branch protection and takes CI integrity seriously.

[10] Microsoft Learn — "How emulation works on Arm" + OpenBLAS issue #5696 (x87 code runs incorrectly in Prism)
https://learn.microsoft.com/en-us/windows/arm/apps-on-arm-x86-emulation ,
https://github.com/OpenMathLib/OpenBLAS/issues/5696 | 2026 / 2025 | official docs / primary bug report | high / medium
- Microsoft's own docs describe x64-on-Arm64 as binary translation (Prism), not identical execution; the OpenBLAS issue is a concrete, filed example of x87 floating-point code behaving differently under Prism emulation than on real x64 — i.e., "arm64 Windows" is not a transparent stand-in for "x64 Windows" even functionally, let alone for timing.

[11] Microsoft — Windows 365 Enterprise pricing
https://www.microsoft.com/en-us/windows-365/enterprise/all-pricing | 2026-08-09 | official pricing page | high
- 2 vCPU/8GB/128GB: $41/user/month; 2 vCPU/8GB/256GB: $50/user/month; cheaper 2vCPU/4GB tiers exist from $28/month. Enterprise plan requires separate Windows 11 Enterprise + Intune + Entra ID P1 licensing unless already bundled in an M365 suite the org holds; Business plan (not fetched in detail) needs no extra licenses and is credit-card self-serve, capped at 300 seats.
- These are always-on monthly Cloud PC seats (x64), not pay-as-you-go compute — relevant as a licensing-simple alternative to a raw Azure VM.

[12] Azure — Windows Virtual Machines pricing page
https://azure.microsoft.com/en-us/pricing/details/virtual-machines/windows/ | 2026-08-09 | official pricing page | medium (page content was JS-rendered; exact $/hr figures for a specific SKU/region were not retrievable through this fetch)
- Confirms the licensing model conceptually: Windows VM pricing normally bundles the OS license ("License Included"); Azure Hybrid Benefit lets you bring your own license and pay compute-only; a stopped/deallocated VM is billed for disk only, not license; a free-tier burstable VM (750 hrs/month for 12 months, B2ts v2/B2pts v2/B2ats v2) exists.
- Gap: I could not pull an exact current $/hr number for e.g. Standard_D2s_v3 in East US through WebFetch (the table is rendered client-side). Treat "a few cents to ~$0.10-0.20/hr compute, more with License Included" as an order-of-magnitude inference from general Azure D-series pricing knowledge, not a verified figure — get the live number from the Azure Pricing Calculator before budgeting.

## Approaches

### A. Incus (system container or VM) as the Windows test loop
- **Mechanism, verified**: Incus cannot run Windows as a "system container" under any circumstance — LXC containers share the host kernel, and Windows is not the host kernel. The only mechanism is **Incus VM** (QEMU/KVM-backed), confirmed by [1], and even that requires a real Windows ISO (optionally `repack-windows`-prepared per [2] for VirtIO drivers) since Incus ships no Windows image in its default `images:` remote.
- **Host chain, verified**: this Mac is arm64 (M2 Ultra) with no native Incus daemon for macOS at all — [6] states the daemon is Linux-only. The only way to get Incus running locally is macOS → a Linux VM (Colima/Lima/UTM, using either QEMU-TCG or Apple's Virtualization.framework) → the Incus daemon inside that VM → an Incus-managed Windows VM nested one level deeper ([5]).
- **The blocking fact**: nested virtualization (a VM inside that outer Linux VM getting hardware acceleration) is gated on Apple Silicon at M3-or-later + macOS 15+ ([4], corroborated independently by [5]). `system_profiler` confirms this machine is **M2 Ultra** — one generation short of the cutoff, on the actual hardware in hand, not hypothetically. Without nested-virt hardware exposure, the inner Windows VM can only run under QEMU TCG (pure software emulation), which for a full Windows boot is commonly one to two orders of magnitude slower than KVM/HVF-accelerated — practically unusable for an edit-run-observe loop, and this is inference (no source directly benchmarked "TCG Windows boot on Apple Silicon"), flagged accordingly.
- **The architecture question, verified as secondary but real**: even granting a hypothetical M3+ Mac where nested virt worked, the natural guest would be Windows-on-ARM64, while `windows-latest` in CI is x64 ([8]). Microsoft's own emulation docs plus a filed compatibility bug ([10]) show x64-under-Prism is not behavior-identical to native x64, and timing behavior — the exact thing issue #90's open questions are about — would differ from CI for reasons having nothing to do with the bug being chased. An x64 Windows guest is technically also possible under QEMU on arm64, but then it is *also* running under TCG (no hardware acceleration for cross-arch execution even with nested virt available), compounding rather than avoiding the slowness.
- **Complexity**: High. Multiple layers to install and maintain (Colima/UTM + Incus + distrobuilder/repack-windows + a licensed Windows ISO + VirtIO drivers), none of which is a documented, first-party "how to run Windows on Incus on macOS" path — [1] and [6] together do not describe this combination at all; it is reconstructed from a container-orchestration doc, a driver-repacking CLI tool's source, and community forum threads.
- **Verdict: wrong tool for this job**, on this machine, today. Stated plainly per the task's request: Incus's own value proposition (fast, native Linux system containers) does not touch Windows at all; the VM path that could touch Windows requires nested virtualization this specific host does not have, and even where nested virt exists on other Apple Silicon hardware, the natural target is the wrong CPU architecture for CI parity.

### B. Rewrite the UTM VM doc around `bun test`/`e2e` (drop the installer framing)
- UTM already runs Windows 11 ARM64 natively on this hardware today (no nested-virt gate — UTM's own guest *is* the top-level VM, accelerated directly by Apple's Hypervisor.framework, which has no M3 requirement) — this is the one approach in the whole comparison that is already working, per `docs/dev/windows-vm-utm.md`'s existence and the repo's own description of it as "acceptable."
- Its stated premise (installer / scheduled-task validation) is dead per #81 (installer shim removed; confirmed via `gh issue view 81`). What remains useful and is *not* dead: cross-compiling `maximal.exe` on the Mac, dropping it into the shared folder, and running it — that maps directly onto "run `bun test`/`bun run e2e` inside the VM" if Bun-for-Windows-ARM64 is installed there (the doc's Option A/B bring-up already installs Bun).
- **Same architecture caveat as Incus applies here, less severely**: this is still Windows-on-**ARM64** against a CI runner that is x64 ([8]). The doc itself already flags this under "Known limitations" — "ARM64 emulation of x64 binaries is fast but not native... a poor target for performance regression testing." That is precisely the caveat that matters for #90's timing questions (a) and (c): a UTM-ARM64 loop can plausibly answer "is this `skipIf` genuinely unconstructable" (question b, architecture-independent) and can exercise the win32-specific code paths (EBUSY/ENOENT/RegExp-`u`-flag classes of bug), but it cannot cleanly answer "is the 5016ms timeout a real x64-CI-runner stall" because a differently-architected, differently-performing environment is exactly the confound the issue is trying to eliminate.
- **Complexity**: Low-to-medium — the VM and toolchain already exist; the work is rewriting the doc's workflow section and validating `bun test`/`bun run e2e` run cleanly against a `bun build --compile --target=bun-windows-x64` or an ARM64-native Bun build inside it (worth checking Bun's Windows-ARM64 target support explicitly before committing to this).
- **Licensing**: needs a real Windows 11 license for anything beyond evaluation-timer use; UTM/QEMU itself is free (Apache 2.0 for QEMU, GPL/proprietary-mixed for UTM's macOS app — not itself a blocker, just noting no extra cost there).

### C. Cloud Windows box (persistent x64 VM, SSH/RDP in)
- Direct, x64, real hardware or x64 KVM/Hyper-V-backed cloud VM — reproduces CI's actual architecture with no emulation layer, which none of A or B can claim cleanly.
- Interactive by construction: RDP or an SSH server on Windows (OpenSSH Server for Windows, per search) gives a genuine edit-run-observe loop, not a batch one.
- **Licensing/cost, partially verified**: Azure Windows VM pricing bundles the Windows Server license into "License Included" pricing (per [12]); exact current $/hr for a specific SKU was **not** retrieved (JS-rendered table) — this needs a live check against the Azure Pricing Calculator or `az vm list-sizes` + `az pricing` — flagged as unverified. Windows 365 Cloud PC is a cleaner monthly-seat alternative at **$28-$50/user/month** for small (2 vCPU) tiers ([11]), but Enterprise plans require separate Windows/Intune/Entra licensing entitlements unless bundled in an existing M365 suite; Business tier is simpler (credit-card self-serve, no extra licenses, ≤300 seats).
- **Complexity**: Low. Provision once, connect over SSH/RDP, keep it running or start/stop on demand (Windows 365 Cloud PCs and Azure VMs both support stop/deallocate to cut cost when idle — confirmed conceptually in [12], not the exact restart latency).
- Downsides: recurring cost (bounded and predictable, unlike engineering time lost per issue #90's four-to-five incidents); it is a shared box, not an ephemeral CI sandbox, so state can accumulate (mirrors the UTM doc's own baseline/revert workflow need).

### D. Self-hosted GitHub Actions Windows runner
- Reuses the existing `windows` job definition verbatim by pointing a `runs-on: self-hosted` (or a matching label) at a machine you control — closest fidelity to "the actual CI job" since it *is* the actual CI job, just on different iron.
- Could be the same cloud VM as (C), which blurs C and D together in practice; the distinguishing feature of D proper is wiring it into the Actions runner fleet rather than just using the box by hand.
- **Security is a real minus for a public repo** ([9]): GitHub's own security research treats self-hosted runners on public repositories as a standing risk (arbitrary PRs can achieve code execution on the runner via `pull_request_target`/workflow-trigger patterns) unless carefully sandboxed and ephemeral — meaningful extra operational burden for a repo that (per AGENTS.md) already runs required-check branch protection and takes CI integrity seriously.
- Gives a **batch** loop primarily (push → wait for the self-hosted job), not an interactive one, unless combined with `tmate`/RDP-style debugging in the job itself — at which point it converges on option E's mechanism anyway.
- Architecture: same self-hosted note as GH-hosted — could be x64 or ARM64 depending on the box; if this machine's own arm64 hardware were used as the self-hosted box (running Windows-on-ARM), the same CI-fidelity gap as options A/B reappears.

### E. `windows-latest` + `tmate`/`--debug` into a live/failing CI run
- Zero new infrastructure: `mxschmitt/action-tmate` (actively maintained, per search results — releases ongoing) drops an SSH-reachable tmux session into the *actual* `windows-latest` (x64, confirmed [8]) job, either unconditionally or `if: failure()`.
- **This is the only option that is both interactive and perfectly CI-faithful** — same OS image, same architecture, same Azure datacenter network path GitHub itself uses ([8]). It directly answers #90 question (c) (re-measure `e2e:replace` probe timing "on real hardware" — this *is* the real hardware CI runs on) and can be used to attach and manually re-run the flaking tests in question (a) to see whether the ~5016ms recurs and correlates with observable runner load.
- **Cost**: consumes GitHub Actions Windows-runner minutes (billed at the standard multiplier for Windows jobs) only while a session is open; no idle cost, no separate VM to maintain, no license to buy.
- **Downside**: still tethered to "push a commit/branch to trigger a run" for the *first* repro of a given failure (not a true local-edit loop) — but once attached, it is fully interactive: you can edit files in-session, rerun `bun test`, inspect state, before ending it. For diagnosing *why* the existing flake happens (the acute, described problem) rather than iterating a large code change, this is the fastest path to ground truth.
- Doesn't help with the shebang/`prepare`-script/RegExp-class of "no Windows machine at all" problem in the same way a persistent box does for exploratory day-to-day dev — it's best framed as a debugging tool for an already-observed CI failure, not a substitute for local iteration.

## Comparison Table

| Option | Reproduces x64 CI env faithfully | Time to first repro | Ongoing cost | Setup complexity | Interactive loop? |
|---|---|---|---|---|---|
| A. Incus (VM; containers don't apply) | No — blocked before arch even matters (no nested virt on this M2 Ultra host); would be arm64-guest-in-arm64-VM even if it worked | Not viable on this hardware (nested-virt hard blocker); days if forced through unaccelerated TCG | Free (software) but wasted engineering time | Very high (Colima/UTM + Incus + distrobuilder + licensed ISO, no first-party doc for this exact stack) | No — not viable at all here |
| B. UTM doc, rewritten for `bun test`/`e2e` | Partial — real Windows, but ARM64 not x64; doc itself flags this gap | Fast once rewritten (VM + toolchain already exist) | Free (already-owned hardware/software) + a Windows license | Low-medium (rewrite + validate) | Yes — full edit-run-observe on the Mac, exec in the VM |
| C. Cloud Windows box (SSH/RDP) | Yes — genuine x64 | Fast (provision once) | ~$28-50/mo (Win365) or metered Azure VM (exact $/hr not verified here) | Low | Yes — real interactive remote session |
| D. Self-hosted GH Actions Windows runner | Yes — genuine x64 (if provisioned as such) | Medium (runner registration/fleet wiring) | Same VM cost as C, plus runner upkeep | Medium | Batch by default; interactive only if paired with tmate/RDP inside the job |
| E. `windows-latest` + tmate/`--debug` | Yes — it IS the CI image | Fast (one workflow_dispatch or push) | Actions minutes only while session open | Very low (add one step) | Yes, but per-CI-run, not a standing local box |

## Recommendation

**Two-track recommendation, not a single tool:**

1. **Immediate, cheapest fix for issue #90's open measurement questions**: add a `tmate`/`--debug` step to the `windows` job (gated `if: failure()` for routine runs, or a manual `workflow_dispatch` input for a deliberate debugging session). This is option E. It directly answers open question (c) — re-measuring the `e2e:replace` TCP-vs-HTTP timing gap "on real hardware," where "real hardware" is most usefully read as *the actual x64 CI runner*, not a local stand-in — and gives a way to attach live to a run reproducing the ~5016ms timeout and watch what the runner is actually doing at that moment (CPU steal time, whether the first HTTP round-trip is the slow part as hypothesized, etc.). Cost is near-zero and setup is a few lines in `ci.yml`. [8], [9] (tmate's maintenance and mechanism), issue #90/#78 evidence.

2. **For the standing "no local Windows machine" problem** (the four-to-five historical bugs found only by pushing), **rewrite `docs/dev/windows-vm-utm.md` around `bun test`/`bun run e2e`** (option B), because it is the only option that is both already working on this exact hardware and free of new infrastructure. Its known limitation — ARM64 vs CI's x64 — genuinely blocks it from settling the timeout-timing question, but it is well-suited to the *other* class of Windows bug this issue is about: platform-specific logic errors that don't depend on CPU microarchitecture timing at all (shell-parsing differences, file-locking semantics, path-separator/regex-escaping bugs like today's `RegExp` `u`-flag case, POSIX-mode-bit unavailability). Those are exactly the four-of-five historical cases that were *not* about timing. Pair this with periodic option-E sessions specifically for the timing-sensitive questions, rather than trying to make one environment answer both kinds of question.

3. **If ongoing budget for a persistent x64 box is acceptable**, a small Windows 365 Business Cloud PC (~$28-31/user/month, no extra licensing hassle, self-serve) is a reasonable low-complexity supplement that gets genuine x64 fidelity with an interactive loop, and would settle question (c) even better than a CI-attached tmate session because it's a standing box you can hammer on repeatedly without spending Actions minutes. This is optional, not required, given option E already covers the same fidelity gap for free within existing CI usage. If the team pursues this, get exact current pricing from `azure.microsoft.com/en-us/pricing/calculator/` or the Windows 365 sales page directly rather than relying on this document's numbers past this write-up.

**Incus verdict, stated directly as asked**: **this is the wrong tool for this job.** Incus's system containers cannot run Windows at all — only its VM instance type can, and that VM path requires Incus itself to be running on Linux, which on this Apple Silicon Mac means an outer Linux VM whose nested-virtualization capability is gated by Apple to M3-or-later silicon on macOS 15+. This machine is a verified M2 Ultra, one generation short of that gate, so the entire macOS → Linux VM → Incus → Windows VM chain fails at the second hop before either the "system container" framing or the arm64-vs-x64 CI-parity question is even reached. Even granting a hypothetical M3+ host, the natural Incus-VM guest would be Windows-on-ARM64 — the same CI-fidelity gap the UTM doc already carries, arrived at through far more moving parts (Colima/UTM-as-Incus-host, the Incus daemon, `distrobuilder repack-windows`, VirtIO driver injection, a licensed ISO) with zero first-party documentation covering this exact combination. Nothing about Incus specifically buys anything here that UTM does not already provide more simply on this hardware today.

## Implementation

**Track 1 (tmate in `windows` job) — concrete next steps:**
1. Add a manual-trigger-friendly debug step to `.github/workflows/ci.yml`'s `windows` job, e.g. an `if: failure() || github.event_name == 'workflow_dispatch'` step running `mxschmitt/action-tmate@v3` (pin to a released SHA per the repo's dependency-pinning conventions — check `docs/dev/` for the house style on pinning third-party actions before adding).
2. Confirm the action works from the `bash` shell default already set for this job (`defaults.run.shell: bash` per `ci.yml` lines ~283-288) — action-tmate documents an MSYS2/bash caveat (search result: `mxschmitt/action-tmate` issue #86, "is there any way to run tmate using the standard MSYS2 shell") worth reading before wiring it in.
3. First use: re-run the exact scenario from the issue-#90 comment (subscriptions/listen and boot/bind tests) via `workflow_dispatch`, attach, and manually instrument/time the first HTTP round-trip while the job runs, to test the "first-round-trip is slow on Windows" hypothesis directly rather than inferring it from wall-clock deltas after the fact.
4. If confirmed as pure Windows-runner slowness with no correctness issue, the fix is a Windows-aware timeout bump on the specific assertions (not a global bump) — exactly the caution already noted in the issue.

**Track 2 (rewrite the UTM doc) — concrete next steps:**
1. In `docs/dev/windows-vm-utm.md`, replace the "Iteration loop" section's installer/`maximal uninstall` framing with a `bun test`/`bun run e2e` loop: cross-compile is unnecessary if Bun-for-Windows-ARM64 is installed in the VM (the doc's own bring-up checklist already does this) — clone/pull the repo (or drop a tarball via the shared folder) and run `bun install && bun test` and `bun run e2e` directly inside the VM, which matches what CI actually runs (`bun install`, `bun test`) more closely than shipping a pre-built `.exe`.
2. Explicitly re-title or annotate the "Known limitations" section to state plainly (as this report does) that this loop is Windows-ARM64, not Windows-x64, and is unsuitable for timing-sensitive questions like the ~5016ms CI flake — cross-reference issue #90 by number so a future reader isn't tempted to use it for that.
3. Verify the one remaining `win32` `skipIf` in `tests/secrets.test.ts` (line 69: `it.skipIf(process.platform === "win32")`, gated on POSIX mode bits per the comment at line ~58) inside this VM — this answers open question (b) directly and is architecture-independent, so the ARM64 VM is perfectly adequate for it despite not being adequate for the timing question.
4. Take a fresh UTM baseline (`./scripts/dev/utm.sh baseline`) once the loop is validated, per the doc's existing "when to take a fresh baseline" guidance.

## Risks

- **Unverified Azure $/hr figure** ([12]): this report does not have a confirmed current Standard_D2s_v3-class hourly rate; do not commit to a budget number without pulling it fresh from the Azure Pricing Calculator or `az` CLI.
- **TCG-slowness claim for Incus is inference, not measurement**: no source in this research directly benchmarked "Windows boot time under QEMU TCG on Apple Silicon" — the conclusion that it would be impractical rests on general knowledge of TCG-vs-KVM/HVF overhead (commonly cited as 1-2 orders of magnitude for CPU-bound work) rather than a citation specific to this scenario. The nested-virt hardware blocker on this exact M2 Ultra machine is independently sufficient to rule out Incus regardless of how bad TCG would be, so this gap doesn't change the verdict, but flag it as inference if it's ever repeated as fact.
- **Bun-for-Windows-ARM64 support was not independently re-verified in this research pass** — `docs/dev/windows-vm-utm.md` already asserts Bun installs fine there (`powershell -c "irm bun.sh/install.ps1 | iex"`), and the existing doc's own bring-up checklist is being trusted rather than re-checked from Bun's own release/platform docs. Worth a quick sanity check before investing in the rewrite.
- **tmate/self-hosted-runner security**: any self-hosted-runner path (option D) on a public/branch-protected repo carries real risk per GitHub's own security research ([9]); this report recommends against D for that reason, in favor of E (tmate on the existing GitHub-hosted `windows-latest` job, which stays inside GitHub's own sandboxing) wherever the goal is "attach to CI," reserving a persistent box (option C) for "own a machine to iterate on outside of any CI run."
- **Apple's own documentation page for `isNestedVirtualizationSupported`** could not be fetched with body content in this research pass (WebFetch returned only the page title) — the M3+/macOS 15+ requirement is corroborated by two independent secondary sources ([4], [5]) that reference Apple's docs and forum discussion, not read verbatim from Apple's page itself. If this decision is ever revisited on different (M3+) hardware, re-verify directly against `developer.apple.com/documentation/virtualization/vzgenericplatformconfiguration/isnestedvirtualizationsupported` before relying on the secondary framing.

METRICS: searches=12 fetches=10 high_quality=6 ratio=0.83
CHECKS: [x] freshness [x] went_deep [x] found_outlier [x] checked_awesome

## Feedback
usefulness: | implemented: | result: | notes:
