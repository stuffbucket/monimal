#!/usr/bin/env bash
set -euo pipefail

# monimal's PRODUCER for the private stuffbucket/macos-builder pipeline.
#
# Builds the UNSIGNED Electron client into an .app and leaves it at the path
# .macos-builder/config names:
#   packages/maximal/client/out/Maximal-darwin-arm64/Maximal.app
#
# THIS SCRIPT DOES NOT SIGN, and must not learn how. The builder runs it with the
# signing keychain LOCKED and SIGN_IDENTITY set to the ad-hoc identity "-", so a
# packager configured to sign fails with "No identity found for signing". That
# failure is the point: untrusted client code can never reach the Developer ID.
#
# The builder owns every codesign call, plus the dmg, notarization, stapling,
# checksum and upload. `sign_walk = bun-runtime` in .macos-builder/config tells
# it to sign every nested code item deepest-first — the four Helper .apps and the
# Electron Framework included, each sealed as a bundle — then seal the outer
# bundle. See RELEASING.md.
#
# Builder-supplied env consumed: TAG, ARCH, BUN_INSTALL, CARGO_HOME. Node 24 and
# npm are already on PATH. SIGN_IDENTITY and ENTITLEMENTS_DIR are also exported
# and are deliberately UNUSED here.
#
# Env this script EXPORTS: MAXIMAL_BUILD_VERSION, which forge.config.ts passes to
# @electron/packager as buildVersion (CFBundleVersion). See section 1.
#
# NOT to be confused with packages/maximal/.macos-builder/build.sh, which is a
# vendored fixture for the standalone maximal repo (npm, client/ at the root).
# The two target different layouts and must diverge. See SOURCES.md.

# Self-hosted runners use non-login shells that do not read ~/.zshrc.
#
# /opt/homebrew/bin is APPENDED, never prepended. Prepending it puts Homebrew's
# node ahead of the pinned Node the builder installs via actions/setup-node, and
# the producer then silently builds on whatever major Homebrew happens to carry.
# Caught locally: `node -v` reported 24.19.0 while this script saw 26.5.0.
#
# Prepend only what is actually set: "${BUN_INSTALL:-}/bin" collapses to "/bin"
# when the variable is absent, silently putting /bin ahead of everything else.
#
# `if`, not `a && b`: under set -e a trailing AND-OR list whose test fails takes
# its non-zero status with it, so the && form is safe only where it sits now.
export PATH="$PATH:/opt/homebrew/bin"
if [ -n "${CARGO_HOME:-}" ]; then export PATH="${CARGO_HOME}/bin:$PATH"; fi
if [ -n "${BUN_INSTALL:-}" ]; then export PATH="${BUN_INSTALL}/bin:$PATH"; fi
export TURBO_TELEMETRY_DISABLED=1
export CI=1

