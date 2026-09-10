import {
  CallId,
  LlmError,
  type ContentBlock,
  type FinishReason,
  type StreamChunk,
  type TokenUsage,
} from "@deepseek-ai/dsh-llm"

export type OpenAiSseEvent =
  { readonly done: true } | { readonly done: false; readonly value: unknown }

const MAX_EVENT_BYTES = 1024 * 1024

type UnknownRecord = Record<string, unknown>

interface ParserState {
  eventBytes: number
  eventData: Array<string>
}

interface TextState {
  readonly index: number
  readonly type: "text" | "reasoning"
  text: string
}

interface ToolState {
  readonly index: number
  readonly type: "tool-call"
  arguments: string
  id?: string
  name?: string
}

type BlockState = TextState | ToolState

function malformed(message: string, options?: ErrorOptions): LlmError {
  return new LlmError(
    `llama-server: malformed streaming response: ${message}`,
    "MALFORMED_RESPONSE",
    options,
  )
}

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function parseEvent(data: string): OpenAiSseEvent {
  if (data === "[DONE]") return { done: true }
  try {
    return { done: false, value: JSON.parse(data) as unknown }
  } catch (error) {
    throw malformed("event data is not valid JSON", { cause: error })
  }
}

function consumeLine(
  lineValue: string,
  state: ParserState,
): OpenAiSseEvent | undefined {
  const line = lineValue.endsWith("\r") ? lineValue.slice(0, -1) : lineValue
  if (line.length === 0) {
    if (state.eventData.length === 0) return undefined
    const data = state.eventData.join("\n")
    state.eventData = []
    state.eventBytes = 0
    return parseEvent(data)
  }
  if (line.startsWith(":")) return undefined
  const separator = line.indexOf(":")
  const field = separator === -1 ? line : line.slice(0, separator)
  if (field !== "data") return undefined
  let value = separator === -1 ? "" : line.slice(separator + 1)
  if (value.startsWith(" ")) value = value.slice(1)
  state.eventBytes += Buffer.byteLength(value)
  if (state.eventBytes > MAX_EVENT_BYTES) {
    throw malformed("event exceeds size limit")
  }
  state.eventData.push(value)
  return undefined
}

/** Parse an SSE byte stream without retaining an unbounded line or event. */
export async function* parseOpenAiSse(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<OpenAiSseEvent> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  const state: ParserState = { eventBytes: 0, eventData: [] }
  let buffer = ""

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      if (Buffer.byteLength(buffer) > MAX_EVENT_BYTES) {
        throw malformed("line exceeds size limit")
      }
      let newline = buffer.indexOf("\n")
      while (newline !== -1) {
        const event = consumeLine(buffer.slice(0, newline), state)
        if (event !== undefined) yield event
        buffer = buffer.slice(newline + 1)
        newline = buffer.indexOf("\n")
      }
    }
    buffer += decoder.decode()
    if (buffer.length > 0) {
      const event = consumeLine(buffer, state)
      if (event !== undefined) yield event
    }
    if (state.eventData.length > 0) {
      yield parseEvent(state.eventData.join("\n"))
    }
  } finally {
    reader.releaseLock()
  }
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== "string") throw malformed(`${field} must be a string`)
  return value
}

function nonNegativeInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw malformed(`${field} must be a non-negative integer`)
  }
  return value as number
}

function usage(value: unknown): TokenUsage | undefined {
  if (value === undefined || value === null) return undefined
  if (!isRecord(value)) throw malformed("usage must be an object")
  return {
    inputTokens: nonNegativeInteger(value.prompt_tokens, "usage.prompt_tokens"),
    outputTokens: nonNegativeInteger(
      value.completion_tokens,
      "usage.completion_tokens",
    ),
  }
}

function finishReason(value: string): FinishReason {
  if (value === "stop") return { kind: "stop" }
  if (value === "length") return { kind: "max-tokens" }
  if (value === "tool_calls" || value === "function_call") {
    return { kind: "tool-calls" }
  }
  throw malformed(`unsupported finish reason "${value}"`)
}

function closeBlock(state: BlockState): ContentBlock {
  if (state.type !== "tool-call") return { type: state.type, text: state.text }
  if (state.id === undefined || state.id.length === 0) {
    throw malformed("tool call did not provide an id")
  }
  if (state.name === undefined || state.name.length === 0) {
    throw malformed("tool call did not provide a function name")
  }
  return {
    type: "tool-call",
    id: CallId(state.id),
    name: state.name,
    arguments: state.arguments,
  }
}

class TranslationState {
  readonly #blocks: Array<BlockState> = []
  readonly #tools = new Map<number, ToolState>()
  #text: TextState | undefined
  #reasoning: TextState | undefined
  #finalUsage: TokenUsage | undefined
  #finalReason: FinishReason | undefined
  #done = false

