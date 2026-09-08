#!/usr/bin/env bash
set -euo pipefail

# Creates and validates the portable, line-oriented evidence accepted by the
# protected publication workflow. Values deliberately allow no whitespace,
# quotes, escapes, or newlines: this keeps a pasted workflow input unambiguous.

fail() { echo "error: $*" >&2; exit 1; }
usage() {
  echo "Usage: $(basename "$0") create|verify [options]" >&2
  exit 2
}

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

valid_value() {
  # A workflow input is a transport format, not a general-purpose document.
  # Permit only the characters needed by repository, tag, asset and version
  # values; the requirement itself is represented by its SHA-256.
  printf '%s' "$1" | grep -Eq '^[A-Za-z0-9._/@:+-]+$'
}

need_value() {
  [ -n "$2" ] && valid_value "$2" || fail "$1 is missing or contains an unsafe character"
}

read_evidence() {
  local file="$1" line key value count=0
  [ -f "$file" ] || fail "evidence file '${file}' is missing"
  while IFS= read -r line || [ -n "$line" ]; do
    count=$((count + 1))
    case "$line" in
      *=*) key=${line%%=*}; value=${line#*=} ;;
      *) fail "evidence line ${count} is malformed" ;;
    esac
    valid_value "$key" || fail "evidence key '${key}' is unsafe"
    valid_value "$value" || fail "evidence value for '${key}' is unsafe"
    case " ${EVIDENCE_KEYS:-} " in
      *" ${key} "*) fail "evidence key '${key}' is duplicated" ;;
    esac
    EVIDENCE_KEYS="${EVIDENCE_KEYS:-} ${key}"
    eval "EVIDENCE_${key}='${value}'"
  done < "$file"
  [ "$count" -gt 0 ] || fail "evidence is empty"
}

evidence_value() {
  eval "printf '%s' \"\${EVIDENCE_$1:-}\""
}

require_equal() {
  local key="$1" want="$2" got
  got="$(evidence_value "$key")"
  [ -n "$got" ] || fail "evidence is missing ${key}"
  [ "$got" = "$want" ] || fail "evidence ${key} '${got}' does not match '${want}'"
}

MODE="${1:-}"
[ -n "$MODE" ] || usage
shift

REPO=""; TAG=""; DMG=""; DMG_SHA=""; ZIP=""; ZIP_SHA=""
PREDECESSOR=""; BUNDLE_ID=""; REQUIREMENT_SHA=""; BUNDLE_VERSION=""
ACCEPTED_AT=""; OFFLINE=""; QUARANTINE=""; UPGRADE=""; FILE=""
NOW=""; MAX_AGE=""; RELEASE_DRAFT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --repo) REPO="${2:-}"; shift 2 ;;
    --tag) TAG="${2:-}"; shift 2 ;;
    --dmg) DMG="${2:-}"; shift 2 ;;
    --dmg-sha256) DMG_SHA="${2:-}"; shift 2 ;;
    --zip) ZIP="${2:-}"; shift 2 ;;
    --zip-sha256) ZIP_SHA="${2:-}"; shift 2 ;;
    --predecessor) PREDECESSOR="${2:-}"; shift 2 ;;
    --bundle-id) BUNDLE_ID="${2:-}"; shift 2 ;;
    --designated-requirement-sha256) REQUIREMENT_SHA="${2:-}"; shift 2 ;;
    --bundle-version) BUNDLE_VERSION="${2:-}"; shift 2 ;;
    --accepted-at) ACCEPTED_AT="${2:-}"; shift 2 ;;
    --offline-launch) OFFLINE="${2:-}"; shift 2 ;;
    --quarantine-inheritance) QUARANTINE="${2:-}"; shift 2 ;;
    --upgrade) UPGRADE="${2:-}"; shift 2 ;;
    --file) FILE="${2:-}"; shift 2 ;;
    --now) NOW="${2:-}"; shift 2 ;;
    --max-age) MAX_AGE="${2:-}"; shift 2 ;;
    --release-draft) RELEASE_DRAFT="${2:-}"; shift 2 ;;
    *) usage ;;
  esac
