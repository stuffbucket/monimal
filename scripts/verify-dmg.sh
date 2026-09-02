#!/usr/bin/env bash
set -euo pipefail

# Gatekeeper + upgrade-continuity acceptance test for a release dmg.
# THIS IS THE DEFINITION OF DONE.
#
# Run it on a Mac that has NEVER held the signing identity. Running it on the
# builder proves much less: that machine's files carry no quarantine bit and its
# Gatekeeper state may be developer-relaxed, so a pass there does not predict a
# user's Mac.
#
# CI cannot run this. .github/workflows/release.yml proves only presence,
# checksum and UDIF container shape from Ubuntu, because AGENTS.md forbids
# GitHub-hosted macOS runners and the signed artifact only exists off-runner.
#
#   Usage: scripts/verify-dmg.sh <tag> [previous-tag|none]
#
#     scripts/verify-dmg.sh v0.5.0-rc.2                 auto-detect the previous release
#     scripts/verify-dmg.sh v0.5.0-rc.2 v0.5.0-rc.1     compare against that one
#     scripts/verify-dmg.sh v0.5.0-rc.2 none            skip the comparison
#
# Requires: gh (authenticated — the release is a DRAFT and is not public).
#
# It asks two questions, and both must pass before publishing:
#
#   Will a user's Mac OPEN this?              steps 2–11.
#   Will it treat this as the SAME app as     step 12, against the previous
#   the version already installed?            release's actual artifact.
#
# The second is the upgrade path. macOS keys TCC grants, keychain ACLs and
# LaunchServices registration on the bundle identifier plus the code signature's
# DESIGNATED REQUIREMENT. If either changes between releases, every existing
# install becomes a stranger: permissions reset, keychain items orphan, and a
# future in-app updater refuses the swap. Nothing upstream fails when that
# happens — not the build, not notarization, not CI — so it is checked here,
# against the previous artifact rather than against a constant restated in this
# file.
#
# bash 3.2 safe: a clean Mac has no newer bash, and this script's whole purpose
# is to run on a machine nobody prepared.

usage() {
  echo "Usage: $(basename "$0") <tag> [previous-tag|none]" >&2
  echo "   e.g. $(basename "$0") v0.5.0-rc.2" >&2
  exit 2
}

TAG="${1:-}"
PREV_ARG="${2:-}"
[ -n "$TAG" ] || usage
[ "$(uname -s)" = "Darwin" ] || { echo "error: this test only means anything on macOS." >&2; exit 1; }
command -v gh >/dev/null || { echo "error: gh is required to download a draft release." >&2; exit 1; }
command -v git >/dev/null || { echo "error: git is required to read the builder contract at the tag." >&2; exit 1; }

# Every contract read below is repository-relative. Run from anywhere.
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[ -n "$ROOT" ] || { echo "error: not inside the monimal checkout; .macos-builder/config cannot be read." >&2; exit 1; }
cd "$ROOT"

REPO="${REPO:-stuffbucket/monimal}"

# ---------------------------------------------------------------------------
# The builder contract, AS THE BUILDER READ IT: at the tag, not in the working
# tree. .macos-builder/config is the single owner of the asset name, the bundle
# id and the app path (release.yml parses the same file). Restating any of them
# here would let this script verify an artifact the release does not carry, and
# the failure would read as a missing asset rather than as drift.
# ---------------------------------------------------------------------------
read_config() {
  # -C "$ROOT" / "$ROOT"-prefixed, not cwd-relative: step 12 calls this again
  # after the script has cd'd into its scratch directory, where there is no
  # repository and no contract to read.
  local tag="$1"
  if git -C "$ROOT" rev-parse -q --verify "refs/tags/${tag}" >/dev/null 2>&1; then
    git -C "$ROOT" show "${tag}:.macos-builder/config"
  else
    echo "note: ${tag} is not a tag in this checkout — reading the working tree's contract instead." >&2
    cat "$ROOT/.macos-builder/config"
  fi
}

cfg_get() {
  # cfg_get <key> <config-text>
  printf '%s\n' "$2" | sed -nE "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*(.*[^[:space:]])[[:space:]]*$/\1/p" | head -1
}

expand_name() {
  # expand_name <template> <tag>  — dmg_name or updater_name
  local t="$1" tag="$2"
  t="${t//\{version\}/${tag#v}}"
  t="${t//\{tag\}/${tag}}"
  printf '%s' "$t"
}

