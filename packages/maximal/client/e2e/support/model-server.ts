import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

export const SCRIPTED_MODEL = 'claude-haiku-4-5'
export const SCRIPTED_ANSWER = 'STREAMED_HARNESS_READY'

export interface ScriptedRequest {
  path: string
  prompt: string
  model: string | undefined
  stream: boolean | undefined
}

export interface ScriptedModel {
  baseUrl: string
  requests: ScriptedRequest[]
  stop(): Promise<void>
}

interface RequestMessage {
  role?: unknown
  content?: unknown
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((block) => (block as { text?: unknown }).text)
    .filter((text): text is string => typeof text === 'string')
    .join('\n')
}

function requestOf(path: string, body: string): ScriptedRequest {
  const parsed: unknown = JSON.parse(body)
  const candidate = parsed as {
    messages?: unknown
    model?: unknown
    stream?: unknown
  }
  const messages = candidate.messages
  const prompts = Array.isArray(messages)
    ? (messages as RequestMessage[]).filter((message) => message.role === 'user')
    : []
  return {
    path,
    prompt: textOf(prompts.at(-1)?.content),
    model: typeof candidate.model === 'string' ? candidate.model : undefined,
    stream: typeof candidate.stream === 'boolean' ? candidate.stream : undefined,
  }
}

function openAiChunk(content: string, finish: string | null): string {
  return `data: ${JSON.stringify({
    id: 'chatcmpl-scripted',
    object: 'chat.completion.chunk',
    created: 0,
    model: SCRIPTED_MODEL,
    choices: [
      {
        index: 0,
        delta: content ? { content } : {},
        finish_reason: finish,
      },
    ],
  })}\n\n`
}

function anthropicEvent(type: string, payload: unknown): string {
  return `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    request.setEncoding('utf8')
    request.on('data', (piece: string) => {
      body += piece
    })
    request.on('end', () => resolve(body))
    request.on('error', reject)
  })
}

function startReply(response: ServerResponse): void {
  response.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })
}

async function writeOpenAiReply(response: ServerResponse): Promise<void> {
  startReply(response)
  response.write(openAiChunk('', null))
  for (const piece of SCRIPTED_ANSWER.match(/.{1,4}/g) ?? []) {
    response.write(openAiChunk(piece, null))
    await new Promise((resolve) => setTimeout(resolve, 15))
  }
  response.write(openAiChunk('', 'stop'))
  response.write('data: [DONE]\n\n')
  response.end()
}

async function writeAnthropicReply(response: ServerResponse): Promise<void> {
  startReply(response)
  response.write(
    anthropicEvent('message_start', {
      type: 'message_start',
      message: {
        id: 'msg_scripted',
        type: 'message',
        role: 'assistant',
        model: SCRIPTED_MODEL,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 0 },
      },
    }),
  )
  response.write(
    anthropicEvent('content_block_start', {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'text', text: '' },
    }),
  )
  for (const piece of SCRIPTED_ANSWER.match(/.{1,4}/g) ?? []) {
    response.write(
      anthropicEvent('content_block_delta', {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: piece },
      }),
    )
    await new Promise((resolve) => setTimeout(resolve, 15))
  }
  response.write(
    anthropicEvent('content_block_stop', {
      type: 'content_block_stop',
      index: 0,
    }),
  )
  response.write(
    anthropicEvent('message_delta', {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn', stop_sequence: null },
      usage: { output_tokens: SCRIPTED_ANSWER.length },
    }),
  )
  response.write(anthropicEvent('message_stop', { type: 'message_stop' }))
  response.end()
}

export async function startScriptedModel(): Promise<ScriptedModel> {
  const requests: ScriptedRequest[] = []
  const server = createServer((request, response) => {
    void (async () => {
      const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
      if (request.method === 'GET' && path === '/api/tags') {
        response.writeHead(200, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({ models: [{ name: SCRIPTED_MODEL }] }))
        return
      }
      if (request.method === 'GET' && path === '/v1/models') {
        response.writeHead(200, { 'Content-Type': 'application/json' })
        response.end(
          JSON.stringify({
            data: [{ id: SCRIPTED_MODEL, type: 'model', display_name: SCRIPTED_MODEL }],
            has_more: false,
          }),
        )
        return
      }
      if (request.method === 'POST' && path === '/v1/chat/completions') {
        requests.push(requestOf(path, await readBody(request)))
        await writeOpenAiReply(response)
        return
      }
      if (request.method === 'POST' && path === '/v1/messages') {
        requests.push(requestOf(path, await readBody(request)))
        await writeAnthropicReply(response)
        return
      }
      response.writeHead(404).end()
    })()
  })

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address() as AddressInfo

  return {
    baseUrl: `http://127.0.0.1:${String(address.port)}`,
    requests,
    stop: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections()
        server.close((error) => (error ? reject(error) : resolve()))
      }),
  }
}
