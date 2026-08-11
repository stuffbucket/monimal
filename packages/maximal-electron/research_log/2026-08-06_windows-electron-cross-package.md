# Research: Packaging a win32-x64 Electron app on a non-Windows host
Started: 2026-08-06T13:15:06-07:00 | Status: complete | ended: 2026-08-06T14:46:17-07:00

## Problem
The project (Electron 43.x, Electron Forge 7.11.x, Vite, asar+integrity+fuses,
native modules @lydell/node-pty and node-llama-cpp) currently packages win32-x64
on a windows-latest GitHub Actions runner. Question: could win32-x64 packaging
move to a Linux or macOS host instead? What exactly is documented to work,
what is known to work in practice, and what breaks (rcedit/WINE, fuses, asar
integrity, native prebuilds, code signing, file semantics)? Read-only spike,
no code changes.

## Awesome Lists Checked
- [sindresorhus/awesome-electron](https://github.com/sindresorhus/awesome-electron) — general Electron resource list, no dedicated cross-platform-packaging entry; pointed toward electron-builder/electron/packager themselves as the canonical sources, which is where the actual research was done.
- No dedicated "awesome cross-compiling Electron" list exists; this is a narrow enough question that primary-source repos (electron/packager, electron/forge, electron-builder, electron/asar, npm/cli) are the right sources, not curated lists.

## Searches
1. "awesome electron site:github.com" | fresh: none | findings: no specialized list; confirmed primary sources are the way to go.
2. "@electron/packager rcedit wine linux windows target" | fresh: none | findings: surfaced electron/node-rcedit issue #22 (wine64) and electron/packager issue #1515 (wine64 detection) — but also surfaced that node-rcedit is archived, hinting at a replacement.
3. "electron-builder build windows target on linux wine requirement" | fresh: none | findings: electron.build multi-platform-build docs, confirms Wine+Mono model for electron-builder (a *different* tool from Forge/packager).
4. "npm install --os win32 --cpu x64 optional dependencies override" | fresh: none | findings: npm/rfcs#612, npm/cli#6755, confirmed `--os`/`--cpu` flags exist in modern npm.
5. "node-llama-cpp prebuilt binaries win32 x64 optionalDependencies platform packages" | fresh: py | findings: per-platform npm packages under `@node-llama-cpp/*` scope.
6. "@lydell/node-pty conpty.node prebuilt binary platform package win32" | fresh: py | findings: per-platform packages under `@lydell/node-pty-*`.
7. "electron/fuses flip fuses cross platform windows exe from linux macos" | fresh: none | findings: no explicit host-OS caveat in README; inferred pure binary-patch behavior.
8. "asar integrity hash header cross platform build reproducible electron" | fresh: none | findings: found the actual crux bug — electron-builder PR #8689 and electron/packager issues #1780/#1873.
9. "electron packager resedit replaces rcedit wine no longer required pure javascript" | fresh: py | findings: confirms Wine dependency was removed entirely starting packager v18.2.0/v18.12.0.
10. "electron forge 7.11 @electron/packager version dependency package.json" | fresh: py | findings: Forge 7.11.2 depends on `@electron/packager ^18.3.5`.
11. "electron forge package win32 target from macOS linux host cross-platform native modules" | fresh: none | findings: electron/forge issue #3142 (Squirrel maker failure on macOS→win32/arm64), electron/rebuild README (arch override yes, platform override no).
12. "electron-forge OR electron-builder building windows exe from macOS 2026 native modules pain reddit OR blog" | fresh: none | findings: mostly circular back to official docs; one electron-builder ARM64 Docker question (#8038) with no real answer recorded.
13. "node-pty electron package windows target from linux native module conpty issue" | fresh: none | findings: nothing node-pty-specific beyond the optionalDependencies structure already found.

Direct npm registry queries (via `npm view`) were used to verify os/cpu gating and dependency versions with certainty rather than relying on search snippets.

## Sources

[1] electron/packager README (main branch)
raw.githubusercontent.com/electron/packager/main/README.md | 2026-08-06 | official docs | high
- Confirms `win32` is an explicitly supported target platform/arch from any host platform (Windows/macOS/Linux all listed as valid hosts).
- No mention of Wine anywhere in the current README — a "Building Windows apps from non-Windows platforms" section that used to exist has been removed.
- Only signing caveat documented is for macOS: ".app bundle can only be signed when building on a host macOS platform." No equivalent Windows-signing-requires-Windows-host statement exists.
- ia32 (x86) Windows and armv7l Linux builds are "only published for Electron <= 43" — not relevant to this project's win32-**x64** target, but worth flagging since the project is currently on Electron 43.x.

[2] electron/packager package.json (main branch, current release line 20.x)
raw.githubusercontent.com/electron/packager/main/package.json | 2026-08-06 | source of truth | high
- `resedit: ^2.0.3` is a dependency; `rcedit` does not appear anywhere in the manifest.
- Confirms the rcedit→resedit migration is real and current, not a rumor.

[3] "[Web] ElectronのexeビルドにWineは不要になった" (pg-fl.jp, by resedit's author jet2jet)
www.pg-fl.jp/program/tips/electron_no_wine.htm | article dated 2024-03-29 (>1yr old but describes a stable, unreversed change) | author-is-the-tool's-maintainer blog | high
- Explains the actual mechanism: rcedit shelled out to a real Windows PE-editing `.exe`, which is why Wine was needed on non-Windows hosts.
- `resedit` (by the same author, `jet2jet/resedit-js`) reimplements Windows PE resource editing in pure JS/TypeScript with no native dependency — "it doesn't even depend on Node.js APIs, so it works in browsers too."
- The PR removing the rcedit dependency landed in `@electron/packager` v18.2.0; Wine is "formally gone" as a requirement from v18.12.0 onward, and packager's README dropped the "Building Windows apps from non-Windows platforms" section entirely at that point.
- Caveat noted by the author: projects with an existing lockfile may need to force-refresh `package-lock.json` to actually pick up a packager version new enough to have resedit.

[4] npm view of the current dependency graph (verified live, 2026-08-06)
`npm view @electron-forge/core@7.11.2 dependencies`, `npm view @electron/packager versions` | live registry query | primary/authoritative | high
- `@electron-forge/core@7.11.2` depends on `@electron/packager: ^18.3.5`.
- `@electron/packager` versions available: 18.0.0 through 18.4.4, then 19.0.0+ (breaking change), latest overall is 20.2.0.
- Because Forge pins with a caret (`^18.3.5`), a fresh `npm install`/`npm ci` today resolves to **18.4.4** (the newest 18.x satisfying the range) — well past the 18.3.6 fix and entirely on the pre-19.x line, which matters for the asar-integrity bug timeline below.
- `@electron/fuses` is not a direct Forge dependency — it's brought in separately as `@electron-forge/plugin-fuses`, which the project is presumably already using given "fuses" in its stack description.

[5] electron/packager issue #1780 "ASAR integrity info corrupt in crossplatform build" + PR #1781 (fix) + PR #1878 (follow-up fix)
github.com/electron/packager/issues/1780, /pull/1781, /pull/1878 | opened/merged Nov 2024 (PR #1781), PR #1878 merged 2026-02-09 | GitHub issue/PR, maintainer-authored fix | high
- **Root cause of #1780**: building a win32 target with `EnableEmbeddedAsarIntegrityValidation` enabled on a Linux host embedded the integrity manifest's file key as `resources/app.asar` (POSIX separator) instead of the Windows-expected `resources\app.asar`. Electron's runtime (`archive_win.cc`) does an exact string lookup and fails to find the entry, so the app crashes at launch with "Failed to find file integrity info for resources\app.asar" — reproduced both under Wine and on native Windows.
- Reporter (Lemonexe) reproduced it with **both** electron-forge and electron-builder, since both ultimately go through `@electron/packager`'s (or app-builder-lib's own) integrity-embedding code.
- Fixed in `@electron/packager` **v18.3.6** (PR #1781, merged same day it was filed, by MarshallOfSound — who noted this whole class of cross-building became possible only because of the rcedit→resedit migration: "cross-building windows on macOS is suddenly a Thing People Can Do").
- A **second**, unrelated regression (issue #1873, "ASAR integrity corrupt in v19") was introduced later in the v19 line by a `.buffer` vs buffer-slice bug in `resedit.js` when writing the integrity resource — fixed in **v19.0.3** (PR #1878). This regression appears to have been introduced during v19 refactoring and there is no evidence it ever affected the 18.x line.
- **Net assessment for this project**: since Forge 7.11.2 resolves to packager 18.4.4 (post-18.3.6, pre-19.x), it should have the separator fix and never have hit the v19 buffer regression — but this has not been independently verified by a real build in this research (see Risks).

[6] Lemonexe's reproduction gist ("ASAR integrity bug reproduction")
gist.github.com/Lemonexe/0f4b098febc1595914c1636e83b8c774 | 2024-11 | independent third-party repro, high detail | high
- Confirms the bug is specifically a build-host-vs-target path-separator mismatch: Linux-built binary embeds `resources/app.asar`, Windows-built binary embeds `resources\\app.asar`; only the latter matches what `archive_win.cc` looks up.
- Confirms the underlying SHA-256 hash computation itself is correct on both hosts — it's purely a key-matching/string-format bug, not a hashing bug.
- Explicitly built and tested under Wine 9.0 on Ubuntu 24.04, so this is a "works in practice" (post-fix) / "reported broken" (pre-fix) data point, not just theory.

[7] Electron official docs — ASAR Integrity tutorial
electronjs.org/docs/latest/tutorial/asar-integrity | current | official docs | high
- macOS support requires `electron>=16`, Windows support requires `electron>=30` (project is on 43.x, comfortably past both).
- On Windows, the integrity data is embedded as a PE resource of type `Integrity`/name `ElectronAsar`, a JSON array of `{file, alg, value}` objects, where `file` uses backslash-escaped paths like `resources\\app.asar` — this is the exact format the packager bug above was getting wrong pre-18.3.6.
- States plainly that Forge/Packager "handle all of this with no extra config when asar is on" for `@electron/packager>=18.3.1` and `@electron-forge/core>=7.4.0` — both comfortably satisfied by this project's Forge 7.11.x.
- Does not itself call out cross-platform-build caveats; that context only exists in the packager issue tracker (sources 5-6).

[8] @electron/asar source: `filesystem.ts` (main branch)
raw.githubusercontent.com/electron/asar/main/src/filesystem.ts | 2026-08-06 | source of truth | high
- The asar archive's own internal header (distinct from the Windows PE integrity resource above) builds file-tree keys using Node's platform-bound `path` API (`path.sep`, `path.basename`, `path.dirname`, `path.relative`) with no explicit POSIX normalization.
- Practical implication: building on a POSIX host (Linux/macOS) naturally produces forward-slash-style internal keys, which is the same direction Electron's own asar reader expects on all platforms (Electron's asar reader treats archive-internal paths as POSIX-style regardless of host OS) — so this direction (POSIX host → win32 target) is *not* a source of corruption. The asymmetric risk described in Electron/packager forum discussion is building *on Windows* for other targets, which is out of scope here.
- This is a different code path from the Windows PE "ElectronAsar" integrity resource (source 5-7); don't conflate the two — one is internal-to-asar (fine cross-platform), the other is the exe-level integrity metadata (was broken, now fixed as of packager 18.3.6+).

[9] npm CLI v11 docs — `install` command options
docs.npmjs.com/cli/v11/commands/npm-install/ | current | official docs | high
- `--os` and `--cpu` (and `--libc`) are real, current, documented npm install options: "Override CPU architecture / OS of native modules to install. Acceptable values are same as the `cpu`/`os` fields of package.json."
- These flags exist in npm ≥ 9.6.5 per the RFC discussion (source below) and are present through npm 11 (current).

[10] npm/rfcs#612 and linked npm/cli#6755
github.com/npm/rfcs/issues/612 | opened 2022-07, closed | GitHub RFC | medium (thin page content, but corroborated by live npm v11 docs)
- The RFC's own motivating example is almost exactly this project's scenario: "a Debian build box using wine to produce Windows artifacts will always be installed with linux native bindings" unless os/cpu can be overridden — i.e., this exact class of problem (cross-building an Electron app with native optionalDependencies) is why the feature was requested.

[11] `npm view` live verification of the two native modules' platform packages (2026-08-06)
npm registry, `npm view @lydell/node-pty-win32-x64 os cpu`, `npm view @node-llama-cpp/win-x64 os cpu`, `npm view node-llama-cpp optionalDependencies`, script fields on both leaf packages | live | primary source | high
- `@lydell/node-pty-win32-x64` declares `"os": ["win32"], "cpu": ["x64"]` and has **no lifecycle scripts** — it's a plain prebuilt-binary package with static os/cpu gating and nothing that inspects the running host at install time.
- `@node-llama-cpp/win-x64` likewise declares `"os": ["win32"], "cpu": ["x64"]` with **no lifecycle scripts**.
- `node-llama-cpp` (the root/wrapper package) lists 14 platform variant packages as `optionalDependencies`, including `@node-llama-cpp/win-x64`, `@node-llama-cpp/win-arm64`, `@node-llama-cpp/win-x64-cuda`, `@node-llama-cpp/win-x64-cuda-ext`, `@node-llama-cpp/win-x64-vulkan`.
- The root `node-llama-cpp` package **does** have a `postinstall` script (`node ./dist/cli/cli.js postinstall`) — unlike the leaf platform packages. This is worth flagging as a possible wrinkle (see Risks): it's not proven here whether that postinstall step behaves correctly when the *other* platform's optional dependency was force-installed via `--os`/`--cpu` rather than being the natural host match.
- Contrast with `sharp` (source 12 below): sharp's platform selection happens via a custom install script that inspects `process.platform`/`process.arch` directly, which is why `--os`/`--cpu` flags don't work for it. `@lydell/node-pty-*` and `@node-llama-cpp/*` leaf packages have no such script — they rely purely on npm's own os/cpu package-json gating, which **is** exactly what `--os`/`--cpu install flags control. This is a meaningfully different (and more favorable) situation than sharp's.

[12] lovell/sharp issue #4037 — `--cpu=x64 --os=win32` doesn't fetch the right binary
github.com/lovell/sharp/issues/4037 | 2023, closed | GitHub issue, negative/outlier result | medium
- Documents a real failure of the `--os`/`--cpu` override approach for a *different* package (sharp) whose own install script re-detects the host platform regardless of the flags, always downloading the host's own prebuilt binary.
- Important as an outlier/counter-example: **the `--os`/`--cpu` npm flags do not universally work** for every package that ships platform binaries — it depends entirely on whether the package's own tooling (postinstall scripts) respects npm's os/cpu resolution or does its own platform detection. This is why source [11]'s script-field check on the two modules this project actually uses matters — the mechanism differs from sharp's, but node-llama-cpp's own `postinstall` script is unverified.

[13] node-llama-cpp official Electron guide
node-llama-cpp.withcat.ai/guide/electron | current | official docs, highest authority for this specific module | high
- States directly and unambiguously: **"Cross packaging from one platform to another is not supported"** — the stated reason being "other platforms' binaries aren't fetched during `npm install`" by default.
- One narrower exception: arm64 app from an x64 host works; the reverse (x64 from arm64) does not. This is about **architecture**, not the win32-from-Linux/macOS **platform** crossing this project cares about.
- Recommends CI as the answer: a GitHub Actions matrix building natively on `windows-2022`, `ubuntu-22.04`, `macos-13`, uploading per-platform artifacts — i.e., the node-llama-cpp maintainers' own prescribed workflow is "use a real Windows runner for the Windows build," not cross-building.
- Native binaries must be excluded from the asar archive and the module treated as `external` in bundler config, or the required file-layout breaks — orthogonal to the cross-host question but a real packaging requirement either way.
- No compile-from-source fallback inside Electron by default ("we cannot assume that the user has the necessary build tools installed"), and source builds are impossible from inside an asar anyway (read-only archive).

[14] electron/forge issue #3142 — Squirrel maker fails building win32/arm64 from macOS
github.com/electron/forge/issues/3142 | opened 2023, still open, no maintainer response recorded | GitHub issue, unresolved | medium
- Packaging step itself succeeded ("Packaging for arm64 on win32" completed) on macOS with Wine+Mono installed, but the **making** step (Squirrel.Windows installer generation via `electron-winstaller`) failed with exit code 255 from a Mono/Squirrel.Utility exception.
- This is Forge-specific (not `@electron/packager`) and specifically about the Squirrel.Windows maker, which depends on Mono in addition to whatever packager needs — a second, independent toolchain requirement beyond the packager/resedit path.
- Confirms a real "works in practice, up to a point" story: **packaging succeeds cross-platform, but the Squirrel installer-maker step is a documented failure point on macOS**, unresolved as of this research. (This project's maker was not specified in the prompt; if it's Squirrel.Windows rather than zip/NSIS-equivalent, this is directly relevant.)

[15] electron/rebuild README (main branch)
raw.githubusercontent.com/electron/rebuild/main/README.md | current | official docs | high
- `--arch`/`arch` override is explicitly supported and documented ("Override the target architecture to something other than your system's").
- No `--platform`/`platform` option exists anywhere in the CLI or API — cross-**platform** rebuilding (e.g., rebuilding a native module against Windows Electron headers while running on Linux) is neither documented nor claimed. Building from source is delegated entirely to `node-gyp`, which needs a real target-OS toolchain to produce Windows-loadable binaries.
- Practical implication: this only matters if either native module needed rebuilding from source against the Electron ABI. Since both `@lydell/node-pty` and `node-llama-cpp` ship **prebuilt** binaries per platform (no local compilation needed if the correct platform package installs), `electron/rebuild`'s platform limitation is largely moot for this project **as long as the prebuilds are successfully fetched** — the crux is npm-level fetching (sources 11-13), not native compilation.

[16] electron-builder Multi Platform Build docs
electron.build/docs/features/multi-platform-build/ | current | official docs (different tool than this project uses, but useful comparison) | high
- Blunt, explicit statement: **"Don't expect that you can build an app for all platforms on one platform."** The blocking issue named is exactly this project's crux: native modules "can only be compiled on the target platform unless [prebuild] is used," and "most node modules don't provide" prebuilt binaries. The Docker-based cross-build path explicitly warns: "You cannot build for Windows using Docker if your app has native dependencies that don't use prebuild."
- For electron-builder (not this project's Forge, but architecturally identical dilemma), Wine 2.0+ is required for NSIS-target Windows builds from Linux, plus Mono 4.2+ additionally for Squirrel.Windows — this is the *older*, rcedit-based model that Forge/`@electron/packager` has since moved away from (source 3). electron-builder's own PR migrating to `resedit` (see search 9 results: "migrate to resedit npm package from app-builder-bin's usage of rcedit.exe", PR mmaietta/electron-builder#9717) suggests electron-builder is converging on the same Wine-free approach, but as of the docs fetched here the Wine/Mono requirement is still the documented default for that tool.

[17] electron-builder PR #8689 "fix(win): corrupt asar integrity file path on crossplatform build"
github.com/electron-userland/electron-builder/pull/8689 | merged 2024-11-17, in v26.0.0 GA | GitHub PR, merged and released | high
- Independent confirmation (in a sibling tool, same underlying Electron integrity-fuse mechanism) of the identical path-separator bug class described in sources 5-6: electron-builder had to add `path.win32` normalization for the exact same reason.
- Corroborates that this bug class was real, cross-tool (affected both Forge/packager and electron-builder independently, because both write the same Windows PE "ElectronAsar" resource format), and is now fixed in both tools' current releases.

[18] electron.build "Code Signing Windows Apps on Unix" tutorial
electron.build/docs/tutorials/code-signing-windows-apps-on-unix/ | current | official docs | high
- States Windows signing from Linux/macOS is officially supported, but only the EV-certificate/PKCS#11-hardware-token path needs manual setup (via JSign or osslsigncode); standard certificate signing is described as working "out of the box" (electron-builder specific claim, but the underlying signing tools are the same ones used regardless of packager/builder).
- Not urgent for this project since it does not currently sign Windows builds, but confirms this is a solved, documented problem if signing is ever added — no need to keep Windows-only for that reason.

## Approaches

**Approach A: Keep windows-latest GitHub Actions runner for win32-x64 packaging (status quo)**
- Pros: Zero known integrity/path-separator risk (native Windows host is exactly what packager, asar, and the two native modules are tested against); native modules install with zero flags/overrides; Squirrel/other makers face no Mono-on-macOS-style toolchain gaps; matches node-llama-cpp maintainers' own recommended CI pattern (source 13).
- Cons: Cannot reuse a single Linux/macOS build matrix; existing cost/complexity of a separate runner OS in CI.
- Complexity: Low (already working).
- Supporting sources: [13] (node-llama-cpp's own prescribed workflow), [1][2][3] (packager's win32 support is host-agnostic in principle, but native Windows remains the reference platform).
- Best scenario: This is the actual recommended path today.

**Approach B: Cross-build win32-x64 on a Linux container, with explicit npm `--os=win32 --cpu=x64` override for native prebuilds**
- Pros: WINE IS NOT REQUIRED — `@electron/packager` (resolved via Forge 7.11.2 to v18.4.4) uses `resedit`, a pure-JS PE resource editor, so icon/version-metadata embedding needs no Wine at all (sources 2, 3). Fuses flipping (`@electron/fuses`) appears to be pure binary patching with no host-native dependency (source unclear/inferred — see Risks). ASAR integrity path-separator corruption is fixed as of packager 18.3.6, and Forge's pinned range resolves past that fix (source 5, 4). npm's `--os`/`--cpu` flags are documented and current (source 9), and both `@lydell/node-pty-win32-x64` and `@node-llama-cpp/win-x64` are plain script-free prebuilt-binary packages gated only by package.json os/cpu fields — exactly the mechanism these flags control (source 11), unlike sharp's failure case (source 12).
- Cons: node-llama-cpp's own docs state cross-packaging "is not supported" (source 13) — this is the maintainers' position, not merely an inferred limitation, even though the underlying mechanism (optionalDependencies + os/cpu gating with no lifecycle script on leaf packages) looks like it *should* work with `--os`/`--cpu`. The root `node-llama-cpp` package's own `postinstall` script is unverified against this override path — it might do its own host detection that silently breaks things, similar in spirit to sharp. If the Squirrel.Windows maker is used (not verified for this project), it's a documented open failure point on non-Windows hosts (source 14) independent of the packager/asar fixes.
- Complexity: Medium-High — requires deliberately overriding npm defaults, verifying the actual runtime location/require path of the forced-in win32 binaries, and testing the packaged .exe on a real Windows machine or in Wine since the local dev/build host can never run the artifact to confirm it launches.
- Supporting sources: [2][3][4][5][6][7][9][11].
- Best scenario: If CI cost/complexity strongly favors a single Linux container fleet, and the team is willing to invest in verifying (through an actual test artifact on Windows) that node-llama-cpp's postinstall doesn't misbehave under forced cross-install.

**Approach C: Cross-build win32-x64 on Apple Silicon macOS**
- Same analysis as B for packager/fuses/asar (both are host-OS agnostic in the current code). Native module gating story is identical (npm `--os`/`--cpu` flags work the same way regardless of macOS vs Linux host).
- Additional consideration: if the maker is Squirrel.Windows, this is the exact scenario in the one open, unresolved GitHub issue found (source 14) — packaging succeeds, making (installer generation) fails via Mono. If the maker is zip or a non-Squirrel format, this risk doesn't apply.
- Complexity: Medium-High, same caveats as B, plus the Squirrel-maker risk is concretely documented here (vs. only inferred for Linux).

## Recommendation

**Packaging (not signing, not making-with-Squirrel) a win32-x64 Electron app on a non-Windows host is realistic in 2026 and is meaningfully easier than it would have been in 2023-2024** — the two things that used to make it a non-starter (Wine for rcedit, and the asar-integrity path-separator corruption bug) are both resolved in the current toolchain this project already uses (Forge 7.11.x → `@electron/packager` 18.4.4, source [2][3][4][5]).

The crux that remains is exactly what the prompt suspected: **native modules**. Concretely:

1. `@lydell/node-pty` and `node-llama-cpp` both distribute win32-x64 as script-free, os/cpu-gated npm packages (source 11) — this is the *good* case for cross-installing, unlike packages such as `sharp` that re-detect the host at install time regardless of npm flags (source 12). `npm ci --os=win32 --cpu=x64` (or setting `os`/`cpu` in `.npmrc`) is the documented, current mechanism (source 9) and should, mechanically, fetch the correct binaries.
2. However, node-llama-cpp's own maintainers state flatly that cross-packaging "is not supported" (source 13), and the root package does carry a `postinstall` script whose interaction with a forced-in win32 binary has not been verified here. This is the single largest unresolved unknown in this research — it would need an actual test build to confirm one way or the other.
3. If the Windows maker is Squirrel.Windows, there is a live, unresolved, unaddressed GitHub issue (source 14, open since 2023, no maintainer reply recorded) showing installer generation failing on macOS even after packaging succeeds — a real, currently-broken step, not merely a theoretical one.

**Recommendation: do not migrate the primary release-build path off a real Windows host in 2026.** The specific reasons this project should stay put, in priority order:
- node-llama-cpp's own docs explicitly disclaim cross-packaging support (source 13) — going against the maintainers' stated position for a component this central (an LLM runtime with per-platform native accelerators) is the kind of thing that surfaces as an intermittent, hard-to-diagnose runtime failure months later, not a clean build-time error.
- The value of cross-building here is CI infrastructure simplification, not a technical requirement — `windows-latest` runners are a supported, first-class GitHub Actions option, and this is exactly the workflow node-llama-cpp's own docs recommend (source 13).
- The residual unknowns (node-llama-cpp postinstall behavior under forced os/cpu override, and Squirrel-maker behavior if that maker is in use) are cheap to leave unexplored by simply keeping the Windows runner, and expensive to explore by actually finding out the hard way in production.

If there is a concrete driver to move off Windows runners (cost, fleet consolidation, container-only CI), the fix is not to abandon the idea but to **spike it properly first**: build on Linux with `--os=win32 --cpu=x64`, ship the artifact to an actual Windows VM (or even just Wine, which is now only needed for *testing*, not building) and confirm `getLlama()` and node-pty actually initialize correctly at runtime before trusting it as a release path.

## Implementation

If pursuing Approach B/C as a spike (not a recommendation to ship it yet):

1. **Native module fetch.** On the Linux/macOS build host:
   ```
   npm ci --os=win32 --cpu=x64
   ```
   or equivalently set `os=win32` / `cpu=x64` in `.npmrc` for the CI job. Verify post-install that `node_modules/@lydell/node-pty-win32-x64` and `node_modules/@node-llama-cpp/win-x64` (plus whichever accelerator variant, e.g. `win-x64-vulkan`, is actually used) are present and contain the expected `.node`/`.dll` files — do not just trust exit code 0.
2. **Verify node-llama-cpp's postinstall didn't skip/misconfigure anything.** Run `node ./node_modules/node-llama-cpp/dist/cli/cli.js postinstall` output through manually and diff against a native-Windows install's output if possible, since this script is the one unverified piece in this whole chain (source 11, source 13).
3. **Package normally via Forge** (`electron-forge package --platform=win32 --arch=x64`) — no Wine install needed given packager resolves to 18.4.4 with `resedit` (source 2, 3).
4. **Fuses.** Flip fuses as normal via `@electron-forge/plugin-fuses` — treat this as needing verification since this research found no explicit statement that `flipFuses` is host-OS-agnostic (only inferred from the absence of any Windows-specific caveat in its README, source in Sources list under fuses discussion). Confirm the resulting exe's fuse wire format matches a native-Windows-flipped exe byte-for-byte (`@electron/fuses read --app` against both).
5. **ASAR integrity smoke test.** After packaging, extract strings from the produced `.exe` (`strings ./out/*-win32-x64/*.exe | grep '"alg"'`) and confirm the embedded path uses `resources\\app.asar` (backslash), not `resources/app.asar` — this exact check is what the source [6] gist used to catch the bug pre-fix. This is a 30-second sanity check worth keeping as a permanent CI assertion regardless of which host builds it.
6. **Runtime smoke test on real Windows or Wine.** Since none of the build host's tooling can execute a win32 binary, the artifact must be run on an actual Windows machine (or, now that Wine is only needed for *testing* rather than *building*, in Wine as a cheap first-pass check) to confirm the app launches, the asar integrity check passes, and both native modules (`node-pty` spawn, `getLlama()` init) actually work.
7. **If using the Squirrel.Windows maker**, treat electron/forge#3142 as a known blocker until proven otherwise on this exact combination of Forge/Squirrel/Mono versions — test making, not just packaging, before trusting this path.

## Risks

- **Unverified node-llama-cpp postinstall behavior under forced cross-install** — the single biggest open question in this research. The upstream docs' blanket "not supported" statement (source 13) may be conservative (true "will not work") or may just mean "we don't test/support it" while it happens to function. This needs an actual build to resolve, not more reading. Mitigation: treat any cross-built artifact as provisional until it's been runtime-tested on real Windows.
- **Squirrel.Windows maker on macOS is a documented live failure** (source 14) with no maintainer response in over a year. If this project's Windows maker is Squirrel rather than zip, this is not a risk to mitigate — it's close to a known blocker. Mitigation: check which maker is actually configured before considering this path further; if Squirrel, either stay on Windows or switch maker.
- **Fuses cross-host behavior is inferred, not documented.** No source found explicitly states `@electron/fuses` flipFuses works identically regardless of host OS for a win32 target; this was inferred from the absence of any stated caveat. Mitigation: byte-diff a fuse-flipped exe built on Linux against one built on native Windows before trusting it.
- **The asar-integrity path-separator fix (packager 18.3.6) and its own later regression (19.0.3) show this exact code path has broken twice in under two years.** Even though the currently pinned version (18.4.4) postdates both the bug and (since it predates v19) never had the regression, this is evidence of real fragility in exactly the mechanism this project depends on (integrity + fuses + OnlyLoadAppFromAsar). Mitigation: the strings-based smoke test in Implementation step 5, run on every build regardless of host, as a permanent regression guard — this protects against a *future* regression on any host, not just a cross-build-specific one.
- **This research did not have access to a real Windows machine or a Linux/macOS container to actually attempt a build.** Everything above is grounded in official docs, package.json inspection, and GitHub issue/PR history — a real, blunt piece of due diligence (actually running `npm ci --os=win32 --cpu=x64` and `electron-forge package --platform=win32` on this project's real repo) has not been performed and should precede any decision to change the CI pipeline.
- **Wine is still needed for *testing*, if not building.** Even in the best case (Approach B/C working perfectly), there is no way to execute or smoke-test the resulting win32 binary without either Wine or an actual Windows machine — so a non-Windows-only CI pipeline still needs *some* access to a Windows-compatible runtime somewhere in the loop for verification, undercutting some of the infrastructure-simplification motivation for this change in the first place.

METRICS: searches=13 fetches=24 high_quality=15 ratio=1.0
CHECKS: [x] freshness [x] went_deep [x] found_outlier [x] checked_awesome

## Feedback
usefulness: | implemented: | result: | notes:
