import type { ProviderOperation } from "@stuffbucket/maximal-provider-contract"

import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import { createCordisRuntime } from "../src/cordis-runtime.ts"
import {
  createDshHost,
  startDshHost,
  type ActivationSource,
  type DshHost,
} from "../src/index.ts"
import { resolveExternalProfile } from "../src/profile.ts"
import { createFixtureProfile, fixtureState } from "./fixture.ts"

function requestBody(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    model: "fixture-model",
    max_tokens: 100,
    messages: [{ role: "user", content: "hello" }],
    ...overrides,
  }
}

// The test helper mirrors ProviderGateway.dispatch while adding body defaults.
// eslint-disable-next-line max-params
async function dispatch(
  host: DshHost,
  operation: ProviderOperation,
  body: unknown = requestBody(),
  signal: AbortSignal = new AbortController().signal,
): Promise<Response> {
  return await host.dispatch({
    operation,
    provider: "fixture",
    request: new Request("http://localhost/v1/messages", {
      method: operation === "models" ? "GET" : "POST",
      ...(operation === "models" ?
        {}
      : {
          body: JSON.stringify(body),
          headers: { "content-type": "application/json" },
        }),
      signal,
    }),
    signal,
  })
}

async function waitUntil(
  predicate: () => boolean | Promise<boolean>,
): Promise<void> {
  const deadline = Date.now() + 2_000
  while (!(await predicate())) {
    if (Date.now() >= deadline)
      throw new Error("Timed out waiting for condition.")
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

async function responseText(host: DshHost): Promise<string> {
  const response = await dispatch(host, "messages")
  assert.equal(response.status, 200)
  const body = (await response.json()) as { content: Array<{ text: string }> }
  return body.content[0]?.text ?? ""
}

function rejectActivationDisposal(): void {
  throw new Error("activation disposer secret")
}

async function readStreamChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const result = await Promise.race([
      reader.read(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error("Timed out waiting for an SSE chunk.")),
          500,
        )
      }),
    ])
    assert.equal(result.done, false)
    return new TextDecoder().decode(result.value)
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

void test("runtime facade unloads plugin fibers", async () => {
  const fixture = await createFixtureProfile()
  const runtime = await createCordisRuntime(
    await resolveExternalProfile(fixture.directory),
    { fixture: { enabled: true, config: {} } },
  )
  assert.equal((await fixtureState(fixture.pluginEntry)).active, 1)
  await runtime.dispose()
  assert.equal((await fixtureState(fixture.pluginEntry)).active, 0)
})

void test("genuine external DSH plugin receives Anthropic messages, tools, and controls", async () => {
  const fixture = await createFixtureProfile()
  const host = await startDshHost({
    profileDirectory: fixture.directory,
    activation: { fixture: { enabled: true, config: { echo: true } } },
  })
  const response = await dispatch(
    host,
    "messages",
    requestBody({
      system: [{ type: "text", text: "system" }],
      messages: [
        {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "call_1",
              name: "lookup",
              input: { q: "x" },
            },
          ],
        },
        {
          role: "user",
          content: [
            { type: "tool_result", tool_use_id: "call_1", content: "done" },
            { type: "text", text: "next" },
          ],
        },
      ],
      tools: [
        {
          name: "lookup",
          description: "Lookup",
          input_schema: { type: "object", properties: {} },
        },
      ],
      output_config: { effort: "high" },
      stop_sequences: ["stop"],
    }),
  )
  assert.equal(response.status, 200)
  const body = (await response.json()) as {
    content: Array<{ text: string }>
    usage: Record<string, number>
  }
  const echoed = JSON.parse(body.content[0].text) as Record<string, unknown>
  assert.equal(echoed.system, "system")
  assert.deepEqual(echoed.content, ["tool-call", "tool-result", "text"])
  assert.equal(echoed.reasoningEffort, "high")
  assert.deepEqual(echoed.stop, ["stop"])
  assert.equal(body.usage.input_tokens, 5)
  await host.dispose()
})

