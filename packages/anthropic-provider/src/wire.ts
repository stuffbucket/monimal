import type {
  ContentBlock,
  GenerateOptions,
  Message,
  ToolSchema,
} from "@deepseek-ai/dsh-llm"

import type {
  AnthropicReasoningEffort,
  ModelConfig,
  ResolvedInstanceConfig,
} from "./config.ts"

import { invalidRequest, unsupported } from "./errors.ts"
import { isRecord } from "./validation.ts"

export interface WireRequest {
  max_tokens: number
  messages: Array<WireMessage>
  metadata?: { user_id: string }
  model: string
  output_config?: { effort: AnthropicReasoningEffort }
  stop_sequences?: Array<string>
  stream: true
  system?: string
  temperature?: number
  thinking?: { display: "summarized"; type: "adaptive" }
  tool_choice?: never
  tools?: Array<WireTool>
  top_k?: number
  top_p?: number
}

export interface WireTool {
  description: string
  input_schema: Record<string, unknown>
  name: string
}

type WireMessage =
  | { content: Array<WireContent>; role: "assistant" | "user" }
  | { content: string; role: "system" }

type WireContent =
  | { text: string; type: "text" }
  | { thinking: string; signature: string; type: "thinking" }
  | {
      id: string
      input: Record<string, unknown>
      name: string
      type: "tool_use"
    }
  | {
      content: Array<{ text: string; type: "text" }>
      is_error?: boolean
      tool_use_id: string
      type: "tool_result"
    }

interface ReplayState {
  content: Array<unknown>
  type: "anthropic-message-v1"
}

const KNOWN_OPTION_KEYS = new Set([
  "provider",
  "model",
  "reasoningEffort",
  "messages",
  "system",
  "tools",
  "temperature",
  "maxTokens",
  "stop",
  "signal",
  "sessionId",
  "purpose",
])

export function serializeRequest(
  options: GenerateOptions,
  instance: ResolvedInstanceConfig,
): WireRequest {
  rejectUnknownOptions(options)
  if (options.model.length === 0) invalidRequest("model must be non-empty")
  const modelConfig = instance.models[options.model]
  const defaults = { ...instance.modelDefaults, ...modelConfig }
  const maxTokens = options.maxTokens ?? defaults.maxTokens
  if (!Number.isSafeInteger(maxTokens) || maxTokens <= 0) {
    invalidRequest("maxTokens must be a positive safe integer")
  }
  const temperature = options.temperature ?? defaults.temperature
  if (
    temperature !== undefined
    && (!Number.isFinite(temperature) || temperature < 0 || temperature > 1)
  ) {
    invalidRequest("temperature must be between 0 and 1")
  }
  const effort = options.reasoningEffort ?? defaults.reasoningEffort
  if (effort !== undefined && !isReasoningEffort(effort)) {
    unsupported("the requested reasoning effort")
  }

  const request: WireRequest = {
    max_tokens: maxTokens,
    messages: options.messages.map((message) => serializeMessage(message)),
    model: options.model,
    stream: true,
    ...(options.system === undefined ? {} : { system: options.system }),
    ...(options.tools === undefined ?
      {}
    : { tools: options.tools.map((tool) => serializeTool(tool)) }),
    ...(temperature === undefined ? {} : { temperature }),
    ...(defaults.topP === undefined ? {} : { top_p: defaults.topP }),
    ...(defaults.topK === undefined ? {} : { top_k: defaults.topK }),
    ...(options.stop === undefined ?
      {}
    : { stop_sequences: validateStop(options.stop) }),
    ...(options.sessionId === undefined ?
      {}
    : { metadata: { user_id: String(options.sessionId) } }),
    ...(effort === undefined ?
      {}
    : {
        output_config: { effort },
        thinking: { display: "summarized", type: "adaptive" },
      }),
  }
  return request
}

function serializeMessage(message: Message): WireMessage {
  const role = message.role
  if (role === "system") {
    return { content: textOnly(message.content, "system messages"), role }
  }
  const replay = replayState(message)
  const content = message.content.map((block, index) =>
    serializeBlock(block, role, replay?.content[index]),
  )
  return { content, role }
}

function serializeBlock(
  block: ContentBlock,
  role: "assistant" | "user",
  replayBlock: unknown,
): WireContent {
  switch (block.type) {
    case "text": {
      return { text: block.text, type: "text" }
    }
    case "reasoning": {
      if (role !== "assistant")
        unsupported("reasoning in non-assistant history")
      if (
        !isRecord(replayBlock)
        || replayBlock.type !== "thinking"
        || replayBlock.thinking !== block.text
        || typeof replayBlock.signature !== "string"
      ) {
        unsupported("reasoning replay without an Anthropic signature")
      }
      return {
        signature: replayBlock.signature,
        thinking: block.text,
        type: "thinking",
      }
    }
    case "tool-call": {
      if (role !== "assistant")
        unsupported("tool calls in non-assistant history")
      return {
        id: String(block.id),
        input: parseToolArguments(block.arguments),
        name: block.name,
        type: "tool_use",
      }
    }
    case "tool-result": {
      if (role !== "user") unsupported("tool results in non-user history")
      const content = block.content.map((inner) => {
        if (inner.type !== "text") unsupported("non-text tool result content")
        return { text: inner.text, type: "text" as const }
      })
      return {
        content,
        ...(block.isError === undefined ? {} : { is_error: block.isError }),
        tool_use_id: String(block.toolCallId),
        type: "tool_result",
      }
    }
    default: {
      unsupported("this message content block")
    }
  }
}

function textOnly(content: Array<ContentBlock>, location: string): string {
  return content
    .map((block) => {
      if (block.type !== "text") unsupported(`non-text content in ${location}`)
      return block.text
    })
    .join("")
}

function parseToolArguments(value: string): Record<string, unknown> {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch (error) {
    invalidRequest("tool-call arguments must be valid JSON", error)
  }
  if (!isRecord(parsed))
    invalidRequest("tool-call arguments must be a JSON object")
  return parsed
}

function serializeTool(tool: ToolSchema): WireTool {
  if (tool.name.length === 0) invalidRequest("tool names must be non-empty")
  return {
    description: tool.description,
    input_schema: tool.parameters,
    name: tool.name,
  }
}

function replayState(message: Message): ReplayState | undefined {
  if (message.source.kind !== "model") return undefined
  const value = message.source.replayState
  if (!isRecord(value) || value.type !== "anthropic-message-v1")
    return undefined
  if (!Array.isArray(value.content)) return undefined
  return { content: value.content, type: "anthropic-message-v1" }
}

function validateStop(stop: Array<string>): Array<string> {
  for (const value of stop) {
    if (value.length === 0) invalidRequest("stop sequences must be non-empty")
  }
  return [...stop]
}

function rejectUnknownOptions(options: GenerateOptions): void {
  for (const key of Object.keys(options)) {
    if (!KNOWN_OPTION_KEYS.has(key)) unsupported(`GenerateOptions.${key}`)
  }
  const purpose: unknown = options.purpose
  if (
    purpose !== undefined
    && purpose !== "compaction"
    && purpose !== "session-title"
  ) {
    unsupported("the requested call purpose")
  }
}

function isReasoningEffort(value: unknown): value is AnthropicReasoningEffort {
  return (
    value === "low"
    || value === "medium"
    || value === "high"
    || value === "xhigh"
    || value === "max"
  )
}

export function configuredModel(
  instance: ResolvedInstanceConfig,
  model: string,
): Readonly<ModelConfig> | undefined {
  return instance.models[model]
}
