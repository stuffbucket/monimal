import {
  LlmError,
  type ContentBlock,
  type GenerateOptions,
  type Message,
} from "@deepseek-ai/dsh-llm"

import type { ResolvedOmlxInstance } from "./config.ts"

import {
  ANTHROPIC_REPLAY_TYPE,
  type OmlxReplayBlock,
  type OmlxReplayState,
} from "./replay.ts"

type JsonObject = Record<string, unknown>

interface WireMessage {
  role: Message["role"]
  content: Array<JsonObject>
}

interface WireRequest {
  model: string
  max_tokens: number
  messages: Array<WireMessage>
  stream: true
  system?: string
  tools?: Array<JsonObject>
  temperature?: number
  stop_sequences?: Array<string>
  thinking?: { type: "adaptive" | "disabled" }
  chat_template_kwargs?: { reasoning_effort: string }
}

function unsupported(message: string): never {
  throw new LlmError(message, "UNSUPPORTED")
}

function invalidReplay(message: string): never {
  throw new LlmError(`omlx: ${message}`, "INVALID_REQUEST")
}

function isRecord(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function hasOnlyKeys(value: JsonObject, keys: Array<string>): boolean {
  const actual = Object.keys(value).sort()
  return (
    actual.length === keys.length
    && actual.every((key, index) => key === keys[index])
  )
}

function jsonEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length
      && left.every((value, index) => jsonEqual(value, right[index]))
    )
  }
  if (!isRecord(left) || !isRecord(right)) return false
  const leftKeys = Object.keys(left).sort()
  const rightKeys = Object.keys(right).sort()
  return (
    leftKeys.length === rightKeys.length
    && leftKeys.every(
      (key, index) =>
        key === rightKeys[index] && jsonEqual(left[key], right[key]),
    )
  )
}

function parseToolArguments(argumentsJson: string): JsonObject {
  let parsed: unknown
  try {
    parsed = JSON.parse(argumentsJson)
  } catch {
    throw new LlmError(
      "omlx: tool-call arguments must be valid JSON",
      "INVALID_REQUEST",
    )
  }
  if (!isRecord(parsed)) {
    throw new LlmError(
      "omlx: tool-call arguments must be a JSON object",
      "INVALID_REQUEST",
    )
  }
  return parsed
}

function serializeToolResultContent(
  content: Array<ContentBlock>,
): Array<JsonObject> {
  const result: Array<JsonObject> = []
  for (const block of content) {
    if (block.type === "text") {
      result.push({ type: "text", text: block.text })
      continue
    }
    if (block.type === "image") {
      unsupported(
        "omlx: image content is not representable without attachment bytes",
      )
    }
    unsupported(
      `omlx: ${block.type} content is not supported inside tool results`,
    )
  }
  return result
}

function replayForMessage(message: Message): OmlxReplayState | undefined {
  if (message.source.kind !== "model") return undefined
  const value = message.source.replayState
  if (value === undefined) return undefined
  if (
    !isRecord(value)
    || value.type !== ANTHROPIC_REPLAY_TYPE
    || !Array.isArray(value.content)
    || !hasOnlyKeys(value, ["content", "type"])
  ) {
    invalidReplay(
      "assistant replay state is malformed or belongs to another adapter",
    )
  }
  if (value.content.length !== message.content.length) {
    invalidReplay("assistant replay content does not match the message")
  }
  return value as unknown as OmlxReplayState
}

function validateTextReplay(
  block: Extract<ContentBlock, { type: "text" }>,
  replay: unknown,
): void {
  if (
    !isRecord(replay)
    || replay.type !== "text"
    || replay.text !== block.text
    || !hasOnlyKeys(replay, ["text", "type"])
  ) {
    invalidReplay("text replay content does not match the message")
  }
}

function reasoningReplay(
  block: Extract<ContentBlock, { type: "reasoning" }>,
  replay: unknown,
): Extract<OmlxReplayBlock, { type: "thinking" }> {
  if (replay === undefined) {
    unsupported("omlx: reasoning replay requires its oMLX signature")
  }
  if (
    !isRecord(replay)
    || replay.type !== "thinking"
    || replay.thinking !== block.text
    || typeof replay.signature !== "string"
    || replay.signature.length === 0
    || !hasOnlyKeys(replay, ["signature", "thinking", "type"])
  ) {
    invalidReplay(
      "reasoning replay does not match its signed Anthropic content",
    )
  }
  return replay as Extract<OmlxReplayBlock, { type: "thinking" }>
}