void test("models is advisory and count tokens is explicitly unsupported", async () => {
  const fixture = await createFixtureProfile()
  const host = await startDshHost({
    profileDirectory: fixture.directory,
    activation: { fixture: { enabled: true, config: {} } },
  })
  const models = await dispatch(host, "models")
  assert.equal(models.status, 200)
  const modelBody = (await models.json()) as { data: Array<{ id: string }> }
  assert.deepEqual(
    modelBody.data.map((model) => model.id),
    ["fixture-model"],
  )
  assert.deepEqual(host.getStatus("fixture")?.operations, [
    "messages",
    "models",
  ])
  const count = await dispatch(host, "count-tokens")
  assert.equal(count.status, 501)
  const countBody = (await count.json()) as {
    error: { code?: string; message: string; type: string }
  }
  assert.match(countBody.error.message, /not supported by the DSH LLM contract/)
  assert.equal(countBody.error.type, "invalid_request_error")
  assert.equal(countBody.error.code, "UNSUPPORTED")
  await host.dispose()
})

void test("SSE maps tool calls without fabricating provider pings", async () => {
  const fixture = await createFixtureProfile()
  const host = await startDshHost({
    profileDirectory: fixture.directory,
    activation: { fixture: { enabled: true, config: { mode: "tool" } } },
  })
  const response = await dispatch(
    host,
    "messages",
    requestBody({ stream: true }),
  )
  assert.equal(response.status, 200)
  const body = await response.text()
  assert.doesNotMatch(body, /event: ping/)
  assert.doesNotMatch(body, /thinking_delta/)
  assert.match(
    body,
    /"type":"input_json_delta","partial_json":"\{\\"q\\":\\"ok\\"\}"/,
  )
  assert.match(body, /"stop_reason":"tool_use"/)
  assert.match(
    body,
    /"usage":\{"input_tokens":7,"output_tokens":3,"cache_read_input_tokens":2,"cache_creation_input_tokens":4\}/,
  )
  assert.ok(body.indexOf("message_delta") < body.indexOf("message_stop"))
  await host.dispose()
})

void test("SSE buffers tool arguments until the provider supplies a name", async () => {
  const fixture = await createFixtureProfile()
  const host = await startDshHost({
    profileDirectory: fixture.directory,
    activation: {
      fixture: { enabled: true, config: { mode: "tool-delayed-name" } },
    },
  })
  const response = await dispatch(
    host,
    "messages",
    requestBody({ stream: true }),
  )
  assert.equal(response.status, 200)
  const body = await response.text()
  assert.doesNotMatch(body, /event: error/)
  const start = body.indexOf(
    '"content_block":{"type":"tool_use","id":"call_fixture","name":"lookup","input":{}}',
  )
  const firstArguments = body.indexOf(String.raw`"partial_json":"{\"q\":"`)
  const secondArguments = body.indexOf(String.raw`"partial_json":"\"ok\"}"`)
  assert.notEqual(start, -1)
  assert.ok(start < firstArguments)
  assert.ok(firstArguments < secondArguments)
  assert.equal(body.match(/"type":"input_json_delta"/gu)?.length, 2)
  await host.dispose()
})

void test("ordinary SSE is incremental, backpressure-aware, and cancellable", async () => {
  const fixture = await createFixtureProfile()
  const host = await startDshHost({
    profileDirectory: fixture.directory,
    activation: { fixture: { enabled: true, config: { mode: "incremental" } } },
  })
  const response = await dispatch(
    host,
    "messages",
    requestBody({ stream: true }),
  )
  assert.ok(response.body)
  const reader = response.body.getReader()
  assert.match(await readStreamChunk(reader), /message_start/)
  assert.match(await readStreamChunk(reader), /content_block_start/)
  assert.ok((await fixtureState(fixture.pluginEntry)).streamYields <= 2)
  assert.match(await readStreamChunk(reader), /"text":"first"/)
  await reader.cancel()
  await waitUntil(() =>
    fixtureState(fixture.pluginEntry).then((state) => state.aborted > 0),
  )
  assert.ok((await fixtureState(fixture.pluginEntry)).streamYields < 4)
  await host.dispose()
})

void test("terminal provider failures map before success-only usage validation", async () => {
  const fixture = await createFixtureProfile()
  const host = await startDshHost({
    profileDirectory: fixture.directory,
    activation: {
      fixture: { enabled: true, config: { mode: "error-no-usage" } },
    },
    reconcileDebounceMs: 0,
  })
  const failed = await dispatch(host, "messages")
  assert.equal(failed.status, 401)
  const failureBody = await failed.text()
  assert.match(failureBody, /Provider authentication failed/)
  assert.doesNotMatch(failureBody, /reporting usage|secret/)
  const streamingFailure = await dispatch(
    host,
    "messages",
    requestBody({ stream: true }),
  )
  const streamingFailureBody = await streamingFailure.text()
  assert.match(streamingFailureBody, /Provider authentication failed/)
  assert.doesNotMatch(streamingFailureBody, /reporting usage|secret/)

  await host.reconcile({
    activation: {
      fixture: { enabled: true, config: { mode: "aborted-no-usage" } },
    },
  })
  const aborted = await dispatch(host, "messages")
  assert.equal(aborted.status, 499)
  const abortedBody = await aborted.text()
  assert.match(abortedBody, /request was cancelled/i)
  assert.doesNotMatch(abortedBody, /reporting usage|secret/)
  await host.dispose()
})