  consume(event: OpenAiSseEvent): ReadonlyArray<StreamChunk> {
    if (this.#done) throw malformed("received data after [DONE]")
    if (event.done) {
      this.#done = true
      return []
    }
    if (!isRecord(event.value)) throw malformed("event must be an object")
    const observedUsage = usage(event.value.usage)
    if (observedUsage !== undefined) this.#finalUsage = observedUsage
    if (!Array.isArray(event.value.choices)) {
      throw malformed("choices must be an array")
    }
    const chunks: Array<StreamChunk> = []
    for (const choice of event.value.choices) {
      chunks.push(...this.#consumeChoice(choice))
    }
    return chunks
  }

  finish(): ReadonlyArray<StreamChunk> {
    if (!this.#done) throw malformed("stream ended before [DONE]")
    if (this.#finalReason === undefined) {
      throw malformed("stream ended without a finish reason")
    }
    const chunks: Array<StreamChunk> = this.#blocks.map((state) => ({
      type: "block-end",
      index: state.index,
      block: closeBlock(state),
    }))
    if (this.#finalUsage !== undefined) {
      chunks.push({ type: "usage", usage: this.#finalUsage })
    }
    chunks.push({ type: "finish", reason: this.#finalReason })
    return chunks
  }

  #consumeChoice(value: unknown): ReadonlyArray<StreamChunk> {
    if (!isRecord(value)) throw malformed("choice must be an object")
    if (value.index !== undefined) {
      const index = nonNegativeInteger(value.index, "choice.index")
      if (index !== 0) return []
    }
    const finish = optionalString(value.finish_reason, "finish_reason")
    if (finish !== undefined) this.#finalReason = finishReason(finish)
    if (value.delta === undefined || value.delta === null) return []
    if (!isRecord(value.delta))
      throw malformed("choice.delta must be an object")
    return this.#consumeDelta(value.delta)
  }

  #consumeDelta(delta: UnknownRecord): ReadonlyArray<StreamChunk> {
    const chunks: Array<StreamChunk> = []
    const reasoning = optionalString(
      delta.reasoning_content ?? delta.reasoning,
      "delta.reasoning_content",
    )
    if (reasoning !== undefined && reasoning.length > 0) {
      chunks.push(...this.#appendReasoning(reasoning))
    }
    const content = optionalString(delta.content, "delta.content")
    if (content !== undefined && content.length > 0) {
      chunks.push(...this.#appendText(content))
    }
    if (delta.tool_calls !== undefined) {
      chunks.push(...this.#consumeTools(delta.tool_calls))
    }
    return chunks
  }

  #appendReasoning(value: string): ReadonlyArray<StreamChunk> {
    const chunks: Array<StreamChunk> = []
    if (this.#reasoning === undefined) {
      this.#reasoning = this.#createText("reasoning")
      chunks.push({
        type: "block-start",
        index: this.#reasoning.index,
        blockType: "reasoning",
      })
    }
    this.#reasoning.text += value
    chunks.push({
      type: "reasoning-delta",
      index: this.#reasoning.index,
      text: value,
    })
    return chunks
  }

  #appendText(value: string): ReadonlyArray<StreamChunk> {
    const chunks: Array<StreamChunk> = []
    if (this.#text === undefined) {
      this.#text = this.#createText("text")
      chunks.push({
        type: "block-start",
        index: this.#text.index,
        blockType: "text",
      })
    }
    this.#text.text += value
    chunks.push({ type: "text-delta", index: this.#text.index, text: value })
    return chunks
  }

  #consumeTools(value: unknown): ReadonlyArray<StreamChunk> {
    if (!Array.isArray(value))
      throw malformed("delta.tool_calls must be an array")
    const chunks: Array<StreamChunk> = []
    for (const call of value) chunks.push(...this.#consumeTool(call))
    return chunks
  }

  #consumeTool(value: unknown): ReadonlyArray<StreamChunk> {
    if (!isRecord(value)) throw malformed("tool call must be an object")
    const toolIndex = nonNegativeInteger(value.index, "tool call index")
    const id = optionalString(value.id, "tool call id")
    const functionValue = value.function
    if (functionValue !== undefined && !isRecord(functionValue)) {
      throw malformed("tool call function must be an object")
    }
    const name = optionalString(functionValue?.name, "tool call name")
    const argumentsDelta =
      optionalString(functionValue?.arguments, "tool call arguments") ?? ""
    const existing = this.#tools.has(toolIndex)
    const state = this.#toolState(toolIndex, id, name)
    if (state.id === undefined || state.id.length === 0) {
      throw malformed("tool call delta arrived before its id")
    }
    state.arguments += argumentsDelta
    return [
      ...(existing ?
        []
      : [
          {
            type: "block-start" as const,
            index: state.index,
            blockType: "tool-call" as const,
          },
        ]),
      {
        type: "tool-call-delta",
        index: state.index,
        id: CallId(state.id),
        ...(name === undefined ? {} : { name }),
        argumentsDelta,
      },
    ]
  }

  #toolState(
    toolIndex: number,
    id: string | undefined,
    name: string | undefined,
  ): ToolState {
    const existing = this.#tools.get(toolIndex)
    if (existing !== undefined) {
      if (id !== undefined) existing.id = id
      if (name !== undefined) existing.name = name
      return existing
    }
    const state: ToolState = {
      index: this.#blocks.length,
      type: "tool-call",
      arguments: "",
      ...(id === undefined ? {} : { id }),
      ...(name === undefined ? {} : { name }),
    }
    this.#tools.set(toolIndex, state)
    this.#blocks.push(state)
    return state
  }

  #createText(type: "text" | "reasoning"): TextState {
    const state: TextState = { index: this.#blocks.length, type, text: "" }
    this.#blocks.push(state)
    return state
  }
}

/** Translate llama.cpp's OpenAI chat-completion events to DSH stream chunks. */
export async function* translateOpenAiSse(
  events: AsyncIterable<OpenAiSseEvent>,
): AsyncGenerator<StreamChunk> {
  const state = new TranslationState()
  for await (const event of events) {
    for (const chunk of state.consume(event)) yield chunk
  }
  for (const chunk of state.finish()) yield chunk
}
