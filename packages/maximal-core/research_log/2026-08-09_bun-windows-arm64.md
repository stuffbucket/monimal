# Research: Bun on Windows 11 ARM64 (mid-2026 state)
Started: 2026-08-09T17:28:49-07:00 | Status: complete | ended: 2026-08-09T18:20:00-07:00

## Problem
This project pins Bun 1.3.14 as its toolchain. We need to know whether Bun
runs natively on Windows 11 ARM64 devices, whether the pinned 1.3.14 release
has a native arm64 asset, whether the x64 build works under Windows's
Prism/x64 emulation, what the official install.ps1 script does on an ARM64
host, and whether AVX2 is a hard requirement (relevant since QEMU/Prism
emulation historically didn't expose AVX2). This determines whether we can
support contributors/CI on Windows ARM64 devices.

## Awesome Lists Checked
- `oven-sh/awesome-bun` (https://github.com/oven-sh/awesome-bun) — curated
  Bun ecosystem list (tools/frameworks/libraries). Checked but not directly
  relevant: it does not track platform/OS support matrices, only
  community packages built on Bun. No Windows-ARM64-specific entries found.

## Searches
1. "bun windows arm64 aarch64 site:github.com/oven-sh/bun" | fresh: none | findings: surfaced issue #9824 (original ARM64 support request), #21869 (build crash), #28055 (bun:ffi unsupported), and setup-bun#164 (asset detection).
2. "awesome-bun site:github.com" | fresh: none | findings: oven-sh/awesome-bun confirmed as the canonical list; not platform-support focused.
3. "bun windows arm64 native build 'bun install' OR 'bun test' problems 2026" | fresh: none | findings: surfaced Bun v1.3.11 blog, mise discussion #7155, several crash issues (#27201, #27692, #16976).
4. "bun-windows-aarch64 issues site:github.com/oven-sh/bun 2026" | fresh: none | findings: surfaced #27201 (alignment panic on native ARM64), #27692 (Windows x64 BSOD, unrelated to ARM64), setup-bun#168 (action still fetching x64 on arm64 runners as of v1.3.10-era).
5. "Windows 11 Prism emulator AVX2 support rollout 2025 24H2" | fresh: none | findings: Microsoft shipped AVX/AVX2 emulation via Prism starting ~Oct 2025 (KB5066835, Windows 11 24H2), addressing the historical "no AVX2 under emulation" gap.
6. Direct GitHub API queries against `api.github.com/repos/oven-sh/bun/releases/tags/{bun-v1.3.14, bun-v1.3.10, bun-v1.3.9}` to get exact, authoritative asset lists (not search — direct source fetch).

## Sources

[1] Bun GitHub Releases API — bun-v1.3.14 (pinned version)
url: https://api.github.com/repos/oven-sh/bun/releases/tags/bun-v1.3.14 | fetched via curl (GitHub REST API, unauthenticated) | type: primary/official | quality: high
- Published 2026-05-13T03:48:28Z.
- Full asset list includes `bun-windows-aarch64.zip` and `bun-windows-aarch64-profile.zip`, alongside `bun-windows-x64.zip`, `bun-windows-x64-baseline.zip`, `bun-windows-x64-profile.zip`, `bun-windows-x64-baseline-profile.zip`.
- Confirms: **1.3.14 ships a native Windows ARM64 asset.**
- Full asset list for 1.3.14 (all platforms) is included verbatim; see Approaches/Implementation section for the Windows subset.

[2] Bun GitHub Releases API — bun-v1.3.10 and bun-v1.3.9 (boundary check)
urls: https://api.github.com/repos/oven-sh/bun/releases/tags/bun-v1.3.10 (published 2026-02-26T07:08:20Z) and .../bun-v1.3.9 (published 2026-02-08T09:31:23Z) | type: primary/official | quality: high
- 1.3.9 asset list has **no** `bun-windows-aarch64*` asset — only x64/x64-baseline variants.
- 1.3.10 asset list **does** include `bun-windows-aarch64.zip` / `-profile.zip`.
- This pins down the exact release boundary: **native Windows ARM64 shipped starting Bun v1.3.10 (2026-02-26)**, and every stable release since (including our pinned 1.3.14) has it.

[3] Bun install script — https://bun.sh/install.ps1
fetched directly | type: primary/official script | quality: high
- Detects architecture via the registry key `HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Environment\PROCESSOR_ARCHITECTURE` (chosen specifically because `Win32_ComputerSystem.SystemType` is unreliable under WoW64/x64-emulation).
- Accepts only `AMD64` or `ARM64`; anything else aborts with "Bun for Windows is only available for x86 64-bit and ARM64 Windows."
- Maps `ARM64` → asset name `bun-windows-aarch64`, `AMD64` → `bun-windows-x64` (or `-baseline` if AVX2 absent/forced).
- **The AVX2/baseline check is explicitly skipped for ARM64** (`if (-not $IsARM64) { ...IsProcessorFeaturePresent(40) check... }`) — i.e., there is no ARM64 "baseline" build; the single aarch64 build is used unconditionally.
- On `STATUS_DLL_NOT_FOUND`, the script points ARM64 users at `vc_redist.arm64.exe` specifically, confirming first-class ARM64 handling.

[4] Bun official docs — Installation page
url: https://bun.com/docs/installation (canonical bun.sh docs, mirrored at bun.com) | fetched directly | type: official docs | quality: high
- Direct-download card grid explicitly lists **"Windows ARM64" → bun-windows-aarch64.zip** with the caption "Windows on ARM (Snapdragon, etc.)", alongside Windows x64 and x64-baseline.
- CPU Requirements section: standard x64 binaries require Haswell/AVX2-class instructions (Intel Haswell+/AMD Excavator+); baseline x64 targets Nehalem/SSE4.2 (no AVX2). This baseline/standard split is **x64-only** — there's no baseline variant mentioned for ARM64 (consistent with source [3]).
- No caveats/warnings are listed for Windows ARM64 specifically on this page (contrast with source [8] below, which does document real gaps).

[5] Bun Blog — "Bun v1.3.10" release announcement
url: https://bun.com/blog/bun-v1.3.10 | fetched directly | type: official blog | quality: high
- Verbatim: "Bun now natively supports Windows on ARM64 (Snapdragon, etc.). You can install and run Bun on ARM64 Windows devices," plus cross-compilation support via `--target=bun-windows-arm64`.
- Dated 2026-02-26, matching the release-API boundary in source [2].
- No caveats stated in the announcement text itself (the real caveats surface in the PR and later issues — see below).

[6] PR #26215 — "feat(windows): Add Windows ARM64 support" (oven-sh/bun)
url: https://github.com/oven-sh/bun/pull/26215 | type: primary GitHub PR | quality: high
- Merged 2026-01-22 by Jarred-Sumner (Bun's creator). Authored via an automated/Claude-assisted branch (`claude/windows-arm64-support`), 17 commits.
- Implementation: bumped LLVM 19.1.7 → 21.1.8 (first LLVM with ARM64 Windows builds), added a `cmake/toolchains/windows-aarch64.cmake` toolchain, Highway NEON support, Zig target-triple support for `windows_aarch64`.
- **Documented, still-current limitations from the PR itself:**
  - `bun:ffi` (TinyCC-based) is **disabled by default on ARM64** — `ENABLE_TINYCC` off for `WIN32 && aarch64`.
  - **JIT/WASM disabled on Windows ARM64**: a later commit in the same PR turns off `useWasm`, `useJIT`, and `useBBQJIT` on Windows ARM64 because WebKit's IPInt interpreter "has alignment validation issues due to COFF format not correctly handling the `.balign` directive," pending an upstream WebKit fix. A reviewer flagged `useConcurrentJIT` was left on inconsistently.
  - No ARM64 baseline variant exists.
  - Zig itself is still fetched/run as x86_64 on Windows ARM64 (i.e., parts of the *build toolchain*, not the shipped runtime, still run under emulation).

[7] Bun Blog — "Bun v1.3.11" release
url: https://bun.com/blog/bun-v1.3.11 | fetched directly | type: official blog | quality: high
- One Windows-ARM64-specific fix: `bun_shim_impl.exe` (used for `node_modules/.bin/*` shims) was previously hardcoded x86_64, so every package-binary invocation on Windows ARM64 ran through x64 emulation even on the native ARM64 Bun build. v1.3.11 compiles this shim natively for aarch64, "removing the emulation overhead." Credited to @dylan-conway.
- This confirms that even after "native support" landed in 1.3.10, there were still real sub-components silently running emulated — evidence that ARM64 support was (and likely still is) being incrementally hardened rather than 100% native end-to-end from day one.

[8] GitHub Issue #28055 — "Support bun:ffi on Windows ARM64" (oven-sh/bun)
url: https://github.com/oven-sh/bun/issues/28055 | type: primary GitHub issue | quality: high
- Opened 2026-03-12, **closed**, linked to PR #33696.
- Confirms as of March 2026 (after 1.3.10/1.3.14-era): "Windows ARM64 support landed in #26215, but `bun:ffi` is still completely disabled on that target" — blocked specifically on TinyCC lacking a maintained Windows-ARM64 revision at the pinned commit Bun vendors.
- `dlopen()`/fixed-symbol loading is gated behind the same TinyCC flag even though it arguably shouldn't need a C compiler — flagged as a possible quick win, not yet split out at issue-open time.
- Real-world consequence, corroborated by a related report ("OpenTUI fails to start on Windows ARM64: bun:ffi dlopen() is not..." — https://github.com/anomalyco/opencode/issues/38520): any project depending on `bun:ffi` (native addon loading via Bun's FFI, not N-API) breaks on Windows ARM64.

[9] GitHub Issue #27201 — "panic: incorrect alignment on Windows ARM64 (Bun v1.3.10)"
url: https://github.com/oven-sh/bun/issues/27201 | type: primary GitHub issue | quality: medium (single reporter, no maintainer comment visible, no confirmed root cause in the visible thread)
- Opened 2026-02-19, on Bun v1.3.10, Windows 11 ARM64, running Claude Code (a Bun-based CLI) — crash after prolonged normal use: "panic(thread 3544): incorrect alignment."
- Issue is marked **Closed**, but no maintainer comment or fix commit is visible in the fetched content, so I could not verify *why*/how it was resolved — flagging this as unverified rather than guessing.
- This is consistent with the PR #26215 caveat about ARM64 alignment issues (COFF `.balign` handling) not being fully resolved at ship time.

[10] GitHub Issue #21869 — "Bun build crashes on Windows ARM64"
url: https://github.com/oven-sh/bun/issues/21869 | type: primary GitHub issue | quality: medium
- Opened 2025-08-14, Bun v1.2.19 — **before** native ARM64 support existed (predates v1.3.10 by ~6 months). The crash trace explicitly identifies the binary as `"windows x86_64_baseline"` with `no_avx2, no_avx` feature flags — i.e., this is the **x64-baseline build running under old Prism emulation**, not a native arm64 binary. Panic in Bun's SIMD string-search layer (`highway.zig`), consistent with CPU-feature mismatches under pre-AVX2-emulation Prism.
- Still **open** as of research date; likely superseded in relevance by the native ARM64 build, but demonstrates the pre-1.3.10 x64-emulation path was genuinely fragile, not just "slower."

[11] GitHub Issue #9824 — "Support Windows ARM64" (original tracking issue)
url: https://github.com/oven-sh/bun/issues/9824 | type: primary GitHub issue | quality: medium (limited visible content — comment thread did not render)
- Opened 2024-04-02 on Bun 1.1, reporting install.ps1's then-hard refusal: "Bun for Windows is currently only available for x86 64-bit Windows." Labeled `tracking`, `windows`. Now closed (presumably by PR #26215, ~22 months later), though I could not directly confirm the closing commit from the fetched content.

[12] oven-sh/setup-bun Issue #164 — "Use native Windows ARM64 binary now that Bun v1.3.10 ships bun-windows-aarch64"
url: https://github.com/oven-sh/setup-bun/issues/164 | type: primary GitHub issue | quality: high
- Opened 2026-02-26 (same day as the 1.3.10 release), closed, fixed via PR #165.
- Quotes setup-bun's pre-fix warning message verbatim: Bun "does not provide native arm64 builds for Windows," and the x64-baseline fallback runs "through Microsoft's x64 emulation layer," which "may cause reduced performance and potential compatibility issues" — this was setup-bun's own logic, now understood to be **outdated** as of 1.3.10+.

[13] oven-sh/setup-bun Issue #168 — "Downloading x64 version on arm64 Windows runners"
url: https://github.com/oven-sh/setup-bun/issues/168 | type: primary GitHub issue | quality: high
- Filed 2026-03-02, closed via PR #170. Confirms that even after #164/#165 landed, setup-bun's `getArchitecture()`/`getAvx2()` helpers in `src/utils.ts` were still hardcoded to steer Windows ARM64 GitHub Actions runners (`windows-11-arm`) to `bun-windows-x64-baseline.zip` — i.e., **CI tooling lagged the underlying Bun release** by about a week, and needed its own separate fix. Important operational note: don't assume third-party installers/actions auto-detect ARM64 correctly just because Bun itself ships the asset.

[14] Bun docs — "Building Windows" (build-from-source guide)
url: https://bun.com/docs/project/building-windows | fetched directly | type: official docs | quality: high
- Confirms LLVM 21.1.8 is "the first version with ARM64 Windows builds," requiring a manual `LLVM-21.1.8-woa64.exe` download (Scoop/Chocolatey lack an ARM64 package).
- States the one clearly-documented permanent ARM64 build limitation: **no LTO for arm64** — "LLVM's CodeView emitter can't handle ARM64 NEON tuple registers during LTO codegen" — and the same exclusion applies to `--baseline` (reinforcing there is no ARM64 baseline target).
- Notes cross-compiled Windows-ARM64 binaries built on a Linux host skip the `--revision` smoke test (can't execute the target binary on the build host), so verification needs real Windows or Wine.

[15] Microsoft Support — KB5066835 (Oct 14, 2025, Windows 11 24H2/23H2)
url: https://support.microsoft.com/en-US/servicing/os/windows-11/2025/10/october-14-2025-kb5066835-os-builds-26200-6899-and-26100-6899 | type: official Microsoft KB | quality: high
- Corroborated by multiple tech press (Neowin, WindowsLatest, TechPowerUp): this update began rolling out **AVX/AVX2 instruction emulation in Prism** (Windows-on-ARM's x86/x64 emulator) for the first time, targeting improved x64-game/app compatibility. Prior to this, Prism did not emulate AVX2 at all, which is the direct cause of the `STATUS_ILLEGAL_INSTRUCTION` crash pattern seen in source [16].

[16] jdx/mise Discussion #7155 — "[Bug] Bun on Windows ARM64 fails to run"
url: https://github.com/jdx/mise/discussions/7155 | type: community bug report (third-party tool, not Bun itself) | quality: medium
- Nov 2025, mise v2025.11.4 on a Snapdragon X Elite laptop, `mise use bun@1.2` (pre-native-ARM64 Bun). mise's own arch-detection code (`src/plugins/core/bun.rs`) requested the **non-baseline x64 build** (`bun-windows-x64.zip`) for ARM64 hosts, which uses AVX2 — Prism at the time could not emulate AVX2, producing `-1073741795` (`STATUS_ILLEGAL_INSTRUCTION`, i.e. `0xC000001D`). Root cause identified as a bug in mise's own arch-mapping (should request `x64-baseline`, not `x64`), not a Bun bug per se.
- A Microsoft engineer (Psychlist1972) later asked in the thread (Feb 2026) whether this was retested after Prism's AVX/AVX2 update (source [15]) — implying the specific failure mode may no longer reproduce even for x64-under-emulation, post-October-2025.

[17] GitHub Issue #27692 — "Bun crashes in Claude Code cause Windows BSOD" (outlier / negative-signal source)
url: https://github.com/oven-sh/bun/issues/27692 | type: primary GitHub issue | quality: medium
- Included as an outlier/critical perspective on Bun's general Windows stability (not ARM64-specific — reporter's machine is Windows 11 **x64**, Intel Core i9). Documents repeated BSODs (KERNEL_SECURITY_CHECK_FAILURE, KMODE_EXCEPTION_NOT_HANDLED, PAGE_FAULT_IN_NONPAGED_AREA) during extended Claude Code (Bun-based) sessions on v1.3.10, tied by the reporter to known open Bun issues (N-API async cleanup use-after-free, NaN-boxing GC corruption, orphaned high-memory processes: #27471, #27099, #27138, #18198). No maintainer response yet; open as of report.
- Relevance: shows that Bun's Windows platform (both x64 and, per #27201, ARM64) had non-trivial stability issues around the v1.3.10/1.3.14 timeframe unrelated to architecture per se — worth factoring into any decision to run Bun-based tooling unattended/long-running on Windows, ARM64 or not.

## Approaches

### Approach A: Use the native `bun-windows-aarch64.zip` build (recommended default)
- **Pros**: Confirmed shipping since v1.3.10 and present in the pinned v1.3.14 release [1][2][5]. No emulation overhead for the core runtime; v1.3.11 further removed emulation from the `.bin` shim path [7]. Official docs list it as a first-class download target [4].
- **Cons**: `bun:ffi` (dlopen/cc/callback/linkSymbols) is fully disabled on this target [8]. JIT and WebAssembly (`useJIT`/`useWasm`/`useBBQJIT`) were disabled at ship time in the merging PR pending a WebKit COFF-alignment fix [6] — I could not confirm from fetched sources whether this has since been re-enabled in 1.3.14 specifically; treat as still-off unless verified against the current `src/bun.js` feature flags or a changelog entry. At least one alignment-panic report exists on v1.3.10 [9] with unclear resolution. No LTO/no baseline variant when building Bun itself from source [14] (irrelevant to end users just running the released binary).
- **Complexity**: Low for end users (`bun.sh/install.ps1` handles it transparently); Medium for CI (third-party actions like `setup-bun` needed their own separate fixes to actually fetch this asset — see #164/#168 [12][13]).
- **Best scenarios**: Any normal JS/TS app development, `bun install`, `bun test`, bundling — anything not depending on `bun:ffi` or (if still disabled) JIT-dependent workloads.

### Approach B: Run the x64 Windows build under Prism emulation
- **Pros**: Not needed anymore for stable Bun ≥1.3.10 on Windows 11 ARM64 — included here only for completeness / for pre-1.3.10 pins or third-party tools that haven't updated their arch detection.
- **Cons**: Historically crashed outright if the non-baseline (AVX2) build was fetched on pre-Oct-2025 Prism, since AVX2 wasn't emulated [15][16]. Even with the baseline build it's slower, and one real bundler crash was documented specifically in this configuration [10]. Microsoft's Oct 2025 Prism update added AVX/AVX2 emulation [15], which should reduce (but per Microsoft's own engineer, is not yet confirmed to fully eliminate [16]) this class of failure for the non-baseline x64 build too.
- **Complexity**: Low if you explicitly force baseline (`-ForceBaseline`, or an up-to-date tool), Medium/fragile if arch-detection is wrong and it silently grabs the AVX2 build.
- **Best scenarios**: Only relevant for Bun versions < 1.3.10, or if some other tool in your stack requires x64-specific native addons unavailable on arm64.

### Approach C: Do not support Windows ARM64 as a first-class CI/dev target yet
- **Pros**: Avoids exposure to bun:ffi gaps, the not-fully-verified JIT/WASM disablement, and the still-fresh (post-Jan-2026) toolchain maturity.
- **Cons**: Unnecessarily conservative given the native build has existed and been iterated on (1.3.10 → 1.3.11 shim fix) for ~6 months by the time of the pinned 1.3.14 release; most ordinary bundling/testing work doesn't touch `bun:ffi` or JIT toggles directly.
- **Complexity**: N/A (policy choice).
- **Best scenarios**: If this project's toolchain depends on `bun:ffi` (native addon loading via Bun's own FFI, as opposed to N-API), or on features gated by JIT.

## Recommendation
Bun 1.3.14 (this project's pin) **does** ship a native Windows ARM64 asset
(`bun-windows-aarch64.zip`), confirmed directly against the GitHub Releases
API [1]. Native ARM64 support has existed since v1.3.10 (2026-02-26) [2][5],
roughly 2.5 months before 1.3.14 shipped (2026-05-13), so it is not
brand-new/unstable in the "just landed" sense — it has had at least 4 patch
releases to mature (1.3.10 → 1.3.14).

**Recommendation: treat Windows 11 ARM64 as supported via the native
`bun-windows-aarch64` build (Approach A)**, with two explicit caveats to
document for contributors/CI:
1. **Do not use `bun:ffi`** (dlopen/cc/callback/linkSymbols) on this
   platform — it is unconditionally disabled pending a TinyCC ARM64 port
   [8]. If any dependency in this project needs native FFI loading (not
   N-API), it will fail on Windows ARM64 specifically.
2. **JIT/WASM status is unverified for 1.3.14** — the disabling commit is
   confirmed present in the PR that introduced ARM64 support [6], but I did
   not find a changelog entry confirming re-enablement by 1.3.14. If this
   project relies on `bun:jsc`/WASM-heavy code paths on Windows ARM64,
   verify directly (`bun --print "typeof WebAssembly"` behavior, or check
   for a JIT-related changelog line in 1.3.11/1.3.12/1.3.13/1.3.14 blog
   posts — only 1.3.10 and 1.3.11 posts were checked in this research).

If CI uses `oven-sh/setup-bun`, verify the action version pulls in the
fixes from setup-bun PRs #165/#170 (merged in response to issues #164/#168
in early March 2026) — older pinned action versions may still silently
fetch the x64-baseline build under emulation even though the native asset
exists upstream [12][13].

## Implementation
1. **Exact Windows asset set for the pinned Bun v1.3.14** (verified via
   `curl https://api.github.com/repos/oven-sh/bun/releases/tags/bun-v1.3.14`):
   - `bun-windows-x64.zip`, `bun-windows-x64-profile.zip`
   - `bun-windows-x64-baseline.zip`, `bun-windows-x64-baseline-profile.zip`
   - `bun-windows-aarch64.zip`, `bun-windows-aarch64-profile.zip`
   - (plus `SHASUMS256.txt` / `.asc` covering all of the above)
2. On a Windows 11 ARM64 machine, `powershell -c "irm bun.sh/install.ps1 | iex"`:
   - Reads `PROCESSOR_ARCHITECTURE` from the registry (works correctly even
     under WoW64/emulation, unlike `Win32_ComputerSystem.SystemType`).
   - Resolves to `ARM64` → downloads
     `https://github.com/oven-sh/bun/releases/latest/download/bun-windows-aarch64.zip`
     (or `.../download/bun-v1.3.14/bun-windows-aarch64.zip` if pinning a
     version via `-Version 1.3.14`).
   - Does **not** apply any AVX2/baseline check for ARM64 — there is only
     one ARM64 variant.
   - On `STATUS_DLL_NOT_FOUND`, would direct the user to
     `vc_redist.arm64.exe` (arch-correct).
3. To pin the exact version on Windows (matching this repo's toolchain
   pin), per Bun's own docs [4]:
   ```powershell
   iex "& {$(irm https://bun.com/install.ps1)} -Version 1.3.14"
   ```
4. If using GitHub Actions `windows-11-arm` runners with
   `oven-sh/setup-bun`, ensure the action version is recent enough to
   include the fixes from setup-bun PRs #165 and #170 (both closed as
   fixes for issues opened 2026-03-02 or earlier) so it fetches
   `bun-windows-aarch64.zip` rather than falling back to
   `bun-windows-x64-baseline.zip` under emulation.
5. Do not rely on `bun:ffi` in any code path expected to run on Windows
   ARM64 until oven-sh/bun#33696 (the PR that closed #28055) is confirmed
   present in the pinned version — I did not verify which Bun release
   contains PR #33696; this needs a follow-up check before relying on FFI
   there.

## Risks
- **JIT/WASM disablement status unverified for 1.3.14**: could silently
  degrade performance or break WASM-dependent code on Windows ARM64 with no
  clear error message. Mitigation: smoke-test `bun run` of a small
  WebAssembly module on real Windows ARM64 hardware (or a VM) before
  depending on it; check the 1.3.12/1.3.13/1.3.14 changelogs
  (bun.com/blog/bun-v1.3.12, -v1.3.13, -v1.3.14 — not fetched in this
  research) for a JIT re-enablement note.
- **bun:ffi hard failure**: any transitive dependency using Bun's FFI
  (not Node-API) will throw on Windows ARM64. Mitigation: grep the
  dependency tree for `bun:ffi` imports; if found, either avoid that
  dependency on this platform or gate it behind a platform check.
  Corroborated by a real downstream break (OpenTUI/opencode, source [8]).
- **Third-party tooling lag**: installers/version-managers/CI actions
  (mise, early setup-bun) had incorrect ARM64 handling for months after
  Bun itself added native support — don't assume any wrapper tool
  auto-detects correctly; verify the actual binary architecture at runtime
  (`bun --revision` and check the executable, or `[Environment]::Is64BitProcess`
  combined with `PROCESSOR_ARCHITECTURE`).
- **General Windows stability reports independent of ARM64** (#27692):
  there are open, unresolved reports of Bun-based long-running processes
  (Claude Code) causing kernel-level crashes on Windows (x64, in that
  report) tied to suspected N-API/GC issues. Not ARM64-specific, but
  relevant to any decision to run Bun unattended/long-session on Windows in
  general. Mitigation: if adopting Windows (ARM64 or x64) as a CI/dev
  target, monitor for process hangs/crashes and keep Bun on the latest
  patch release.
- **Unverified issue-closure reasons**: for #27201 and #9824, GitHub's
  rendered page did not expose the comment thread/closing commit, so their
  precise resolution (which release, what fix) is inferred rather than
  confirmed. Treat "closed" as "no longer an open bug report," not
  necessarily "root-caused and fixed" without further digging into the
  linked commits.

METRICS: searches=6 fetches=17 high_quality=12 ratio=1.9
CHECKS: [x] freshness [x] went_deep [x] found_outlier [x] checked_awesome

## Feedback
usefulness: | implemented: | result: | notes:
