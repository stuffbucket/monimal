/* eslint-disable complexity, max-lines, max-lines-per-function, max-params */
import type {
  CallId as DshCallId,
  ContentBlock as DshContentBlock,
  FinishReason,
  GenerateOptions,
  LlmFailure,
  LlmModelInfo,
  Message as DshMessage,
  MessageId as DshMessageId,
  ReasoningEffortId,
  StreamChunk,
  TokenUsage,
  ToolSchema,
} from "@deepseek-ai/dsh-llm"
import type { ProviderDispatch } from "@stuffbucket/maximal-provider-contract"

import { randomUUID } from "node:crypto"
import { isDeepStrictEqual } from "node:util"

export interface LlmGatewayRuntime {
  listModels(provider: string): Promise<ReadonlyArray<LlmModelInfo>>
  stream(options: GenerateOptions): AsyncIterable<StreamChunk>
}

class GatewayError extends Error {
  readonly status: number
  readonly type: string
  readonly code: string | undefined

  constructor(status: number, type: string, message: string, code?: string) {
    super(message)
    this.name = "GatewayError"
    this.status = status
    this.type = type
    this.code = code
  }
}

class StreamFailure extends Error {
  readonly failure: LlmFailure

  constructor(failure: LlmFailure) {
    super("The provider could not complete the request.")
    this.name = "StreamFailure"
    this.failure = failure
  }
}

type JsonObject = Record<string, unknown>

interface ParsedMessageRequest {
  readonly model: string
  readonly stream: boolean
  readonly options: GenerateOptions
}

interface AnthropicBlock {
  readonly type: "text" | "thinking" | "tool_use"
  readonly text?: string
  readonly thinking?: string
  readonly signature?: string
  readonly id?: string
  readonly name?: string
  readonly input?: unknown
}

interface Completion {
  readonly blocks: Array<AnthropicBlock>
  readonly usage: TokenUsage
  readonly finish: FinishReason
}

const jsonHeaders = Object.freeze({ "content-type": "application/json" })
const requestKeys = new Set([
  "model",
  "max_tokens",
  "messages",
  "system",
  "tools",
  "temperature",
  "stop_sequences",
  "stream",
  "thinking",
  "output_config",
])
const messageKeys = new Set(["role", "content"])
const textBlockKeys = new Set(["type", "text"])
const thinkingBlockKeys = new Set(["type", "thinking", "signature"])
const toolUseBlockKeys = new Set(["type", "id", "name", "input"])
const toolResultBlockKeys = new Set([
  "type",
  "tool_use_id",
  "content",
  "is_error",
])

function object(value: unknown, label: string): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new GatewayError(
      400,
      "invalid_request_error",
      `${label} must be an object.`,
    )
  }
  return value as JsonObject
}

function assertOnlyKeys(
  value: JsonObject,
  allowed: ReadonlySet<string>,
  label: string,
): void {
  const unsupported = Object.keys(value).find((key) => !allowed.has(key))
  if (unsupported !== undefined) {
    throw new GatewayError(
      400,
      "invalid_request_error",
      `${label} contains unsupported field "${unsupported}".`,
      "UNSUPPORTED",
    )
  }
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new GatewayError(
      400,
      "invalid_request_error",
      `${label} must be a non-empty string.`,
    )
  }
  return value
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new GatewayError(
      400,
      "invalid_request_error",
      `${label} must be a finite number.`,
    )
  }
  return value
}

function callId(value: string): DshCallId {
  return value as DshCallId
}

function messageId(): DshMessageId {
  return randomUUID() as DshMessageId
}

function contentText(value: unknown, label: string): Array<DshContentBlock> {
  if (typeof value === "string") return [{ type: "text", text: value }]
  if (!Array.isArray(value))
    throw new GatewayError(
      400,
      "invalid_request_error",
      `${label} must be text or an array.`,
    )
  const blocks: Array<DshContentBlock> = []
  for (const [index, element] of value.entries()) {
    const block = object(element, `${label}[${index}]`)
    assertOnlyKeys(block, textBlockKeys, `${label}[${index}]`)
    if (block.type !== "text") {
      throw new GatewayError(
        400,
        "invalid_request_error",
        `${label}[${index}] uses an unsupported content type.`,
        "UNSUPPORTED",
      )
    }
    if (typeof block.text !== "string") {
      throw new GatewayError(
        400,
        "invalid_request_error",
        `${label}[${index}].text must be a string.`,
      )
    }
    blocks.push({ type: "text", text: block.text })
  }
  return blocks
}

