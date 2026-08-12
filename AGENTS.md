# AGENTS.md

Repo-level working agreements for monimal. Package-level guidance lives in the
vendored copies (`packages/maximal/AGENTS.md` and friends) and is **upstream's**
— a re-sync overwrites it. Anything monimal decides for itself belongs here.

## CI runners

**Never use GitHub-hosted macOS runners.** No `runs-on: macos-14`,
`macos-latest`, or any other `macos-*` label in this repo's workflows.

macOS work goes to **`stuffbucket/macos-builder`**, a private repo that owns the
only self-hosted macOS runner and all Apple signing secrets. Public repos —
monimal included — trigger it and hold no runner and no Apple credentials.

**Why:** `stuffbucket` is a personal GitHub user account, not an org, so
org-level shared runners are not available. Every client repo is public, and a
self-hosted runner or Apple signing secret on a public repo is exposed to fork
PRs and secret exfiltration. Concentrating both in one private builder is the
workaround, and it only holds if clients never quietly grow their own macOS job.

**How the handoff works** (the builder's README calls this the shared contract;
do not deviate from it):

| Thing | Value |
| --- | --- |
| Trigger | `workflow_dispatch` of the builder's `build.yml`, inputs `{ repo: "<owner/name>", ref: "<git tag>" }` |
| Client auth | `MACOS_BUILDER_PAT` — fine-grained PAT, Actions: write on `stuffbucket/macos-builder` **only** |
| Client entrypoint | `.macos-builder/config` (required, flat `key = value`) plus an optional `.macos-builder/build.sh` |
| Producer's job | Build the `.app` and leave it at the configured `app_path`. Nothing else. |
| Builder's job | Top-level sign, package (`.dmg`/`.pkg`), notarize, staple, checksum, and upload back onto the client's release |

Two consequences worth internalizing before writing a workflow:

- The builder is **tag-driven**. It checks the client out at a git tag, so it
  packages releases — it is not a drop-in replacement for a per-push or per-PR
  packaging job. If a change needs proving on every push, prove it on Linux, or
  accept that it is proven at release time.
- The producer only *builds*. Signing, notarization, and artifact upload are
  builder-owned and universal; per-app logic must not leak into the builder.
