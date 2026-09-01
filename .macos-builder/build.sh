#!/usr/bin/env bash
set -euo pipefail

# monimal's PRODUCER for the private stuffbucket/macos-builder pipeline.
#
# Builds the inside-out-signed Electron client into an .app and leaves it at the
# path .macos-builder/config names:
#   packages/maximal/client/out/Maximal-darwin-arm64/Maximal.app
#
# It does NOT build a dmg, notarize, staple, or write OUTPUT_DIR. The builder
# owns that tail (lib/package-macos.sh: top-level sign without --deep → package
# → notarize → staple → checksum → upload). This script is never handed APPLE_*
# or KEYCHAIN_PASSWORD, and the keychain is already unlocked — do not unlock it.
#
# Why the .app is signed HERE and not by the builder's top-level pass: an
# Electron bundle nests Helper apps and the Electron Framework, which must be
# signed inside-out. A single top-level sign cannot reach them. @electron/osx-sign
# does that pass during `electron-forge package`, gated on SIGN_IDENTITY in
# packages/maximal/client/forge.config.ts. The builder's later top-level re-sign
# just re-seals the outer bundle (no --deep, idempotent).
#
# Builder-supplied env consumed: TAG, ARCH, SIGN_IDENTITY, ENTITLEMENTS_DIR,
# BUN_INSTALL, CARGO_HOME. Node 24 + npm are already on PATH.
#
# NOT to be confused with packages/maximal/.macos-builder/build.sh, which is a
# vendored fixture for the standalone maximal repo (npm, client/ at the root).
# The two target different layouts and must diverge. See SOURCES.md.

# Self-hosted runners use non-login shells that do not read ~/.zshrc.
export PATH="${BUN_INSTALL:-}/bin:${CARGO_HOME:-}/bin:/opt/homebrew/bin:$PATH"
export TURBO_TELEMETRY_DISABLED=1
export CI=1

fail() { echo "::error::$*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# 1. Inputs
# ---------------------------------------------------------------------------
[ -n "${TAG:-}" ]              || fail "TAG is empty; the builder must export the tag being built."
[ -n "${SIGN_IDENTITY:-}" ]    || fail "SIGN_IDENTITY is empty; forge.config.ts would silently produce an UNSIGNED app."
[ -n "${ENTITLEMENTS_DIR:-}" ] || fail "ENTITLEMENTS_DIR is empty; the builder must point at its enumerated entitlements."

VERSION="${TAG#v}"
ARCH="${ARCH:-arm64}"

# .macos-builder/config names darwin-arm64 literally and client/scripts/build-core.ts
# compiles --target=bun-darwin-arm64. On any other arch the packager writes
# out/Maximal-darwin-<other>/ and the builder fails with "app not found" only
# after the entire build has already run.
[ "$ARCH" = "arm64" ] || fail "ARCH=${ARCH}; this producer is arm64-only."

ENTITLEMENTS="${ENTITLEMENTS_DIR}/bun-runtime.entitlements"
[ -f "$ENTITLEMENTS" ] || fail "Entitlements not found at ${ENTITLEMENTS} (config declares 'entitlements = bun-runtime')."
# forge.config.ts throws at config load if SIGN_IDENTITY is set and this file is
# missing; asserting here produces the readable error instead.
export MACOS_ENTITLEMENTS="$ENTITLEMENTS"

# Every path below is relative to the checkout root. If the builder ever runs
# this from elsewhere they resolve somewhere else, silently.
[ -f pnpm-workspace.yaml ] && [ -f packages/maximal/client/package.json ] \
  || fail "Not at the monimal checkout root (cwd=$(pwd)); pnpm-workspace.yaml and the client manifest are both required here."

APP="packages/maximal/client/out/Maximal-darwin-${ARCH}/Maximal.app"
CLIENT_PKG="packages/maximal/client/package.json"
CORE="packages/maximal/client/resources/bin/maximal-core"

echo "Producing Maximal.app (Electron) for ${TAG} (version ${VERSION}, ${ARCH})"

# ---------------------------------------------------------------------------
# 2. Preflight. One block, so a first-run failure on the Mac mini is
#    diagnosable from the builder log without a second run.
# ---------------------------------------------------------------------------
echo "--- preflight ---"
node -v
npm -v
bun --version
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
[ "$BUILT_ID" = "co.stuffbucket.maximal" ] \
  || fail "CFBundleIdentifier '${BUILT_ID}' != co.stuffbucket.maximal; the builder's policy gate would reject this."

BUILT_VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "${APP}/Contents/Info.plist" 2>/dev/null || echo '')"
echo "Built bundle version: ${BUILT_VERSION} (expected ${VERSION})"
[ "$BUILT_VERSION" = "$VERSION" ] \
  || fail "Bundle version '${BUILT_VERSION}' != release version '${VERSION}'. Stale build?"

BUNDLED_CORE="${APP}/Contents/Resources/bin/maximal-core"
[ -f "$BUNDLED_CORE" ] || fail "Sidecar missing from the bundle: ${BUNDLED_CORE}."
codesign --verify --strict --verbose=2 "$BUNDLED_CORE"

# The sidecar must have been compiled from THIS commit, not restored from a
# cache. Process substitution, not a pipe: `grep -q` exits at the first match and
# SIGPIPEs `strings` part-way through a ~74MB binary, and under pipefail that
# 141 fails a sidecar that is perfectly correct. Same shape as ci.yml's
# "Verify sidecar provenance" step.
SHA="$(git rev-parse HEAD)"
grep -qF "$SHA" < <(strings "$BUNDLED_CORE") \
  || fail "Sidecar does not embed HEAD (${SHA}) — it was built from something else."

# Full inside-out verification: helpers + Electron Framework + sidecar + app.
codesign --verify --deep --strict --verbose=2 "$APP"

# Prove it is a REAL Developer ID signature with the hardened runtime on. Without
# these three, a bad signature is discovered by Apple's notary service minutes
# later, as an opaque rejection with no local evidence.
CS_OUT="$(codesign -dvv "$APP" 2>&1)"
printf '%s\n' "$CS_OUT" | grep -E 'Identifier=|Authority=|TeamIdentifier=|flags=' || true
printf '%s\n' "$CS_OUT" | grep -q 'Authority=Developer ID Application' \
  || fail "Not Developer ID signed; notarization would be rejected."
printf '%s\n' "$CS_OUT" | grep -q 'flags=.*runtime' \
  || fail "Hardened runtime missing; notarization would be rejected."
if printf '%s\n' "$CS_OUT" | grep -q 'Signature=adhoc'; then
  fail "Ad-hoc signature reached the release path."
fi

echo "Producer done — ${APP} is ready for the builder (top-level sign + dmg + notarize + staple + sha256)."