function parseContent(
  value: unknown,
  role: "user" | "assistant",
  provider: string,
  model: string,
): Array<DshMessage> {
  if (typeof value === "string") {
    return [
      {
        id: messageId(),
        role,
        content: [{ type: "text", text: value }],
        source:
          role === "assistant" ?
            { kind: "model", provider, model }
          : { kind: "user" },
      },
    ]
  }
  if (!Array.isArray(value) || value.length === 0) {
    throw new GatewayError(
      400,
      "invalid_request_error",
      "message content must be non-empty text or content blocks.",
    )
  }
  const messages: Array<DshMessage> = []
  let ordinary: Array<DshContentBlock> = []
  let replay: Array<unknown> = []
  const flushOrdinary = (): void => {
    if (ordinary.length === 0) return
    messages.push({
      id: messageId(),
      role,
      content: ordinary,
      source:
        role === "assistant" ?
          {
            kind: "model",
            provider,
            model,
            replayState: { type: "anthropic-message-v1", content: replay },
          }
        : { kind: "user" },
    })
    ordinary = []
    replay = []
  }
  for (const [index, element] of value.entries()) {
    const label = `message content[${index}]`
    const block = object(element, label)
    switch (block.type) {
      case "text": {
        assertOnlyKeys(block, textBlockKeys, label)
        if (typeof block.text !== "string")
          throw new GatewayError(
            400,
            "invalid_request_error",
            `${label}.text must be a string.`,
          )
        ordinary.push({ type: "text", text: block.text })
        replay.push({ type: "text", text: block.text })
        break
      }
      case "thinking": {
        assertOnlyKeys(block, thinkingBlockKeys, label)
        if (role !== "assistant" || typeof block.thinking !== "string") {
          throw new GatewayError(
            400,
            "invalid_request_error",
            "thinking blocks are valid only in assistant messages.",
          )
        }
        const signature = string(block.signature, "thinking signature")
        ordinary.push({ type: "reasoning", text: block.thinking })
        replay.push({
          type: "thinking",
          thinking: block.thinking,
          signature,
        })
        break
      }
      case "tool_use": {
        assertOnlyKeys(block, toolUseBlockKeys, label)
        if (role !== "assistant")
          throw new GatewayError(
            400,
            "invalid_request_error",
            "tool_use blocks require assistant role.",
          )
        const id = string(block.id, "tool_use id")
        const name = string(block.name, "tool_use name")
        const input = object(block.input, "tool_use input")
        ordinary.push({
          type: "tool-call",
          id: callId(id),
          name,
          arguments: JSON.stringify(input),
        })
        replay.push({ type: "tool_use", id, name, input })
        break
      }
      case "tool_result": {
        assertOnlyKeys(block, toolResultBlockKeys, label)
        if (role !== "user")
          throw new GatewayError(
            400,
            "invalid_request_error",
            "tool_result blocks require user role.",
          )
        flushOrdinary()
        const id = string(block.tool_use_id, "tool_result tool_use_id")
        const resultContent = contentText(
          block.content ?? "",
          "tool_result content",
        )
        const isError = block.is_error === undefined ? false : block.is_error
        if (typeof isError !== "boolean")
          throw new GatewayError(
            400,
            "invalid_request_error",
            "tool_result is_error must be boolean.",
          )
        messages.push({
          id: messageId(),
          role: "user",
          content: [
            {
              type: "tool-result",
              toolCallId: callId(id),
              content: resultContent,
              ...(isError ? { isError: true } : {}),
            },
          ],
          source: { kind: "tool", callId: callId(id) },
        })
        break
      }
      default: {
        throw new GatewayError(
          400,
          "invalid_request_error",
          `${label} uses an unsupported content type.`,
          "UNSUPPORTED",
        )
      }
    }
  }
  flushOrdinary()
  if (messages.length === 0)
    throw new GatewayError(
      400,
      "invalid_request_error",
      "message content must not be empty.",
    )
  return messages
}

function parseSystem(value: unknown): string | undefined {
  if (value === undefined) return undefined
  if (typeof value === "string") return value
  if (!Array.isArray(value))
    throw new GatewayError(
      400,
      "invalid_request_error",
      "system must be text or text blocks.",
    )
  return value
    .map((entry, index) => {
      const block = object(entry, `system[${index}]`)
      assertOnlyKeys(block, textBlockKeys, `system[${index}]`)
      if (block.type !== "text") {
        throw new GatewayError(
          400,
          "invalid_request_error",
          `system[${index}] uses an unsupported content type.`,
          "UNSUPPORTED",
        )
      }
      if (typeof block.text !== "string") {
        throw new GatewayError(
          400,
          "invalid_request_error",
          `system[${index}].text must be a string.`,
        )
      }
      return block.text
    })
    .join("\n")
}

