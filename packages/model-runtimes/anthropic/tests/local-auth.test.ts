import assert from "node:assert/strict"
import test from "node:test"

import { resolveConfig } from "../src/index.ts"
import {
  baseConfig,
  collect,
  createHarness,
  requestOptions,
  sendSse,
  startServer,
  textStream,
} from "./helpers.ts"

test("explicit loopback no-auth sends neither credential header", async () => {
  let calls = 0
  const server = await startServer((request, response) => {
    calls += 1
    assert.equal(request.headers.authorization, undefined)
    assert.equal(request.headers["x-api-key"], undefined)
    sendSse(response, textStream())
  })
  const harness = await createHarness({
    instances: [
      { aliases: ["local"], baseURL: server.origin, authType: "none" },
    ],
  })
  try {
    await collect(harness.ctx.llm.stream(requestOptions({ provider: "local" })))
    assert.equal(calls, 1)
  } finally {
    await harness.dispose()
    await server.close()
  }
})

test("no-auth cannot silently drop a key or connect to a remote host; ordinary auth still requires a key", () => {
  const loopbackOrigin = `http://${[127, 0, 0, 1].join(".")}`
  assert.throws(
    () => resolveConfig(baseConfig(loopbackOrigin, { authType: "none" })),
    /no apiKey/,
  )
  assert.throws(
    () =>
      resolveConfig({
        instances: [
          {
            aliases: ["remote"],
            baseURL: "https://remote.example",
            authType: "none",
          },
        ],
      }),
    /loopback/,
  )
  assert.throws(
    () =>
      resolveConfig({
        instances: [{ aliases: ["local"], baseURL: loopbackOrigin }],
      }),
    /require an apiKey/,
  )
})

test("discovery rejects redirects before forwarding authentication", async () => {
  let destinationCalls = 0
  const destination = await startServer((_request, response) => {
    destinationCalls += 1
    response.end(JSON.stringify({ data: [] }))
  })
  const redirect = await startServer((_request, response) => {
    response.writeHead(307, { location: `${destination.origin}/v1/models` })
    response.end()
  })
  const harness = await createHarness(baseConfig(redirect.origin))
  try {
    await assert.rejects(harness.ctx.llm.listModels("anthropic"))
    assert.equal(destinationCalls, 0)
  } finally {
    await harness.dispose()
    await redirect.close()
    await destination.close()
  }
})