fail() { echo "::error::$*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# 1. Inputs
# ---------------------------------------------------------------------------
[ -n "${TAG:-}" ] || fail "TAG is empty; the builder must export the tag being built."

VERSION="${TAG#v}"
ARCH="${ARCH:-arm64}"

# .macos-builder/config names darwin-arm64 literally and client/scripts/build-core.ts
# compiles --target=bun-darwin-arm64. On any other arch the packager writes
# out/Maximal-darwin-<other>/ and the builder fails with "app not found" only
# after the entire build has already run.
[ "$ARCH" = "arm64" ] || fail "ARCH=${ARCH}; this producer is arm64-only."

# Every path below is relative to the checkout root. If the builder ever runs
# this from elsewhere they resolve somewhere else, silently.
[ -f pnpm-workspace.yaml ] && [ -f packages/maximal/client/package.json ] \
  || fail "Not at the monimal checkout root (cwd=$(pwd)); pnpm-workspace.yaml and the client manifest are both required here."

APP="packages/maximal/client/out/Maximal-darwin-${ARCH}/Maximal.app"
CLIENT_PKG="packages/maximal/client/package.json"
CORE="packages/maximal/client/resources/bin/maximal-core"

# The bundle id is READ, not restated. .macos-builder/config is its owner here
# (release.yml parses the same file and cross-checks it against forge.config.ts),
# and a copy in this script could only ever disagree with it.
BUNDLE_ID="$(sed -nE 's/^[[:space:]]*bundle_id[[:space:]]*=[[:space:]]*(.*[^[:space:]])[[:space:]]*$/\1/p' .macos-builder/config | head -1)"
[ -n "$BUNDLE_ID" ] || fail "bundle_id is missing from .macos-builder/config; the builder's policy gate would reject this build anyway."

# ---------------------------------------------------------------------------
# CFBundleVersion. NOT the tag.
#
# This is the field macOS compares when it finds two copies of the same bundle
# id, so it is what the UPGRADE path rides on. Apple requires one to three
# period-separated integers and LaunchServices' parse stops at the first
# non-digit, so the tag version is unusable: "0.5.0-rc.2" collapses to 0.5.0 and
# compares EQUAL to the final 0.5.0, and macOS then has no reason to prefer
# either copy.
#
# Derived from the TAGGED COMMIT'S committer date, in UTC, as YYYY.MMDD.HHMM:
#   - Monotonic. A later release is a later commit, on main and on a release
#     branch alike, where a cherry-pick's committer date is the pick's.
#   - Shallow-safe. The builder checks the client out with actions/checkout's
#     default depth of 1, so `git rev-list --count` would return 1 for every
#     release; `git log -1` reads the one commit that IS there.
#   - Each component stays under 10000, and 10# forces decimal so a zero-padded
#     month or hour is never read as octal.
#
# scripts/verify-dmg.sh asserts the shape, and asserts it INCREASED against the
# previously released artifact — which is the backstop for two tags landing in
# the same minute.
# ---------------------------------------------------------------------------
COMMIT_TS="$(git log -1 --format=%ct HEAD)"
[ -n "$COMMIT_TS" ] || fail "Could not read the committer date of HEAD; CFBundleVersion cannot be derived."
BUILD_VERSION="$(date -u -r "$COMMIT_TS" +%Y).$((10#$(date -u -r "$COMMIT_TS" +%m%d))).$((10#$(date -u -r "$COMMIT_TS" +%H%M)))"
export MAXIMAL_BUILD_VERSION="$BUILD_VERSION"

echo "Producing Maximal.app (Electron) for ${TAG} (version ${VERSION}, ${ARCH})"
echo "  bundle id       ${BUNDLE_ID}   (from .macos-builder/config)"
echo "  CFBundleVersion ${BUILD_VERSION}   (from the committer date of $(git rev-parse --short HEAD))"

# ---------------------------------------------------------------------------
# 2. Preflight. One block, so a first-run failure on the Mac mini is
#    diagnosable from the builder log without a second run.
# ---------------------------------------------------------------------------
echo "--- preflight ---"
node -v
npm -v
# Tolerated here so the named Bun assertion below is what reports a missing or
# wrong Bun; bare `set -e` on this line would abort with no explanation.
bun --version || true
git rev-parse HEAD
sw_vers -productVersion
# Native modules in allowBuilds (node-pty, node-llama-cpp) need the Command Line
# Tools. Their absence surfaces as an opaque node-gyp failure during install.
xcode-select -p || echo "::warning::xcode-select -p failed; native module builds will fail."
echo "-----------------"

# ---------------------------------------------------------------------------
# 3. Bun must match .bun-version.
#
# The sidecar is a Bun single-file executable. Building it on a runtime CI never
# exercised ships a maximal-core nobody tested, and `bun build --compile` flag
# semantics drift across minors. Signing is unaffected, so this failure would be
# SILENT and would surface only as a runtime bug in the released app.
#
# Fix by bumping .bun-version and re-cutting the tag, never by changing the
# builder: .bun-version is the single owner of that version (SOURCES.md).
# ---------------------------------------------------------------------------
command -v bun >/dev/null \
  || fail "bun is not on PATH (BUN_INSTALL=${BUN_INSTALL:-unset}); the maximal-core sidecar cannot be compiled."
# Node major must match .nvmrc. verify-workspace checks this too, but only after
# a full install; failing here names the cause in one line instead.
WANT_NODE="$(tr -d '[:space:]' < .nvmrc)"
HAVE_NODE="$(node -p 'process.versions.node.split(".")[0]')"
[ "$HAVE_NODE" = "$WANT_NODE" ] \
  || fail "node ${HAVE_NODE}.x is on PATH but .nvmrc says ${WANT_NODE} (node: $(command -v node))."

WANT_BUN="$(tr -d '[:space:]' < .bun-version)"
HAVE_BUN="$(bun --version)"
[ "$HAVE_BUN" = "$WANT_BUN" ] \
  || fail "builder Bun ${HAVE_BUN} != .bun-version ${WANT_BUN}. Bump .bun-version and re-tag; do not change the builder."

# ---------------------------------------------------------------------------
# 4. pnpm, at the pinned version, without asking the builder to supply it.
#
# The builder deliberately provides only Node + npm + Bun; adding pnpm there
# would couple every other client repo to this one's toolchain.
#
# The version is read from packageManager rather than named here, so this file
# is not a second owner of it (SOURCES.md owns that fact).
# ---------------------------------------------------------------------------
PNPM_SPEC="$(node -p "require('./package.json').packageManager")"
case "$PNPM_SPEC" in
  pnpm@*) ;;
  *) fail "packageManager is '${PNPM_SPEC}', expected pnpm@x.y.z." ;;