function parseTools(value: unknown): Array<ToolSchema> | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value))
    throw new GatewayError(
      400,
      "invalid_request_error",
      "tools must be an array.",
    )
  return value.map((entry, index) => {
    const label = `tools[${index}]`
    const tool = object(entry, label)
    assertOnlyKeys(
      tool,
      new Set(["name", "description", "input_schema"]),
      label,
    )
    const name = string(tool.name, `${label}.name`)
    const description =
      tool.description === undefined ?
        ""
      : string(tool.description, `${label}.description`)
    const parameters = object(tool.input_schema, `${label}.input_schema`)
    return { name, description, parameters }
  })
}

function parseReasoning(body: JsonObject): ReasoningEffortId | undefined {
  const outputConfig =
    body.output_config === undefined ?
      undefined
    : object(body.output_config, "output_config")
  if (outputConfig !== undefined)
    assertOnlyKeys(outputConfig, new Set(["effort"]), "output_config")
  const effort = outputConfig?.effort
  let thinkingEffort: ReasoningEffortId | undefined
  if (body.thinking !== undefined) {
    const thinking = object(body.thinking, "thinking")
    assertOnlyKeys(thinking, new Set(["type"]), "thinking")
    switch (thinking.type) {
      case "disabled": {
        thinkingEffort = "off" as ReasoningEffortId
        break
      }
      case "enabled":
      case "adaptive": {
        thinkingEffort = "high" as ReasoningEffortId
        break
      }
      default: {
        throw new GatewayError(
          400,
          "invalid_request_error",
          "thinking.type is not supported.",
          "UNSUPPORTED",
        )
      }
    }
  }
  return effort === undefined ? thinkingEffort : (
      (string(effort, "output_config.effort") as ReasoningEffortId)
    )
}

async function parseMessageRequest(
  request: Request,
  provider: string,
  signal: AbortSignal,
): Promise<ParsedMessageRequest> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    throw new GatewayError(
      400,
      "invalid_request_error",
      "Request body must be valid JSON.",
    )
  }
  const body = object(raw, "request body")
  assertOnlyKeys(body, requestKeys, "request body")
  const model = string(body.model, "model")
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    throw new GatewayError(
      400,
      "invalid_request_error",
      "messages must be a non-empty array.",
    )
  }
  const messages: Array<DshMessage> = []
  for (let index = 0; index < body.messages.length; index += 1) {
    const label = `messages[${index}]`
    const message = object(body.messages[index], label)
    assertOnlyKeys(message, messageKeys, label)
    if (message.role !== "user" && message.role !== "assistant") {
      throw new GatewayError(
        400,
        "invalid_request_error",
        `messages[${index}].role must be user or assistant.`,
      )
    }
    messages.push(
      ...parseContent(message.content, message.role, provider, model),
    )
  }
  const maxTokens = finiteNumber(body.max_tokens, "max_tokens")
  if (!Number.isSafeInteger(maxTokens) || maxTokens <= 0) {
    throw new GatewayError(
      400,
      "invalid_request_error",
      "max_tokens must be a positive integer.",
    )
  }
  let temperature: number | undefined
  if (body.temperature !== undefined) {
    temperature = finiteNumber(body.temperature, "temperature")
    if (temperature < 0 || temperature > 1)
      throw new GatewayError(
        400,
        "invalid_request_error",
        "temperature must be between 0 and 1.",
      )
  }
  let stop: Array<string> | undefined
  if (body.stop_sequences !== undefined) {
    if (
      !Array.isArray(body.stop_sequences)
      || body.stop_sequences.some(
        (item) => typeof item !== "string" || item.length === 0,
      )
    ) {
      throw new GatewayError(
        400,
        "invalid_request_error",
        "stop_sequences must contain non-empty strings.",
      )
    }
    stop = [...(body.stop_sequences as Array<string>)]
  }
  const stream = body.stream === undefined ? false : body.stream
  if (typeof stream !== "boolean")
    throw new GatewayError(
      400,
      "invalid_request_error",
      "stream must be boolean.",
    )
  const system = parseSystem(body.system)
  const tools = parseTools(body.tools)
  const reasoningEffort = parseReasoning(body)
  return {
    model,
    stream,
    options: {
      provider,
      model,
      messages,
      maxTokens,
      signal,
      ...(system === undefined ? {} : { system }),
      ...(tools === undefined ? {} : { tools }),
      ...(temperature === undefined ? {} : { temperature }),
      ...(stop === undefined ? {} : { stop }),
      ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
    },
  }
}

function providerProtocol(message: string): never {
  throw new GatewayError(502, "api_error", message)
}

function providerObject(value: unknown, label: string): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    providerProtocol(`The provider returned invalid ${label}.`)
  return value as JsonObject
}

function assertProviderKeys(
  value: JsonObject,
  allowed: ReadonlySet<string>,
  label: string,
): void {
  if (Object.keys(value).some((key) => !allowed.has(key)))
    providerProtocol(`The provider returned invalid ${label}.`)
}