done

case "$MODE" in
  create)
    for pair in repo:"$REPO" tag:"$TAG" dmg:"$DMG" dmg_sha256:"$DMG_SHA" predecessor:"$PREDECESSOR" bundle_id:"$BUNDLE_ID" designated_requirement_sha256:"$REQUIREMENT_SHA" bundle_version:"$BUNDLE_VERSION" accepted_at:"$ACCEPTED_AT"; do
      need_value "${pair%%:*}" "${pair#*:}"
    done
    if [ "$ZIP" = none ] && [ "$ZIP_SHA" = none ]; then
      :
    else
      need_value zip "$ZIP"
      need_value zip_sha256 "$ZIP_SHA"
    fi
    for value in "$DMG_SHA" "$REQUIREMENT_SHA"; do
      printf '%s' "$value" | grep -Eq '^[0-9a-f]{64}$' || fail "SHA-256 values must be lowercase hexadecimal"
    done
    if [ "$ZIP_SHA" != none ]; then
      printf '%s' "$ZIP_SHA" | grep -Eq '^[0-9a-f]{64}$' || fail "SHA-256 values must be lowercase hexadecimal"
    fi
    printf '%s' "$ACCEPTED_AT" | grep -Eq '^[0-9]+$' || fail "accepted_at must be Unix seconds"
    [ "$OFFLINE" = true ] || fail "offline-launch attestation must be true"
    [ "$QUARANTINE" = true ] || fail "quarantine-inheritance attestation must be true"
    [ "$UPGRADE" = true ] || fail "upgrade attestation must be true"
    cat <<EOF
format=monimal-release-acceptance-v1
repo=${REPO}
tag=${TAG}
dmg=${DMG}
dmg_sha256=${DMG_SHA}
zip=${ZIP}
zip_sha256=${ZIP_SHA}
predecessor=${PREDECESSOR}
bundle_id=${BUNDLE_ID}
designated_requirement_sha256=${REQUIREMENT_SHA}
bundle_version=${BUNDLE_VERSION}
accepted_at=${ACCEPTED_AT}
offline_launch=true
quarantine_inheritance=true
upgrade=true
EOF
    ;;
  verify)
    [ -n "$FILE" ] || usage
    EVIDENCE_KEYS=""
    read_evidence "$FILE"
    require_equal format monimal-release-acceptance-v1
    require_equal repo "$REPO"; require_equal tag "$TAG"; require_equal dmg "$DMG"
    require_equal dmg_sha256 "$DMG_SHA"; require_equal zip "$ZIP"; require_equal zip_sha256 "$ZIP_SHA"
    require_equal predecessor "$PREDECESSOR"; require_equal bundle_id "$BUNDLE_ID"
    require_equal designated_requirement_sha256 "$REQUIREMENT_SHA"
    require_equal bundle_version "$BUNDLE_VERSION"
    require_equal offline_launch true; require_equal quarantine_inheritance true; require_equal upgrade true
    ACCEPTED_AT="$(evidence_value accepted_at)"
    printf '%s' "$ACCEPTED_AT" | grep -Eq '^[0-9]+$' || fail "evidence accepted_at is invalid"
    [ -z "$NOW" ] || { printf '%s' "$NOW" | grep -Eq '^[0-9]+$' || fail "now must be Unix seconds"; }
    [ -z "$MAX_AGE" ] || { printf '%s' "$MAX_AGE" | grep -Eq '^[0-9]+$' || fail "max-age must be seconds"; }
    if [ -n "$NOW" ] && [ -n "$MAX_AGE" ]; then
      [ "$ACCEPTED_AT" -le "$NOW" ] || fail "evidence is from the future"
      [ $((NOW - ACCEPTED_AT)) -le "$MAX_AGE" ] || fail "evidence is stale"
    fi
    [ -z "$RELEASE_DRAFT" ] || [ "$RELEASE_DRAFT" = true ] || fail "release is not a draft"
    ;;
  *) usage ;;
esac