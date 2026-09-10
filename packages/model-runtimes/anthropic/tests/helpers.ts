import type { AddressInfo } from "node:net"

import { Context } from "@deepseek-ai/cordis"
import LlmRuntime, {
  createUserMessage,
  type GenerateOptions,
  type StreamChunk,
} from "@deepseek-ai/dsh-llm"
import { once } from "node:events"
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http"

import type { Config } from "../src/config.ts"

import * as plugin from "../src/index.ts"

export interface TestServer {
  close(): Promise<void>
  origin: string
}

export async function startServer(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
): Promise<TestServer> {
  const server = createServer(handler)
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  const address = server.address() as AddressInfo
  return {
    async close() {
      server.closeAllConnections()
      server.close()
      await once(server, "close")
    },
    origin: `http://127.0.0.1:${address.port}`,
  }
}

export async function createHarness(config: Config) {
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  const providerFiber = await ctx.plugin(plugin, config)
  return {
    ctx,
    providerFiber,
    async dispose() {
      await ctx.fiber.dispose()
    },
  }
}

export function baseConfig(
  origin: string,
  overrides: Partial<Config["instances"][number]> = {},
): Config {
  return {
    instances: [
      {
        aliases: ["anthropic"],
        apiKey: "test-secret-key",
        baseURL: origin,
        ...overrides,
      },
    ],
  }
}

export function requestOptions(
  overrides: Partial<GenerateOptions> = {},
): GenerateOptions {
  return {
    messages: [
      createUserMessage({
        content: [{ text: "Hello", type: "text" }],
        source: { kind: "user" },
      }),
    ],
    model: "claude-opus-5",
    provider: "anthropic",
    ...overrides,
  }
}

export async function collect(
  iterable: AsyncIterable<StreamChunk>,
): Promise<Array<StreamChunk>> {
  const chunks: Array<StreamChunk> = []
  for await (const chunk of iterable) chunks.push(chunk)
  return chunks
}

export function sseEvent(
  type: string,
  payload: unknown,
  newline = "\n",
): string {
  return `event: ${type}${newline}data: ${JSON.stringify(payload)}${newline}${newline}`
}

export function textStream(text = "Hello"): string {
  return [
    sseEvent("message_start", {
      message: {
        content: [],
        id: "msg_test",
        model: "claude-opus-5",
        role: "assistant",
        stop_reason: null,
        stop_sequence: null,
        type: "message",
        usage: {
          cache_creation_input_tokens: 5,
          cache_read_input_tokens: 10,
          input_tokens: 100,
          output_tokens: 1,
        },
      },
      type: "message_start",
    }),
    ": keepalive\n\n",
    sseEvent("ping", { type: "ping" }),
    sseEvent("content_block_start", {
      content_block: { text: "", type: "text" },
      index: 0,
      type: "content_block_start",
    }),
    sseEvent("content_block_delta", {
      delta: { text, type: "text_delta" },
      index: 0,
      type: "content_block_delta",
    }),
    sseEvent("content_block_stop", { index: 0, type: "content_block_stop" }),
    sseEvent("message_delta", {
      delta: { stop_reason: "end_turn", stop_sequence: null },
      type: "message_delta",
      usage: { output_tokens: 7 },
    }),
    sseEvent("message_stop", { type: "message_stop" }),
  ].join("")
}

export async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Array<Buffer> = []
  for await (const chunk of request) chunks.push(Buffer.from(chunk))
  return JSON.parse(Buffer.concat(chunks).toString("utf8"))
}

export function sendSse(response: ServerResponse, body: string): void {
  response.writeHead(200, { "content-type": "text/event-stream" })
  response.end(body)
}

export function terminalFailure(chunks: Array<StreamChunk>) {
  const finish = chunks.at(-1)
  if (finish?.type !== "finish") throw new TypeError("expected terminal finish")
  return finish.reason
}

export async function closesWithin(
  promise: Promise<unknown>,
  timeoutMs = 2_000,
): Promise<void> {
  let timer: NodeJS.Timeout | undefined
  try {
    await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error("timed out waiting for close")),
          timeoutMs,
        )
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