function parsedToolInput(argumentsText: string): JsonObject {
  let input: unknown
  try {
    input = JSON.parse(argumentsText) as unknown
  } catch {
    providerProtocol("The provider returned invalid tool arguments.")
  }
  if (input === null || typeof input !== "object" || Array.isArray(input))
    providerProtocol("The provider returned invalid tool arguments.")
  return input as JsonObject
}

function mapBlock(
  block: DshContentBlock,
  replayBlock: unknown,
): AnthropicBlock {
  switch (block.type) {
    case "text": {
      if (replayBlock !== undefined) {
        const replay = providerObject(replayBlock, "Anthropic replay state")
        assertProviderKeys(replay, textBlockKeys, "Anthropic replay state")
        if (replay.type !== "text" || replay.text !== block.text)
          providerProtocol(
            "The provider returned invalid Anthropic replay state.",
          )
      }
      return { type: "text", text: block.text }
    }
    case "reasoning": {
      const replay = providerObject(replayBlock, "Anthropic reasoning replay")
      assertProviderKeys(
        replay,
        thinkingBlockKeys,
        "Anthropic reasoning replay",
      )
      if (
        replay.type !== "thinking"
        || replay.thinking !== block.text
        || typeof replay.signature !== "string"
        || replay.signature.length === 0
      ) {
        providerProtocol(
          "The provider returned invalid Anthropic reasoning replay.",
        )
      }
      return {
        type: "thinking",
        thinking: block.text,
        signature: replay.signature,
      }
    }
    case "tool-call": {
      const input = parsedToolInput(block.arguments)
      if (replayBlock !== undefined) {
        const replay = providerObject(replayBlock, "Anthropic replay state")
        assertProviderKeys(replay, toolUseBlockKeys, "Anthropic replay state")
        if (
          replay.type !== "tool_use"
          || replay.id !== block.id
          || replay.name !== block.name
          || !isDeepStrictEqual(replay.input, input)
        ) {
          providerProtocol(
            "The provider returned invalid Anthropic replay state.",
          )
        }
      }
      return { type: "tool_use", id: block.id, name: block.name, input }
    }
    default: {
      providerProtocol("The provider returned an unsupported content block.")
    }
  }
}

function completionBlocks(
  indexed: ReadonlyMap<number, DshContentBlock>,
  replayState: unknown,
): Array<AnthropicBlock> {
  const entries = [...indexed.entries()].sort(([left], [right]) => left - right)
  if (entries.some(([index], position) => index !== position))
    providerProtocol("The provider returned non-contiguous content blocks.")
  const needsReplay = entries.some(([, block]) => block.type === "reasoning")
  let replay: Array<unknown> | undefined
  if (needsReplay) {
    const envelope = providerObject(replayState, "Anthropic replay state")
    assertProviderKeys(
      envelope,
      new Set(["type", "content"]),
      "Anthropic replay state",
    )
    if (
      envelope.type !== "anthropic-message-v1"
      || !Array.isArray(envelope.content)
      || envelope.content.length !== entries.length
    ) {
      providerProtocol("The provider returned invalid Anthropic replay state.")
    }
    replay = envelope.content
  }
  return entries.map(([, block], index) => mapBlock(block, replay?.[index]))
}

async function closeIterator(
  iterator: AsyncIterator<StreamChunk>,
): Promise<void> {
  try {
    await iterator.return?.()
  } catch {
    // Preserve the already classified provider or protocol failure.
  }
}

async function collectIteratorUnchecked(
  iterator: AsyncIterator<StreamChunk>,
): Promise<Completion> {
  const indexed = new Map<number, DshContentBlock>()
  let usage: TokenUsage | undefined
  let finish: FinishReason | undefined
  let replayState: unknown
  while (true) {
    const next = await iterator.next()
    if (next.done) break
    const chunk = next.value
    if (finish !== undefined)
      providerProtocol("The provider emitted data after its terminal finish.")
    switch (chunk.type) {
      case "block-start":
      case "text-delta":
      case "reasoning-delta":
      case "tool-call-delta": {
        break
      }
      case "block-end": {
        if (indexed.has(chunk.index))
          providerProtocol("The provider emitted a duplicate content block.")
        indexed.set(chunk.index, chunk.block)
        break
      }
      case "usage": {
        if (usage !== undefined)
          providerProtocol("The provider emitted duplicate usage.")
        usage = chunk.usage
        break
      }
      case "finish": {
        if (chunk.reason.kind === "error" || chunk.reason.kind === "aborted")
          throw new StreamFailure(chunk.reason.failure)
        if (usage === undefined)
          providerProtocol("The provider finished before reporting usage.")
        finish = chunk.reason
        replayState = chunk.replayState
        break
      }
      default: {
        providerProtocol("The provider emitted an unsupported stream chunk.")
      }
    }
  }
  if (usage === undefined || finish === undefined)
    providerProtocol("The provider stream ended without usage and finish.")
  if (finish.kind === "error" || finish.kind === "aborted")
    throw new StreamFailure(finish.failure)
  return { blocks: completionBlocks(indexed, replayState), usage, finish }
}