ver_field() {
  # ver_field <version> <1|2|3> -> that component as an integer, 0 when absent.
  # Mirrors LaunchServices: parse stops at the first non-digit.
  local v="$1" n="$2" f
  case "$n" in
    1) f="${v%%.*}" ;;
    2) case "$v" in *.*) f="${v#*.}"; f="${f%%.*}" ;; *) f=0 ;; esac ;;
    3) case "$v" in *.*.*) f="${v#*.*.}"; f="${f%%.*}" ;; *) f=0 ;; esac ;;
  esac
  f="${f%%[!0-9]*}"
  printf '%s' "${f:-0}"
}

ver_gt() {
  # True when version $1 sorts strictly after $2, component-wise.
  local i x y
  for i in 1 2 3; do
    x="$(ver_field "$1" "$i")"
    y="$(ver_field "$2" "$i")"
    if [ "$x" -gt "$y" ]; then return 0; fi
    if [ "$x" -lt "$y" ]; then return 1; fi
  done
  return 1
}

CFG="$(read_config "$TAG")"
DMG_TMPL="$(cfg_get dmg_name "$CFG")"
BUNDLE_ID="$(cfg_get bundle_id "$CFG")"
APP_PATH="$(cfg_get app_path "$CFG")"
[ -n "$DMG_TMPL" ]  || { echo "error: dmg_name missing from the contract at ${TAG}." >&2; exit 1; }
[ -n "$BUNDLE_ID" ] || { echo "error: bundle_id missing from the contract at ${TAG}." >&2; exit 1; }
[ -n "$APP_PATH" ]  || { echo "error: app_path missing from the contract at ${TAG}." >&2; exit 1; }

DMG="$(expand_name "$DMG_TMPL" "$TAG")"
APP_NAME="$(basename "$APP_PATH")"

WORK="$(mktemp -d "${TMPDIR:-/tmp}/verify-dmg.XXXXXX")"
MOUNT="/Volumes/verify-dmg-$$"
MOUNT_PREV="/Volumes/verify-dmg-prev-$$"

# shellcheck disable=SC2317  # invoked via trap
cleanup() {
  hdiutil detach "$MOUNT" -quiet 2>/dev/null || true
  hdiutil detach "$MOUNT_PREV" -quiet 2>/dev/null || true
  echo
  echo "Artifacts left in ${WORK}"
}
trap cleanup EXIT

step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
fail() { echo "FAIL: $*" >&2; exit 1; }

# `stapler` is not on PATH; `xcrun` resolves it from the active developer
# directory. The Command Line Tools DO carry it — /Library/Developer/
# CommandLineTools/usr/bin/stapler, alongside notarytool — so full Xcode is not
# required, contrary to what #34 concluded from an older CLT that lacked it.
# The fallback stays for a machine where it genuinely does not resolve: it is
# not a reason to fail, because step A below (offline spctl) is the stronger
# proof anyway — a ticket that is merely resolvable online passes an online
# check whether or not it is stapled INTO the artifact.
HAVE_STAPLER=0
if xcrun --find stapler >/dev/null 2>&1; then HAVE_STAPLER=1; fi

echo "repo:      ${REPO}"
echo "tag:       ${TAG}"
echo "dmg:       ${DMG}"
echo "bundle id: ${BUNDLE_ID}  (from .macos-builder/config at the tag)"

cd "$WORK"

step "1. Download ${DMG} from ${REPO}@${TAG}"
gh release download "$TAG" --repo "$REPO" --pattern "$DMG" --pattern "${DMG}.sha256" --clobber
ls -la

step "2. Checksum"
shasum -a 256 "$DMG"
cat "${DMG}.sha256"
HAVE="$(shasum -a 256 "$DMG" | awk '{print $1}')"
grep -qi "$HAVE" "${DMG}.sha256" || fail "sha256 mismatch."
echo "OK: checksum matches."

step "3. Apply a quarantine attribute"
# Neither gh nor curl sets com.apple.quarantine — only download-aware apps
# (Safari, Chrome, Mail) do. Without it, every Gatekeeper check below runs on a
# file macOS considers locally produced and trusted, which proves nothing about
# what a user gets. So set it explicitly, in the shape Safari writes.
#   0083 = quarantine flags, then a hex timestamp, then the agent name.
xattr -w com.apple.quarantine "0083;$(printf '%x' "$(date +%s)");Safari;" "$DMG"
xattr -p com.apple.quarantine "$DMG" >/dev/null 2>&1 || fail "quarantine attribute did not stick."
echo "OK: quarantined."

