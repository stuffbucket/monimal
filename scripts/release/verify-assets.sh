#!/usr/bin/env bash
set -euo pipefail

# Everything about a release artifact that can be proven WITHOUT a Mac.
#
#   Usage: scripts/release/verify-assets.sh --dir <dir> --dmg <name> \
#                                           [--zip <name>] --app-name <Name.app>
#
# Proves PRESENCE, INTEGRITY and CONTAINER SHAPE. Gatekeeper, notarization and
# the designated requirement cannot be checked off a Mac, and AGENTS.md forbids
# GitHub-hosted macOS runners. scripts/verify-dmg.sh owns that proof and must be
# run by a human on a clean Mac before publishing. See RELEASING.md.
#
# Extracted from .github/workflows/release.yml so scripts/release/selftest.sh can
# drive every branch against fixtures on every PR. Both bugs that reached a real
# release lived in shell exactly like this and could only be found by cutting a
# tag and waiting 40 minutes for a build.
#
# NO `writer | reader` PIPELINES WHERE THE READER CAN EXIT EARLY.
# `head` stops after N lines and `grep -q` stops at the first match, closing the
# read end while the writer may still be writing. The writer then takes SIGPIPE,
# and under `set -o pipefail` that 141 becomes the status of the whole pipeline.
# Whether it happens is a race on the listing's size, so it fails on one machine
# and passes on another: v0.5.0-rc.4 shipped four correct, signed, notarized,
# stapled assets and its release still failed on `echo "$ENTRIES" | head -5`,
# while the identical pipeline over the identical artifact exits 0 on macOS.
# Herestrings throughout: a herestring is a file, so there is no second exit
# status to inherit. selftest.sh's zip fixture is deliberately large enough that
# reintroducing a pipeline here fails the test.

fail() { echo "::error::$*" >&2; exit 1; }
usage() {
  echo "Usage: $(basename "$0") --dir <dir> --dmg <name> [--zip <name>] --app-name <Name.app>" >&2
  exit 2
}

DIR=""; DMG=""; ZIP=""; APP_NAME=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dir)      DIR="${2:-}"; shift 2 ;;
    --dmg)      DMG="${2:-}"; shift 2 ;;
    --zip)      ZIP="${2:-}"; shift 2 ;;
    --app-name) APP_NAME="${2:-}"; shift 2 ;;
    *) usage ;;
  esac
done
if [ -z "$DIR" ] || [ -z "$DMG" ] || [ -z "$APP_NAME" ]; then usage; fi
[ -d "$DIR" ] || fail "${DIR} is not a directory."

# GNU on the runner, BSD on a maintainer's Mac. Both are load-bearing: the
# workflow runs this on ubuntu-latest, selftest.sh runs it wherever it is
# invoked, and a script that only works on one of them is a script that only
# gets tested on one of them.
if command -v sha256sum >/dev/null 2>&1; then
  sha256_of() { sha256sum "$1" | awk '{print $1}'; }
else
  sha256_of() { shasum -a 256 "$1" | awk '{print $1}'; }
fi
size_of() { wc -c < "$1" | tr -d ' '; }

# The Bun sidecar alone is ~74MB; anything near zero is a failed hdiutil or
# ditto that still produced a file.
MIN_BYTES=50000000

check_checksum() {
  # $1 file, relative to $DIR
  local f="$1" have want
  [ -f "${DIR}/${f}" ]        || fail "${f} is not attached."
  [ -f "${DIR}/${f}.sha256" ] || fail "${f}.sha256 is not attached; integrity cannot be checked."
  have="$(sha256_of "${DIR}/${f}")"
  want="$(cat "${DIR}/${f}.sha256")"
  # The builder writes `<sha>  <name>`; match the hash anywhere in the line, but
  # as a whole word so a truncated hash cannot pass.
  grep -qiE "(^|[^0-9a-fA-F])${have}([^0-9a-fA-F]|\$)" <<< "$want" \
    || fail "sha256 mismatch for ${f}; computed ${have}, checksum file says ${want}"
  printf '%s' "$have"
}

# ---------------------------------------------------------------------------
# dmg
# ---------------------------------------------------------------------------
DMG_SHA="$(check_checksum "$DMG")"

BYTES="$(size_of "${DIR}/${DMG}")"
[ "$BYTES" -gt "$MIN_BYTES" ] \
  || fail "${DMG} is ${BYTES} bytes — far too small to contain the app."

# A real UDIF disk image ends with a 512-byte 'koly' trailer. Read it with dd at
# an offset rather than `tail -c 512 | head -c 4`, which is the same early-exit
# pipeline this file exists to avoid.
TRAILER="$(dd if="${DIR}/${DMG}" bs=1 skip="$(( BYTES - 512 ))" count=4 2>/dev/null)"
[ "$TRAILER" = "koly" ] \
  || fail "${DMG} has no UDIF koly trailer (got '${TRAILER}') — not a disk image."

echo "::notice::${DMG} — ${BYTES} bytes, sha256 ${DMG_SHA}, valid UDIF."

# ---------------------------------------------------------------------------
# zip — optional, and the ONLY artifact Ubuntu can inspect the .app through: a
# zip can be listed, an APFS disk image cannot.
# ---------------------------------------------------------------------------
[ -n "$ZIP" ] || exit 0

ZIP_SHA="$(check_checksum "$ZIP")"

# PKZip magic, before unzip is asked to read it.
MAGIC="$(dd if="${DIR}/${ZIP}" bs=1 count=2 2>/dev/null | od -An -tx1 | tr -d ' \n')"
[ "$MAGIC" = "504b" ] \
  || fail "${ZIP} does not start with the PKZip magic (got ${MAGIC})."

# -Z1 is zipinfo's bare listing: one entry per line, no header or totals.
ENTRIES="$(unzip -Z1 "${DIR}/${ZIP}")"
head -5 <<< "$ENTRIES"
echo "  ... $(wc -l <<< "$ENTRIES" | tr -d ' ') entries"

grep -qxF "${APP_NAME}/Contents/Info.plist" <<< "$ENTRIES" \
  || fail "${ZIP} does not contain ${APP_NAME}/Contents/Info.plist."

# `Contents/CodeResources` at the BUNDLE ROOT is the stapled notarization
# ticket. It is a different file from `Contents/_CodeSignature/CodeResources`,
# which is the resource manifest and is present whether or not the app was ever
# stapled, and from `Contents/._CodeResources`, which is ditto's AppleDouble
# sidecar. Absence means every install of this version needs Apple's notary
# service reachable at first launch.
grep -qxF "${APP_NAME}/Contents/CodeResources" <<< "$ENTRIES" \
  || fail "${APP_NAME} inside ${ZIP} carries no stapled ticket. package-macos.sh section 2b must staple the .app before packaging. See RELEASING.md → Offline launch."

echo "::notice::${ZIP} — sha256 ${ZIP_SHA}, contains a STAPLED ${APP_NAME}."