async function collectIterator(
  iterator: AsyncIterator<StreamChunk>,
): Promise<Completion> {
  try {
    return await collectIteratorUnchecked(iterator)
  } catch (error) {
    await closeIterator(iterator)
    throw error
  }
}

async function collect(
  stream: AsyncIterable<StreamChunk>,
): Promise<Completion> {
  return await collectIterator(stream[Symbol.asyncIterator]())
}

function usageJson(usage: TokenUsage): JsonObject {
  return {
    input_tokens: usage.inputTokens,
    output_tokens: usage.outputTokens,
    ...(usage.cacheReadTokens === undefined ?
      {}
    : { cache_read_input_tokens: usage.cacheReadTokens }),
    ...(usage.cacheWriteTokens === undefined ?
      {}
    : { cache_creation_input_tokens: usage.cacheWriteTokens }),
  }
}

function stopReason(
  finish: FinishReason,
): "end_turn" | "tool_use" | "max_tokens" {
  switch (finish.kind) {
    case "stop": {
      return "end_turn"
    }
    case "tool-calls": {
      return "tool_use"
    }
    case "max-tokens": {
      return "max_tokens"
    }
    default: {
      throw new GatewayError(
        502,
        "api_error",
        "The provider returned an unsupported finish reason.",
      )
    }
  }
}

function completionResponse(model: string, completion: Completion): Response {
  return Response.json(
    {
      id: `msg_${randomUUID().replaceAll("-", "")}`,
      type: "message",
      role: "assistant",
      content: completion.blocks,
      model,
      stop_reason: stopReason(completion.finish),
      stop_sequence: null,
      usage: usageJson(completion.usage),
    },
    { headers: jsonHeaders },
  )
}

function failureError(failure: LlmFailure): GatewayError {
  const code = failure.code.toUpperCase()
  if (code.includes("AUTH") || code.includes("CREDENTIAL"))
    return new GatewayError(
      401,
      "authentication_error",
      "Provider authentication failed.",
    )
  if (code.includes("RATE_LIMIT"))
    return new GatewayError(
      429,
      "rate_limit_error",
      "The provider rate limit was exceeded.",
    )
  if (code.includes("QUOTA"))
    return new GatewayError(
      429,
      "rate_limit_error",
      "The provider quota was exceeded.",
    )
  if (code.includes("CONTEXT") || code.includes("INVALID"))
    return new GatewayError(
      400,
      "invalid_request_error",
      "The provider rejected the request.",
    )
  if (code.includes("OVERLOAD") || failure.status === 529)
    return new GatewayError(
      529,
      "overloaded_error",
      "The provider is overloaded.",
    )
  if (code.includes("ABORT"))
    return new GatewayError(499, "api_error", "The request was cancelled.")
  return new GatewayError(
    (
      failure.status !== undefined
        && failure.status >= 400
        && failure.status < 600
    ) ?
      failure.status
    : 502,
    "api_error",
    "The provider could not complete the request.",
  )
}

export function errorResponse(error: unknown): Response {
  let mapped: GatewayError
  if (error instanceof StreamFailure) mapped = failureError(error.failure)
  else if (error instanceof GatewayError) mapped = error
  else
    mapped = new GatewayError(500, "api_error", "The provider gateway failed.")
  return Response.json(
    {
      type: "error",
      error: {
        type: mapped.type,
        message: mapped.message,
        ...(mapped.code === undefined ? {} : { code: mapped.code }),
      },
    },
    {
      status: mapped.status,
      headers: jsonHeaders,
    },
  )
}