esac
PNPM_VERSION="${PNPM_SPEC#pnpm@}"
PNPM_DIR="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/pnpm-${PNPM_VERSION}"

# --prefix into scratch: no sudo, no global prefix mutated on a shared
# persistent runner, nothing left behind between builds. Run from OUTSIDE the
# checkout so npm reads its own config rather than this workspace's .npmrc —
# pnpm is not in this workspace's dependency graph, and the default registry
# publishes dist.integrity (sha512), a stronger content check than the proxy's
# SHA-1 shasum.
#
# Not corepack: unbundled from Node 25, and its embedded signature keys go stale.
if [ ! -x "${PNPM_DIR}/node_modules/.bin/pnpm" ]; then
  ( cd "${TMPDIR:-/tmp}" \
    && npm install --prefix "$PNPM_DIR" --no-save --no-audit --no-fund "pnpm@${PNPM_VERSION}" )
fi
export PATH="${PNPM_DIR}/node_modules/.bin:$PATH"

# Without this assert, a pnpm that disagrees with packageManager self-manages by
# downloading the named version THROUGH THE CONFIGURED REGISTRY. .npmrc points at
# the 1ES proxy, which publishes no signatures, so pnpm refuses the switch and
# dies mid-install with an error that reads like a registry outage.
HAVE_PNPM="$(pnpm --version)"
[ "$HAVE_PNPM" = "$PNPM_VERSION" ] \
  || fail "pnpm ${HAVE_PNPM} != packageManager ${PNPM_VERSION}."

# ---------------------------------------------------------------------------
# 5. Install.
#
# strip-lockfile-hosts.mjs MUST run BEFORE the install: pnpm verifies every
# recorded tarball: URL against the registry's current metadata before lifecycle
# scripts run, so no hook can repair it. See SOURCES.md#lockfile-integrity.
#
# Nothing here uses `pnpm run`. Under this workspace `pnpm run <script>`
# re-resolves and rewrites rotating ms-feed-N hosts into pnpm-lock.yaml BEFORE
# the script body executes (monimal#26), which would poison the very lockfile
# the line above just repaired.
# ---------------------------------------------------------------------------
node scripts/strip-lockfile-hosts.mjs
pnpm install --frozen-lockfile

# Reused rather than reimplemented: it already asserts the RUNNING Node major
# against .nvmrc and checks the installed tree for the hoist behaviour Forge and
# Rolldown need — the whole of AGENTS.md's Node rule in one command, one owner.
node scripts/verify-workspace.mjs

# ---------------------------------------------------------------------------
# 6. Stamp the version — AFTER the install, unlike the vendored producer.
#
# electron-forge / @electron/packager read the app version from package.json at
# PACKAGE time, so stamping later is equally effective. Stamping earlier would
# mutate a workspace member's manifest before --frozen-lockfile, risking pnpm
# judging the lockfile out of date and failing the release for a reason that has
# nothing to do with dependencies.
#
# Match WHATEVER value is there (not just "0.0.0"), so a stray committed version
# cannot slip through unstamped, then ASSERT the stamp took.
# ---------------------------------------------------------------------------
/usr/bin/sed -i '' -E "s/\"version\": \"[^\"]*\"/\"version\": \"${VERSION}\"/" "$CLIENT_PKG"
grep -q "\"version\": \"${VERSION}\"" "$CLIENT_PKG" \
  || fail "Failed to stamp version ${VERSION} into ${CLIENT_PKG}."

# ---------------------------------------------------------------------------
# 7. The runner persists between builds. Delete anything that could hand this
#    release a previous tag's bytes.
# ---------------------------------------------------------------------------
rm -rf packages/maximal/client/out packages/maximal/client/.vite .turbo node_modules/.cache/turbo

# ---------------------------------------------------------------------------
# 8. Build the graph, then package.
# ---------------------------------------------------------------------------
# turbo owns the dependency order (maximal-core and maximal-electron before the
# client sidecar). --force defeats any cache that survived step 7.
pnpm exec turbo run build --filter maximal-client --force