step "4. The dmg is notarized and stapled"
# --context context:primary-signature is the correct assessment for a disk
# image; -t install is for installer packages.
spctl -a -t open --context context:primary-signature -vv "$DMG"
# FATAL, unlike the .app check in step 9. The dmg is the artifact the builder
# staples; an unstapled one is a broken release, not a documented trade-off.
if [ "$HAVE_STAPLER" -eq 1 ]; then
  xcrun stapler validate "$DMG" || fail "the dmg carries no stapled ticket. The builder staples it in finalize(); this is a pipeline defect, not the known .app gap."
else
  echo "SKIP: xcrun cannot resolve stapler on this machine."
  echo "      Step A below proves the .app half without it; the dmg half goes unchecked."
fi

step "5. Mount"
hdiutil attach "$DMG" -nobrowse -readonly -mountpoint "$MOUNT"
APP="${MOUNT}/${APP_NAME}"
[ -d "$APP" ] || fail "no ${APP_NAME} inside the image."

step "6. The .app: inside-out signature"
codesign --verify --deep --strict --verbose=2 "$APP"
echo "OK: every nested bundle is sealed."

step "7. The .app: identity, hardened runtime, entitlements"
codesign -dvvv "$APP" 2>sig.txt || true
sed -n '1,25p' sig.txt
grep -q 'Authority=Developer ID Application' sig.txt || fail "not Developer ID signed."
grep -q 'flags=.*runtime'                    sig.txt || fail "hardened runtime is off; notarization should have rejected this."
if grep -q 'Signature=adhoc' sig.txt; then fail "ad-hoc signature."; fi
echo "OK: Developer ID + hardened runtime."

# The entitlement set is chosen by NAME in .macos-builder/config
# (entitlements = bun-runtime), so this repo cannot widen it — but it can drift
# on the builder without anything here noticing. Assert what the contract's
# profile is documented to grant, and that nothing dangerous rode along.
codesign -d --entitlements :- "$APP" 2>/dev/null > ents.txt || true
echo "--- entitlements ---"
# codesign writes the plist as a single line; -o is what makes it readable.
grep -ao '<key>[^<]*</key>' ents.txt || echo "(none)"
echo "--------------------"
for ent in \
  com.apple.security.cs.allow-jit \
  com.apple.security.cs.allow-unsigned-executable-memory \
  com.apple.security.cs.disable-library-validation
do
  grep -aq "<key>${ent}</key>" ents.txt \
    || fail "${ent} is missing. .macos-builder/config names the bun-runtime profile, which grants it; the builder signed with something else. Electron's V8 or the Bun sidecar will crash at runtime."
done
# get-task-allow makes the app debuggable by any process and notarization is
# supposed to reject it. If it is here, the rejection did not happen.
for ent in \
  com.apple.security.get-task-allow \
  com.apple.security.cs.allow-dyld-environment-variables \
  com.apple.security.cs.disable-executable-page-protection
do
  if grep -aq "<key>${ent}</key>" ents.txt; then
    fail "${ent} is present. The bun-runtime profile does not grant it; the hardened runtime is weaker than the contract says."
  fi
done
echo "OK: bun-runtime entitlements present, nothing beyond them."

step "8. The .app: Gatekeeper assessment"
spctl -a -t exec -vv "$APP" 2>spctl.txt || { cat spctl.txt; fail "Gatekeeper rejects the app."; }
cat spctl.txt
# `accepted` alone is not enough: an unnotarized app signed by a Developer ID
# can still be accepted on a developer-relaxed Mac. The SOURCE is the proof.
grep -q 'source=Notarized Developer ID' spctl.txt \
  || fail "Gatekeeper accepted the app but not as 'Notarized Developer ID' (see above). On a user's Mac this is the difference between opening and 'cannot be opened'."
echo "OK: assessed as Notarized Developer ID."