function validateToolReplay(
  block: Extract<ContentBlock, { type: "tool-call" }>,
  input: JsonObject,
  replay: unknown,
): void {
  if (
    !isRecord(replay)
    || replay.type !== "tool_use"
    || replay.id !== String(block.id)
    || replay.name !== block.name
    || !jsonEqual(replay.input, input)
    || !hasOnlyKeys(replay, ["id", "input", "name", "type"])
  ) {
    invalidReplay("tool-call replay content does not match the message")
  }
}

function serializeMessage(message: Message): WireMessage {
  const replay = replayForMessage(message)
  const content: Array<JsonObject> = []
  for (const [index, block] of message.content.entries()) {
    const replayBlock = replay?.content[index]
    switch (block.type) {
      case "text": {
        if (replay !== undefined) validateTextReplay(block, replayBlock)
        content.push({ type: "text", text: block.text })
        break
      }
      case "reasoning": {
        if (message.role !== "assistant") {
          unsupported(
            "omlx: reasoning content is supported only in assistant messages",
          )
        }
        const signed = reasoningReplay(block, replayBlock)
        content.push({
          type: "thinking",
          thinking: block.text,
          signature: signed.signature,
        })
        break
      }
      case "tool-call": {
        if (message.role !== "assistant") {
          unsupported(
            "omlx: tool calls are supported only in assistant messages",
          )
        }
        const input = parseToolArguments(block.arguments)
        if (replay !== undefined) validateToolReplay(block, input, replayBlock)
        content.push({
          type: "tool_use",
          id: block.id,
          name: block.name,
          input,
        })
        break
      }
      case "tool-result": {
        if (message.role !== "user") {
          unsupported("omlx: tool results are supported only in user messages")
        }
        content.push({
          type: "tool_result",
          tool_use_id: block.toolCallId,
          content: serializeToolResultContent(block.content),
          ...(block.isError === undefined ? {} : { is_error: block.isError }),
        })
        break
      }
      case "image": {
        unsupported(
          "omlx: image content is not representable without attachment bytes",
        )
        break
      }
      default: {
        unsupported("omlx: this content block type is not supported")
      }
    }
  }
  return { role: message.role, content }
}

function maxTokensFor(
  options: GenerateOptions,
  instance: ResolvedOmlxInstance,
): number {
  const maxTokens = options.maxTokens ?? instance.modelDefaults?.maxTokens
  if (maxTokens === undefined) {
    throw new LlmError(
      "omlx: maxTokens is required when the instance has no modelDefaults.maxTokens",
      "INVALID_REQUEST",
    )
  }
  if (!Number.isSafeInteger(maxTokens) || maxTokens <= 0) {
    throw new LlmError(
      "omlx: maxTokens must be a positive safe integer",
      "INVALID_REQUEST",
    )
  }
  return maxTokens
}

function reasoningProperties(
  reasoningEffort: string | undefined,
): Partial<WireRequest> {
  if (reasoningEffort === undefined) {
    return { thinking: { type: "disabled" } }
  }
  if (reasoningEffort.length === 0) {
    unsupported("omlx: an empty reasoning effort is not representable")
  }
  if (reasoningEffort === "off") {
    return { thinking: { type: "disabled" } }
  }
  return {
    thinking: { type: "adaptive" },
    chat_template_kwargs: { reasoning_effort: reasoningEffort },
  }
}

export function serializeRequest(
  options: GenerateOptions,
  instance: ResolvedOmlxInstance,
): WireRequest {
  if (options.sessionId !== undefined) {
    unsupported("omlx: sessionId is not representable by the Messages endpoint")
  }
  if (options.purpose !== undefined) {
    unsupported("omlx: purpose is not representable by the Messages endpoint")
  }

  const tools = options.tools?.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters,
  }))
  const reasoningEffort =
    options.reasoningEffort === undefined ?
      undefined
    : String(options.reasoningEffort)

  return {
    model: options.model,
    max_tokens: maxTokensFor(options, instance),
    messages: options.messages.map((message) => serializeMessage(message)),
    stream: true,
    ...(options.system === undefined ? {} : { system: options.system }),
    ...(tools === undefined || tools.length === 0 ? {} : { tools }),
    ...(options.temperature === undefined ?
      {}
    : { temperature: options.temperature }),
    ...(options.stop === undefined ? {} : { stop_sequences: options.stop }),
    ...reasoningProperties(reasoningEffort),
  }
}