function sseEvent(event: string, data: unknown): Uint8Array {
  return new TextEncoder().encode(
    `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
  )
}

function completionBlockEvents(
  block: AnthropicBlock,
  index: number,
): Array<Uint8Array> {
  let start: JsonObject
  let delta: JsonObject | undefined
  switch (block.type) {
    case "text": {
      start = { type: "text", text: "" }
      if (block.text !== "") delta = { type: "text_delta", text: block.text }
      break
    }
    case "thinking": {
      start = { type: "thinking", thinking: "", signature: "" }
      return [
        sseEvent("content_block_start", {
          type: "content_block_start",
          index,
          content_block: start,
        }),
        ...(block.thinking === "" ?
          []
        : [
            sseEvent("content_block_delta", {
              type: "content_block_delta",
              index,
              delta: { type: "thinking_delta", thinking: block.thinking },
            }),
          ]),
        sseEvent("content_block_delta", {
          type: "content_block_delta",
          index,
          delta: { type: "signature_delta", signature: block.signature },
        }),
        sseEvent("content_block_stop", {
          type: "content_block_stop",
          index,
        }),
      ]
    }
    case "tool_use": {
      start = {
        type: "tool_use",
        id: block.id,
        name: block.name,
        input: {},
      }
      delta = {
        type: "input_json_delta",
        partial_json: JSON.stringify(block.input),
      }
      break
    }
    default: {
      providerProtocol("The provider returned an unsupported content block.")
    }
  }
  return [
    sseEvent("content_block_start", {
      type: "content_block_start",
      index,
      content_block: start,
    }),
    ...(delta === undefined ?
      []
    : [
        sseEvent("content_block_delta", {
          type: "content_block_delta",
          index,
          delta,
        }),
      ]),
    sseEvent("content_block_stop", { type: "content_block_stop", index }),
  ]
}

interface ToolProgress {
  arguments: string
  id: string
  name: string | undefined
  pendingArguments: Array<string>
}

class AnthropicSsePump {
  readonly #bodyAbort = new AbortController()
  readonly #iterator: AsyncIterator<StreamChunk>
  readonly #model: string
  readonly #release: () => void
  readonly #events: Array<Uint8Array> = []
  readonly #blockTypes = new Map<number, "text" | "reasoning" | "tool-call">()
  readonly #indexed = new Map<number, DshContentBlock>()
  readonly #text = new Map<number, string>()
  readonly #tools = new Map<number, ToolProgress>()
  readonly #emittedStarts = new Set<number>()
  #reasoningBarrier: number | undefined
  #usage: TokenUsage | undefined
  #finish: { reason: FinishReason; replayState: unknown } | undefined
  #done = false
  #iteratorClosed = false
  #released = false

  constructor(
    runtime: LlmGatewayRuntime,
    parsed: ParsedMessageRequest,
    signal: AbortSignal,
    release: () => void,
  ) {
    this.#model = parsed.model
    this.#release = release
    const combinedSignal = AbortSignal.any([signal, this.#bodyAbort.signal])
    this.#iterator = runtime
      .stream({ ...parsed.options, signal: combinedSignal })
      [Symbol.asyncIterator]()
  }

  start(controller: ReadableStreamDefaultController<Uint8Array>): void {
    controller.enqueue(
      sseEvent("message_start", {
        type: "message_start",
        message: {
          id: `msg_${randomUUID().replaceAll("-", "")}`,
          type: "message",
          role: "assistant",
          content: [],
          model: this.#model,
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 0, output_tokens: 0 },
        },
      }),
    )
  }

  async pull(
    controller: ReadableStreamDefaultController<Uint8Array>,
  ): Promise<void> {
    try {
      while (this.#events.length === 0 && !this.#done) {
        const next = await this.#iterator.next()
        if (next.done) {
          this.#finishSuccess()
          break
        }
        if (this.#finish !== undefined)
          providerProtocol(
            "The provider emitted data after its terminal finish.",
          )
        this.#accept(next.value)
      }
      this.#flush(controller)
    } catch (error) {
      await this.#fail(controller, error)
    }
  }

  async cancel(): Promise<void> {
    try {
      await this.#closeProvider(new Error("Response body cancelled."))
    } finally {
      this.#releaseOnce()
    }
  }

  #accept(chunk: StreamChunk): void {
    switch (chunk.type) {
      case "block-start": {
        this.#startBlock(chunk.index, chunk.blockType)
        break
      }
      case "text-delta": {
        this.#textDelta(chunk.index, chunk.text, "text")
        break
      }
      case "reasoning-delta": {
        this.#textDelta(chunk.index, chunk.text, "reasoning")
        break
      }
      case "tool-call-delta": {
        this.#toolDelta(chunk.index, chunk.id, chunk.name, chunk.argumentsDelta)
        break
      }
      case "block-end": {
        this.#endBlock(chunk.index, chunk.block)
        break
      }
      case "usage": {
        if (this.#usage !== undefined)
          providerProtocol("The provider emitted duplicate usage.")
        this.#usage = chunk.usage
        break
      }
      case "finish": {
        if (chunk.reason.kind === "error" || chunk.reason.kind === "aborted")
          throw new StreamFailure(chunk.reason.failure)
        if (this.#usage === undefined)
          providerProtocol("The provider finished before reporting usage.")
        this.#finish = {
          reason: chunk.reason,
          replayState: chunk.replayState,
        }
        break
      }
      default: {
        providerProtocol("The provider emitted an unsupported stream chunk.")
      }
    }
  }

  #startBlock(index: number, blockType: string): void {
    if (
      blockType !== "text"
      && blockType !== "reasoning"
      && blockType !== "tool-call"
    ) {
      providerProtocol("The provider returned an unsupported content block.")
    }
    if (this.#blockTypes.has(index) || this.#indexed.has(index))
      providerProtocol("The provider emitted a duplicate content block.")
    this.#blockTypes.set(index, blockType)
    if (blockType === "reasoning") {
      this.#reasoningBarrier ??= index
      return
    }
    if (blockType === "text" && this.#canEmit(index)) {
      this.#events.push(
        sseEvent("content_block_start", {
          type: "content_block_start",
          index,
          content_block: { type: "text", text: "" },
        }),
      )
      this.#emittedStarts.add(index)
    }
  }

  #textDelta(
    index: number,
    text: string,
    expected: "text" | "reasoning",
  ): void {
    if (this.#blockTypes.get(index) !== expected)
      providerProtocol("The provider emitted a delta for the wrong block type.")
    this.#text.set(index, `${this.#text.get(index) ?? ""}${text}`)
    if (expected === "text" && this.#canEmit(index)) {
      this.#events.push(
        sseEvent("content_block_delta", {
          type: "content_block_delta",
          index,
          delta: { type: "text_delta", text },
        }),
      )
    }
  }

  #toolDelta(
    index: number,
    id: string,
    name: string | undefined,
    argumentsDelta: string,
  ): void {
    if (this.#blockTypes.get(index) !== "tool-call")
      providerProtocol("The provider emitted a delta for the wrong block type.")
    const progress = this.#tools.get(index) ?? {
      arguments: "",
      id,
      name,
      pendingArguments: [],
    }
    if (
      progress.id !== id
      || (name !== undefined
        && progress.name !== undefined
        && progress.name !== name)
    ) {
      providerProtocol("The provider changed a streaming tool call identity.")
    }
    progress.name ??= name
    progress.arguments += argumentsDelta
    if (!this.#emittedStarts.has(index))
      progress.pendingArguments.push(argumentsDelta)
    this.#tools.set(index, progress)
    if (!this.#canEmit(index)) return
    if (!this.#emittedStarts.has(index)) {
      if (progress.name === undefined) return
      this.#startToolAndFlush(index, progress)
      return
    }
    this.#emitToolArguments(index, argumentsDelta)
  }

  #startToolAndFlush(index: number, progress: ToolProgress): void {
    if (progress.name === undefined)
      providerProtocol("The provider ended a tool call without a name.")
    this.#events.push(
      sseEvent("content_block_start", {
        type: "content_block_start",
        index,
        content_block: {
          type: "tool_use",
          id: progress.id,
          name: progress.name,
          input: {},
        },
      }),
    )
    this.#emittedStarts.add(index)
    for (const argumentsDelta of progress.pendingArguments)
      this.#emitToolArguments(index, argumentsDelta)
    progress.pendingArguments.length = 0
  }

  #emitToolArguments(index: number, argumentsDelta: string): void {
    if (argumentsDelta === "") return
    this.#events.push(
      sseEvent("content_block_delta", {
        type: "content_block_delta",
        index,
        delta: {
          type: "input_json_delta",
          partial_json: argumentsDelta,
        },
      }),
    )
  }

  #endBlock(index: number, block: DshContentBlock): void {
    const expected = this.#blockTypes.get(index)
    if (expected === undefined || this.#indexed.has(index))
      providerProtocol("The provider ended an unknown content block.")
    if (block.type !== expected)
      providerProtocol(
        "The provider ended a content block with the wrong type.",
      )
    this.#validateCompletedBlock(index, block)
    this.#indexed.set(index, block)
    if (!this.#canEmit(index)) return
    this.#completeEmittedBlock(index, block)
  }

  #validateCompletedBlock(index: number, block: DshContentBlock): void {
    if (block.type === "text" || block.type === "reasoning") {
      const streamed = this.#text.get(index) ?? ""
      if (streamed !== "" && streamed !== block.text)
        providerProtocol("The provider returned inconsistent block text.")
      return
    }
    if (block.type === "tool-call") {
      const progress = this.#tools.get(index)
      if (
        progress !== undefined
        && (progress.id !== block.id
          || (progress.name !== undefined && progress.name !== block.name)
          || (progress.arguments !== ""
            && progress.arguments !== block.arguments))
      ) {
        providerProtocol("The provider returned an inconsistent tool call.")
      }
      return
    }
    providerProtocol("The provider returned an unsupported content block.")
  }

  #completeEmittedBlock(index: number, block: DshContentBlock): void {
    if (block.type === "text") {
      if (!this.#emittedStarts.has(index))
        providerProtocol("The provider ended a text block before it started.")
      if ((this.#text.get(index) ?? "") === "" && block.text !== "") {
        this.#events.push(
          sseEvent("content_block_delta", {
            type: "content_block_delta",
            index,
            delta: { type: "text_delta", text: block.text },
          }),
        )
      }
    } else if (block.type === "tool-call") {
      if (!this.#emittedStarts.has(index)) {
        const progress = this.#tools.get(index)
        if (progress === undefined) {
          this.#events.push(
            ...completionBlockEvents(mapBlock(block, undefined), index).slice(
              0,
              -1,
            ),
          )
          this.#emittedStarts.add(index)
        } else {
          progress.name ??= block.name
          if (progress.arguments === "" && block.arguments !== "")
            progress.pendingArguments.push(block.arguments)
          this.#startToolAndFlush(index, progress)
        }
      }
    } else {
      providerProtocol("The provider returned an unsupported content block.")
    }
    this.#events.push(
      sseEvent("content_block_stop", { type: "content_block_stop", index }),
    )
  }

  #finishSuccess(): void {
    if (this.#finish === undefined || this.#usage === undefined)
      providerProtocol("The provider stream ended without usage and finish.")
    const blocks = completionBlocks(this.#indexed, this.#finish.replayState)
    if (this.#reasoningBarrier !== undefined) {
      for (
        let index = this.#reasoningBarrier;
        index < blocks.length;
        index += 1
      )
        this.#events.push(...completionBlockEvents(blocks[index], index))
    }
    this.#events.push(
      sseEvent("message_delta", {
        type: "message_delta",
        delta: {
          stop_reason: stopReason(this.#finish.reason),
          stop_sequence: null,
        },
        usage: usageJson(this.#usage),
      }),
      sseEvent("message_stop", { type: "message_stop" }),
    )
    this.#done = true
  }

  #canEmit(index: number): boolean {
    return (
      this.#reasoningBarrier === undefined || index < this.#reasoningBarrier
    )
  }

  #flush(controller: ReadableStreamDefaultController<Uint8Array>): void {
    const event = this.#events.shift()
    if (event !== undefined) controller.enqueue(event)
    if (this.#done && this.#events.length === 0) {
      controller.close()
      this.#releaseOnce()
    }
  }

  async #closeProvider(reason: unknown): Promise<void> {
    this.#bodyAbort.abort(reason)
    if (this.#iteratorClosed) return
    this.#iteratorClosed = true
    await closeIterator(this.#iterator)
  }

  async #fail(
    controller: ReadableStreamDefaultController<Uint8Array>,
    error: unknown,
  ): Promise<void> {
    await this.#closeProvider(error)
    const response = errorResponse(error)
    const payload: unknown = await response.json()
    this.#done = true
    this.#events.length = 0
    try {
      controller.enqueue(sseEvent("error", payload))
      controller.close()
    } catch {
      // A cancelled body has no consumer for an error event.
    } finally {
      this.#releaseOnce()
    }
  }

  #releaseOnce(): void {
    if (this.#released) return
    this.#released = true
    this.#release()
  }
}