[ -s "$CORE" ] || fail "Sidecar not produced at ${CORE}."
chmod 0755 "$CORE"
ls -la packages/maximal/client/resources/bin/

# Bun's compile output carries a linker ad-hoc signature Apple rejects. Strip it;
# @electron/osx-sign signs the copy inside Maximal.app during its single
# inside-out pass, with hardened runtime + the bun-runtime entitlements.
codesign --remove-signature "$CORE" 2>/dev/null || true

# Forge is invoked DIRECTLY, not through the root `package` script. That script
# is `turbo run package`, whose task declares outputs out/** and .vite/**, so a
# cache hit could restore a bundle this release never built. --arch is pinned so
# the output directory name matches what .macos-builder/config declares.
( cd packages/maximal/client && pnpm exec electron-forge package --arch="$ARCH" )

ls -la "$(dirname "$APP")"

# ---------------------------------------------------------------------------
# 9. Assert the bundle before handing it to the builder. Each check names what
#    it caught, because the builder's own failure messages cannot.
# ---------------------------------------------------------------------------
[ -d "$APP" ] || fail "Expected app not found at ${APP}."

BUILT_ID="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "${APP}/Contents/Info.plist" 2>/dev/null || echo '')"
echo "Bundle id: ${BUILT_ID}"
[ "$BUILT_ID" = "$BUNDLE_ID" ] \
  || fail "CFBundleIdentifier '${BUILT_ID}' != '${BUNDLE_ID}' from .macos-builder/config; the builder's policy gate would reject this."

BUILT_VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "${APP}/Contents/Info.plist" 2>/dev/null || echo '')"
echo "Built bundle version: ${BUILT_VERSION} (expected ${VERSION})"
[ "$BUILT_VERSION" = "$VERSION" ] \
  || fail "Bundle version '${BUILT_VERSION}' != release version '${VERSION}'. Stale build?"

# The upgrade field. @electron/packager silently falls back to appVersion when
# buildVersion is unset, which would put the unusable tag string here and look
# exactly like success, so assert BOTH that the stamp took and that what landed
# is a shape macOS can order.
BUILT_BUILD="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "${APP}/Contents/Info.plist" 2>/dev/null || echo '')"
echo "Built CFBundleVersion: ${BUILT_BUILD} (expected ${BUILD_VERSION})"
[ "$BUILT_BUILD" = "$BUILD_VERSION" ] \
  || fail "CFBundleVersion '${BUILT_BUILD}' != '${BUILD_VERSION}'. forge.config.ts must pass buildVersion: process.env.MAXIMAL_BUILD_VERSION."
printf '%s' "$BUILT_BUILD" | grep -Eq '^[0-9]+(\.[0-9]+){0,2}$' \
  || fail "CFBundleVersion '${BUILT_BUILD}' is not one to three period-separated integers; macOS could not order this against an installed copy."

BUNDLED_CORE="${APP}/Contents/Resources/bin/maximal-core"
[ -f "$BUNDLED_CORE" ] || fail "Sidecar missing from the bundle: ${BUNDLED_CORE}."

# The sidecar must have been compiled from THIS commit, not restored from a
# cache. Process substitution, not a pipe: `grep -q` exits at the first match and
# SIGPIPEs `strings` part-way through a ~74MB binary, and under pipefail that
# 141 fails a sidecar that is perfectly correct. Same shape as ci.yml's
# "Verify sidecar provenance" step.
SHA="$(git rev-parse HEAD)"
grep -qF "$SHA" < <(strings "$BUNDLED_CORE") \
  || fail "Sidecar does not embed HEAD (${SHA}) — it was built from something else."

# Isolation tripwire — the inverse of the assertion this replaced. The producer
# MUST NOT be able to sign. A Developer ID signature on a bundle this script
# built means the builder's keychain lock or its ad-hoc SIGN_IDENTITY has
# regressed, and untrusted client code is reaching the signing identity.
CS_OUT="$(codesign -dvv "$APP" 2>&1 || true)"
printf '%s\n' "$CS_OUT" | grep -E 'Identifier=|Authority=|Signature=|flags=' || true
if printf '%s\n' "$CS_OUT" | grep -q 'Authority=Developer ID Application'; then
  fail "Producer output is Developer ID signed. It must not be able to sign — check the builder's keychain isolation."
fi

echo "Producer done — ${APP} is unsigned and ready for the builder (sign_walk + top-level seal + dmg + notarize + staple + sha256)."
