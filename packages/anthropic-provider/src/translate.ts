import {
  EMPTY_RESPONSE_CODE,
  LlmError,
  type CallId,
  type FinishReason,
  type StreamChunk,
  type TokenUsage,
} from "@deepseek-ai/dsh-llm"

import type { ResolvedInstanceConfig } from "./config.ts"
import type { SseEvent } from "./sse.ts"

import { protocolError, streamClosed, unsupported } from "./errors.ts"
import {
  finiteTokenCount,
  isRecord,
  requiredIndex,
  requiredString,
} from "./validation.ts"

type BlockState =
  | { kind: "text"; text: string }
  | { kind: "reasoning"; signature: string; text: string }
  | { arguments: string; id: CallId; kind: "tool"; name: string }

interface TranslationState {
  blocks: Map<number, BlockState>
  closedIndexes: Set<number>
  finishReason?: FinishReason
  inputUsage?: TokenUsage
  messageDeltaSeen: boolean
  messageStarted: boolean
  messageStopped: boolean
  replay: Array<unknown>
  usage?: TokenUsage
}

export async function* translate(
  events: AsyncIterable<SseEvent>,
  instance: ResolvedInstanceConfig,
): AsyncGenerator<StreamChunk> {
  const state: TranslationState = {
    blocks: new Map(),
    closedIndexes: new Set(),
    messageDeltaSeen: false,
    messageStarted: false,
    messageStopped: false,
    replay: [],
  }

  for await (const event of events) {
    if (state.messageStopped) protocolError("an event followed message_stop")
    const payload = parsePayload(event.data)
    const type = requiredString(payload, "type", "stream event")
    if (event.event !== "message" && event.event !== type) {
      protocolError("SSE event name does not match its payload type")
    }
    if (type === "ping") continue
    if (type === "error") throwProviderStreamError()
    if (type === "message_start") {
      handleMessageStart(payload, state, instance)
      continue
    }
    requireStarted(state)
    switch (type) {
      case "content_block_start": {
        yield* handleBlockStart(payload, state)

        break
      }
      case "content_block_delta": {
        yield* handleBlockDelta(payload, state)

        break
      }
      case "content_block_stop": {
        yield handleBlockStop(payload, state)

        break
      }
      case "message_delta": {
        handleMessageDelta(payload, state, instance)

        break
      }
      case "message_stop": {
        handleMessageStop(state)

        break
      }
      default: {
        unsupported(`Anthropic stream event ${type}`)
      }
    }
  }

  if (!state.messageStopped) streamClosed("stream ended before message_stop")
  if (!state.inputUsage || !state.usage || !state.finishReason) {
    protocolError("stream ended without complete usage and finish data")
  }
  if (state.closedIndexes.size === 0) {
    throw new LlmError(
      "anthropic-provider: provider completed without content",
      EMPTY_RESPONSE_CODE,
    )
  }
  yield { type: "usage", usage: state.usage }
  yield {
    type: "finish",
    reason: state.finishReason,
    replayState: { content: state.replay, type: "anthropic-message-v1" },
  }
}

function handleMessageStart(
  payload: Record<string, unknown>,
  state: TranslationState,
  instance: ResolvedInstanceConfig,
): void {
  if (state.messageStarted)
    protocolError("message_start appeared more than once")
  const message = payload.message
  if (!isRecord(message))
    protocolError("message_start.message must be an object")
  if (!Array.isArray(message.content) || message.content.length > 0) {
    protocolError("message_start.message.content must be empty")
  }
  if (message.role !== "assistant" || message.type !== "message") {
    protocolError("message_start contains an invalid message envelope")
  }
  if (typeof message.id !== "string" || typeof message.model !== "string") {
    protocolError("message_start lacks message identity")
  }
  if (message.stop_reason !== null || message.stop_sequence !== null) {
    protocolError("message_start must not contain finish data")
  }
  if (!isRecord(message.usage))
    protocolError("message_start.usage must be an object")
  state.inputUsage = mapInputUsage(message.usage, instance.adjustInputTokens)
  state.messageStarted = true
}

