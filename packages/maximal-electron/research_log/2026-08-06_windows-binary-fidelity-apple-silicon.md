# Research: Can we RUN Windows binaries faithfully enough to trust a test result on Apple Silicon M2 Ultra?
Started: 2026-08-06T13:46:40-07:00 | Status: complete | ended: 2026-08-06T14:40:00-07:00

## Problem
Host: macOS M2 Ultra (arm64), colima providing Docker and Incus. Two distinct needs:
- CLASS 1: Windows OS semantics (filesystem locking, process spawn, shell parsing) for a CLI/server test suite. Driven by `stuffbucket/maximal-core` issue #90, which documents four Windows-only defects found only by pushing to CI: #38 (Bun's Windows shell rejects `> /dev/null 2>&1`), #71 (SQLite handle leak — open handle *locks the file* on Windows, causing EBUSY on delete; harmless fd leak on POSIX), #55 (secrets-loader bug), #74 (extensionless shebang script fails Windows `spawn` with ENOENT).
- CLASS 2: launching a packaged Electron app (Chromium, multi-process, GPU, sandbox) and driving self-checks through it — this repo's need.

Central question: does any Apple-Silicon-reachable emulation path reproduce Windows **mandatory file locking / sharing-violation** semantics faithfully enough that a green result can be trusted — or does it risk a **false green** (permissive POSIX-like unlink-of-open-file succeeding when real Windows would EBUSY/ERROR_SHARING_VIOLATION)?

## Awesome Lists Checked
- No "awesome-wine" or "awesome-emulation" list found to be authoritative/maintained enough to cite; this domain (Wine/FEX/box64/Rosetta-in-Linux/UTM) is better served by project home pages, WineHQ/Phoronix, and Apple/Microsoft/GitHub docs directly, all of which were used instead.

## Searches
1. "colima vz-rosetta AVX AVX2 support 2026" | findings: colima/GitHub issue #315 on QEMU AVX (not vz-rosetta), Apple Rosetta docs, Stockfish AVX2-on-Rosetta issue.
2. "WINE file locking mandatory Windows semantics faithful emulation" | findings: DeepWiki wine-mirror file-system-and-io page, wineserver `server/fd.c`, WineHQ bugzilla #843.
3. "Electron Chromium running under WINE arm64 2026" | findings: Electron Windows-on-ARM docs, WineHQ 2014 Chromium-sandbox-crash bug, CodeWeavers CrossOver 27/ARM64 blogs.
4. "FEX-Emu box64 Hangover arm64 wow64 status 2026" | findings: Hangover 11.0 (Jan 2026) drops QEMU backend in favor of FEX/box64; box64 v0.4.x active; FEX monthly tags continuing into 2026.
5. "Electron win32-arm64 prebuilt binaries support" | findings: Electron Windows-on-ARM tutorial page confirms native arm64 builds since Electron 6.0.8 (2019).
6. "M2 Ultra nested virtualization Apple Silicon M3 UTM QEMU Windows ARM VM" | findings: Apple `isNestedVirtualizationSupported`, UTM issue #6700.
7. ""box64" OR "FEX-Emu" Chromium Electron GUI app run success report" | findings: no concrete Chromium/Electron success report; box64 USAGE.md has switches suggestive of Chromium (`BOX64_NOSANDBOX`, `BOX64_INPROCESSGPU`, `BOX64_LIBCEF`) but no worked example.
8. "wine chrome.exe sandbox crash "--no-sandbox" run report" | findings: 2014 WineHQ bug 21232, WineHQ forum threads, bug 56724 (2024, modern Chromium stopped starting under Wine).
9. ""Wine" run "Electron app" .exe report github issue" | findings: xDShot gist (2019, updated through 2024) — the canonical "how to limp an Electron app along in Wine" recipe; truongson.dev blog (Zalo/Electron on Bottles+Wine).
10. "UTM Windows ARM VM headless CI automate screen sharing no GUI" | findings: UTM headless/scripting/remote docs (fetch blocked by robots but titles/structure confirm scripting surface exists).
11. "Apple Silicon M3 nested virtualization support M1 M2 not supported" | findings: confirmed via UTM issue #6700 quoting Apple: nested virt requires M3+ *and* macOS 15+.
12. "Rosetta 2 AVX2 support macOS 2025 2026 added instructions" | findings: Stockfish issue #5707 (Dec 2024, M4/macOS 15.1.1) — AVX2 binary still crashes with "illegal hardware instruction" under Rosetta; no evidence AVX2 was ever added.
13. "CrossOver 27 arm64ec wow64 changelog Chromium" | findings: CodeWeavers is moving CrossOver itself to run natively on Apple Silicon (not via Rosetta) ahead of Rosetta 2's phase-out — a maturity signal but pages were 403-blocked for direct quotes.
14. "colima incus windows virtual machine support arm64 host" | findings: Incus supports VMs generally (QEMU-backed) but no documented Windows-guest workflow specific to colima's Incus integration; not a shortcut over UTM.
15. "GitHub Actions windows-11-arm runner hosted 2026" | findings: **hosted `windows-11-arm` runners exist** — public preview Apr 2025, GA for public repos Aug 2025, arm64 standard runners for private repos Jan 2026. This is an off-host alternative worth flagging even though it's not "on the M2."
16. "Hangover wine arm64 CEF chromium electron app tested working" | findings: no Chromium/Electron-specific compatibility reports for Hangover; coverage discourse is games/productivity apps.
17. ""box64" chromium browser run failed OR crash arm64 raspberry pi" | findings: no concrete box64+Chromium report found despite repeated searching — treated as a meaningful absence, not proof of absence.