void test("provider failures close iterators before dispatch releases their generation", async () => {
  const fixture = await createFixtureProfile()
  const host = await startDshHost({
    profileDirectory: fixture.directory,
    activation: {
      fixture: { enabled: true, config: { mode: "error-finally" } },
    },
    reconcileDebounceMs: 0,
  })
  const cases = [
    { mode: "error-finally", stream: false },
    { mode: "aborted-finally", stream: false },
    { mode: "protocol-finally", stream: false },
    { mode: "error-finally", stream: true },
    { mode: "aborted-finally", stream: true },
    { mode: "protocol-finally", stream: true },
  ] as const
  let finalized = 0
  for (const entry of cases) {
    if (finalized > 0) {
      const reconciled = await host.reconcile({
        activation: {
          fixture: { enabled: true, config: { mode: entry.mode } },
        },
      })
      assert.equal(reconciled.committed, true)
    }
    const response = await dispatch(
      host,
      "messages",
      requestBody({ stream: entry.stream }),
    )
    await response.text()
    finalized += 1
    assert.equal((await fixtureState(fixture.pluginEntry)).finalized, finalized)
  }
  await host.dispose()
})

void test("Anthropic replay signatures are preserved without fabrication", async () => {
  const fixture = await createFixtureProfile()
  const host = await startDshHost({
    profileDirectory: fixture.directory,
    activation: { fixture: { enabled: true, config: { mode: "reasoning" } } },
  })
  const response = await dispatch(host, "messages")
  assert.equal(response.status, 200)
  const body = (await response.json()) as {
    content: Array<{ signature: string; thinking: string; type: string }>
  }
  assert.deepEqual(body.content, [
    {
      type: "thinking",
      thinking: "considering",
      signature: "signed-fixture",
    },
  ])

  const streaming = await dispatch(
    host,
    "messages",
    requestBody({ stream: true }),
  )
  const streamBody = await streaming.text()
  assert.match(
    streamBody,
    /"content_block":\{"type":"thinking","thinking":"","signature":""\}/,
  )
  assert.match(
    streamBody,
    /"delta":\{"type":"thinking_delta","thinking":"considering"\}/,
  )
  assert.match(
    streamBody,
    /"delta":\{"type":"signature_delta","signature":"signed-fixture"\}/,
  )
  assert.match(streamBody, /event: content_block_stop/)
  assert.doesNotMatch(streamBody, /cannot be represented losslessly/)
  assert.doesNotMatch(
    streamBody,
    /"delta":\{"type":"signature_delta","signature":""\}/,
  )
  await host.dispose()
})

void test("assistant thinking history carries strict Anthropic replay state", async () => {
  const fixture = await createFixtureProfile()
  const host = await startDshHost({
    profileDirectory: fixture.directory,
    activation: { fixture: { enabled: true, config: { echo: true } } },
  })
  const response = await dispatch(
    host,
    "messages",
    requestBody({
      messages: [
        {
          role: "assistant",
          content: [
            {
              type: "thinking",
              thinking: "prior thought",
              signature: "prior-signature",
            },
          ],
        },
        { role: "user", content: "continue" },
      ],
    }),
  )
  assert.equal(response.status, 200)
  const body = (await response.json()) as { content: Array<{ text: string }> }
  const echoed = JSON.parse(body.content[0].text) as {
    replayStates: Array<unknown>
  }
  assert.deepEqual(echoed.replayStates, [
    {
      type: "anthropic-message-v1",
      content: [
        {
          type: "thinking",
          thinking: "prior thought",
          signature: "prior-signature",
        },
      ],
    },
  ])
  await host.dispose()
})

