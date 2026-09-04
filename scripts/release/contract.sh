#!/usr/bin/env bash
set -euo pipefail

# Reads the macos-builder client contract and prints what a release needs to
# know, as KEY=VALUE lines suitable for appending to $GITHUB_OUTPUT.
#
#   Usage: scripts/release/contract.sh --config <file> --forge <file> --tag <tag>
#
# WHY THIS TAKES FILES AND NOT PATHS IT FINDS ITSELF
#
# .github/workflows/release.yml runs on two triggers with different refs. On a
# tag push the checkout IS the tag. On workflow_dispatch — the recovery path —
# the checkout is a BRANCH, so the workflow and these scripts come from that
# branch (which is the point: a fix to them can then reach an already-cut tag)
# while the contract must still come from the TAG being released. Reading a
# fixed path would silently release main's contract at the tag's commit.
#
# So the caller decides where each file comes from, typically:
#   git show "${TAG}:.macos-builder/config"           > cfg
#   git show "${TAG}:packages/maximal/client/forge.config.ts" > forge
#
# It also makes every branch below reachable from scripts/release/selftest.sh
# with fixtures, instead of only during a real 20-40 minute release.
#
# Emits: dmg, zip (empty when not requested), bundle_id, app_name, app_path.

fail() { echo "::error::$*" >&2; exit 1; }
usage() {
  echo "Usage: $(basename "$0") --config <file> --forge <file> --tag <tag>" >&2
  exit 2
}

CFG=""; FORGE=""; TAG=""
while [ $# -gt 0 ]; do
  case "$1" in
    --config) CFG="${2:-}"; shift 2 ;;
    --forge)  FORGE="${2:-}"; shift 2 ;;
    --tag)    TAG="${2:-}"; shift 2 ;;
    *) usage ;;
  esac
done
[ -n "$CFG" ] && [ -n "$FORGE" ] && [ -n "$TAG" ] || usage
[ -f "$CFG" ] || fail "${CFG} is missing; the builder refuses a client without it."
[ -f "$FORGE" ] || fail "${FORGE} is missing; the bundle id cannot be cross-checked."

# One key, first occurrence, trailing whitespace stripped. `sed -n` writes at
# most one line here, so there is no reader to exit early and no pipeline to
# take a SIGPIPE from — see verify-assets.sh for where that mattered.
get() {
  sed -nE "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*(.*[^[:space:]])[[:space:]]*\$/\1/p" "$CFG" \
    | sed -n '1p'
}

BUNDLE_ID="$(get bundle_id)"
APP_PATH="$(get app_path)"
DMG_TMPL="$(get dmg_name)"
ARTIFACT="$(get artifact)"
ZIP_TMPL="$(get zip_name)"

[ -n "$BUNDLE_ID" ] || fail "bundle_id missing from ${CFG}."
[ -n "$DMG_TMPL" ]  || fail "dmg_name missing from ${CFG}; the release derives the asset name from it."
case "$APP_PATH" in
  *.app) ;;
  *) fail "app_path '${APP_PATH}' must end in .app." ;;
esac

# forge.config.ts is the other place the bundle id appears. A disagreement is
# otherwise caught by the builder's policy gate only AFTER a full build.
grep -q "appBundleId: '${BUNDLE_ID}'" "$FORGE" \
  || fail "bundle_id '${BUNDLE_ID}' in ${CFG} does not match appBundleId in ${FORGE}."

expand() {
  local t="${1//\{version\}/${TAG#v}}"
  printf '%s' "${t//\{tag\}/${TAG}}"
}
DMG="$(expand "$DMG_TMPL")"
case "$DMG" in
  *.dmg) ;;
  *) fail "dmg_name '${DMG}' must end in .dmg." ;;
esac

# The zip artifact is optional in the contract, so what the release waits for is
# DERIVED from `artifact`, never assumed. Commas both sides so a substring like
# `unzip` cannot match.
ZIP=""
case ",$(printf '%s' "$ARTIFACT" | tr -d '[:space:]')," in
  *,zip,*)
    [ -n "$ZIP_TMPL" ] || fail "artifact lists zip but zip_name is missing from ${CFG}."
    ZIP="$(expand "$ZIP_TMPL")"
    case "$ZIP" in
      *.zip) ;;
      *) fail "zip_name '${ZIP}' must end in .zip; the builder rejects any other shape." ;;
    esac
    ;;
esac

printf 'dmg=%s\n' "$DMG"
printf 'zip=%s\n' "$ZIP"
printf 'bundle_id=%s\n' "$BUNDLE_ID"
printf 'app_name=%s\n' "$(basename "$APP_PATH")"
printf 'app_path=%s\n' "$APP_PATH"