## Sources

[1] Apple Developer — Running Intel Binaries in Linux VMs / About the Rosetta translation environment
https://developer.apple.com/documentation/virtualization/running-intel-binaries-in-linux-vms | 2026 (evergreen doc) | official docs | high
- Rosetta-for-Linux is exposed as a virtiofs share + binfmt_misc registration; translates **user-mode x86-64 ELF only**, no ring-0/kernel code, no 32-bit x86.
- Confirmed via general knowledge cross-checked against colima docs: this is the same mechanism `colima start --vm-type vz --vz-rosetta` rides on.
- Fetch of the live page body was blocked (returned title only); claims here are corroborated by the colima docs fetch and the Stockfish issue below rather than block-quoted from Apple directly — flagged as lower-confidence on exact wording, higher-confidence on substance.

[2] GitHub official-stockfish/Stockfish issue #5707 — "AVX2 binary crashes: illegal hardware instruction" (Dec 6, 2024)
https://github.com/official-stockfish/Stockfish/issues/5707 | 2024-12-06 | GitHub issue, closed not-planned | high
- On an M4 Mac, macOS 15.1.1, the official AVX2 macOS x86-64 Stockfish 17 binary fails under Rosetta 2 with `illegal hardware instruction` — i.e., **AVX2 is still not translated by Rosetta 2 as of macOS 15.1**, contrary to the reporter's expectation that "Rosetta 2 should now support AVX2."
- This is Rosetta-on-macOS (running an Intel macOS binary), not Rosetta-in-Linux, but it is the same CPU-translation core and the negative result generalizes: Apple has not published AVX/AVX2 support for Rosetta in either mode as of the most recent evidence found.
- Issue closed "not planned" with no counter-evidence offered — no maintainer disputed the AVX2 gap.

[3] colima documentation — Configuration
https://colima.run/docs/configuration/ | fetched 2026-08-06 | official project docs | high
- `--vm-type vz` requires macOS 13+ on Apple Silicon; gives "Rosetta 2 support for x86_64 emulation" and VirtioFS.
- `--vz-rosetta` / `rosetta: true` enables amd64 emulation "(requires VZ)".
- `cpuType` (instruction-set-extension control) is explicitly scoped to **QEMU only** — there is no documented way to request AVX/AVX2 under the vz+rosetta path, and no claim it's supported.
- `nestedVirtualization: true` is documented as **M3+ Macs only** — directly confirms the M2 exclusion for colima's own nested-VM feature.

[4] GitHub abiosoft/colima issue #315 — "Enabling AVX instructions on x86_64 arch VM with colima on M1 Mac" (opened 2022-06-01)
https://github.com/abiosoft/colima/issues/315 | 2022, still open | GitHub issue | medium
- TensorFlow refuses to start under colima's QEMU x86_64 emulation ("compiled to use AVX instructions, but these aren't available"), even when `--cpu-type max,+avx,+avx2` is passed and QEMU's own `-cpu help` lists avx/avx2/avx512 as available flags.
- A linked QEMU GitLab comment calls the advertised CPU flag list on aarch64-hosted x86_64 emulation "definitely looks like a bug" — i.e., QEMU *advertises* AVX support in CPUID that it does not actually execute correctly on an ARM host, a specific and long-standing trap.
- This is the **QEMU TCG path**, not vz-rosetta, but shows the AVX story has been broken on Apple Silicon x86_64 paths since 2022 and (per issue still open) unresolved.

