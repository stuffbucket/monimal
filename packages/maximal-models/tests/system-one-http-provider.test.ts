import type { ProviderDispatch } from "@maximal/maximal-model-contract"

import assert from "node:assert/strict"
import test from "node:test"

import { dispatchSystemOneHttpProvider } from "../src/system-one-http-provider.ts"

const config = {
  apiKey: "test-secret",
  authType: "authorization" as const,
  baseUrl: "https://api.typesafe.ai/",
}

function dispatch(
  operation: ProviderDispatch["operation"],
  body = "",
): ProviderDispatch {
  return {
    operation,
    provider: "typesafe-jev",
    request: new Request("http://gateway.test/v1/systemone", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    }),
    signal: new AbortController().signal,
  }
}

void test("normalizes TypeSafe model discovery for the provider gateway", async () => {
  let request: Request | undefined
  const response = await dispatchSystemOneHttpProvider(
    config,
    dispatch("models"),
    (input, init) => {
      request = new Request(input, init)
      return Promise.resolve(
        Response.json({
          models: [{ name: "jev-latest" }, { name: "jev-preview" }],
        }),
      )
    },
  )

  assert.ok(request)
  assert.equal(request.url, "https://api.typesafe.ai/v1/models")
  assert.equal(request.headers.get("authorization"), "Bearer test-secret")
  assert.deepEqual(await response.json(), {
    data: [
      {
        id: "jev-latest",
        display_name: "jev-latest",
        type: "model",
      },
      {
        id: "jev-preview",
        display_name: "jev-preview",
        type: "model",
      },
    ],
    has_more: false,
  })
})

void test("forwards System One inference without accepting caller credentials", async () => {
  let request: Request | undefined
  const body = JSON.stringify({ model: "jev-latest", state: "test" })
  const response = await dispatchSystemOneHttpProvider(
    config,
    {
      ...dispatch("systemone", body),
      request: new Request("http://gateway.test/v1/systemone", {
        method: "POST",
        headers: {
          authorization: "Bearer attacker-value",
          cookie: "private=value",
          "content-type": "application/json",
          "x-api-key": "attacker-value",
        },
        body,
      }),
    },
    (input, init) => {
      request = new Request(input, init)
      return Promise.resolve(Response.json({ answer: 0.6 }))
    },
  )

  assert.equal(response.status, 200)
  assert.ok(request)
  assert.equal(request.url, "https://api.typesafe.ai/v1/systemone")
  assert.equal(request.headers.get("authorization"), "Bearer test-secret")
  assert.equal(request.headers.get("cookie"), null)
  assert.equal(request.headers.get("x-api-key"), null)
  assert.deepEqual(await request.json(), {
    model: "jev-latest",
    state: "test",
  })
})

void test("returns a bounded upstream error for malformed model discovery", async () => {
  const response = await dispatchSystemOneHttpProvider(
    config,
    dispatch("models"),
    () => Promise.resolve(Response.json({ models: "invalid" })),
  )

  assert.equal(response.status, 502)
  assert.deepEqual(await response.json(), {
    type: "error",
    error: {
      type: "api_error",
      message: "The System One provider returned an invalid model catalog.",
    },
  })
})