function* handleBlockStart(
  payload: Record<string, unknown>,
  state: TranslationState,
): Generator<StreamChunk> {
  ensureBeforeMessageDelta(state)
  const index = safeIndex(payload, "content_block_start")
  if (state.blocks.has(index) || state.closedIndexes.has(index)) {
    protocolError("content block index was reused")
  }
  if (index !== state.blocks.size + state.closedIndexes.size) {
    protocolError("content block indexes must be contiguous")
  }
  const block = payload.content_block
  if (!isRecord(block))
    protocolError("content_block_start.content_block must be an object")
  const type = requiredString(block, "type", "content block")
  if (type === "text") {
    if (block.text !== "")
      protocolError("streamed text blocks must start empty")
    state.blocks.set(index, { kind: "text", text: "" })
    yield { blockType: "text", index, type: "block-start" }
    return
  }
  if (type === "thinking") {
    if (block.thinking !== "" || block.signature !== "") {
      protocolError("streamed thinking blocks must start empty")
    }
    state.blocks.set(index, { kind: "reasoning", signature: "", text: "" })
    yield { blockType: "reasoning", index, type: "block-start" }
    return
  }
  if (type === "redacted_thinking") unsupported("redacted thinking blocks")
  if (type === "tool_use") {
    const id = requiredString(block, "id", "tool_use") as CallId
    const name = requiredString(block, "name", "tool_use")
    if (!isRecord(block.input) || Object.keys(block.input).length > 0) {
      protocolError("streamed tool_use blocks must start with empty input")
    }
    state.blocks.set(index, { arguments: "", id, kind: "tool", name })
    yield { blockType: "tool-call", index, type: "block-start" }
    yield { argumentsDelta: "", id, index, name, type: "tool-call-delta" }
    return
  }
  unsupported(`Anthropic content block ${type}`)
}

function* handleBlockDelta(
  payload: Record<string, unknown>,
  state: TranslationState,
): Generator<StreamChunk> {
  ensureBeforeMessageDelta(state)
  const index = safeIndex(payload, "content_block_delta")
  const block = state.blocks.get(index)
  if (!block)
    protocolError("content_block_delta references a block that is not open")
  const delta = payload.delta
  if (!isRecord(delta))
    protocolError("content_block_delta.delta must be an object")
  const type = requiredString(delta, "type", "content delta")
  if (type === "text_delta" && block.kind === "text") {
    const text = requiredString(delta, "text", "text_delta")
    block.text += text
    yield { index, text, type: "text-delta" }
    return
  }
  if (type === "thinking_delta" && block.kind === "reasoning") {
    const text = requiredString(delta, "thinking", "thinking_delta")
    block.text += text
    yield { index, text, type: "reasoning-delta" }
    return
  }
  if (type === "signature_delta" && block.kind === "reasoning") {
    block.signature += requiredString(delta, "signature", "signature_delta")
    return
  }
  if (type === "input_json_delta" && block.kind === "tool") {
    const argumentsDelta = requiredString(
      delta,
      "partial_json",
      "input_json_delta",
    )
    block.arguments += argumentsDelta
    yield { argumentsDelta, id: block.id, index, type: "tool-call-delta" }
    return
  }
  protocolError("content delta type does not match its open block")
}

function handleBlockStop(
  payload: Record<string, unknown>,
  state: TranslationState,
): StreamChunk {
  ensureBeforeMessageDelta(state)
  const index = safeIndex(payload, "content_block_stop")
  const block = state.blocks.get(index)
  if (!block)
    protocolError("content_block_stop references a block that is not open")
  state.blocks.delete(index)
  state.closedIndexes.add(index)
  if (block.kind === "text") {
    state.replay[index] = { text: block.text, type: "text" }
    return {
      block: { text: block.text, type: "text" },
      index,
      type: "block-end",
    }
  }
  if (block.kind === "reasoning") {
    if (block.signature.length === 0)
      protocolError("thinking block lacks a signature")
    state.replay[index] = {
      signature: block.signature,
      thinking: block.text,
      type: "thinking",
    }
    return {
      block: { text: block.text, type: "reasoning" },
      index,
      type: "block-end",
    }
  }
  const argumentsText = block.arguments.length === 0 ? "{}" : block.arguments
  let input: unknown
  try {
    input = JSON.parse(argumentsText)
  } catch (error) {
    protocolError("tool input JSON is malformed", error)
  }
  if (!isRecord(input)) protocolError("tool input must be a JSON object")
  state.replay[index] = {
    id: String(block.id),
    input,
    name: block.name,
    type: "tool_use",
  }
  return {
    block: {
      arguments: argumentsText,
      id: block.id,
      name: block.name,
      type: "tool-call",
    },
    index,
    type: "block-end",
  }
}

