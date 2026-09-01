#!/usr/bin/env bash
set -euo pipefail

# Gatekeeper acceptance test for a release dmg. THIS IS THE DEFINITION OF DONE.
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
#   Usage: scripts/verify-dmg.sh v0.5.0-rc.1
#
# Requires: gh (authenticated — the release is a DRAFT and is not public).

usage() { echo "Usage: $(basename "$0") <tag>   e.g. $(basename "$0") v0.5.0-rc.1" >&2; exit 2; }

TAG="${1:-}"
[ -n "$TAG" ] || usage
[ "$(uname -s)" = "Darwin" ] || { echo "error: this test only means anything on macOS." >&2; exit 1; }
command -v gh >/dev/null || { echo "error: gh is required to download a draft release." >&2; exit 1; }

REPO="${REPO:-stuffbucket/monimal}"
DMG="maximal-${TAG}-darwin-arm64.dmg"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/verify-dmg.XXXXXX")"
MOUNT="/Volumes/Maximal-verify-$$"

# shellcheck disable=SC2317  # invoked via trap
cleanup() {
  hdiutil detach "$MOUNT" -quiet 2>/dev/null || true
  echo
  echo "Artifacts left in ${WORK}"
}
trap cleanup EXIT

step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

cd "$WORK"

step "1. Download ${DMG} from ${REPO}@${TAG}"
gh release download "$TAG" --repo "$REPO" --pattern "$DMG" --pattern "${DMG}.sha256" --clobber
ls -la

step "2. Checksum"
shasum -a 256 "$DMG"
cat "${DMG}.sha256"
HAVE="$(shasum -a 256 "$DMG" | awk '{print $1}')"
grep -qi "$HAVE" "${DMG}.sha256" || { echo "FAIL: sha256 mismatch." >&2; exit 1; }
echo "OK: checksum matches."

step "3. Apply a quarantine attribute"
# Neither gh nor curl sets com.apple.quarantine — only download-aware apps
# (Safari, Chrome, Mail) do. Without it, every Gatekeeper check below runs on a
# file macOS considers locally produced and trusted, which proves nothing about
# what a user gets. So set it explicitly, in the shape Safari writes.
#   0083 = quarantine flags, then a hex timestamp, then the agent name.
xattr -w com.apple.quarantine "0083;$(printf '%x' "$(date +%s)");Safari;" "$DMG"
xattr -p com.apple.quarantine "$DMG" || { echo "FAIL: quarantine attribute did not stick." >&2; exit 1; }
echo "OK: quarantined."

step "4. The dmg is notarized and stapled"
# --context context:primary-signature is the correct assessment for a disk
# image; -t install is for installer packages.
spctl -a -t open --context context:primary-signature -vv "$DMG"
stapler validate "$DMG"

step "5. Mount"
hdiutil attach "$DMG" -nobrowse -readonly -mountpoint "$MOUNT"
APP="${MOUNT}/Maximal.app"
[ -d "$APP" ] || { echo "FAIL: no Maximal.app inside the image." >&2; exit 1; }

step "6. The .app: inside-out signature"
codesign --verify --deep --strict --verbose=2 "$APP"

step "7. The .app: identity, hardened runtime, entitlements"
codesign -dvvv --entitlements :- "$APP" 2>&1 | tee sig.txt | sed -n '1,40p'
grep -q 'Authority=Developer ID Application' sig.txt || { echo "FAIL: not Developer ID signed." >&2; exit 1; }
grep -q 'flags=.*runtime'                    sig.txt || { echo "FAIL: hardened runtime is off; notarization should have rejected this." >&2; exit 1; }
if grep -q 'Signature=adhoc' sig.txt; then echo "FAIL: ad-hoc signature." >&2; exit 1; fi
echo "OK: Developer ID + hardened runtime."

step "8. The .app: Gatekeeper and staple"
spctl -a -t exec -vv "$APP"
stapler validate "$APP"

step "9. The sidecar inside the bundle"
codesign --verify --strict --verbose=2 "${APP}/Contents/Resources/bin/maximal-core"

step "10. Bundle identity"
/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier'         "${APP}/Contents/Info.plist"
/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "${APP}/Contents/Info.plist"

cat <<MANUAL

$(printf '\033[1m')Automated checks passed.$(printf '\033[0m')

Two steps remain, and they are the ones that distinguish "notarized and
stapled" from "signed and lucky". Neither can be scripted honestly.

  A. OFFLINE STAPLE TEST
     Turn Wi-Fi off, then run:

       spctl -a -t exec -vv "${APP}"

     It must still be accepted. Passing online only proves the ticket is
     resolvable from Apple; passing offline proves it is stapled INTO the
     artifact, which is what a user on a plane or behind a proxy gets.

  B. QUARANTINE INHERITANCE, END TO END
     With the image still mounted:

       cp -R "${APP}" /Applications/
       xattr -r -p com.apple.quarantine /Applications/Maximal.app | head
       open -W /Applications/Maximal.app

     Expect at most the ordinary first-run prompt. "Maximal cannot be opened"
     or "is damaged" is a FAILURE. If it is refused, the reason is in:

       log show --predicate 'subsystem == "com.apple.syspolicy"' --last 5m

Then detach:  hdiutil detach "${MOUNT}"
MANUAL
