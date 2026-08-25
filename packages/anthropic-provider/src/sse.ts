import { protocolError, streamClosed } from "./errors.ts"

export interface SseEvent {
  data: string
  event: string
}

export async function* parseSse(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<SseEvent> {
  const reader = stream.getReader()
  const decoder = new TextDecoder("utf-8", { fatal: true })
  let buffer = ""
  let eventName = ""
  let dataLines: Array<string> = []
  let terminated = false

  const dispatch = (): SseEvent | undefined => {
    if (dataLines.length === 0) {
      eventName = ""
      return undefined
    }
    const event = { event: eventName || "message", data: dataLines.join("\n") }
    eventName = ""
    dataLines = []
    return event
  }

  try {
    while (true) {
      const read = await reader.read()
      if (read.done) {
        buffer += decoder.decode()
        break
      }
      buffer += decoder.decode(read.value, { stream: true })
      while (true) {
        const lineEnd = findLineEnd(buffer)
        if (lineEnd === undefined) break
        const line = buffer.slice(0, lineEnd.index)
        buffer = buffer.slice(lineEnd.index + lineEnd.length)
        if (line.length === 0) {
          const event = dispatch()
          if (event) yield event
          continue
        }
        if (line.startsWith(":")) continue
        const separator = line.indexOf(":")
        const field = separator === -1 ? line : line.slice(0, separator)
        let value = separator === -1 ? "" : line.slice(separator + 1)
        if (value.startsWith(" ")) value = value.slice(1)
        if (field === "event") eventName = value
        else if (field === "data") dataLines.push(value)
      }
    }
    if (buffer.length > 0 || eventName.length > 0 || dataLines.length > 0) {
      streamClosed("SSE stream ended with an unterminated event")
    }
    terminated = true
  } catch (error) {
    if (error instanceof TypeError) {
      protocolError("failed to decode the SSE stream", error)
    }
    throw error
  } finally {
    if (!terminated) await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}

function findLineEnd(
  value: string,
): { index: number; length: number } | undefined {
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    if (character === "\n") return { index, length: 1 }
    if (character === "\r") {
      if (index + 1 === value.length) return undefined
      return { index, length: value[index + 1] === "\n" ? 2 : 1 }
    }
  }
  return undefined
}
