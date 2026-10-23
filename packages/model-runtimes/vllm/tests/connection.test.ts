import { Context } from "@deepseek-ai/cordis"
import LlmRuntime, {
  createUserMessage,
  type StreamChunk,
} from "@deepseek-ai/dsh-llm"
import { ModelTopologyRegistry } from "@maximal/maximal-models"
import assert from "node:assert/strict"
import { once } from "node:events"
import { createServer, type IncomingMessage } from "node:http"
import test from "node:test"

import type { Config } from "../src/config.ts"

import * as plugin from "../src/index.ts"

const loopbackHostname = [127, 0, 0, 1].join(".")
const loopbackOrigin = `http://${loopbackHostname}`

function config(baseURL: string): Config {
  return {
    instances: [
      {
        provider: "remote-gpu",
        displayName: "Configured GPU host · vLLM",
        endpointId: "endpoint/gpu-1",
        runnerId: "runner/gpu-1/vllm",
        baseURL,
        location: "lan",
        authType: "none",
        models: [
          {
            id: "served-brain",
            targetId: "deployment/brain",
            contextWindow: 65536,
          },
        ],
      },
    ],
  }
}

async function harness(value: Config) {
  const ctx = new Context()
  const topology = new ModelTopologyRegistry()
  ctx.provide("modelTopology", topology)
  await ctx.plugin(LlmRuntime)
  const fiber = await ctx.plugin(plugin, value)
  return { ctx, topology, fiber, dispose: () => ctx.fiber.dispose() }
}

async function jsonBody(
  request: IncomingMessage,
): Promise<Record<string, unknown>> {
  const chunks: Array<Buffer> = []
  for await (const chunk of request) {
    if (!(chunk instanceof Uint8Array))
      throw new TypeError("Expected request bytes")
    chunks.push(Buffer.from(chunk))
  }
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"))
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Expected request object")
  return Object.fromEntries(Object.entries(value))
}

function event(type: string, data: object): string {
  return `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`
}

function textStream(): string {
  return [
    event("message_start", {
      message: {
        id: "msg_vllm",
        type: "message",
        role: "assistant",
        model: "served-brain",
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 2, output_tokens: 0 },
      },
    }),
    event("content_block_start", {
      index: 0,
      content_block: { type: "text", text: "" },
    }),
    event("content_block_delta", {
      index: 0,
      delta: { type: "text_delta", text: "CONNECTION_OK" },
    }),
    // Perun's native vLLM stream omits the final block stop and stop_sequence.
    event("message_delta", {
      delta: { stop_reason: "end_turn" },
      usage: { output_tokens: 3 },
    }),
    event("message_stop", {}),
  ].join("")
}

async function collect(
  iterable: AsyncIterable<StreamChunk>,
): Promise<Array<StreamChunk>> {
  const chunks: Array<StreamChunk> = []
  for await (const chunk of iterable) chunks.push(chunk)
  return chunks
}

const messages = [
  createUserMessage({
    content: [{ type: "text", text: "Synthetic connection check" }],
    source: { kind: "user" },
  }),
]

