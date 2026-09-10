import {
  CallId,
  EMPTY_RESPONSE_CODE,
  LlmError,
  type FinishReason,
  type StreamChunk,
  type TokenUsage,
} from "@deepseek-ai/dsh-llm"

import {
  type OmlxReplayBlock,
  replayState as createReplayState,
} from "./replay.ts"

interface SseEvent {
  readonly event?: string
  readonly data: string
}

class SseParserState {
  readonly #decoder = new TextDecoder("utf-8", { fatal: true })
  #buffer = ""
  #eventName: string | undefined
  #dataLines: Array<string> = []

  append(bytes: Uint8Array): void {
    this.#buffer += this.#decode(bytes, true)
  }

  finish(): void {
    this.#buffer += this.#decode(undefined, false)
  }

  consumeAvailable(atEof = false): Array<SseEvent> {
    const events: Array<SseEvent> = []
    let line = this.#nextLine(atEof)
    while (line !== undefined) {
      const event = this.#consumeLine(line)
      if (event !== undefined) events.push(event)
      line = this.#nextLine(atEof)
    }
    return events
  }

  assertComplete(): void {
    if (
      this.#buffer.length > 0
      || this.#eventName !== undefined
      || this.#dataLines.length > 0
    ) {
      throw new LlmError(
        "omlx: SSE stream ended in a partial event",
        "STREAM_CLOSED",
      )
    }
  }

  #decode(bytes: Uint8Array | undefined, stream: boolean): string {
    try {
      return bytes === undefined ?
          this.#decoder.decode()
        : this.#decoder.decode(bytes, { stream })
    } catch (error) {
      throw new LlmError(
        "omlx: SSE stream contained invalid UTF-8",
        "MALFORMED_RESPONSE",
        { cause: error },
      )
    }
  }

  #dispatch(): SseEvent | undefined {
    if (this.#dataLines.length === 0) {
      this.#eventName = undefined
      return undefined
    }
    const event = {
      ...(this.#eventName === undefined ? {} : { event: this.#eventName }),
      data: this.#dataLines.join("\n"),
    }
    this.#eventName = undefined
    this.#dataLines = []
    return event
  }

  #nextLine(atEof: boolean): string | undefined {
    for (let position = 0; position < this.#buffer.length; position += 1) {
      const character = this.#buffer[position]
      if (character === "\n") return this.#takeLine(position, 1)
      if (character === "\r") {
        if (position + 1 === this.#buffer.length && !atEof) return undefined
        const width = this.#buffer[position + 1] === "\n" ? 2 : 1
        return this.#takeLine(position, width)
      }
    }
    return undefined
  }

  #takeLine(position: number, width: number): string {
    const line = this.#buffer.slice(0, position)
    this.#buffer = this.#buffer.slice(position + width)
    return line
  }

  #consumeLine(line: string): SseEvent | undefined {
    if (line.length === 0) return this.#dispatch()
    if (line.startsWith(":")) return undefined

    const colon = line.indexOf(":")
    const field = colon === -1 ? line : line.slice(0, colon)
    let value = colon === -1 ? "" : line.slice(colon + 1)
    if (value.startsWith(" ")) value = value.slice(1)
    if (field === "event") this.#eventName = value
    if (field === "data") this.#dataLines.push(value)
    return undefined
  }
}

export async function* parseSse(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<SseEvent> {
  const reader = stream.getReader()
  const parser = new SseParserState()
  let exhausted = false

  try {
    while (true) {
      const result = await reader.read()
      if (result.done) {
        exhausted = true
        parser.finish()
        yield* parser.consumeAvailable(true)
        parser.assertComplete()
        return
      }
      parser.append(result.value)
      yield* parser.consumeAvailable()
    }
  } finally {
    if (!exhausted) {
      try {
        await reader.cancel("omlx stream consumer stopped")
      } catch {
        // The transport may already have failed or been aborted.
      }
    }
    reader.releaseLock()
  }
}

type OpenBlock =
  | { type: "text"; index: number; text: string }
  | { type: "reasoning"; index: number; text: string; signature: string }
  | {
      type: "tool-call"
      index: number
      id: ReturnType<typeof CallId>
      name: string
      arguments: string
    }

interface Translation {
  readonly chunks: Array<StreamChunk>
  readonly finished: boolean
}

function record(value: unknown, description: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new LlmError(`omlx: malformed ${description}`, "MALFORMED_RESPONSE")
  }
  return value as Record<string, unknown>
}

