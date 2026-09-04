#!/usr/bin/env bash
set -euo pipefail

# Exercises contract.sh and verify-assets.sh against fixtures, in BOTH
# directions: every check must pass on a good artifact and FAIL on a broken one.
#
#   Usage: scripts/release/selftest.sh
#
# Runs in the ordinary PR gate (.github/workflows/ci.yml). It needs no tag, no
# Apple credential, no Mac and no builder, and finishes in seconds.
#
# WHY THIS EXISTS
#
# Two releases were spent finding two bugs that no linter can catch:
#   v0.5.0-rc.3  the builder built and checksummed the zip, and never uploaded
#                it — the workflow's upload list did not mention it.
#   v0.5.0-rc.4  all four assets were built, signed, notarized, stapled and
#                uploaded CORRECTLY, and the release still failed, on a debug
#                `echo "$ENTRIES" | head -5` under `set -o pipefail`.
# Each cost a tag, a 20-40 minute build, Apple's notary queue and a human
# approval, because the shell only ever ran during a real release.
#
# THE ZIP FIXTURE'S SIZE IS THE TEST, NOT PADDING.
#
# The real v0.5.0-rc.4 listing is 604 entries / 55,827 bytes — UNDER a pipe's
# 64K capacity. It still broke the release, because the threshold is not the
# whole story: `head` exits after five lines and closes the read end, and
# whether the writer finishes before that is a RACE. The Ubuntu runner lost it;
# the same pipeline on a maintainer's Mac wins it and exits 0. An intermittent
# bug, not a deterministic one, which is worse.
#
# So the fixture is deliberately ~6x the real listing: large enough that the
# writer CANNOT finish first, on any machine, and a reintroduced
# `writer | head` / `writer | grep -q` fails here every time instead of once in
# a while. A fixture sized like the real artifact would reproduce the bug only
# on the platform that already found it. The assertion below fails the suite if
# the fixture ever stops being large enough.
#
# bash 3.2 safe: no zero-padded brace ranges, no associative arrays. A
# maintainer's Mac ships bash 3.2 and this must be runnable there.

HERE="$(cd "$(dirname "$0")" && pwd)"
CONTRACT="${HERE}/contract.sh"
VERIFY="${HERE}/verify-assets.sh"

PASS=0
FAIL=0
note() { printf '  %s\n' "$*"; }
ok()   { PASS=$((PASS + 1)); printf '  ok    %s\n' "$*"; }
bad()  { FAIL=$((FAIL + 1)); printf '  FAIL  %s\n' "$*" >&2; }

# The workflow's shell, exactly: .github/workflows/release.yml sets
# `defaults.run.shell: bash -eo pipefail {0}`. Running the scripts any other way
# would not reproduce the failure that reached a real release.
run() { bash -eo pipefail "$@"; }

expect_pass() { # <label> <cmd...>
  local label="$1"; shift
  if out="$("$@" 2>&1)"; then ok "$label"; else
    bad "$label — expected success, got exit $?"
    printf '%s\n' "$out" | sed 's/^/        /' >&2
  fi
}
expect_fail() { # <label> <expected-substring> <cmd...>
  local label="$1" want="$2"; shift 2
  if out="$("$@" 2>&1)"; then
    bad "$label — expected failure, but it PASSED"
    return
  fi
  if [ -n "$want" ] && ! grep -qF "$want" <<< "$out"; then
    bad "$label — failed, but not for the expected reason (wanted '${want}')"
    printf '%s\n' "$out" | sed 's/^/        /' >&2
    return
  fi
  ok "$label"
}

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cd "$WORK"

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------
APP_NAME="Maximal.app"
DMG="maximal-v9.9.9-darwin-arm64.dmg"
ZIP="maximal-v9.9.9-darwin-arm64.zip"

if command -v sha256sum >/dev/null 2>&1; then
  sha_of() { sha256sum "$1" | awk '{print $1}'; }
else
  sha_of() { shasum -a 256 "$1" | awk '{print $1}'; }
fi
sidecar() { printf '%s  %s\n' "$(sha_of "$1")" "$(basename "$1")" > "$1.sha256"; }

mkdir -p assets

# A UDIF-shaped dmg: sparse, over the 50,000,000-byte floor, ending in a
# 512-byte trailer whose first four bytes are 'koly'. dd with seek makes the
# hole without writing 50MB, on both GNU and BSD.
mk_dmg() { # <path> <total-bytes>
  local p="$1" n="$2"
  rm -f "$p"
  dd if=/dev/zero of="$p" bs=1 count=0 seek="$(( n - 512 ))" 2>/dev/null
  { printf 'koly'; dd if=/dev/zero bs=508 count=1 2>/dev/null; } >> "$p"
}
mk_dmg "assets/${DMG}" 60000000
sidecar "assets/${DMG}"

