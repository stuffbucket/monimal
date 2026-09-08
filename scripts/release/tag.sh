#!/usr/bin/env bash
set -euo pipefail

# Validates one release tag and prints workflow outputs as KEY=VALUE lines.
#
# Usage: scripts/release/tag.sh <tag>
#
# Tags are vMAJOR.MINOR.PATCH with an optional SemVer prerelease. The builder
# accepts only refs beginning with an optional v followed by a digit and up to
# 100 permitted characters, so the length limit is enforced here too.

fail() { echo "::error::$*" >&2; exit 1; }

[ "$#" -eq 1 ] || fail "Usage: $(basename "$0") <tag>"
TAG="$1"

[ -n "$TAG" ] || fail "No tag to release."
[ "${#TAG}" -le 100 ] || fail "Tag '${TAG}' is rejected by the builder's ref pattern."

if ! printf '%s' "$TAG" | grep -Eq '^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-([0-9A-Za-z-]+)(\.[0-9A-Za-z-]+)*)?$'; then
  fail "Tag '${TAG}' is not vMAJOR.MINOR.PATCH[-prerelease]."
fi

PRERELEASE=false
case "$TAG" in
  *-*)
    PRERELEASE=true
    SUFFIX="${TAG#*-}"
    OLD_IFS="$IFS"
    IFS=.
    # shellcheck disable=SC2086
    set -- $SUFFIX
    IFS="$OLD_IFS"
    for IDENTIFIER in "$@"; do
      case "$IDENTIFIER" in
        *[!0-9]*) ;;
        0|[1-9][0-9]*) ;;
        *) fail "Tag '${TAG}' has a prerelease numeric identifier with a leading zero." ;;
      esac
    done
    ;;
esac

printf 'tag=%s\n' "$TAG"
printf 'version=%s\n' "${TAG#v}"
printf 'prerelease=%s\n' "$PRERELEASE"