function string(value: unknown, description: string): string {
  if (typeof value !== "string") {
    throw new LlmError(`omlx: malformed ${description}`, "MALFORMED_RESPONSE")
  }
  return value
}

function index(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new LlmError(
      "omlx: malformed content block index",
      "MALFORMED_RESPONSE",
    )
  }
  return value as number
}

function tokenCount(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new LlmError(`omlx: malformed usage.${field}`, "MALFORMED_RESPONSE")
  }
  return value as number
}

function optionalTokenCount(
  value: Record<string, unknown>,
  field: string,
): number | undefined {
  const count = value[field]
  return count === undefined ? undefined : tokenCount(count, field)
}

function optionalUsageFields(
  cacheReadTokens: number | undefined,
  cacheWriteTokens: number | undefined,
): Partial<TokenUsage> {
  return {
    ...(cacheReadTokens === undefined ? {} : { cacheReadTokens }),
    ...(cacheWriteTokens === undefined ? {} : { cacheWriteTokens }),
  }
}

function usageFromStart(message: Record<string, unknown>): TokenUsage {
  const usage = record(message.usage, "message_start usage")
  const outputTokens =
    usage.output_tokens === undefined ?
      0
    : tokenCount(usage.output_tokens, "output_tokens")
  return {
    inputTokens: tokenCount(usage.input_tokens, "input_tokens"),
    outputTokens,
    ...optionalUsageFields(
      optionalTokenCount(usage, "cache_read_input_tokens"),
      optionalTokenCount(usage, "cache_creation_input_tokens"),
    ),
  }
}

function updateUsage(current: TokenUsage, value: unknown): TokenUsage {
  const usage = record(value, "message_delta usage")
  const inputTokens = optionalTokenCount(usage, "input_tokens")
  const cacheReadTokens =
    optionalTokenCount(usage, "cache_read_input_tokens")
    ?? current.cacheReadTokens
  const cacheWriteTokens =
    optionalTokenCount(usage, "cache_creation_input_tokens")
    ?? current.cacheWriteTokens
  return {
    inputTokens: inputTokens ?? current.inputTokens,
    outputTokens: tokenCount(usage.output_tokens, "output_tokens"),
    ...optionalUsageFields(cacheReadTokens, cacheWriteTokens),
  }
}

function finishReason(value: unknown): FinishReason {
  const reason = string(value, "message_delta stop_reason")
  switch (reason) {
    case "end_turn":
    case "stop_sequence": {
      return { kind: "stop" }
    }
    case "tool_use": {
      return { kind: "tool-calls" }
    }
    case "max_tokens": {
      return { kind: "max-tokens" }
    }
    default: {
      return {
        kind: "error",
        failure: {
          message: "omlx: model stopped for an unsupported reason",
          code: "UNSUPPORTED_STOP_REASON",
        },
      }
    }
  }
}

function providerError(value: unknown): FinishReason {
  const event = record(value, "error event")
  const error = record(event.error, "error event detail")
  const rawCode = typeof error.type === "string" ? error.type : "PROVIDER_ERROR"
  const code =
    /^[\w-]+$/.test(rawCode) ?
      rawCode.toUpperCase().replaceAll("-", "_")
    : "PROVIDER_ERROR"
  return {
    kind: "error",
    failure: {
      message: "omlx: provider reported an in-band stream error",
      code,
    },
  }
}

interface ClosedBlock {
  readonly chunk: StreamChunk
  readonly replay: OmlxReplayBlock
}

