import type { ProviderDispatch } from "@stuffbucket/maximal-provider-contract"

import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import { dispatchRuntime, type LlmGatewayRuntime } from "../src/bridge.ts"

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

function messageDispatch(body: unknown): ProviderDispatch {
  const signal = new AbortController().signal
  return {
    operation: "messages",
    provider: "fixture",
    request: new Request("http://localhost/v1/messages", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      signal,
    }),
    signal,
  }
}

const unusedRuntime: LlmGatewayRuntime = {
  listModels: () => Promise.resolve([]),
  stream(): AsyncIterable<never> {
    throw new Error("The parser unexpectedly started the provider.")
  },
}

void test("unsupported content and thinking types have a stable code", async () => {
  const bodies = [
    requestBody({
      messages: [{ role: "user", content: [{ type: "image" }] }],
    }),
    requestBody({
      messages: [
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "call_fixture",
              content: [{ type: "image" }],
            },
          ],
        },
      ],
    }),
    requestBody({ system: [{ type: "image" }] }),
    requestBody({ thinking: { type: "experimental" } }),
  ]
  for (const body of bodies) {
    let releases = 0
    const response = await dispatchRuntime(
      unusedRuntime,
      messageDispatch(body),
      () => {
        releases += 1
      },
    )
    const payload = (await response.json()) as {
      error: { code?: string; type: string }
    }
    assert.equal(response.status, 400)
    assert.equal(payload.error.type, "invalid_request_error")
    assert.equal(payload.error.code, "UNSUPPORTED")
    assert.equal(releases, 1)
  }
})

void test("malformed known text is not classified as unsupported", async () => {
  let releases = 0
  const response = await dispatchRuntime(
    unusedRuntime,
    messageDispatch(
      requestBody({
        messages: [{ role: "user", content: [{ type: "text", text: 42 }] }],
      }),
    ),
    () => {
      releases += 1
    },
  )
  const payload = (await response.json()) as {
    error: { code?: string; type: string }
  }
  assert.equal(response.status, 400)
  assert.equal(payload.error.type, "invalid_request_error")
  assert.equal(payload.error.code, undefined)
  assert.equal(releases, 1)
})

void test("compiled Bun packaging uses autoload package JSON", async () => {
  const script = await readFile(
    new URL("../scripts/compiled-bun-import.ts", import.meta.url),
    "utf8",
  )
  assert.match(script, /"--compile-autoload-package-json"/)
  assert.doesNotMatch(script, /"--autoload-package-json"/)
})

void test("synchronous streaming construction failures release exactly once", async () => {
  const runtimes: ReadonlyArray<LlmGatewayRuntime> = [
    {
      listModels: () => Promise.resolve([]),
      stream(): AsyncIterable<never> {
        throw new Error("synchronous stream secret")
      },
    },
    {
      listModels: () => Promise.resolve([]),
      stream(): AsyncIterable<never> {
        return {
          [Symbol.asyncIterator](): AsyncIterator<never> {
            throw new Error("synchronous iterator secret")
          },
        }
      },
    },
  ]
  for (const runtime of runtimes) {
    let releases = 0
    const response = await dispatchRuntime(
      runtime,
      messageDispatch(requestBody({ stream: true })),
      () => {
        releases += 1
      },
    )
    assert.equal(response.status, 500)
    assert.deepEqual(await response.json(), {
      type: "error",
      error: {
        type: "api_error",
        message: "The provider gateway failed.",
      },
    })
    assert.equal(releases, 1)
  }
})
