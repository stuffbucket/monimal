#!/usr/bin/env node

import { randomUUID } from 'node:crypto'
import { createInterface } from 'node:readline'
import { stdin, stderr, stdout } from 'node:process'

import { parseAssistantCliOptions } from './cli-options.js'
import {
  abortAgent,
  configureAgent,
  createAssistantChatStore,
  HARNESS_SYSTEM_PROMPT,
  resolveApproval,
  runAgent,
  shutdownAgent,
} from './host/index.js'

const LEASE_TTL_MS = 30_000
const LEASE_RENEW_MS = 10_000

function write(text: string): void {
  stdout.write(text)
}

function writeError(text: string): void {
  stderr.write(`\x1b[31m${text}\x1b[0m\r\n`)
}

function printTranscript(
  messages: ReturnType<ReturnType<typeof createAssistantChatStore>['messages']>,
): void {
  for (const message of messages) {
    const label = message.role === 'user' ? 'You' : 'Maximal'
    const color = message.role === 'user' ? '\x1b[36m' : '\x1b[35m'
    write(`${color}${label}\x1b[0m\r\n${message.content}\r\n\r\n`)
  }
}

function help(): void {
  write([
    'Usage: maximal-agent --chat ID --database PATH --cwd PATH [options] [-- agent-options]',
    '',
    'Options:',
    '  --approval all|writes|none',
    '  --model PROVIDER:MODEL',
    '  --toolset ID[,ID...]',
    '  --coding-tools | --no-coding-tools',
    '  --system-prompt TEXT',
    '',
    'Commands while running: /abort, /exit',
    '',
  ].join('\r\n'))
}

function main(): void {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    help()
    return
  }
  const options = parseAssistantCliOptions(process.argv.slice(2))
  configureAgent({
    systemPrompt: options.systemPrompt ?? HARNESS_SYSTEM_PROMPT,
    codingTools: options.codingTools,
    approval: options.approval,
    cwd: options.cwd,
    toolsetIds: options.toolsetIds,
    providers: ['maximal', 'ollama'],
    autoSelectModel: true,
    ...(options.preferredModel ? { preferredModel: options.preferredModel } : {}),
  })

  const store = createAssistantChatStore(options.databasePath)
  const owner = `cli:${String(process.pid)}:${randomUUID()}`
  if (!store.acquire(options.chatId, owner, LEASE_TTL_MS)) {
    store.close()
    throw new Error('This chat is already active in another Assistant surface.')
  }
  const chat = store.open(options.chatId)
  const transcript = store.messages(options.chatId)
  let history = store.agentMessages(options.chatId)
  let running = false
  let exiting = false
  let pendingApproval: string | undefined
  const input = createInterface({ input: stdin, terminal: true })

  const prompt = (): void => {
    if (!running && !exiting) write('\x1b[36m›\x1b[0m ')
  }
  const release = (): void => {
    clearInterval(heartbeat)
    store.release(options.chatId, owner)
    store.close()
  }
  const shutdown = async (exitCode: number): Promise<void> => {
    if (exiting) return
    exiting = true
    input.close()
    abortAgent()
    await shutdownAgent()
    release()
    process.exitCode = exitCode
  }

  const heartbeat = setInterval(() => {
    if (store.renew(options.chatId, owner, LEASE_TTL_MS)) return
    writeError('The chat ownership lease was lost.')
    void shutdown(1)
  }, LEASE_RENEW_MS)
  heartbeat.unref()

  write(`\x1b[1mMaximal Assistant · ${chat.title}\x1b[0m\r\n`)
  write('Type /exit to close or /abort to stop the current run.\r\n\r\n')
  printTranscript(transcript)
  prompt()

  input.on('line', (rawLine) => {
    const line = rawLine.trim()
    if (pendingApproval) {
      const approvalId = pendingApproval
      pendingApproval = undefined
      const normalized = line.toLowerCase()
      resolveApproval({
        id: approvalId,
        allow: normalized === 'y' || normalized === 'yes' || normalized === 'a',
        remember: normalized === 'a',
      })
      return
    }
    if (line === '/exit') {
      void shutdown(0)
      return
    }
    if (line === '/abort') {
      if (running) abortAgent()
      else prompt()
      return
    }
    if (running) {
      writeError('The Assistant is still working. Use /abort to stop it.')
      return
    }
    if (line === '') {
      prompt()
      return
    }

    running = true
    store.append(options.chatId, 'user', line)
    let answer = ''
    write('\r\n\x1b[35mMaximal\x1b[0m\r\n')
    void runAgent(line, {
      onDelta(text) {
        answer += text
        write(text)
      },
      onTool(name, phase, isError) {
        const status = phase === 'start'
          ? `Running ${name}…`
          : `${name} ${isError ? 'failed' : 'finished'}.`
        write(`\r\n\x1b[2m${status}\x1b[0m\r\n`)
      },
      onApproval(request) {
        pendingApproval = request.id
        write(
          `\r\n\x1b[33m${request.summary}\x1b[0m\r\n`
          + 'Allow? [y]es / [n]o / [a]lways: ',
        )
      },
      onEnd(result) {
        if (!result.ok) writeError(result.error)
      },
    }, { initialMessages: history }).then((messages) => {
      if (answer) store.append(options.chatId, 'assistant', answer)
      if (messages) {
        history = messages
        store.saveAgentState(options.chatId, { version: 1, messages })
      }
      running = false
      pendingApproval = undefined
      write('\r\n\r\n')
      prompt()
    }).catch((error: unknown) => {
      running = false
      writeError(error instanceof Error ? error.message : String(error))
      prompt()
    })
  })
  input.on('close', () => {
    if (!exiting) void shutdown(0)
  })
  process.once('SIGINT', () => {
    if (running) abortAgent()
    else void shutdown(0)
  })
  process.once('SIGTERM', () => void shutdown(0))
}

try {
  main()
} catch (error) {
  writeError(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
