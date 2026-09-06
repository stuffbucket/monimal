// The host's guard on replay-state alignment.
//
// dsh-llm's `ReplayEnvelope` pairs response-level metadata with one `blocks`
// entry per emitted content block. When the two disagree, dsh-llm's assembler
// drops the envelope and reports nothing -- a deliberate choice there, since it
// cannot tell a mispositioned entry from a missing one. The host does not use
// that assembler: it reads the terminal finish chunk itself, which makes it the
// one place a mismatch can still become an error instead of a silence.
//
// Without this, a provider that builds the envelope wrong shows up as reasoning
// that has quietly lost its signature, and the first visible symptom is a
// different provider rejecting the replayed history much later.

import type { ProviderOperation } from "@stuffbucket/maximal-provider-contract"

import assert from "node:assert/strict"
import test from "node:test"

import { startDshHost, type DshHost } from "../src/index.ts"
import { createFixtureProfile } from "./fixture.ts"

async function dispatch(
  host: DshHost,
  operation: ProviderOperation,
): Promise<Response> {
  const signal = new AbortController().signal
  return await host.dispatch({
    operation,
    provider: "fixture",
    request: new Request("http://localhost/v1/messages", {
      body: JSON.stringify({
        model: "fixture-model",
        max_tokens: 100,
        messages: [{ role: "user", content: "hello" }],
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
      signal,
    }),
    signal,
  })
}

void test("replay state that does not align with the emitted blocks is rejected", async () => {
  const fixture = await createFixtureProfile()
  const host = await startDshHost({
    profileDirectory: fixture.directory,
    activation: {
      fixture: {
        enabled: true,
        config: { mode: "reasoning-misaligned-replay" },
      },
    },
  })
  const response = await dispatch(host, "messages")
  assert.equal(response.status, 502)
  assert.match(await response.text(), /invalid Anthropic replay state/)
  await host.dispose()
})