void test("unsupported request fields and stream chunks fail explicitly", async () => {
  const fixture = await createFixtureProfile()
  const host = await startDshHost({
    profileDirectory: fixture.directory,
    activation: { fixture: { enabled: true, config: {} } },
    reconcileDebounceMs: 0,
  })
  const unsupported = await dispatch(
    host,
    "messages",
    requestBody({ top_p: 0.5 }),
  )
  assert.equal(unsupported.status, 400)
  const unsupportedBody = (await unsupported.json()) as {
    error: { code?: string; message: string; type: string }
  }
  assert.match(unsupportedBody.error.message, /unsupported field/)
  assert.equal(unsupportedBody.error.type, "invalid_request_error")
  assert.equal(unsupportedBody.error.code, "UNSUPPORTED")
  const malformedRequest = await dispatch(
    host,
    "messages",
    requestBody({ max_tokens: "many" }),
  )
  const malformedBody = (await malformedRequest.json()) as {
    error: { code?: string }
  }
  assert.equal(malformedRequest.status, 400)
  assert.equal(malformedBody.error.code, undefined)
  const nestedUnsupported = await dispatch(
    host,
    "messages",
    requestBody({
      output_config: { effort: "high" },
      thinking: { type: "adaptive", budget_tokens: 1_024 },
    }),
  )
  assert.equal(nestedUnsupported.status, 400)
  assert.match(await nestedUnsupported.text(), /unsupported field/)

  const changed = await host.reconcile({
    activation: {
      fixture: { enabled: true, config: { mode: "unknown-chunk" } },
    },
  })
  assert.equal(changed.committed, true)
  const malformed = await dispatch(host, "messages")
  assert.equal(malformed.status, 502)
  assert.match(await malformed.text(), /unsupported stream chunk/)
  await host.dispose()
})

void test("failed reconciliation rolls back, then hot reconfiguration commits", async () => {
  const fixture = await createFixtureProfile()
  const host = await startDshHost({
    profileDirectory: fixture.directory,
    activation: { fixture: { enabled: true, config: { text: "old" } } },
    reconcileDebounceMs: 0,
  })
  assert.equal(await responseText(host), "old")
  const failed = await host.reconcile({
    activation: { fixture: { enabled: true, config: { reject: true } } },
  })
  assert.equal(failed.committed, false)
  assert.equal(await responseText(host), "old")
  const committed = await host.reconcile({
    activation: { fixture: { enabled: true, config: { text: "new" } } },
  })
  assert.equal(committed.committed, true)
  assert.equal(await responseText(host), "new")
  const disabled = await host.reconcile({
    activation: { fixture: { enabled: false } },
  })
  assert.equal(disabled.committed, true)
  assert.equal(host.getStatus("fixture")?.state, "disabled")
  await host.dispose()
})

void test("profile plugin removal commits with stale activation as unavailable", async () => {
  const fixture = await createFixtureProfile()
  const host = await startDshHost({
    profileDirectory: fixture.directory,
    activation: { fixture: { enabled: true, config: { text: "old" } } },
    reconcileDebounceMs: 0,
  })
  await fixture.writeProviders({
    schemaVersion: 1,
    runtime: {
      cordis: "@deepseek-ai/cordis",
      llm: "@deepseek-ai/dsh-llm",
    },
    services: [],
    plugins: [],
  })
  const result = await host.reconcile()
  assert.equal(result.committed, true)
  assert.equal(host.getStatus("fixture")?.state, "unavailable")
  assert.match(
    host.getStatus("fixture")?.diagnostics[0]?.message ?? "",
    /no longer declared/,
  )
  const response = await dispatch(host, "messages")
  assert.equal(response.status, 503)
  await waitUntil(() =>
    fixtureState(fixture.pluginEntry).then((state) => state.active === 0),
  )
  await host.dispose()
})

void test("failed reconciliation publishes diagnostics with LKG statuses", async () => {
  const fixture = await createFixtureProfile()
  const host = await startDshHost({
    profileDirectory: fixture.directory,
    activation: { fixture: { enabled: true, config: { text: "old" } } },
    reconcileDebounceMs: 0,
  })
  const initialRevision = host.getStatus("fixture") === undefined ? 0 : 1
  const observed: Array<{
    diagnostics: ReadonlyArray<{ code: string }>
    revision: number
    state: string | undefined
  }> = []
  host.subscribe((topology) => {
    observed.push({
      revision: topology.revision,
      diagnostics: topology.diagnostics,
      state: topology.statuses.find((status) => status.provider === "fixture")
        ?.state,
    })
  })
  const failed = await host.reconcile({
    activation: { fixture: { enabled: true, config: { reject: true } } },
  })
  assert.equal(failed.committed, false)
  assert.equal(failed.revision, initialRevision + 1)
  assert.equal(observed.at(-1)?.revision, failed.revision)
  assert.equal(observed.at(-1)?.state, "available")
  assert.deepEqual(observed.at(-1)?.diagnostics, failed.diagnostics)
  assert.equal(await responseText(host), "old")
  await host.dispose()
})