function closeBlock(block: OpenBlock): ClosedBlock {
  if (block.type === "text") {
    return {
      chunk: {
        type: "block-end",
        index: block.index,
        block: { type: "text", text: block.text },
      },
      replay: { type: "text", text: block.text },
    }
  }
  if (block.type === "reasoning") {
    if (block.signature.length === 0) {
      throw new LlmError(
        "omlx: thinking block ended without a signature",
        "MALFORMED_RESPONSE",
      )
    }
    return {
      chunk: {
        type: "block-end",
        index: block.index,
        block: { type: "reasoning", text: block.text },
      },
      replay: {
        type: "thinking",
        thinking: block.text,
        signature: block.signature,
      },
    }
  }
  const argumentsJson = block.arguments.length === 0 ? "{}" : block.arguments
  const input = parseToolArguments(argumentsJson)
  return {
    chunk: {
      type: "block-end",
      index: block.index,
      block: {
        type: "tool-call",
        id: block.id,
        name: block.name,
        arguments: argumentsJson,
      },
    },
    replay: {
      type: "tool_use",
      id: String(block.id),
      name: block.name,
      input,
    },
  }
}

function parseToolArguments(argumentsJson: string): Record<string, unknown> {
  let input: unknown
  try {
    input = JSON.parse(argumentsJson)
  } catch {
    throw new LlmError(
      "omlx: tool input stream did not form valid JSON",
      "MALFORMED_RESPONSE",
    )
  }
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new LlmError(
      "omlx: tool input must form a JSON object",
      "MALFORMED_RESPONSE",
    )
  }
  return input as Record<string, unknown>
}

function parseFrame(frame: SseEvent): Record<string, unknown> {
  let event: Record<string, unknown>
  try {
    event = record(JSON.parse(frame.data), "SSE event")
  } catch (error) {
    if (error instanceof LlmError) throw error
    throw new LlmError(
      "omlx: SSE event data was not valid JSON",
      "MALFORMED_RESPONSE",
      { cause: error },
    )
  }
  const type = string(event.type, "SSE event type")
  if (frame.event !== undefined && frame.event !== type) {
    throw new LlmError(
      "omlx: SSE event name did not match its payload type",
      "MALFORMED_RESPONSE",
    )
  }
  return event
}

class AnthropicTranslator {
  #phase: "await-start" | "content" | "await-stop" = "await-start"
  #nextIndex = 0
  #open: OpenBlock | undefined
  #usage: TokenUsage | undefined
  #pendingFinish: FinishReason | undefined
  #blockCount = 0
  #replay: Array<OmlxReplayBlock> = []

  consume(frame: SseEvent): Translation {
    const event = parseFrame(frame)
    const type = event.type as string
    switch (type) {
      case "ping": {
        return this.#pending()
      }
      case "error": {
        return this.#providerFailure(event)
      }
      case "message_start": {
        return this.#messageStart(event)
      }
      case "content_block_start": {
        return this.#contentBlockStart(event)
      }
      case "content_block_delta": {
        return this.#contentBlockDelta(event)
      }
      case "content_block_stop": {
        return this.#contentBlockStop(event)
      }
      case "message_delta": {
        return this.#messageDelta(event)
      }
      case "message_stop": {
        return this.#messageStop()
      }
      default: {
        throw new LlmError("omlx: unknown SSE event type", "MALFORMED_RESPONSE")
      }
    }
  }

  ended(): never {
    throw new LlmError(
      "omlx: SSE stream ended before message_stop",
      "STREAM_CLOSED",
    )
  }