step "9. The .app: is the notarization ticket STAPLED INTO it?"
# NOT FATAL, and deliberately so. `artifact = dmg` in .macos-builder/config
# takes the builder's dmg path, which staples the CONTAINER only; the builder
# staples the .app itself on its `updater` path. So an unstapled .app here is
# the documented state of a dmg-only client, not a failure — see RELEASING.md.
#
# It is reported loudly because it is the one property that decides what happens
# on an OFFLINE first launch, and that recurs on EVERY upgrade: each new version
# is a new cdhash with a fresh quarantine bit, so each one needs its own
# Gatekeeper resolution. Step A is what tests the consequence.
if [ "$HAVE_STAPLER" -eq 1 ]; then
  if xcrun stapler validate "$APP" 2>&1; then
    APP_STAPLED=1
    echo "STAPLED: the .app carries its own ticket. Offline first launch and offline"
    echo "         upgrades work with no network round trip. If this is new, the"
    echo "         builder's app-stapling gate changed — update RELEASING.md."
  else
    APP_STAPLED=0
    echo
    echo "EXPECTED: the .app carries NO stapled ticket (dmg-only client)."
    echo "          Its ticket resolves ONLINE at first launch — on this version and"
    echo "          on every future upgrade. A user upgrading offline, or behind a"
    echo "          proxy that blocks Apple's notary service, gets 'Maximal is"
    echo "          damaged and can't be opened' on a Mac where the PREVIOUS version"
    echo "          still launches fine, because that one's assessment is cached."
    echo "          Step A below is what tests it. See RELEASING.md → Offline launch."
  fi
else
  APP_STAPLED=unknown
  echo "SKIP: xcrun cannot resolve stapler here. Step A below proves this without it."
fi

step "10. Nested code: helpers, framework, sidecar"
# `--verify --deep --strict` in step 6 proves every nested bundle is SEALED. It
# does not prove each was sealed with the Developer ID and the hardened runtime
# — an ad-hoc or runtime-less helper still verifies as sealed, and then fails
# for the user at launch instead of here.
NESTED_N=0
while IFS= read -r item; do
  [ -n "$item" ] || continue
  NESTED_N=$((NESTED_N + 1))
  codesign -dvv "$item" 2>nested.txt || fail "cannot read the signature of ${item#"$APP"/}."
  grep -q 'Authority=Developer ID Application' nested.txt \
    || fail "${item#"$APP"/} is not Developer ID signed (sign_walk missed it)."
  case "$item" in
    *.app)
      grep -q 'flags=.*runtime' nested.txt \
        || fail "${item#"$APP"/} has no hardened runtime; it will be killed at launch."
      ;;
  esac
  echo "  OK  ${item#"$APP"/}"
done < <(find "$APP/Contents/Frameworks" -maxdepth 1 \( -name '*.app' -o -name '*.framework' \) -print 2>/dev/null)
[ "$NESTED_N" -gt 0 ] || fail "no nested helper apps or frameworks found — this does not look like an Electron bundle."

SIDECAR="${APP}/Contents/Resources/bin/maximal-core"
[ -f "$SIDECAR" ] || fail "the maximal-core sidecar is missing from the bundle."
codesign --verify --strict --verbose=2 "$SIDECAR"
codesign -dvv "$SIDECAR" 2>sidecar.txt || true
grep -q 'Authority=Developer ID Application' sidecar.txt \
  || fail "the sidecar is not Developer ID signed."
grep -q 'flags=.*runtime' sidecar.txt \
  || fail "the sidecar has no hardened runtime."
echo "  OK  Contents/Resources/bin/maximal-core"
echo "OK: ${NESTED_N} nested item(s) + the sidecar, all Developer ID + hardened runtime."

step "11. Bundle identity and version"
GOT_ID="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "${APP}/Contents/Info.plist")"
SHORT="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "${APP}/Contents/Info.plist")"
BUILD="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "${APP}/Contents/Info.plist")"
echo "CFBundleIdentifier         ${GOT_ID}"
echo "CFBundleShortVersionString ${SHORT}"
echo "CFBundleVersion            ${BUILD}"

[ "$GOT_ID" = "$BUNDLE_ID" ] \
  || fail "CFBundleIdentifier '${GOT_ID}' != '${BUNDLE_ID}' from the contract at ${TAG}."
[ "$SHORT" = "${TAG#v}" ] \
  || fail "CFBundleShortVersionString '${SHORT}' != '${TAG#v}'. The producer stamps the tag; this bundle is from something else."


