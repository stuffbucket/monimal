# Captured wire traces

Live traces from Copilot, captured for regression cover on the web-tools agent
loop's `/responses` transport (maximal-core#21). They replace hand-written
synthetic frames with the real event sequence a `/responses`-only model emits.

## Provenance

| | |
|---|---|
| Captured | 2026-08-31 |
| Model | `gpt-5.6-sol` (Copilot; `/responses`-only — not served on `/chat/completions`) |
| Path | `POST /v1/messages` → web-tools agent loop → Copilot `/responses` |
| Build | the fix branch, run from `dist/main.js` with `--verbose` |
| Isolation | a throwaway container with its own `COPILOT_API_HOME`, so no host state was read or written beyond a copied credential that was destroyed afterwards |

`agent-loop-handler.trace.txt` is the engine's own daily handler log — the
redacted file copy, not the console tee. It carries the `.txt` extension because
`.gitignore` excludes `*.log`, and a committed fixture should not need a forced
add past a rule that exists to keep stray runtime logs out of the tree.

## Scrubbing

Content was removed with the engine's **own** fail-closed redactor
(`redactForLog` + `scrubSecrets`, `src/lib/platform/log-redact.ts`), not a
bespoke pass: allowlisted structural keys survive verbatim, every other string
leaf becomes `[redacted N chars]`. So what remains is shape — event types, block
types, indices, roles, model id, token counts, stop reasons — and never prompt
text, tool inputs/outputs, model output, or fetched page content.

Verified clean by sweep: no GitHub or Copilot tokens, no account logins, no host
paths, no emails, no URLs, no IPs, and no unredacted `text` values.

Volatile identifiers (UUIDs, `call_*` ids, timestamps, elapsed ms) are replaced
with stable placeholders so the fixtures are deterministic in CI.

## Re-capturing

These are **descriptive**: they record what upstream did on the capture date, so
a genuine upstream change should be expected to fail the golden-sequence
assertions. Re-capture deliberately rather than editing a fixture to match, and
update the date above. Do not capture without the container boundary, and do not
commit a trace that has not been through the sweep.
