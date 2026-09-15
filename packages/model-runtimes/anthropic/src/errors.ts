import { LlmError } from "@deepseek-ai/dsh-llm"

export function unsupported(feature: string): never {
  throw new LlmError(
    `anthropic-provider: ${feature} is not supported by the Anthropic Messages adapter`,
    "UNSUPPORTED",
  )
}

export function invalidRequest(message: string, cause?: unknown): never {
  throw new LlmError(`anthropic-provider: ${message}`, "INVALID_REQUEST", {
    ...(cause === undefined ? {} : { cause }),
  })
}

export function protocolError(message: string, cause?: unknown): never {
  throw new LlmError(`anthropic-provider: ${message}`, "MALFORMED_RESPONSE", {
    ...(cause === undefined ? {} : { cause }),
  })
}

export function streamClosed(message: string): never {
  throw new LlmError(`anthropic-provider: ${message}`, "STREAM_CLOSED")
}

export function aborted(cause?: unknown): never {
  throw new LlmError("anthropic-provider: request aborted", "ABORTED", {
    ...(cause === undefined ? {} : { cause }),
  })
}