function streamResponse(
  runtime: LlmGatewayRuntime,
  parsed: ParsedMessageRequest,
  signal: AbortSignal,
  release: () => void,
): Response {
  const pump = new AnthropicSsePump(runtime, parsed, signal, release)
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      pump.start(controller)
    },
    async pull(controller) {
      await pump.pull(controller)
    },
    async cancel() {
      await pump.cancel()
    },
  })
  return new Response(body, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  })
}

async function modelsResponse(
  runtime: LlmGatewayRuntime,
  provider: string,
): Promise<Response> {
  const models = await runtime.listModels(provider)
  const data = models.map((model) => ({
    type: "model",
    id: model.id,
    display_name: model.name,
    created_at: "1970-01-01T00:00:00Z",
  }))
  return Response.json(
    {
      data,
      has_more: false,
      first_id: data[0]?.id ?? null,
      last_id: data.at(-1)?.id ?? null,
    },
    { headers: jsonHeaders },
  )
}

export async function dispatchRuntime(
  runtime: LlmGatewayRuntime,
  dispatch: ProviderDispatch,
  release: () => void,
): Promise<Response> {
  let releaseOnReturn = true
  try {
    switch (dispatch.operation) {
      case "messages": {
        const parsed = await parseMessageRequest(
          dispatch.request,
          dispatch.provider,
          dispatch.signal,
        )
        if (parsed.stream) {
          const response = streamResponse(
            runtime,
            parsed,
            dispatch.signal,
            release,
          )
          releaseOnReturn = false
          return response
        }
        return completionResponse(
          parsed.model,
          await collect(runtime.stream(parsed.options)),
        )
      }
      case "models": {
        return await modelsResponse(runtime, dispatch.provider)
      }
      case "count-tokens": {
        return errorResponse(
          new GatewayError(
            501,
            "invalid_request_error",
            "Token counting is not supported by the DSH LLM contract.",
            "UNSUPPORTED",
          ),
        )
      }
      default: {
        throw new GatewayError(
          400,
          "invalid_request_error",
          "Unknown provider operation.",
        )
      }
    }
  } catch (error) {
    return errorResponse(error)
  } finally {
    if (releaseOnReturn) release()
  }
}