# The designated requirement — the other half of "same app", and the half that
# is not in the plist. Extracted here rather than in step 12 because steps 12
# and 13 both need it, and step 12 does not run for a first release.
codesign -d -r- "$APP" 2>/dev/null | sed -n 's/^designated => //p' > dr-new.txt
[ -s dr-new.txt ] || fail "could not read the designated requirement of ${TAG}."
echo "designated requirement:"
echo "  $(cat dr-new.txt)"
grep -q "identifier \"${BUNDLE_ID}\"" dr-new.txt \
  || fail "the designated requirement does not pin identifier \"${BUNDLE_ID}\": $(cat dr-new.txt)"
grep -q 'anchor apple generic' dr-new.txt \
  || fail "the designated requirement has no Apple anchor: $(cat dr-new.txt)"
grep -q 'certificate leaf\[subject.OU\]' dr-new.txt \
  || fail "the designated requirement does not pin a Team ID: $(cat dr-new.txt)"

# CFBundleVersion is what macOS compares when it finds two copies of the same
# bundle id. Apple requires one to three period-separated integers, and
# LaunchServices' parse STOPS at the first non-numeric character — so
# "0.5.0-rc.1" and "0.5.0" compare EQUAL and the newer copy is not preferred.
printf '%s' "$BUILD" | grep -Eq '^[0-9]+(\.[0-9]+){0,2}$' \
  || fail "CFBundleVersion '${BUILD}' is not one to three period-separated integers. macOS cannot order this against another installed copy."
echo "OK: identity matches the contract, CFBundleVersion is well formed, requirement pins id + anchor + team."