  #pending(chunks: Array<StreamChunk> = []): Translation {
    return { chunks, finished: false }
  }

  #providerFailure(event: Record<string, unknown>): Translation {
    const reason = providerError(event)
    if (this.#usage === undefined) {
      throw new LlmError(
        "omlx: provider reported an error before message usage",
        "SERVER",
      )
    }
    return {
      chunks: [
        { type: "usage", usage: this.#usage },
        { type: "finish", reason },
      ],
      finished: true,
    }
  }

  #messageStart(event: Record<string, unknown>): Translation {
    if (this.#phase !== "await-start") {
      throw new LlmError(
        "omlx: duplicate or out-of-order message_start",
        "MALFORMED_RESPONSE",
      )
    }
    const message = record(event.message, "message_start message")
    if (
      message.type !== "message"
      || message.role !== "assistant"
      || typeof message.id !== "string"
      || message.id.length === 0
      || typeof message.model !== "string"
      || message.model.length === 0
      || !Array.isArray(message.content)
      || message.content.length > 0
      || message.stop_reason !== null
      || message.stop_sequence !== null
    ) {
      throw new LlmError(
        "omlx: malformed message_start message",
        "MALFORMED_RESPONSE",
      )
    }
    this.#usage = usageFromStart(message)
    this.#phase = "content"
    return this.#pending()
  }

  #assertContentPhase(message: string): void {
    if (this.#phase === "await-start") {
      throw new LlmError(
        "omlx: stream content arrived before message_start",
        "MALFORMED_RESPONSE",
      )
    }
    if (this.#phase !== "content") {
      throw new LlmError(message, "MALFORMED_RESPONSE")
    }
  }

  #contentBlockStart(event: Record<string, unknown>): Translation {
    this.#assertContentPhase("omlx: out-of-order content_block_start")
    if (this.#open !== undefined) {
      throw new LlmError(
        "omlx: out-of-order content_block_start",
        "MALFORMED_RESPONSE",
      )
    }
    const blockIndex = index(event.index)
    if (blockIndex !== this.#nextIndex) {
      throw new LlmError(
        "omlx: content block indices were not contiguous",
        "MALFORMED_RESPONSE",
      )
    }
    const content = record(event.content_block, "content_block_start content")
    const chunks = this.#openBlock(blockIndex, content)
    this.#nextIndex += 1
    this.#blockCount += 1
    return this.#pending(chunks)
  }

  #openBlock(
    blockIndex: number,
    content: Record<string, unknown>,
  ): Array<StreamChunk> {
    const blockType = string(content.type, "content block type")
    if (blockType === "text") return this.#openText(blockIndex, content)
    if (blockType === "thinking")
      return this.#openReasoning(blockIndex, content)
    if (blockType === "tool_use") return this.#openTool(blockIndex, content)
    throw new LlmError(
      "omlx: unsupported response content block",
      "UNSUPPORTED",
    )
  }

  #openText(
    blockIndex: number,
    content: Record<string, unknown>,
  ): Array<StreamChunk> {
    if (content.text !== "") {
      throw new LlmError(
        "omlx: text block start contained non-empty content",
        "MALFORMED_RESPONSE",
      )
    }
    this.#open = { type: "text", index: blockIndex, text: "" }
    return [{ type: "block-start", index: blockIndex, blockType: "text" }]
  }

  #openReasoning(
    blockIndex: number,
    content: Record<string, unknown>,
  ): Array<StreamChunk> {
    if (content.thinking !== "" || content.signature !== "") {
      throw new LlmError(
        "omlx: thinking block start contained non-empty content",
        "MALFORMED_RESPONSE",
      )
    }
    this.#open = {
      type: "reasoning",
      index: blockIndex,
      text: "",
      signature: "",
    }
    return [{ type: "block-start", index: blockIndex, blockType: "reasoning" }]
  }

  #openTool(
    blockIndex: number,
    content: Record<string, unknown>,
  ): Array<StreamChunk> {
    const id = string(content.id, "tool id")
    const name = string(content.name, "tool name")
    const input = record(content.input, "tool input")
    if (id.length === 0 || name.length === 0 || Object.keys(input).length > 0) {
      throw new LlmError(
        "omlx: malformed tool_use block start",
        "MALFORMED_RESPONSE",
      )
    }
    const callId = CallId(id)
    this.#open = {
      type: "tool-call",
      index: blockIndex,
      id: callId,
      name,
      arguments: "",
    }
    return [
      { type: "block-start", index: blockIndex, blockType: "tool-call" },
      {
        type: "tool-call-delta",
        index: blockIndex,
        id: callId,
        name,
        argumentsDelta: "",
      },
    ]
  }

  #contentBlockDelta(event: Record<string, unknown>): Translation {
    this.#assertContentPhase("omlx: content delta arrived after content")
    const open = this.#matchingOpen(event.index, "content delta")
    const delta = record(event.delta, "content block delta")
    const deltaType = string(delta.type, "content delta type")
    if (open.type === "text" && deltaType === "text_delta") {
      const text = string(delta.text, "text delta")
      open.text += text
      return this.#pending([{ type: "text-delta", index: open.index, text }])
    }
    if (open.type === "reasoning" && deltaType === "thinking_delta") {
      const text = string(delta.thinking, "thinking delta")
      open.text += text
      return this.#pending([
        { type: "reasoning-delta", index: open.index, text },
      ])
    }
    if (open.type === "reasoning" && deltaType === "signature_delta") {
      open.signature += string(delta.signature, "signature delta")
      return this.#pending()
    }
    if (open.type === "tool-call" && deltaType === "input_json_delta") {
      const fragment = string(delta.partial_json, "tool input delta")
      open.arguments += fragment
      return this.#pending([
        {
          type: "tool-call-delta",
          index: open.index,
          id: open.id,
          argumentsDelta: fragment,
        },
      ])
    }
    throw new LlmError(
      "omlx: content delta type did not match its block",
      "MALFORMED_RESPONSE",
    )
  }

  #matchingOpen(value: unknown, eventName: string): OpenBlock {
    const open = this.#open
    if (open === undefined || index(value) !== open.index) {
      throw new LlmError(
        `omlx: ${eventName} did not match an open block`,
        "MALFORMED_RESPONSE",
      )
    }
    return open
  }

  #contentBlockStop(event: Record<string, unknown>): Translation {
    this.#assertContentPhase("omlx: content block stop arrived after content")
    const open = this.#matchingOpen(event.index, "content block stop")
    const closed = closeBlock(open)
    this.#replay[open.index] = closed.replay
    this.#open = undefined
    return this.#pending([closed.chunk])
  }

  #messageDelta(event: Record<string, unknown>): Translation {
    this.#assertContentPhase("omlx: out-of-order message_delta")
    if (this.#open !== undefined || this.#pendingFinish !== undefined) {
      throw new LlmError(
        "omlx: out-of-order message_delta",
        "MALFORMED_RESPONSE",
      )
    }
    const delta = record(event.delta, "message_delta delta")
    this.#pendingFinish = finishReason(delta.stop_reason)
    this.#usage = updateUsage(this.#usage as TokenUsage, event.usage)
    this.#phase = "await-stop"
    return this.#pending()
  }

  #messageStop(): Translation {
    if (
      this.#phase !== "await-stop"
      || this.#pendingFinish === undefined
      || this.#usage === undefined
    ) {
      throw new LlmError(
        "omlx: out-of-order message_stop",
        "MALFORMED_RESPONSE",
      )
    }
    const reason = this.#finalReason(this.#pendingFinish)
    const replay =
      reason.kind === "error" ?
        {}
      : { replayState: createReplayState(this.#replay) }
    return {
      chunks: [
        { type: "usage", usage: this.#usage },
        { type: "finish", reason, ...replay },
      ],
      finished: true,
    }
  }

  #finalReason(reason: FinishReason): FinishReason {
    if (reason.kind !== "stop" || this.#blockCount > 0) return reason
    return {
      kind: "error",
      failure: {
        message: "omlx: model returned a completed response with no content",
        code: EMPTY_RESPONSE_CODE,
      },
    }
  }
}

export async function* translateSse(
  events: AsyncIterable<SseEvent>,
): AsyncGenerator<StreamChunk> {
  const translator = new AnthropicTranslator()
  for await (const event of events) {
    const result = translator.consume(event)
    yield* result.chunks
    if (result.finished) return
  }
  translator.ended()
}