void test("connects selected served IDs, retains remote location through a tunnel, and withdraws targets", async () => {
  const requests: Array<{
    path: string | undefined
    authorization: string | undefined
    key: unknown
    body?: Record<string, unknown>
  }> = []
  const server = createServer((request, response) => {
    void (async () => {
      const record = {
        path: request.url,
        authorization: request.headers.authorization,
        key: request.headers["x-api-key"],
      }
      if (request.url === "/v1/models") {
        requests.push(record)
        response.setHeader("content-type", "application/json")
        response.end(
          JSON.stringify({
            data: [{ id: "served-brain" }, { id: "unselected-alias" }],
          }),
        )
      } else {
        requests.push({ ...record, body: await jsonBody(request) })
        response.setHeader("content-type", "text/event-stream")
        response.end(textStream())
      }
    })().catch(() => {
      response.statusCode = 500
      response.end()
    })
  })
  server.listen(0, loopbackHostname)
  await once(server, "listening")
  const address = server.address()
  assert.ok(address && typeof address === "object")
  const instance = await harness(
    config(`http://${address.address}:${address.port}`),
  )
  try {
    assert.equal(
      requests.length,
      0,
      "connecting must not load or even probe the runtime",
    )
    assert.equal(instance.topology.snapshot().targets.length, 1)
    const [target] = instance.topology.snapshot().targets
    assert.equal(target.location, "lan")
    assert.equal(target.runner.kind, "remote-managed")
    assert.equal(target.availability.state, "unknown")
    assert.equal(target.lifecycle.state, "unknown")
    assert.deepEqual(
      target.adapters.map(({ operation }) => operation),
      ["messages"],
    )
    assert.equal(target.evidence.limits.effective?.contextTokens, 65536)
    assert.deepEqual(
      (await instance.ctx.llm.listModels("remote-gpu")).map(({ id }) => id),
      ["served-brain"],
    )
    const chunks = await collect(
      instance.ctx.llm.stream({
        provider: "remote-gpu",
        model: "served-brain",
        messages,
        maxTokens: 64,
      }),
    )
    const finish = chunks.at(-1)
    assert.ok(finish?.type === "finish")
    assert.equal(finish.reason.kind, "stop")
    assert.ok(
      chunks.some(
        (chunk) =>
          chunk.type === "block-end"
          && chunk.block.type === "text"
          && chunk.block.text === "CONNECTION_OK",
      ),
    )
    assert.equal(requests.at(-1)?.body?.model, "served-brain")
    assert.equal(requests.at(-1)?.body?.stream, true)
    assert.ok(
      requests.every(
        ({ authorization, key }) =>
          authorization === undefined && key === undefined,
      ),
    )
    await instance.fiber.dispose()
    assert.equal(instance.topology.snapshot().targets.length, 0)
    assert.deepEqual(instance.ctx.llm.listProviders(), [])
  } finally {
    await instance.dispose()
    server.closeAllConnections()
    server.close()
    await once(server, "close")
  }
})

void test("unselected models fail before HTTP and cannot fall back to another model", async () => {
  const resolved = plugin.resolveConfig(config(loopbackOrigin))
  const adapter = new plugin.VllmAdapter(resolved, new AbortController().signal)
  assert.throws(
    () => adapter.resolveModel("remote-gpu", "other"),
    /not selected/,
  )
  await assert.rejects(
    collect(
      adapter.stream({ provider: "remote-gpu", model: "other", messages }),
    ),
    /not selected/,
  )
})

void test("requires explicit location and authentication, rejects duplicate identities, and snapshots input", () => {
  const value = config(loopbackOrigin)
  const missingLocation = config(loopbackOrigin)
  Reflect.deleteProperty(missingLocation.instances[0], "location")
  assert.throws(
    () => plugin.resolveConfig(missingLocation),
    /invalid connection/,
  )
  const missingAuth = config(loopbackOrigin)
  Reflect.deleteProperty(missingAuth.instances[0], "authType")
  assert.throws(() => plugin.resolveConfig(missingAuth), /invalid connection/)
  assert.throws(
    () =>
      plugin.resolveConfig({
        instances: [value.instances[0], value.instances[0]],
      }),
    /duplicate provider/,
  )
  assert.throws(
    () =>
      plugin.resolveConfig({
        instances: [
          {
            ...value.instances[0],
            models: [
              ...value.instances[0].models,
              { id: "other", targetId: "deployment/brain" },
            ],
          },
        ],
      }),
    /duplicate target/,
  )
  const resolved = plugin.resolveConfig(value)
  value.instances[0].models[0].id = "changed"
  assert.equal(resolved.instances[0]?.models[0]?.id, "served-brain")
  assert.ok(Object.isFrozen(resolved.instances[0]?.models[0]))
  assert.throws(
    () => plugin.resolveConfig(config("http://remote.example")),
    /loopback/,
  )
})

void test("separate configured hosts retain distinct targets without publishing anything", async () => {
  const value = config(loopbackOrigin)
  value.instances.push({
    ...value.instances[0],
    provider: "second-gpu",
    runnerId: "runner/gpu-2/vllm",
    endpointId: "endpoint/gpu-2",
    models: [{ id: "served-brain", targetId: "deployment/second-brain" }],
  })
  const instance = await harness(value)
  try {
    assert.deepEqual(
      instance.topology
        .snapshot()
        .targets.map(({ id }) => id)
        .sort(),
      ["deployment/brain", "deployment/second-brain"],
    )
  } finally {
    await instance.dispose()
  }
})