# The .app, plus enough filler that the LISTING passes 64K. One `touch` with
# many arguments, not a loop: 6000 processes would dominate the runtime.
mk_app() { # <root> [--unstapled]
  local root="$1" mode="${2:-}"
  rm -rf "$root"
  mkdir -p "${root}/${APP_NAME}/Contents/_CodeSignature"
  mkdir -p "${root}/${APP_NAME}/Contents/Resources/app/node_modules"
  printf '<plist/>' > "${root}/${APP_NAME}/Contents/Info.plist"
  printf 'resource manifest' > "${root}/${APP_NAME}/Contents/_CodeSignature/CodeResources"
  # The stapled notarization ticket, at the bundle root.
  [ "$mode" = "--unstapled" ] \
    || printf 'notarization ticket' > "${root}/${APP_NAME}/Contents/CodeResources"
  # Deliberate word split: one `touch` with 6000 arguments, not 6000 processes.
  # shellcheck disable=SC2046
  ( cd "${root}/${APP_NAME}/Contents/Resources/app/node_modules" \
    && touch $(seq 0 5999 | sed 's/^/pkg/; s/$/.js/') )
}
mk_zip() { # <root> <out>
  # `zip` ADDS to an existing archive. Without this rm, a mutation that removes
  # a file from the tree leaves the original entry in the copied-in zip and the
  # must-fail case silently passes — which is how this suite first reported
  # green while proving nothing.
  rm -f "$2"
  ( cd "$1" && zip -q -r -X "$2" "$APP_NAME" )
}

mk_app good
mk_zip good "${WORK}/assets/${ZIP}"
sidecar "assets/${ZIP}"

echo "== fixture sanity =="
ENTRY_BYTES="$(unzip -Z1 "assets/${ZIP}" | wc -c | tr -d ' ')"
ENTRY_COUNT="$(unzip -Z1 "assets/${ZIP}" | wc -l | tr -d ' ')"
note "zip listing: ${ENTRY_COUNT} entries, ${ENTRY_BYTES} bytes"
# 3x a pipe's 64K capacity, not merely over it: at the boundary the SIGPIPE is
# a race the writer sometimes wins, which is exactly the flakiness this fixture
# exists to remove.
if [ "$ENTRY_BYTES" -gt 196608 ]; then
  ok "listing is ${ENTRY_BYTES} bytes, far past a pipe's 64K capacity — an early-exit reader SIGPIPEs deterministically"
else
  bad "listing is only ${ENTRY_BYTES} bytes — too small to reliably catch a reintroduced pipeline"
fi

# ---------------------------------------------------------------------------
# verify-assets.sh
# ---------------------------------------------------------------------------
echo "== verify-assets.sh =="
expect_pass "good dmg + zip" \
  run "$VERIFY" --dir assets --dmg "$DMG" --zip "$ZIP" --app-name "$APP_NAME"
expect_pass "dmg alone (contract without zip)" \
  run "$VERIFY" --dir assets --dmg "$DMG" --app-name "$APP_NAME"

# Each mutation gets its own copy, so failures cannot mask one another.
mutate() { rm -rf m; cp -R assets m; }

mutate; printf 'deadbeef  %s\n' "$DMG" > "m/${DMG}.sha256"
expect_fail "dmg checksum mismatch" "sha256 mismatch" \
  run "$VERIFY" --dir m --dmg "$DMG" --zip "$ZIP" --app-name "$APP_NAME"

mutate; mk_dmg "m/${DMG}" 1024; sidecar "m/${DMG}"
expect_fail "dmg under the size floor" "far too small" \
  run "$VERIFY" --dir m --dmg "$DMG" --zip "$ZIP" --app-name "$APP_NAME"

# Overwrite the trailer where it actually is — size-512 — not at a constant
# that drifts the moment the fixture size changes.
mutate
DMG_SZ="$(wc -c < "m/${DMG}" | tr -d ' ')"
dd if=/dev/zero of="m/${DMG}" bs=1 seek="$(( DMG_SZ - 512 ))" count=4 conv=notrunc 2>/dev/null
sidecar "m/${DMG}"
expect_fail "dmg without a koly trailer" "no UDIF koly trailer" \
  run "$VERIFY" --dir m --dmg "$DMG" --zip "$ZIP" --app-name "$APP_NAME"

mutate; rm -f "m/${DMG}.sha256"
expect_fail "dmg checksum sidecar absent" "integrity cannot be checked" \
  run "$VERIFY" --dir m --dmg "$DMG" --app-name "$APP_NAME"

mutate; rm -f "m/${DMG}"
expect_fail "dmg absent" "is not attached" \
  run "$VERIFY" --dir m --dmg "$DMG" --app-name "$APP_NAME"

mutate; printf 'not a zip at all' > "m/${ZIP}"; sidecar "m/${ZIP}"
expect_fail "zip without PKZip magic" "PKZip magic" \
  run "$VERIFY" --dir m --dmg "$DMG" --zip "$ZIP" --app-name "$APP_NAME"

mutate
mk_app noplist; rm -f "noplist/${APP_NAME}/Contents/Info.plist"
mk_zip noplist "${WORK}/m/${ZIP}"; sidecar "m/${ZIP}"
expect_fail "zip without Info.plist" "does not contain" \
  run "$VERIFY" --dir m --dmg "$DMG" --zip "$ZIP" --app-name "$APP_NAME"

