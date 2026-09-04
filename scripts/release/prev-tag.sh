#!/usr/bin/env bash
set -euo pipefail

# Prints the tag released immediately BEFORE <tag>, or nothing if there is none.
#
#   Usage: scripts/release/prev-tag.sh --tag <tag> --tags-file <file>
#
# <file> is `git tag --list 'v*' --sort=-creatordate`: newest first, one per
# line. Taking the list as a file rather than shelling out to git is what makes
# this testable without fabricating a repository full of dated tags.
#
# WHAT THIS FIXES
#
# The previous form was `git tag --list ... | grep -vxF "$TAG" | head -1`, which
# takes the newest tag that is not <tag> — and that may be NEWER than <tag>.
# Re-releasing an older tag then compared its bundle identity against a LATER
# release, so the identity gate answered a question nobody asked. It only stayed
# invisible because releases had always been cut newest-first.
#
# Position in the list, not "anything but me": the entry after <tag> in a
# newest-first ordering IS the previous release, by construction.

fail() { echo "::error::$*" >&2; exit 1; }
usage() { echo "Usage: $(basename "$0") --tag <tag> --tags-file <file>" >&2; exit 2; }

TAG=""; TAGS_FILE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --tag)       TAG="${2:-}"; shift 2 ;;
    --tags-file) TAGS_FILE="${2:-}"; shift 2 ;;
    *) usage ;;
  esac
done
if [ -z "$TAG" ] || [ -z "$TAGS_FILE" ]; then usage; fi
[ -f "$TAGS_FILE" ] || fail "${TAGS_FILE} is missing; the tag list cannot be read."

# Prints the line after the one equal to $TAG, then stops. Empty output means
# $TAG is the oldest tag, or is absent from the list entirely — both of which
# the caller must treat as "nothing to compare against".
awk -v t="$TAG" 'found { print; exit } $0 == t { found = 1 }' "$TAGS_FILE"