void test("fallible candidate subscriptions cannot replace the LKG", async () => {
  const fixture = await createFixtureProfile()
  const host = await startDshHost({
    profileDirectory: fixture.directory,
    activation: { fixture: { enabled: true, config: { text: "old" } } },
    reconcileDebounceMs: 0,
  })
  const source: ActivationSource = {
    snapshot: () => ({
      fixture: { enabled: true, config: { text: "candidate" } },
    }),
    subscribe: () => {
      throw new Error("subscription failed")
    },
  }
  const failed = await host.reconcile({ activation: source })
  assert.equal(failed.committed, false)
  assert.equal(await responseText(host), "old")
  assert.equal((await fixtureState(fixture.pluginEntry)).active, 1)
  await host.dispose()
})

void test("candidate cleanup failures publish bounded diagnostics and preserve the LKG", async () => {
  const fixture = await createFixtureProfile()
  const host = await startDshHost({
    profileDirectory: fixture.directory,
    activation: { fixture: { enabled: true, config: { text: "old" } } },
    reconcileDebounceMs: 0,
  })
  const source: ActivationSource = {
    snapshot: () => ({
      fixture: {
        enabled: true,
        config: { text: "candidate", disposeReject: true },
      },
    }),
    subscribe: () => {
      throw new Error("candidate subscription secret")
    },
  }
  const failed = await host.reconcile({ activation: source })
  assert.equal(failed.committed, false)
  assert.equal(await responseText(host), "old")
  assert.deepEqual(
    failed.diagnostics.filter(
      (diagnostic) => diagnostic.code === "provider-disposal-failed",
    ),
    [
      {
        code: "provider-disposal-failed",
        message: "A provider generation could not be fully disposed.",
      },
    ],
  )
  assert.doesNotMatch(JSON.stringify(failed.diagnostics), /secret/)
  assert.ok(Object.isFrozen(failed.diagnostics))
  assert.ok(
    failed.diagnostics.every((diagnostic) => Object.isFrozen(diagnostic)),
  )
  assert.equal((await fixtureState(fixture.pluginEntry)).active, 1)
  await host.dispose()
})

void test("retirement and source disposal failures are reported without replacing the LKG", async () => {
  const fixture = await createFixtureProfile()
  const source: ActivationSource = {
    snapshot: () => ({
      fixture: {
        enabled: true,
        config: { text: "old", disposeReject: true },
      },
    }),
    subscribe: () => rejectActivationDisposal,
  }
  const host = await startDshHost({
    profileDirectory: fixture.directory,
    activation: source,
    reconcileDebounceMs: 0,
  })
  const observed: Array<ReadonlyArray<{ code: string }>> = []
  host.subscribe((topology) => observed.push(topology.diagnostics))
  const committed = await host.reconcile({
    activation: { fixture: { enabled: true, config: { text: "new" } } },
  })
  assert.equal(committed.committed, true)
  await waitUntil(() =>
    host
      .diagnostics()
      .some((diagnostic) => diagnostic.code === "provider-disposal-failed"),
  )
  assert.equal(await responseText(host), "new")
  assert.equal(host.getStatus("fixture")?.state, "available")
  assert.deepEqual(host.diagnostics(), [
    {
      code: "provider-disposal-failed",
      message: "A provider generation could not be fully disposed.",
    },
  ])
  assert.ok(
    observed.some((diagnostics) =>
      diagnostics.some(
        (diagnostic) => diagnostic.code === "provider-disposal-failed",
      ),
    ),
  )
  assert.doesNotMatch(JSON.stringify(host.diagnostics()), /secret/)
  await host.dispose()
})

void test("active runtime disposal failures remain diagnostic and idempotent", async () => {
  const fixture = await createFixtureProfile()
  const host = await startDshHost({
    profileDirectory: fixture.directory,
    activation: {
      fixture: { enabled: true, config: { disposeReject: true } },
    },
  })
  const observedStatuses: Array<ReadonlyArray<{ provider: string }>> = []
  host.subscribe((topology) => observedStatuses.push(topology.statuses))
  await host.dispose()
  await host.dispose()
  assert.deepEqual(host.listStatuses(), [])
  assert.equal(host.getStatus("fixture"), undefined)
  assert.deepEqual(observedStatuses.at(-1), [])
  assert.deepEqual(host.diagnostics(), [
    {
      code: "provider-disposal-failed",
      message: "A provider generation could not be fully disposed.",
    },
  ])
  assert.doesNotMatch(JSON.stringify(host.diagnostics()), /fixture disposal/)
  assert.equal((await fixtureState(fixture.pluginEntry)).active, 0)
})