function handleMessageDelta(
  payload: Record<string, unknown>,
  state: TranslationState,
  instance: ResolvedInstanceConfig,
): void {
  if (state.messageDeltaSeen)
    protocolError("message_delta appeared more than once")
  if (state.blocks.size > 0)
    protocolError("message_delta appeared before all blocks closed")
  const delta = payload.delta
  const usage = payload.usage
  if (!isRecord(delta) || !isRecord(usage)) {
    protocolError("message_delta must contain delta and usage objects")
  }
  if (delta.stop_sequence !== null && typeof delta.stop_sequence !== "string") {
    protocolError("message_delta.stop_sequence has an invalid value")
  }
  state.finishReason = mapFinishReason(
    requiredString(delta, "stop_reason", "message_delta.delta"),
  )
  if (!state.inputUsage) protocolError("input usage is missing")
  state.usage = {
    ...state.inputUsage,
    outputTokens: finiteTokenCount(usage.output_tokens, "usage.output_tokens"),
  }
  if (instance.adjustInputTokens) {
    state.usage.inputTokens = Math.max(
      0,
      state.usage.inputTokens
        - (state.usage.cacheReadTokens ?? 0)
        - (state.usage.cacheWriteTokens ?? 0),
    )
  }
  state.messageDeltaSeen = true
}

function handleMessageStop(state: TranslationState): void {
  if (!state.messageDeltaSeen)
    protocolError("message_stop appeared before message_delta")
  if (state.blocks.size > 0)
    protocolError("message_stop appeared with open blocks")
  state.messageStopped = true
}

function mapInputUsage(
  usage: Record<string, unknown>,
  _adjustInputTokens: boolean,
): TokenUsage {
  const inputTokens = finiteTokenCount(usage.input_tokens, "usage.input_tokens")
  const outputTokens = finiteTokenCount(
    usage.output_tokens,
    "usage.output_tokens",
  )
  const cacheRead = optionalTokens(
    usage.cache_read_input_tokens,
    "cache_read_input_tokens",
  )
  const cacheWrite = optionalTokens(
    usage.cache_creation_input_tokens,
    "cache_creation_input_tokens",
  )
  return {
    inputTokens,
    outputTokens,
    ...(cacheRead === undefined ? {} : { cacheReadTokens: cacheRead }),
    ...(cacheWrite === undefined ? {} : { cacheWriteTokens: cacheWrite }),
  }
}

function optionalTokens(value: unknown, name: string): number | undefined {
  return value === undefined ? undefined : (
      finiteTokenCount(value, `usage.${name}`)
    )
}

function mapFinishReason(reason: string): FinishReason {
  if (reason === "end_turn" || reason === "stop_sequence")
    return { kind: "stop" }
  if (reason === "max_tokens") return { kind: "max-tokens" }
  if (reason === "tool_use") return { kind: "tool-calls" }
  unsupported(`Anthropic stop reason ${reason}`)
}

function safeIndex(payload: Record<string, unknown>, context: string): number {
  return requiredIndex(payload, context)
}

function parsePayload(data: string): Record<string, unknown> {
  let parsed: unknown
  try {
    parsed = JSON.parse(data)
  } catch (error) {
    protocolError("SSE data is not valid JSON", error)
  }
  if (!isRecord(parsed)) protocolError("SSE data must be a JSON object")
  return parsed
}

function requireStarted(state: TranslationState): void {
  if (!state.messageStarted)
    protocolError("stream event appeared before message_start")
}

function ensureBeforeMessageDelta(state: TranslationState): void {
  if (state.messageDeltaSeen)
    protocolError("content event appeared after message_delta")
}

function throwProviderStreamError(): never {
  throw new LlmError(
    "anthropic-provider: provider reported an in-stream error",
    "SERVER",
  )
}
