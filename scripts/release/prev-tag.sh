#!/usr/bin/env bash
set -euo pipefail

# Prints the published release immediately BEFORE <tag>, or nothing if there is
# none. If <tag> is not published, prints the latest published release.
#
#   Usage: scripts/release/prev-tag.sh --tag <tag> --releases-file <file>
#
# <file> is the JSON emitted by:
#
#   gh api --paginate --slurp "repos/<owner>/<repo>/releases?per_page=100"
#
# `--slurp` produces one stable outer array around the page arrays. The resolver
# accepts a single flat page too, so synthetic records remain small in selftest.
# Drafts and releases without published_at are ignored. Published releases sort
# newest first by published_at; when the target is present, its following entry
# is its predecessor. This prevents an old-release rerun from comparing against
# a newer release.

fail() { echo "::error::$*" >&2; exit 1; }
usage() { echo "Usage: $(basename "$0") --tag <tag> --releases-file <file>" >&2; exit 2; }

TAG=""; RELEASES_FILE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --tag)           TAG="${2:-}"; shift 2 ;;
    --releases-file) RELEASES_FILE="${2:-}"; shift 2 ;;
    *) usage ;;
  esac
done
if [ -z "$TAG" ] || [ -z "$RELEASES_FILE" ]; then usage; fi
[ -f "$RELEASES_FILE" ] || fail "${RELEASES_FILE} is missing; the release records cannot be read."
command -v jq >/dev/null 2>&1 || fail "jq is required to resolve the previous release."

jq -r --arg tag "$TAG" '
  [ .[] | if type == "array" then .[] else . end
    | select(.draft != true and .published_at != null) ]
  | sort_by(.published_at) | reverse
  | . as $published
  | ($published | map(.tag_name) | index($tag)) as $target_index
  | if $target_index == null then $published[0] else $published[$target_index + 1] end
  | .tag_name // empty
' "$RELEASES_FILE"