void test("topology observer failures are contained and unsubscribe is idempotent", async () => {
  const fixture = await createFixtureProfile()
  const host = await startDshHost({
    profileDirectory: fixture.directory,
    activation: { fixture: { enabled: true, config: {} } },
    reconcileDebounceMs: 0,
  })
  let observed = 0
  host.subscribe(() => {
    throw new Error("observer")
  })
  const unsubscribe = host.subscribe(() => {
    observed += 1
  })
  await host.reconcile({ activation: { fixture: { enabled: false } } })
  assert.equal(observed, 2)
  unsubscribe()
  unsubscribe()
  await host.dispose()
})

void test("stream cancellation releases the old generation and disposal is idempotent", async () => {
  const fixture = await createFixtureProfile()
  const host = await startDshHost({
    profileDirectory: fixture.directory,
    activation: { fixture: { enabled: true, config: { wait: true } } },
    reconcileDebounceMs: 0,
    drainTimeoutMs: 5_000,
  })
  const response = await dispatch(
    host,
    "messages",
    requestBody({ stream: true }),
  )
  assert.ok(response.body)
  const reader = response.body.getReader()
  await reader.read()
  const reconciled = await host.reconcile({
    activation: { fixture: { enabled: true, config: { text: "new" } } },
  })
  assert.equal(reconciled.committed, true)
  await reader.cancel()
  await new Promise((resolve) => setTimeout(resolve, 25))
  assert.deepEqual(await fixtureState(fixture.pluginEntry), {
    active: 1,
    calls: 1,
    aborted: 1,
    finalized: 0,
    streamYields: 0,
  })
  await host.dispose()
  await host.dispose()
  assert.equal((await fixtureState(fixture.pluginEntry)).active, 0)
})

void test("dispose waits for in-flight activation and prevents publication", async () => {
  const fixture = await createFixtureProfile()
  const host = createDshHost({
    profileDirectory: fixture.directory,
    activation: {
      fixture: { enabled: true, config: { activationDelayMs: 75 } },
    },
    reconcileDebounceMs: 0,
  })
  const starting = host.start()
  await new Promise((resolve) => setTimeout(resolve, 10))
  await host.dispose()
  await assert.rejects(starting, { name: "DshHostStartError" })
  assert.equal((await fixtureState(fixture.pluginEntry)).active, 0)
  const response = await dispatch(host, "messages")
  assert.equal(response.status, 503)
})

void test("providers.json changes reconcile through the production watcher", async () => {
  const fixture = await createFixtureProfile()
  const host = await startDshHost({
    profileDirectory: fixture.directory,
    activation: { fixture: { enabled: true, config: {} } },
    reconcileDebounceMs: 5,
  })
  await fixture.writeProviders({
    schemaVersion: 1,
    runtime: {
      cordis: "@deepseek-ai/cordis",
      llm: "@deepseek-ai/dsh-llm",
    },
    services: [],
    plugins: [
      {
        id: "fixture",
        package: "fixture-provider",
        providers: ["fixture", "fixture-alias"],
      },
    ],
  })
  await waitUntil(() => host.getStatus("fixture-alias") !== undefined)
  assert.equal(host.getStatus("fixture")?.state, "available")
  assert.equal(host.getStatus("fixture-alias")?.state, "unavailable")
  await host.dispose()
})

void test("profile bindings are disposed in reverse creation order", async () => {
  const source = await readFile(
    new URL("../src/host.ts", import.meta.url),
    "utf8",
  )
  for (const [watchName, activationName] of [
    ["previousWatchDispose", "previousActivationDispose"],
    ["candidateWatchDispose", "candidateActivationDispose"],
    ["this.#profileWatchDispose", "this.#activationUnsubscribe"],
  ]) {
    const watchDisposal = source.indexOf(`#safeDispose(${watchName})`)
    const activationDisposal = source.indexOf(activationName, watchDisposal)
    assert.notEqual(watchDisposal, -1)
    assert.notEqual(activationDisposal, -1)
    assert.ok(watchDisposal < activationDisposal)
  }
})
