#!/usr/bin/env bash
set -euo pipefail

# Derives and compares CFBundleVersion values used by the macOS producer and
# release preflight. The CLI accepts values only, so it is testable without git
# and works on both GNU and BSD userlands.

usage() {
  echo "Usage: $(basename "$0") derive --timestamp <unix-seconds> | check --candidate <version> --previous <version|none>" >&2
  exit 2
}

fail() { echo "::error::$*" >&2; exit 1; }

decimal() {
  local value="$1"
  while [ "${value#0}" != "$value" ]; do value="${value#0}"; done
  printf '%s' "${value:-0}"
}

valid_version() {
  printf '%s\n' "$1" | grep -Eq '^[0-9]+(\.[0-9]+){0,2}$'
}

greater_than() {
  local candidate="$1" previous="$2" index candidate_part previous_part
  local -a candidate_parts previous_parts
  IFS=. read -r -a candidate_parts <<< "$candidate"
  IFS=. read -r -a previous_parts <<< "$previous"

  for index in 0 1 2; do
    candidate_part="$(decimal "${candidate_parts[$index]:-0}")"
    previous_part="$(decimal "${previous_parts[$index]:-0}")"
    if [ "${#candidate_part}" -gt "${#previous_part}" ]; then return 0; fi
    if [ "${#candidate_part}" -lt "${#previous_part}" ]; then return 1; fi
    if [[ "$candidate_part" > "$previous_part" ]]; then return 0; fi
    if [[ "$candidate_part" < "$previous_part" ]]; then return 1; fi
  done
  return 1
}

derive() {
  local timestamp="$1" rendered year month_day hour_minute
  case "$timestamp" in ''|*[!0-9]*) fail "Commit timestamp '${timestamp}' is not a non-negative Unix timestamp." ;; esac

  if rendered="$(date -u -r "$timestamp" '+%Y %m%d %H%M' 2>/dev/null)"; then
    : # BSD date
  elif rendered="$(date -u -d "@${timestamp}" '+%Y %m%d %H%M' 2>/dev/null)"; then
    : # GNU date
  else
    fail "Could not render commit timestamp '${timestamp}' in UTC."
  fi
  set -- $rendered
  year="$1"; month_day="$2"; hour_minute="$3"
  printf '%s.%s.%s\n' "$year" "$(decimal "$month_day")" "$(decimal "$hour_minute")"
}

command_name="${1:-}"
shift || true
case "$command_name" in
  derive)
    [ "${1:-}" = "--timestamp" ] && [ -n "${2:-}" ] && [ "$#" -eq 2 ] || usage
    derive "$2"
    ;;
  check)
    [ "${1:-}" = "--candidate" ] && [ -n "${2:-}" ] \
      && [ "${3:-}" = "--previous" ] && [ -n "${4:-}" ] && [ "$#" -eq 4 ] || usage
    candidate="$2"; previous="$4"
    valid_version "$candidate" || fail "Candidate CFBundleVersion '${candidate}' must be one to three dot-separated numeric components."
    if [ "$previous" = "none" ]; then exit 0; fi
    valid_version "$previous" || fail "Previous CFBundleVersion '${previous}' must be one to three dot-separated numeric components."
    greater_than "$candidate" "$previous" \
      || fail "Candidate CFBundleVersion '${candidate}' is not greater than previous '${previous}'."
    ;;
  *) usage ;;
esac
