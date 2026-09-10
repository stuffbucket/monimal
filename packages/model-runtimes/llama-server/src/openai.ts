import {
  LlmError,
  type ContentBlock,
  type GenerateOptions,
  type Message,
  type ToolCallBlock,
} from "@deepseek-ai/dsh-llm"

interface OpenAiTextMessage {
  readonly role: "system" | "user"
  readonly content: string
}

interface OpenAiAssistantMessage {
  readonly role: "assistant"
  readonly content: string | null
  readonly tool_calls?: ReadonlyArray<{
    readonly id: string
    readonly type: "function"
    readonly function: {
      readonly name: string
      readonly arguments: string
    }
  }>
}

interface OpenAiToolMessage {
  readonly role: "tool"
  readonly tool_call_id: string
  readonly content: string
}

type OpenAiMessage =
  OpenAiTextMessage | OpenAiAssistantMessage | OpenAiToolMessage

export interface OpenAiChatRequest {
  readonly model: string
  readonly messages: ReadonlyArray<OpenAiMessage>
  readonly stream: true
  readonly stream_options: { readonly include_usage: true }
  readonly tools?: ReadonlyArray<{
    readonly type: "function"
    readonly function: {
      readonly name: string
      readonly description: string
      readonly parameters: Record<string, unknown>
    }
  }>
  readonly temperature?: number
  readonly max_tokens?: number
  readonly stop?: ReadonlyArray<string>
}

function unsupported(block: ContentBlock): never {
  throw new LlmError(
    `llama-server: unsupported request content block "${block.type}"`,
    "INVALID_REQUEST",
  )
}

function textualContent(blocks: ReadonlyArray<ContentBlock>): string {
  let content = ""
  for (const block of blocks) {
    if (block.type === "text" || block.type === "reasoning") {
      content += block.text
      continue
    }
    unsupported(block)
  }
  return content
}

function toolResultContent(block: ContentBlock): string {
  if (block.type !== "tool-result") return unsupported(block)
  return textualContent(block.content)
}

function assistantMessage(message: Message): OpenAiAssistantMessage {
  let content = ""
  const calls: Array<ToolCallBlock> = []
  for (const block of message.content) {
    switch (block.type) {
      case "text": {
        content += block.text

        break
      }
      case "reasoning": {
        // Reasoning is not replayed as visible assistant content.

        break
      }
      case "tool-call": {
        calls.push(block)

        break
      }
      default: {
        unsupported(block)
      }
    }
  }
  return {
    role: "assistant",
    content: content.length === 0 ? null : content,
    ...(calls.length === 0 ?
      {}
    : {
        tool_calls: calls.map((call) => ({
          id: call.id,
          type: "function" as const,
          function: { name: call.name, arguments: call.arguments },
        })),
      }),
  }
}

function serializeMessage(message: Message): ReadonlyArray<OpenAiMessage> {
  if (message.role === "assistant") return [assistantMessage(message)]

  const toolResults = message.content.filter(
    (block) => block.type === "tool-result",
  )
  if (toolResults.length > 0) {
    if (
      toolResults.length !== message.content.length
      || message.role !== "user"
    ) {
      throw new LlmError(
        "llama-server: tool results must be standalone user messages",
        "INVALID_REQUEST",
      )
    }
    return toolResults.map((block) => ({
      role: "tool",
      tool_call_id: block.toolCallId,
      content: toolResultContent(block),
    }))
  }

  return [{ role: message.role, content: textualContent(message.content) }]
}

export function serializeOpenAiRequest(
  options: GenerateOptions,
  modelId: string,
): OpenAiChatRequest {
  if (options.reasoningEffort !== undefined) {
    throw new LlmError(
      "llama-server: reasoning effort is not supported by the OpenAI-compatible endpoint",
      "INVALID_REQUEST",
    )
  }
  const messages: Array<OpenAiMessage> = []
  if (options.system !== undefined) {
    messages.push({ role: "system", content: options.system })
  }
  for (const message of options.messages)
    messages.push(...serializeMessage(message))

  return {
    model: modelId,
    messages,
    stream: true,
    stream_options: { include_usage: true },
    ...(options.tools === undefined ?
      {}
    : {
        tools: options.tools.map((tool) => ({
          type: "function" as const,
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          },
        })),
      }),
    ...(options.temperature === undefined ?
      {}
    : {
        temperature: options.temperature,
      }),
    ...(options.maxTokens === undefined ?
      {}
    : {
        max_tokens: options.maxTokens,
      }),
    ...(options.stop === undefined ? {} : { stop: options.stop }),
  }
}