# The one that matters most: an app that was signed and notarized but never
# stapled still contains Contents/_CodeSignature/CodeResources, so a check that
# looks for the wrong path passes on an artifact that needs Apple reachable at
# first launch.
mutate
mk_app unstapled --unstapled
mk_zip unstapled "${WORK}/m/${ZIP}"; sidecar "m/${ZIP}"
expect_fail "zip whose app carries no stapled ticket" "no stapled ticket" \
  run "$VERIFY" --dir m --dmg "$DMG" --zip "$ZIP" --app-name "$APP_NAME"

# ---------------------------------------------------------------------------
# contract.sh
# ---------------------------------------------------------------------------
echo "== contract.sh =="
mk_cfg() { # <file> <artifact-line> [extra]
  cat > "$1" <<CFG
app_path = packages/maximal/client/out/Maximal-darwin-arm64/Maximal.app
bundle_id = co.stuffbucket.maximal
artifact = $2
dmg_name = maximal-{tag}-darwin-arm64.dmg
zip_name = maximal-{version}-darwin-arm64.zip
CFG
}
printf "  appBundleId: 'co.stuffbucket.maximal',\n" > forge.ts
mk_cfg cfg.ok "dmg,zip"

OUT="$(run "$CONTRACT" --config cfg.ok --forge forge.ts --tag v1.2.3)"
check_kv() { # <key> <want>
  local got
  got="$(sed -n "s/^$1=//p" <<< "$OUT")"
  if [ "$got" = "$2" ]; then ok "contract $1=$2"; else bad "contract $1: got '${got}', want '${2}'"; fi
}
check_kv dmg "maximal-v1.2.3-darwin-arm64.dmg"
check_kv zip "maximal-1.2.3-darwin-arm64.zip"   # {version} strips the leading v
check_kv bundle_id "co.stuffbucket.maximal"
check_kv app_name "Maximal.app"

mk_cfg cfg.nozip "dmg"
OUT="$(run "$CONTRACT" --config cfg.nozip --forge forge.ts --tag v1.2.3)"
check_kv zip ""

# `unzip` must not be read as requesting the zip artifact.
mk_cfg cfg.substr "dmg,unzip"
OUT="$(run "$CONTRACT" --config cfg.substr --forge forge.ts --tag v1.2.3)"
check_kv zip ""

printf "  appBundleId: 'co.stuffbucket.other',\n" > forge.bad.ts
expect_fail "bundle id disagrees with forge.config.ts" "does not match appBundleId" \
  run "$CONTRACT" --config cfg.ok --forge forge.bad.ts --tag v1.2.3

mk_cfg cfg.nozipname "dmg,zip"; sed -i.bak '/^zip_name/d' cfg.nozipname
expect_fail "artifact lists zip but zip_name is missing" "zip_name is missing" \
  run "$CONTRACT" --config cfg.nozipname --forge forge.ts --tag v1.2.3

mk_cfg cfg.badapp "dmg"; sed -i.bak 's#Maximal.app$#Maximal.bundle#' cfg.badapp
expect_fail "app_path does not end in .app" "must end in .app" \
  run "$CONTRACT" --config cfg.badapp --forge forge.ts --tag v1.2.3

mk_cfg cfg.nodmg "dmg"; sed -i.bak '/^dmg_name/d' cfg.nodmg
expect_fail "dmg_name missing" "dmg_name missing" \
  run "$CONTRACT" --config cfg.nodmg --forge forge.ts --tag v1.2.3

expect_fail "config file absent" "is missing" \
  run "$CONTRACT" --config cfg.nope --forge forge.ts --tag v1.2.3

# ---------------------------------------------------------------------------
# prev-tag.sh
# ---------------------------------------------------------------------------
echo "== prev-tag.sh =="
PREV="${HERE}/prev-tag.sh"
# Newest first, as `git tag --list --sort=-creatordate` emits.
cat > tags <<'TAGS'
v0.5.0-rc.5
v0.5.0-rc.4
v0.5.0-rc.3
v0.5.0-rc.2
TAGS
check_prev() { # <tag> <want> <label>
  local got
  got="$(run "$PREV" --tag "$1" --tags-file tags)"
  if [ "$got" = "$2" ]; then ok "$3"; else bad "$3 — got '${got}', want '${2}'"; fi
}
check_prev v0.5.0-rc.5 v0.5.0-rc.4 "newest tag sees the one before it"
check_prev v0.5.0-rc.3 v0.5.0-rc.2 "a middle tag sees the one before it"
check_prev v0.5.0-rc.2 ""          "the oldest tag has no predecessor"
# The regression: re-releasing rc.3 must NOT compare against rc.5, which is what
# `grep -vxF "$TAG" | head -1` returned.
got="$(run "$PREV" --tag v0.5.0-rc.3 --tags-file tags)"
if [ "$got" = "v0.5.0-rc.5" ]; then
  bad "re-released tag compared against a NEWER release"
else
  ok "re-releasing an older tag does not compare against a newer one"
fi
check_prev v9.9.9 "" "a tag absent from the list has no predecessor"

# ---------------------------------------------------------------------------
echo
echo "${PASS} passed, ${FAIL} failed"
[ "$FAIL" -eq 0 ] || exit 1