step "12. Upgrade continuity against the previous release"
# The check nothing else in the pipeline makes. See the header.
PREV="$PREV_ARG"
if [ -z "$PREV" ]; then
  # The previously CUT release, by creation time — which is what a user
  # upgrading from "whatever they had" actually has. Drafts included: a draft is
  # the state every release passes through, and the artifact is already built.
  PREV="$(gh release list --repo "$REPO" --limit 30 --json tagName,createdAt \
            --jq "[.[] | select(.tagName != \"${TAG}\")] | sort_by(.createdAt) | reverse | .[0].tagName // empty" 2>/dev/null || true)"
  if [ -n "$PREV" ]; then
    echo "auto-detected previous release: ${PREV}  (override with a second argument, or 'none')"
  fi
fi

if [ "$PREV" = "$TAG" ]; then
  # hdiutil refuses a second concurrent attach of the same image, so this would
  # fail at the mount rather than say what is wrong. Comparing a release to
  # itself proves nothing anyway.
  echo
  echo "SKIPPED: ${PREV} is the release being verified; there is nothing to compare it to."
elif [ "$PREV" = "none" ] || [ -z "$PREV" ]; then
  echo
  echo "SKIPPED: no previous release to compare against."
  echo "         Nothing is upgrading from anything yet, so there is no continuity"
  echo "         to break. Re-run with an explicit previous tag once one exists."
else
  PREV_CFG="$(read_config "$PREV")"
  PREV_TMPL="$(cfg_get dmg_name "$PREV_CFG")"
  PREV_APP_NAME="$(basename "$(cfg_get app_path "$PREV_CFG")")"
  [ -n "$PREV_TMPL" ] || fail "dmg_name missing from the contract at ${PREV}."
  PREV_DMG="$(expand_name "$PREV_TMPL" "$PREV")"

  echo "comparing ${TAG} against ${PREV} (${PREV_DMG})"
  if ! gh release download "$PREV" --repo "$REPO" --pattern "$PREV_DMG" --clobber 2>/dev/null; then
    fail "could not download ${PREV_DMG} from ${PREV}. Pass an explicit previous tag, or 'none' if that release carries no dmg."
  fi
  hdiutil attach "$PREV_DMG" -nobrowse -readonly -mountpoint "$MOUNT_PREV"
  PREV_APP="${MOUNT_PREV}/${PREV_APP_NAME}"
  [ -d "$PREV_APP" ] || fail "no ${PREV_APP_NAME} inside ${PREV_DMG}."

  # The two facts macOS uses to decide "same app": the bundle identifier, and
  # the designated requirement. Compared against the previous ARTIFACT, because
  # a constant restated here could only ever agree with itself.
  PREV_ID="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "${PREV_APP}/Contents/Info.plist")"
  codesign -d -r- "$PREV_APP" 2>/dev/null | sed -n 's/^designated => //p' > dr-old.txt
  [ -s dr-old.txt ] || fail "could not read the designated requirement of ${PREV}."

  echo "--- designated requirement ---"
  echo "${PREV}:  $(cat dr-old.txt)"
  echo "${TAG}:  $(cat dr-new.txt)"
  echo "------------------------------"

  [ "$GOT_ID" = "$PREV_ID" ] \
    || fail "the bundle identifier changed: ${PREV} was '${PREV_ID}', ${TAG} is '${GOT_ID}'. Every existing install will treat this as a DIFFERENT app: TCC grants reset, keychain items orphan, and ~/Library/Application Support moves. If that is intended, it is a migration, not a release."

  if ! diff -q dr-old.txt dr-new.txt >/dev/null; then
    echo >&2
    diff dr-old.txt dr-new.txt >&2 || true
    fail "the designated requirement changed (usually a different Apple Team ID). macOS will not treat ${TAG} as an upgrade of ${PREV}: TCC grants reset, keychain ACLs orphan, and any future in-app updater refuses the swap."
  fi

  PREV_BUILD="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "${PREV_APP}/Contents/Info.plist")"
  echo "CFBundleVersion  ${PREV}: ${PREV_BUILD}   ${TAG}: ${BUILD}"
  # Component-wise integer compare, matching how LaunchServices orders two
  # copies of the same bundle id.
  if ver_gt "$BUILD" "$PREV_BUILD"; then
    echo "OK: CFBundleVersion increases."
  else
    fail "CFBundleVersion did not increase: ${PREV} is '${PREV_BUILD}', ${TAG} is '${BUILD}'. When both copies exist on a Mac, LaunchServices will not prefer the newer one."
  fi

  hdiutil detach "$MOUNT_PREV" -quiet
  echo "OK: ${TAG} is an upgrade of ${PREV} — same identifier, same designated requirement, higher build."
fi

step "13. The zip artifact"
# `artifact = dmg,zip` in the contract adds the .app in a ditto archive — the
# shape Squirrel.Mac installs, and what an in-app updater here would consume.
# Two things make it worth checking rather than trusting: nothing downstream
# re-verifies it (an updater unpacks it and swaps it in, having already moved
# the running app aside), and it must be the same app the dmg ships.
ZIP_TMPL="$(cfg_get zip_name "$CFG")"
case ",$(printf '%s' "$(cfg_get artifact "$CFG")" | tr -d '[:space:]')," in
  *,zip,*) WANT_ZIP=1 ;;
  *)       WANT_ZIP=0 ;;
esac

if [ "$WANT_ZIP" -eq 0 ]; then
  echo "SKIPPED: the contract at ${TAG} does not request a zip artifact."