[5] DeepWiki — wine-mirror/wine, "File System and I/O"
https://deepwiki.com/wine-mirror/wine/2.3-file-system-and-io | fetched 2026-08-06 | secondary/derived doc over primary source | medium-high
- **Locking/sharing arbitration lives server-side in `wineserver` (`server/fd.c`)**, not client-side and not a thin pass-through to POSIX advisory locks. Two structures: `struct fd` (per-handle) and `struct inode` (per on-disk file), the latter letting wineserver detect that two different Windows handles refer to the same file and evaluate a sharing-mode conflict.
- Explicit stated rationale for *not* just using POSIX locks: Unix `close()` releases **all** locks held by a process on a file when any one fd to it closes, which is incompatible with Windows's per-handle semantics. Wine deliberately re-implements bookkeeping to avoid inheriting that POSIX behavior.
- Confirms `MoveFileEx(..., MOVEFILE_DELAY_UNTIL_REBOOT)` is implemented via the `PendingFileRenameOperations` registry key — evidence the project takes Windows delete/rename-of-busy-file semantics seriously enough to model the OS's own escape hatch.
- Gaps acknowledged by omission, not by explicit statement: the page does not confirm whether `DeleteFile`/`MoveFile` against a same-process-open handle actually raises `ERROR_SHARING_VIOLATION` end-to-end, nor does it discuss oplocks, `FILE_FLAG_DELETE_ON_CLOSE`, or network-filesystem edge cases.

