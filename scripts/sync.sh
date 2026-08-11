#!/usr/bin/env bash
#
# Re-sync the copied packages from their source repos.
#
# Uses `git archive HEAD`, so only COMMITTED state comes across. That makes a
# copy reproducible from the SHAs this script prints: re-running it at the same
# source commits reproduces the same tree. The earlier rsync-of-working-tree
# approach dragged in-flight WIP along and could not offer that.
#
#   ./scripts/sync.sh          sync all packages
#   ./scripts/sync.sh maximal  sync one
#
# Follow with `pnpm install`. Deviations are re-applied automatically.

set -euo pipefail

SB="${SB:-$HOME/github/stuffbucket}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# package-dir : source-repo
PACKAGES=(
  "maximal:maximal"
  "maximal-core:maximal-core"
  "maximal-electron:maximal-electron"
  "site:maximal"          # the Astro site lives in maximal/site upstream
)

want="${1:-}"

extract() {
  local repo="$1" dest="$2" subdir="${3:-}"
  local src="$SB/$repo"

  [ -d "$src/.git" ] || { echo "  !! $src is not a git repo" >&2; return 1; }

  local tmp
  tmp="$(mktemp -d)"
  # shellcheck disable=SC2064
  trap "rm -rf '$tmp'" RETURN

  git -C "$src" archive HEAD | tar -x -C "$tmp"

  local from="$tmp"
  [ -n "$subdir" ] && from="$tmp/$subdir"
  [ -d "$from" ] || { echo "  !! $repo has no $subdir/" >&2; return 1; }

  rm -rf "${ROOT:?}/packages/$dest"
  mkdir -p "$ROOT/packages/$dest"
  # dotfiles included
  (shopt -s dotglob && mv "$from"/* "$ROOT/packages/$dest/")
}

strip_noise() {
  local dest="$ROOT/packages/$1"
  # Committed build output and local agent state: never wanted in the workspace.
  rm -rf "$dest/.claude/worktrees" "$dest/dist" "$dest/out" "$dest/reports"
  # Per-package lockfiles are ignored in a workspace -- one root lockfile wins.
  # Leaving them implies a pinning that is not in effect.
  rm -f "$dest/bun.lock" "$dest/bun.lockb" "$dest/pnpm-lock.yaml" "$dest/package-lock.json"
  # NOTE: .github is deliberately KEPT. It looks like dead weight -- those
  # workflows cannot run from this repo -- but maximal-electron's
  # tests/workflows.test.ts and tests/workflow-health.test.ts assert against
  # them. Deleting it silently dropped 69 passing tests. The workflows are
  # tested artifacts, not inert config.
  # Recorded demo footage: 287MB of jpg/png/mp4. The .json fixtures under
  # demo/ stay -- tests/docs-claims.test.ts references demo/edits/*.json.
  if [ -d "$dest/demo" ]; then
    find "$dest/demo" -type f \
      \( -name '*.jpg' -o -name '*.png' -o -name '*.mp4' -o -name '*.mov' \) -delete
    find "$dest/demo" -type d -empty -delete 2>/dev/null || true
  fi
}

echo "syncing (committed state only):"
for entry in "${PACKAGES[@]}"; do
  dest="${entry%%:*}"
  repo="${entry##*:}"
  [ -n "$want" ] && [ "$want" != "$dest" ] && continue

  if [ "$dest" = "site" ]; then
    extract "$repo" "$dest" "site"
  else
    extract "$repo" "$dest"
  fi

  # The Tauri shell and the site are not part of the maximal package here:
  # the shell is excluded outright, the site is its own workspace package.
  if [ "$dest" = "maximal" ]; then
    rm -rf "$ROOT/packages/maximal/shell" "$ROOT/packages/maximal/site"
  fi

  strip_noise "$dest"
  printf "  %-18s %s  %s\n" "$dest" \
    "$(git -C "$SB/$repo" rev-parse --short HEAD)" \
    "$(git -C "$SB/$repo" branch --show-current)"
done

echo
node "$ROOT/scripts/apply-deviations.mjs"

echo
echo "provenance (paste into SOURCES.md):"
for entry in "${PACKAGES[@]}"; do
  dest="${entry%%:*}"; repo="${entry##*:}"
  printf "| \`packages/%s\` | \`stuffbucket/%s\` | \`%s\` | \`%s\` |\n" \
    "$dest" "$repo" \
    "$(git -C "$SB/$repo" branch --show-current)" \
    "$(git -C "$SB/$repo" rev-parse --short HEAD)"
done

echo
echo "next: pnpm install"