else
  [ -n "$ZIP_TMPL" ] \
    || fail "the contract at ${TAG} lists artifact=zip but names no zip_name."
  ZIP="$(expand_name "$ZIP_TMPL" "$TAG")"
  echo "zip: ${ZIP}"
  gh release download "$TAG" --repo "$REPO" \
    --pattern "$ZIP" --pattern "${ZIP}.sha256" --clobber

  HAVE_Z="$(shasum -a 256 "$ZIP" | awk '{print $1}')"
  grep -qi "$HAVE_Z" "${ZIP}.sha256" || fail "sha256 mismatch for ${ZIP}."
  echo "OK: checksum matches."

  # ditto, not unzip: the archive stores a bundle's symlinks and extended
  # attributes, and unpacking with anything else materialises a framework's
  # Versions/Current as a directory — which invalidates the signature. That is
  # the same reason the builder writes it with ditto.
  rm -rf unpack-zip && mkdir -p unpack-zip
  /usr/bin/ditto -x -k "$ZIP" unpack-zip
  Z_APP="unpack-zip/${APP_NAME}"
  [ -d "$Z_APP" ] || fail "no ${APP_NAME} at the root of ${ZIP}."

  # Same code and same identity as the dmg ships.
  codesign --verify --deep --strict --verbose=2 "$Z_APP"
  codesign -dvv "$Z_APP" 2>z-sig.txt || true
  grep -q 'Authority=Developer ID Application' z-sig.txt \
    || fail "the app inside ${ZIP} is not Developer ID signed."
  grep -q 'flags=.*runtime' z-sig.txt \
    || fail "the app inside ${ZIP} has no hardened runtime."
  codesign -d -r- "$Z_APP" 2>/dev/null | sed -n 's/^designated => //p' > dr-zip.txt
  if ! diff -q dr-new.txt dr-zip.txt >/dev/null; then
    diff dr-new.txt dr-zip.txt >&2 || true
    fail "the app in ${ZIP} has a different designated requirement from the one in ${DMG}. The two artifacts of one release must be the same app."
  fi
  echo "OK: same Developer ID, hardened runtime, and designated requirement as the dmg."

  # An updater swaps this in with no network guarantee, so the ticket has to be
  # in the bundle rather than resolvable.
  if [ "$HAVE_STAPLER" -eq 1 ]; then
    xcrun stapler validate "$Z_APP" \
      || fail "the app inside ${ZIP} carries no stapled ticket — an update swapped in offline would be refused."
  else
    # Same proof without stapler: Contents/CodeResources at the BUNDLE ROOT is
    # the ticket, distinct from Contents/_CodeSignature/CodeResources.
    [ -e "${Z_APP}/Contents/CodeResources" ] \
      || fail "the app inside ${ZIP} has no Contents/CodeResources, so it carries no stapled ticket."
    echo "(stapler unavailable; proved via Contents/CodeResources instead)"
  fi
  spctl -a -t exec -vv "$Z_APP" 2>z-spctl.txt || { cat z-spctl.txt; fail "Gatekeeper rejects the app inside ${ZIP}."; }
  grep -q 'source=Notarized Developer ID' z-spctl.txt \
    || fail "the app inside ${ZIP} does not assess as Notarized Developer ID."
  echo "OK: the zip ships a STAPLED, notarized ${APP_NAME}."
fi

case "$APP_STAPLED" in
  1) STEP_A_EXPECT="It must STILL BE ACCEPTED — step 9 found a stapled ticket." ;;
  0) STEP_A_EXPECT="It is EXPECTED TO FAIL — step 9 found no stapled ticket, which is
     what a dmg-only client ships. Record the result; that is this release's
     known limit, not a regression. It does not block a normal online upgrade;
     it IS what a user on a plane or behind a strict proxy hits, on every
     version they install. See RELEASING.md → Offline launch." ;;
  *) STEP_A_EXPECT="Step 9 could not tell (stapler did not resolve here), so this is the
     only check that can." ;;
esac

cat <<MANUAL

$(printf '\033[1m')Automated checks passed.$(printf '\033[0m')

Three steps remain, and they are the ones that cannot be scripted honestly.

  A. OFFLINE LAUNCH
     Turn Wi-Fi off, then run:

       spctl -a -t exec -vv "${APP}"

     Passing online only proves the ticket is resolvable from Apple; passing
     offline proves it is stapled INTO the artifact.

     ${STEP_A_EXPECT}

  B. QUARANTINE INHERITANCE, END TO END
     With the image still mounted:

       cp -R "${APP}" /Applications/
       xattr -r -p com.apple.quarantine /Applications/${APP_NAME} | head
       open -W /Applications/${APP_NAME}

     Expect at most the ordinary first-run prompt. "${APP_NAME%.app} cannot be
     opened" or "is damaged" is a FAILURE. If it is refused, the reason is in:

       log show --predicate 'subsystem == "com.apple.syspolicy"' --last 5m

  C. UPGRADE OVER THE INSTALLED VERSION
     Step 12 proves macOS will CALL this the same app. This proves it behaves
     like one. Starting from the PREVIOUS version installed and launched at
     least once, so it has real state:

       open -W /Applications/${APP_NAME}          # previous version, let it start
       # then replace it with this build:
       rm -rf /Applications/${APP_NAME}
       cp -R "${APP}" /Applications/
       open -W /Applications/${APP_NAME}

     Expect: it launches with no "damaged" dialog, no repeated Gatekeeper
     prompt, and ~/Library/Application Support/Maximal/core-home still holds
     what the previous version wrote. Replace the bundle while the app is
     RUNNING and macOS may kill it — quit first; that is macOS, not this build.

Then detach:  hdiutil detach "${MOUNT}"
MANUAL