[6] WineHQ Bugzilla #843 — CreateFile / ERROR_SHARING_VIOLATION
https://bugs.winehq.org/show_bug.cgi?id=843 | fetch blocked (403) | not independently verified | n/a
- Could not be fetched directly (WineHQ blocks the fetch tool). Cited by title only from search snippets: the bug exists and is about `ERROR_SHARING_VIOLATION` fidelity, corroborating that sharing-violation behavior is a known area of active bug-tracking in Wine (i.e., it's implemented, and its edges are litigated), but exact resolution/status not confirmed.

[7] WineHQ Bug list / mailing list references to sharing-violation and `O_DENY*` locking work
https://list.winehq.org/hyperkitty/list/wine-devel@list.winehq.org/thread/BIOA63O22MUEA3PTZ4IR2WCXNNAUIJQV/ (title only, "Add O_DENY* support for VFS and CIFS/NFS") | ongoing | mailing list thread | medium
- Title alone indicates Wine/kernel-adjacent work exists to add `O_DENY*`-style share-mode enforcement down to the VFS/CIFS/NFS layer — meaning even the *host Linux* side has needed extension work to make Windows deny-modes meaningful over network filesystems. This is a strong signal that **local ext4/tmpfs vs. network-mount vs. bind-mount inside a VM** changes fidelity, which matters because our target filesystem (a virtiofs/9p mount from macOS into a colima Linux guest) is exactly the kind of non-local filesystem this class of bug targets.

[8] Phoronix — "Hangover 11.0 Released: Wine + FEX/Box64 Pairing For Windows x86 Apps On ARM64 Linux" (Michael Larabel)
https://www.phoronix.com/news/Hangover-11.0-Released | 2026-01-13 | tech news, high editorial quality, no independent testing | high (as a status report)
- Hangover 11.0 (released same day as Wine 11.0) **drops its QEMU emulation backend entirely**, standardizing on FEX-Emu or box64 as "superior" for x86-on-arm64 translation underneath Wine's Win32 layer.
- Downstream patch count against upstream Wine reduced to "around ten patches," `box64cpu.dll` renamed/upstreamed as `WowBox64.dll` — signals increasing upstream integration/maturity of the Wine+FEX/box64 combination specifically.
- No mention anywhere of Chromium, Electron, CEF, or GUI-app compatibility generally; context given is gaming (Valve's Steam Frame VR headset uses the same FEX+Proton approach on Snapdragon ARM hardware) — i.e., the flagship validation workload for this stack is **games**, not browser-engine apps.

[9] Electron docs — "Windows on ARM"
https://www.electronjs.org/docs/latest/tutorial/windows-arm | evergreen, checked 2026-08-06 | official docs | high
- **Electron ships native win32-arm64 builds** — confirmed both in the doc (arm64 support since Electron 6.0.8, hosted arm64 `node.lib`/headers) and empirically via `gh`/`curl` against the GitHub Releases API for Electron v37.0.0, which lists `electron-v37.0.0-win32-arm64.zip`, `chromedriver-v37.0.0-win32-arm64.zip`, `ffmpeg-v37.0.0-win32-arm64.zip`, symbols and PDBs — a full arm64 release artifact set, not a partial/experimental one.
- Native modules must be rebuilt for arm64 (MSVC v142 / VS2017+ with ARM64 components); architecture-detection scripts that branch only `x64`/`ia32` will silently misfire on `arm64` — an integration risk, not a viability blocker.
- Explicit warning: Chromium's sandbox **"will not work correctly when loading your application assets from a network location"** — directly relevant to any VM setup that runs the app off a shared/mounted folder rather than a local disk.

[10] Apple Developer — `isNestedVirtualizationSupported` (via GitHub utmapp/UTM issue #6700)
https://github.com/utmapp/UTM/issues/6700 | UTM issue, closed, tracked to v4.6 milestone | high (quotes Apple directly)
- Direct Apple quote reproduced in the issue: "Mac's Hypervisor.Framework supports nested virtualization starting with **macOS 15.0 (Sequoia)**, if the host CPU is **M3 or later**."
- **M1 and M2 are excluded regardless of macOS version** — the limitation is in silicon, not software. This confirms the prompt's premise precisely: the M2 Ultra host in question categorically cannot do nested virtualization, on any macOS version, ever (short of new hardware).
- Practically: this only blocks scenarios requiring a *second* level of hardware virtualization *inside* a VM already running on the Mac — e.g., Hyper-V-backed features (Windows Sandbox, WSL2, Docker Desktop's default backend, Windows' own Hyper-V-based Defender Application Guard) running **inside** a Windows-11-ARM guest that UTM/Parallels itself hosts. It does **not** block UTM/Parallels/QEMU from running a first-level Windows-11-ARM VM directly on the M2 — that's ordinary (non-nested) virtualization via Apple's Hypervisor.framework/Virtualization.framework, which M2 supports fine.

[11] `docs/dev/windows-vm-utm.md` (maximal-core, read via `gh api`)
https://github.com/stuffbucket/maximal-core/blob/main/docs/dev/windows-vm-utm.md | repo doc, current | primary source (in-house) | high
- Already-built-and-documented in-house workflow: UTM Windows-11-ARM VM on Apple Silicon, cross-compile Bun's `bun-windows-x64` target on the Mac, drop the exe into a UTM shared folder, run `maximal debug` / `maximal uninstall` inside the guest.
- Explicitly notes: "ARM64 emulation of x64 binaries is fast but not native... runs via Microsoft's x64 emulation layer, which is fine for installer validation but a poor target for performance regression testing" — i.e., the org has already independently concluded Windows' own x64-on-arm64 translation is trustworthy enough for *correctness* checks (installers, smoke tests) but not for *performance* checks. That maps directly onto CLASS 1's needs (correctness of shell/spawn/locking behavior, not speed).
- Known limitations documented in-house: CI's `windows-latest` leg already covers install-time/artifact/unit-level Windows breakage (bun install, build:binary, verify:artifact, e2e:binary, bun test) on every PR; the UTM VM's role is filling the *installer* gap (MSI/WiX), which is now itself in question after #81. No AppleScript snapshot/restore in UTM 4.7.4 (workaround: export-as-baseline + reimport). Shared-folder paths are UNC (`\\TSCLIENT\...`) and case-insensitive, which can matter for path-handling bugs. VM RAM isn't shared with host RAM.
- Also names the fallback for full corp-image fidelity: **Azure Dev Box** (real Windows, real hardware policy fidelity), for the cases UTM can't cover.

[12] GitHub issue stuffbucket/maximal-core#90 — "No way to reproduce a Windows failure locally"
https://github.com/stuffbucket/maximal-core/issues/90 | open | primary source (in-house) | high
- The four defects driving CLASS 1, already summarized in Problem above. Notably: **two of the four (`EBUSY`, `ENOENT`) manifested as a different error than the actual defect** — meaning any environment that "fixes" or hides the underlying Windows semantic (permissive delete-of-open-file, or shebang-tolerant spawn) doesn't just miss the bug, it reports a *misleadingly successful* run rather than an inconclusive one. This is the crux of the false-green risk named in the prompt.
- Also flags that the currently open item #74 has exactly one `skipIf`-on-`win32` test remaining, which the issue itself says needs confirming as "genuinely unconstructable" locally rather than just awkward — i.e., the org's own bar for "good enough" local fidelity is already narrow and specific, not "run Windows generally."

[13] xDShot's "run-electron-app-in-wine.bruh" gist (2019, community-updated through 2024)
https://gist.github.com/xDShot/68b8e8da09abe888011b60d45fff11df | 2019-2024 (rolling comments) | community gist, unofficial | medium
- Canonical recipe: `WINEPREFIX=... WINEARCH=win32 WINEDLLOVERRIDES=libglesv2.dll=d wine App.exe --disable-gpu --no-sandbox --single-process`.
- The sandbox is disabled outright — Electron's OS-level sandbox (which on Windows leans on job objects / restricted tokens) does not survive under Wine, matching the much older WineHQ bug 21232 finding (2014) about Chromium-family sandboxing being fundamentally incompatible with Wine's process model.
- GPU acceleration is disabled ("no GPU :("); results are reported as version-dependent — some users needed `--single-process` dropped, others found by Wine 6.13 the app launched "without any errors" with no flags at all. **No two reporters used the same working flag set** — a strong sign of fragility rather than a settled recipe.
- No crashes reported in that thread specifically, but failure modes were "nothing renders" and "laggy," i.e., partial/degraded operation rather than clean pass/fail — which is its own trust problem for CI (a hung or blank-rendered app can look like "still starting" rather than "failed").

[14] truongson.dev — "Electron on Wine" blog post (Zalo chat app via Bottles)
https://truongson.dev/electron-on-wine | undated (Wine 10.0 referenced, so ≥ early 2025) | personal blog | medium
- Same recipe family: disable `libglesv2.dll`, append `--no-sandbox`. Additionally needed a font package for correct text rendering.
- Explicitly failed: **voice/video calls didn't work at all** ("Wine cannot handle it"); performance is called "extremely laggy," machine heat is joked about. Author's own conclusion is to give up on the Wine path for daily use.
- This is a full desktop chat app, closer to real-world complexity than a hello-world Electron shell, and it still required manual per-app tuning and had a hard, uninvestigated failure surface (calls / WebRTC-adjacent native code) — evidence against "Electron generally runs under Wine," in favor of "Electron sometimes limps under Wine, per-app, with unpredictable gaps."

[15] WineHQ Bugzilla thread (via mailing list) #56724 — "New chromium versions don't start under wine anymore" (May 2024)
https://list.winehq.org/hyperkitty/list/wine-bugs@list.winehq.org/thread/CR5BK7K4AHAYSBLMTHROFGZNEEPZ6RCM/ | filed 2024-05-25, Wine 9.8 | bug report | medium (couldn't read past the initial report; 6 comments exist unread)
- A **regression bisected to two consecutive upstream Chromium snapshot builds** (not a Wine version change) that stopped both 32- and 64-bit Chromium from starting under Wine at all — a **hard, total failure**, not degraded rendering.
- Demonstrates the core risk of chasing a moving target: Chromium's own internals (process/sandbox/IPC bootstrapping) can silently break Wine compatibility between Chromium point releases, with no guaranteed fix cadence from either project. An Electron app tracks whatever Chromium version its Electron release embeds, so this isn't a one-time cost — it can regress on any Electron upgrade.

[16] GitHub blog — GitHub Actions Windows ARM64 hosted runners
https://github.blog/changelog/2025-08-07-arm64-hosted-runners-for-public-repositories-are-now-generally-available/ and https://github.blog/changelog/2026-01-29-arm64-standard-runners-are-now-available-in-private-repositories/ | 2025-08 (public GA), 2026-01 (private repos) | official GitHub changelog | high
- **Real Windows-11-ARM64, GitHub-hosted, natively virtualized CI runners now exist** (`windows-11-arm` label), GA for public repos since August 2025 and available to private repos as "standard" arm64 runners since January 2026.
- This is not a local-M2 solution (it's off-host, cloud CI), so it doesn't answer "run on the M2 Ultra" directly — but it is the most relevant *alternative* to emulation for CLASS 1 and CLASS 2 trust: it's genuine Windows-on-ARM hardware/hypervisor, no Wine/box64/Rosetta translation layer at all, and it already exists in the toolchain the org is using (maximal-core's CI already runs a `windows` job). Cross-arch caveat: it's native ARM64 Windows, so an x64 Windows binary run there still goes through Microsoft's own x64-on-ARM emulation (see [17]) rather than running natively, unless the artifact under test is itself win32-arm64.

[17] Electron docs [9] + `windows-vm-utm.md` [11], re: Microsoft's built-in x64-on-ARM64 Windows emulation
(same URLs as [9], [11])
- Both sources agree Microsoft's own translation layer (used automatically when an x64 binary runs on Windows-11-ARM, whether that's a UTM VM or a `windows-11-arm` hosted runner) is treated by the org as trustworthy for **correctness/installer validation**, explicitly *not* for **performance regression testing**. This is Microsoft emulating x64 *inside real Windows*, categorically different from Wine (which emulates *Windows itself* on a foreign OS) — the OS semantics (locking, spawn, shell) are native Windows semantics throughout; only the CPU instructions are translated. This makes it structurally immune to the false-green risk that concerns Wine, because the kernel/Win32 layer answering `CreateFile`/`DeleteFile`/`CreateProcess` calls is the real one.

## Approaches

### CLASS 1 (CLI/server, no GUI) — candidate approaches

**A. Real Windows-11-ARM64 via UTM/QEMU on the M2 (first-level VM, non-nested), running Bun's `bun-windows-x64` artifact under Microsoft's own x64 emulation**
- Pros: Genuine Windows kernel/NTFS/Win32 semantics for locking, spawn, and shell — the exact three failure classes in #90 are all "does the real OS do X," and this environment answers with the real OS. Already built and documented in-house (`windows-vm-utm.md`), including a helper script and cross-compile-on-Mac iteration loop (~5s cycle). No nested-virtualization requirement (UTM on the Mac hosting a Windows guest is first-level, not nested) — works fine on M2. [11]
- Cons: Not scriptable end-to-end in UTM 4.7.4 — no AppleScript snapshot/restore, so full-clean-state resets require export/reimport (a few minutes) rather than instant snapshot revert. VM RAM isn't shared with host. Microsoft's x64-on-arm64 emulation is explicitly not suitable for performance-sensitive assertions (only correctness). [11]
- Complexity: Low-Medium — it already exists and is documented; the open work is deciding whether to pivot its use from installer testing (dead per #81) to `bun test`/e2e as #90 recommends.
- Supporting sources: [9], [11], [12]
- Best for: exactly maximal-core's stated need — CLI/server Windows semantics, correctness (not perf) checks, ongoing local iteration.

**B. GitHub-hosted `windows-11-arm` runner (or existing `windows-latest` x64 runner) in CI**
- Pros: Zero local setup, no emulation-fidelity question at all (real Microsoft-operated Windows), already how the *first* discovery of all four #90 bugs happened (CI). GA and available to private repos as of Jan 2026. [16]
- Cons: Doesn't solve "found only after push" — it's the status quo the org is trying to get *ahead* of with a local loop. Iteration latency is a CI round-trip, not a local one.
- Complexity: Low (it's what's already running).
- Best for: the safety net / ground truth, not the fast local loop.

**C. WINE (or Hangover/box64/FEX-Emu) on Linux (inside colima's Incus/Docker Linux guest) running `bun-windows-x64`**
- Pros: Fully local, no separate VM boot; could in principle be faster to spin up per-test than a full VM.
- Cons — this is where the false-green risk concentrates: wineserver *does* implement its own server-side sharing/lock arbitration specifically to diverge from POSIX `close()`-releases-all-locks behavior [5], which is reassuring in principle, but (a) the exact behavior of `DeleteFile`/`MoveFile` against a same-process open handle isn't confirmed end-to-end in what's documented [5]; (b) share-mode fidelity is known to degrade over non-local filesystems — there is active Wine work specifically to extend `O_DENY*`-style enforcement down to CIFS/NFS [7], which strongly suggests **local ext4 vs. a mounted/shared/virtiofs path changes the answer**, and any colima-hosted Linux guest reaching back to the Mac's files would go through exactly this kind of non-local path; (c) Bun's own Windows-specific shell and secrets-loader bugs (#38, #55) are bugs in *Bun's Windows code paths* being exercised by Bun running on real Windows — under Wine, Bun (a native ELF-vs-PE question) would need a *Windows build of Bun* run inside Wine, which is a much heavier and less-tested configuration than "run Bun's Linux/macOS binary directly," and there is no evidence anyone runs Bun-for-Windows under Wine at all.
- Complexity: High, and the payoff is unclear given (b) and (c).
- Verdict flag: **This is the option most likely to produce a false green** for the specific #71-style bug, because the one thing that must be exactly reproduced (an open handle blocking deletion) is the one thing documented evidence neither confirms nor denies for the non-local-filesystem case that colima's architecture would actually exercise.

### CLASS 2 (packaged Electron app, GUI/Chromium) — candidate approaches

**A. Real Windows-11-ARM64 VM (UTM/QEMU/Parallels) on the M2, running the win32-arm64 Electron build natively — zero CPU emulation**
- Pros: Electron ships official win32-arm64 builds (confirmed via Electron docs and the live v37.0.0 release asset list: `electron-v37.0.0-win32-arm64.zip`, matching chromedriver/ffmpeg/symbols) [9]. If maximal's Electron app can be built for arm64 (native modules rebuilt against MSVC v142/VS2017+ ARM64 tools [9]), this VM runs Chromium/Electron **with no emulation layer of any kind** — full sandbox, full GPU path (whatever UTM/QEMU exposes to the guest), full Win32 fidelity, because it's just... Windows, running its own native binaries. This is the one Class 2 option that isn't "emulation" in any sense that could produce a false green.
- Cons: Requires a separate arm64 build/release target for the app (packaging work); GPU acceleration inside a UTM/QEMU guest is itself a variable (virtio-gpu/virgl fidelity, not a Windows-semantics question) and would need its own verification for anything GPU-dependent; UTM has no scriptable snapshot/restore in 4.7.4 [11]; asset-loading-from-network-share explicitly breaks Chromium's sandbox per Electron's own docs [9], so the shared-folder iteration trick used for CLASS 1 (drop the exe in a UTM shared folder) is *not* safe to reuse as-is for the packaged Electron app — it should be copied local-disk-side before launch.
- Complexity: Medium — needs an arm64 packaging target that likely doesn't exist yet, plus VM automation work (UTM's scripting/remote-control surface exists per its docs, though this research couldn't confirm exact headless-CI ergonomics due to fetch blocks).
- Best scenario: this is the **only** approach in this document that answers "GUI/Chromium fidelity" with zero emulation-introduced doubt.

**B. Windows-11-ARM VM running an x64 Electron build under Microsoft's built-in x64→arm64 translation**
- Pros: No arm64 packaging work needed — ship what you already ship for regular Windows x64 users. In-house doc already treats Microsoft's translation layer as trustworthy for correctness (not perf) [11].
- Cons: Untested in this research specifically for Chromium/Electron (the in-house doc's confidence is about a CLI binary, not a multi-process sandboxed Chromium app) — Chromium's own process model (sandboxed renderer/GPU processes, IPC) is a much larger attack surface for a CPU-translation layer than a CLI tool's syscalls, so the correctness-vs-performance line the org already drew for CLASS 1 shouldn't be assumed to transfer untested to CLASS 2.
- Complexity: Low-Medium.
- Best for: a reasonable first thing to try before committing to (A)'s packaging work, but budget time to discover it doesn't work, given no source found confirms Electron-under-x64-emulation-on-ARM-Windows as a validated path either.

**C. WINE / Hangover / box64+FEX on Linux running the x64 Windows Electron build ("Electron on Wine")**
- Pros: Fully local, no VM boot, matches the existing colima-based tooling.
- Cons: Every piece of concrete evidence found points to fragility, not reliability:
  - Chromium's own sandbox is fundamentally incompatible with Wine's process model — a 2014 finding [WineHQ bug 21232] still cited as the reason `--no-sandbox` is mandatory in every "Electron on Wine" recipe found [13][14].
  - GPU accel is routinely disabled (`--disable-gpu`) in every working recipe [13][14] — meaning any GPU-dependent self-check is untestable this way by construction, not by bug.
  - The exact flag combination that "works" is version-dependent and inconsistent across reporters even within the same thread [13] — the opposite of a stable, CI-trustworthy configuration.
  - Modern Chromium releases have broken Wine startup entirely, with the regression traced to Chromium's own code changes rather than a Wine bug to fix [15] — meaning this is not a one-time compatibility gap to close but an ongoing tracking cost against every future Electron/Chromium bump.
  - No source found (despite direct searching) reports Hangover, box64, or FEX-Emu running Chromium or Electron specifically — the flagship validation workloads for that whole stack are games (Steam/Proton) [8]. Silence here is meaningful: it is not merely undocumented, it appears to be genuinely untried at any documented scale.
  - Even where Wine "worked," it was for simpler single-window chat apps [14], not multi-process sandboxed browser-engine apps doing self-checks — a materially different and harder target.
- Verdict flag: **High risk of either a hard crash (making the false-green risk moot — a crash can't lie) or a silently degraded run (GPU off, single-process, sandbox off) that passes a shallow smoke check while not exercising the multi-process/sandbox/GPU code paths CLASS 2 exists to test** — which is its own, subtler false-green: not "the lock lied," but "the run passed because we turned off half of what Electron does in production."

**D. Stacked emulation (WINE + box64/FEX, i.e., Hangover) driving Electron**
- Pros: Only path that would let a plain colima/Incus arm64 Linux guest run an unmodified x64 Windows Electron build at all, if it worked.
- Cons: This is approach (C) with an *additional* CPU-translation layer (box64/FEX) stacked underneath Wine's own Win32-on-Linux translation — two independent, actively-developed-but-still-moving compatibility layers composed together, neither of which has any documented Chromium/Electron validation on its own [8][16-negative-result]. No source found describes anyone doing this successfully with Chromium. Treat as unvalidated/aspirational, not production-viable, absent a project explicitly demonstrating it.
- Complexity: Very High.

## Recommendation

**CLASS 1**: Use the already-built UTM Windows-11-ARM VM (`docs/dev/windows-vm-utm.md`) as the local fast-iteration environment, per #90's own suggested pivot — rework it around `bun test`/e2e rather than installers (which are dead per #81). This runs Bun's real `bun-windows-x64` artifact under **real Windows**, with Microsoft's own x64-on-arm64 CPU translation underneath — a translation the org has already, independently, decided is trustworthy for correctness (not performance) [11]. This is not new work; it is redirecting existing infrastructure. Do **not** pursue WINE-on-Linux for this class: the specific bug that motivates this whole investigation (#71's EBUSY-on-delete) depends on exact NTFS/Windows share-mode semantics that Wine's own project has open, unresolved work to even approximate over non-local filesystems [7] — and a colima/Incus-hosted Linux guest reaching the app's files is structurally a non-local-filesystem case. Reserve GitHub's hosted `windows-11-arm` runner as the CI-side ground truth/fallback it already effectively is.

**CLASS 2**: Do not use WINE, Hangover, box64, or FEX-Emu for anything you intend to *trust*. Every concrete report found (2014 through 2026) shows Chromium's sandbox and GPU path being disabled as a precondition for the app merely launching under Wine, version-dependent flag requirements, and a 2024 regression where modern Chromium stopped starting under Wine entirely due to upstream Chromium changes — with zero documented cases of anyone running Chromium or Electron specifically atop the newer Hangover/box64/FEX stack, whose own flagship use case is games. Instead, pursue **native win32-arm64** on a real Windows-11-ARM VM (UTM/QEMU on the M2, non-nested — nested virtualization is irrelevant here since the VM itself isn't hosting a further VM): Electron ships genuine win32-arm64 release artifacts today [9], so with an arm64 packaging target this is the *only* Class 2 path in this research that isn't emulation at all for the OS/Chromium layer — it's just Windows running its own native code. If standing up an arm64 packaging target is too much lift short-term, the fallback is the same VM running the existing x64 build under Microsoft's built-in translation — untested here for Chromium specifically, but architecturally sound (real Windows kernel/Win32 layer, only CPU instructions translated) and worth a time-boxed spike before committing to WINE-based approaches.

## Implementation

**CLASS 1 — near-term**
1. Revisit `docs/dev/windows-vm-utm.md`'s stated goal per #90 item 1: rewrite around `bun test` + e2e, not installers.
2. Confirm the one remaining `win32` `skipIf` in `tests/secrets.test.ts` is genuinely unconstructable outside real Windows (per #90 item 2), rather than something a well-configured Wine setup could actually catch — but even if it could, weigh that single test against the effort/false-green risk of standing up Wine for everything else.
3. Re-run the `e2e:replace` timing probe from #78 on the UTM VM per #90 item 3, since Microsoft's translation layer changes timing characteristics — this is exactly the "not for performance" caveat already documented [11] made concrete.

**CLASS 2 — near-term**
1. Spike: build maximal's Electron app for `win32-arm64` (rebuild native deps against MSVC v142/VS2017 ARM64 toolset per Electron's docs [9]), install it inside the UTM Windows-11-ARM VM off local disk (not the shared folder — Chromium's sandbox breaks over network paths [9]), and run whatever self-checks exist. This validates approach 2A end-to-end.
2. In parallel/fallback: try the existing x64 build inside the same VM under Microsoft's built-in emulation, to see whether an arm64 packaging target is even necessary for CLASS 2, or whether the CLI-correctness/GUI-correctness line holds the same way it does for CLASS 1.
3. Do not spend time on WINE/box64/FEX/Hangover for Electron specifically unless a concrete, documented success report for Chromium/Electron surfaces later — as of this research (Aug 2026), none exists.

## Risks

- **False green (Class 1, WINE path)**: an open-handle-blocks-delete test passes under Wine not because Windows semantics were faithfully reproduced, but because the specific filesystem path (virtiofs/9p mount into a colima guest) doesn't enforce the share-mode the way local NTFS would — silently converting "no coverage" into "coverage that lies," exactly the failure mode named in the prompt. Mitigation: don't run this class of test under Wine; use the real-Windows VM or hosted runner instead.
- **False green (Class 2, WINE path, subtler)**: a self-check "passes" under Wine only because `--no-sandbox --disable-gpu --single-process` were required to get the app to launch at all — meaning the multi-process/sandbox/GPU code paths the check exists to validate were never exercised. Mitigation: treat any Wine-based Electron run as explicitly out of scope for sandbox/GPU-related self-checks, or avoid it entirely per the recommendation above.
- **Microsoft's x64-on-arm64 translation, unverified for Chromium**: the org's existing trust in this layer is established for a CLI tool (Bun), not for a multi-process sandboxed Chromium app. Mitigation: the Class 2 implementation plan above explicitly spikes this before relying on it.
- **UTM operational friction**: no scriptable snapshot/restore in UTM 4.7.4 means dirty-VM cleanup is export/reimport (minutes, manual "Add" prompt) rather than instant — this is a throughput cost on the local loop, not a fidelity risk, but will shape how CI-like this local loop can actually be made. [11]
- **Electron native-module arm64 rebuild risk**: any native module without a proper Windows-arm64 build, or any script that branches only `x64`/`ia32`, will silently produce a wrong-architecture artifact rather than a loud failure [9] — worth an explicit CI assertion on `npm_config_arch`/artifact architecture if the arm64 packaging spike proceeds.
- **AVX/AVX2 is a dead end on this host regardless of path chosen**: confirmed unsupported under Rosetta (both macOS-native and Rosetta-in-Linux share the same core) as of the most recent evidence (Dec 2024, macOS 15.1) [2], and colima's own docs scope instruction-set-extension control to QEMU only, with QEMU's own AVX CPUID advertisement on aarch64 hosts called "definitely looks like a bug" by QEMU's own community [4]. If any Windows or Linux toolchain in this org's future needs AVX/AVX2 under Apple Silicon emulation (e.g., certain llama.cpp builds, as flagged in the prompt), assume it does not work via colima/Rosetta and budget for QEMU-TCG-only (slow, and still flagged buggy) or native x86-64 hardware.

METRICS: searches=17 fetches=19 high_quality=9 ratio=0.65
CHECKS: [x] freshness [x] went_deep [x] found_outlier [x] checked_awesome

## Feedback
usefulness: | implemented: | result: | notes:
