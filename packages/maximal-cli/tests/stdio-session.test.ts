import assert from "node:assert/strict"
import test from "node:test"

import { registerCommand } from "../src/index.ts"
import { runJsonLinesStdio } from "../src/stdio.ts"
import { echoCommand } from "./fixtures.ts"

function deferred(): {
  readonly promise: Promise<void>
  readonly resolve: () => void
} {
  let resolvePromise: (() => void) | undefined
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve
  })
  return {
    promise,
    resolve() {
      resolvePromise?.()
    },
  }
}

function collectingWriter(chunks: Array<Uint8Array>) {
  return {
    write(chunk: Uint8Array) {
      chunks.push(chunk)
      return Promise.resolve()
    },
  }
}

function byteInput(input: string): AsyncIterable<Uint8Array> {
  let sent = false
  return {
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<IteratorResult<Uint8Array>> {
          if (sent) {
            return Promise.resolve({ done: true, value: undefined })
          }
          sent = true
          return Promise.resolve({
            done: false,
            value: new TextEncoder().encode(input),
          })
        },
      }
    },
  }
}

function parse(bytes: Uint8Array | undefined): Record<string, unknown> {
  assert.ok(bytes)
  const value: unknown = JSON.parse(new TextDecoder().decode(bytes))
  assert.ok(value && typeof value === "object" && !Array.isArray(value))
  return value as Record<string, unknown>
}

void test(
  "JSON Lines propagates cancellation raised after execution starts",
  { timeout: 2000 },
  async () => {
    const started = deferred()
    const abort = new AbortController()
    const command = registerCommand({
      ...echoCommand,
      name: "wait",
      async execute(_input, context) {
        started.resolve()
        await new Promise<void>((resolve) => {
          context.signal.addEventListener("abort", () => resolve(), {
            once: true,
          })
        })
        return { echoed: "cancelled" }
      },
    })
    const stdout: Array<Uint8Array> = []
    const execution = runJsonLinesStdio({
      commands: [command],
      stdin: byteInput(
        '{"type":"invoke","id":"late","command":"wait",'
          + '"input":{"message":"wait"}}\n',
      ),
      stdout: collectingWriter(stdout),
      stderr: collectingWriter([]),
      signal: abort.signal,
    })

    await started.promise
    abort.abort()
    await execution
    assert.deepEqual(parse(stdout[0]), {
      contract: "dev.maximal.command",
      schemaVersion: 1,
      invocationId: "late",
      ok: false,
      error: {
        kind: "cancelled",
        code: "MAXIMAL_CANCELLED",
        message: "The command was cancelled.",
        retryable: false,
      },
    })
  },
)

void test("JSON Lines permits invocation ID reuse after completion", async () => {
  const firstWritten = deferred()
  const chunks = [
    '{"type":"invoke","id":"reused","command":"echo",'
      + '"input":{"message":"first"}}\n',
    '{"type":"invoke","id":"reused","command":"echo",'
      + '"input":{"message":"second"}}\n',
  ]
  let index = 0
  const stdout: Array<Uint8Array> = []

  await runJsonLinesStdio({
    commands: [registerCommand(echoCommand)],
    stdin: {
      [Symbol.asyncIterator]() {
        return {
          async next(): Promise<IteratorResult<Uint8Array>> {
            if (index === 1) {
              await firstWritten.promise
              await new Promise<void>((resolve) => {
                setImmediate(resolve)
              })
            }
            const chunk = chunks[index]
            index += 1
            return chunk === undefined ?
                { done: true, value: undefined }
              : {
                  done: false,
                  value: new TextEncoder().encode(chunk),
                }
          },
        }
      },
    },
    stdout: {
      write(chunk) {
        stdout.push(chunk)
        firstWritten.resolve()
        return Promise.resolve()
      },
    },
    stderr: collectingWriter([]),
  })

  assert.deepEqual(
    stdout.map((bytes) => parse(bytes)),
    [
      {
        contract: "dev.maximal.command",
        schemaVersion: 1,
        invocationId: "reused",
        ok: true,
        data: { echoed: "first" },
      },
      {
        contract: "dev.maximal.command",
        schemaVersion: 1,
        invocationId: "reused",
        ok: true,
        data: { echoed: "second" },
      },
    ],
  )
})

void test("JSON Lines validates EOF tails and configured record bounds", async () => {
  for (const [input, maxDocumentBytes] of [
    ["{", undefined],
    ['{"type":"invoke","id":"large","command":"echo","input":{}}', 8],
  ] as const) {
    const stdout: Array<Uint8Array> = []
    await runJsonLinesStdio({
      commands: [registerCommand(echoCommand)],
      stdin: byteInput(input),
      stdout: collectingWriter(stdout),
      stderr: collectingWriter([]),
      ...(maxDocumentBytes === undefined ? {} : { maxDocumentBytes }),
    })
    assert.deepEqual(parse(stdout[0]), {
      contract: "dev.maximal.command",
      schemaVersion: 1,
      invocationId: "unknown",
      ok: false,
      error: {
        kind: "invalid-input",
        code: "MAXIMAL_INVALID_JSON_LINE",
        message: "The JSON Lines request is invalid.",
        retryable: false,
      },
    })
  }
})
