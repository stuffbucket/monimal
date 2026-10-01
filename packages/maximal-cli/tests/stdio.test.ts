import assert from "node:assert/strict"
import test from "node:test"

import {
  CommandCatalog,
  createCommandContext,
  registerCommand,
} from "../src/index.ts"
import {
  decodeJsonObject,
  encodeJson,
  JSON_LINES_MEDIA_TYPE,
  JsonLineDecoder,
  runJsonLinesStdio,
  runJsonStdio,
  UTF8_JSON_MEDIA_TYPE,
} from "../src/stdio.ts"
import { echoCommand } from "./fixtures.ts"

function byteInput(
  chunks: ReadonlyArray<Uint8Array>,
): AsyncIterable<Uint8Array> {
  return {
    [Symbol.asyncIterator]() {
      let index = 0
      return {
        next(): Promise<IteratorResult<Uint8Array>> {
          const chunk = chunks[index]
          index += 1
          return Promise.resolve(
            chunk === undefined ?
              { done: true, value: undefined }
            : { done: false, value: chunk },
          )
        },
      }
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

function parseObject(bytes: Uint8Array | undefined): Record<string, unknown> {
  assert.ok(bytes)
  const value: unknown = JSON.parse(new TextDecoder().decode(bytes))
  assert.ok(value && typeof value === "object" && !Array.isArray(value))
  return value as Record<string, unknown>
}

function requireObject(value: unknown): Record<string, unknown> {
  assert.ok(value && typeof value === "object" && !Array.isArray(value))
  return value as Record<string, unknown>
}

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

void test("machine media types are explicit", () => {
  assert.equal(UTF8_JSON_MEDIA_TYPE, "application/json")
  assert.equal(JSON_LINES_MEDIA_TYPE, "application/x-ndjson")
})

void test("one-shot JSON rejects every malformed invocation shape", async () => {
  const records = [
    {},
    { type: "other", id: "x", command: "echo", input: {} },
    { type: "invoke", id: 1, command: "echo", input: {} },
    { type: "invoke", id: "x", command: 1, input: {} },
    { type: "invoke", id: "x", command: "echo", input: [] },
  ]

  for (const record of records) {
    const stdout: Array<Uint8Array> = []
    await runJsonStdio({
      commands: [registerCommand(echoCommand)],
      stdin: byteInput([new TextEncoder().encode(JSON.stringify(record))]),
      stdout: collectingWriter(stdout),
      stderr: collectingWriter([]),
    })
    assert.deepEqual(parseObject(stdout[0]), {
      contract: "dev.maximal.command",
      schemaVersion: 1,
      invocationId: "unknown",
      ok: false,
      error: {
        kind: "invalid-input",
        code: "MAXIMAL_INVALID_REQUEST",
        message: "The JSON request is invalid.",
        retryable: false,
      },
    })
  }
})

void test("one-shot JSON enforces aggregate byte bounds", async () => {
  const stdout: Array<Uint8Array> = []
  await runJsonStdio({
    commands: [registerCommand(echoCommand)],
    stdin: byteInput([
      new TextEncoder().encode('{"type":'),
      new TextEncoder().encode('"invoke"}'),
    ]),
    stdout: collectingWriter(stdout),
    stderr: collectingWriter([]),
    maxDocumentBytes: 8,
  })
  assert.equal(
    requireObject(parseObject(stdout[0]).error).code,
    "MAXIMAL_INVALID_JSON",
  )
})

void test("JSON output is UTF-8 without a BOM and ends in LF", () => {
  const output = encodeJson({ greeting: "héllo" })

  assert.notDeepEqual([...output.subarray(0, 3)], [0xef, 0xbb, 0xbf])
  assert.equal(output.at(-1), 0x0a)
  assert.equal(new TextDecoder().decode(output), '{"greeting":"héllo"}\n')
})

void test("JSON documents accept pretty UTF-8 and BOM-marked UTF-16BE", () => {
  assert.deepEqual(
    decodeJsonObject(
      Uint8Array.from([
        0xef,
        0xbb,
        0xbf,
        ...new TextEncoder().encode('{\n  "message": "héllo"\n}'),
      ]),
    ),
    { message: "héllo" },
  )

  const utf16be = Buffer.from('{\n  "message": "héllo"\n}', "utf16le")
  for (let index = 0; index < utf16be.length; index += 2) {
    const first = utf16be[index]
    utf16be[index] = utf16be[index + 1] ?? 0
    utf16be[index + 1] = first ?? 0
  }
  assert.deepEqual(
    decodeJsonObject(Uint8Array.from([0xfe, 0xff, ...utf16be])),
    { message: "héllo" },
  )
})

void test("one-shot JSON executes one fragmented invocation", async () => {
  const stdout: Array<Uint8Array> = []
  const stderr: Array<Uint8Array> = []
  const request = new TextEncoder().encode(
    '{\n"type":"invoke","id":"json-1","command":"echo",'
      + '"input":{"message":"through JSON"}\n}',
  )

  await runJsonStdio({
    commands: [registerCommand(echoCommand)],
    stdin: byteInput([request.subarray(0, 7), request.subarray(7)]),
    stdout: collectingWriter(stdout),
    stderr: collectingWriter(stderr),
  })

  assert.equal(stderr.length, 0)
  assert.deepEqual(JSON.parse(new TextDecoder().decode(stdout[0])), {
    contract: "dev.maximal.command",
    schemaVersion: 1,
    invocationId: "json-1",
    ok: true,
    data: { echoed: "through JSON" },
  })
})

void test("one-shot JSON returns structured malformed and unknown failures", async () => {
  for (const [input, code, invocationId, message] of [
    ["{", "MAXIMAL_INVALID_JSON", "unknown", "The JSON request is invalid."],
    [
      '{"type":"invoke","id":"missing","command":"missing","input":{}}',
      "MAXIMAL_COMMAND_NOT_FOUND",
      "missing",
      "Unknown command: missing.",
    ],
  ] as const) {
    const stdout: Array<Uint8Array> = []
    await runJsonStdio({
      commands: [registerCommand(echoCommand)],
      stdin: byteInput([new TextEncoder().encode(input)]),
      stdout: collectingWriter(stdout),
      stderr: collectingWriter([]),
    })
    assert.deepEqual(parseObject(stdout[0]), {
      contract: "dev.maximal.command",
      schemaVersion: 1,
      invocationId,
      ok: false,
      error: {
        kind: "invalid-input",
        code,
        message,
        retryable: false,
      },
    })
  }
})

void test("one-shot JSON surfaces output writer failures", async () => {
  await assert.rejects(
    runJsonStdio({
      commands: [registerCommand(echoCommand)],
      stdin: byteInput([
        new TextEncoder().encode(
          '{"type":"invoke","id":"write","command":"echo",'
            + '"input":{"message":"write"}}',
        ),
      ]),
      stdout: {
        write() {
          return Promise.reject(new Error("closed stdout"))
        },
      },
      stderr: collectingWriter([]),
    }),
    /closed stdout/u,
  )
})

void test("decoder preserves multiple records across arbitrary chunks", () => {
  const bytes = new TextEncoder().encode('{"a":1}\n{"b":2}\n')
  const decoder = new JsonLineDecoder()

  assert.deepEqual(decoder.push(bytes.subarray(0, 5)), [])
  assert.deepEqual(decoder.push(bytes.subarray(5, 11)), [{ a: 1 }])
  assert.deepEqual(decoder.push(bytes.subarray(11)), [{ b: 2 }])
  assert.deepEqual(decoder.end(), [])
})

void test("decoder enforces bounded records", () => {
  const decoder = new JsonLineDecoder({ maxRecordBytes: 4 })

  assert.throws(
    () => decoder.push(new TextEncoder().encode('{"too":"large"}')),
    /byte limit/u,
  )
})

void test("decoder enforces bounds across fragmented records", () => {
  const decoder = new JsonLineDecoder({ maxRecordBytes: 8 })
  const bytes = new TextEncoder().encode('{"too":"large"}\n')

  assert.throws(() => {
    for (let offset = 0; offset < bytes.length; offset += 4) {
      decoder.push(bytes.subarray(offset, offset + 4))
    }
  }, /byte limit/u)
})

void test("decoder bounds records rather than aggregate chunks", () => {
  const decoder = new JsonLineDecoder({ maxRecordBytes: 7 })

  assert.deepEqual(
    decoder.push(new TextEncoder().encode('{"a":1}\n{"b":2}\n')),
    [{ a: 1 }, { b: 2 }],
  )
})

void test("JSON Lines returns a structured malformed-record failure", async () => {
  const stdout: Array<Uint8Array> = []
  await runJsonLinesStdio({
    commands: [registerCommand(echoCommand)],
    stdin: byteInput([new TextEncoder().encode("{\n")]),
    stdout: collectingWriter(stdout),
    stderr: collectingWriter([]),
  })

  assert.deepEqual(parseObject(stdout[0]), {
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
})

void test("JSON Lines reports invalid requests and unknown cancellation", async () => {
  const stdout: Array<Uint8Array> = []
  await runJsonLinesStdio({
    commands: [registerCommand(echoCommand)],
    stdin: byteInput([
      new TextEncoder().encode(
        "{}\n"
          + '{"type":"invoke","id":"missing","command":"missing","input":{}}\n'
          + '{"type":"cancel","id":"absent"}\n',
      ),
    ]),
    stdout: collectingWriter(stdout),
    stderr: collectingWriter([]),
  })

  const outcomes = stdout.map((bytes) => parseObject(bytes))
  assert.deepEqual(
    outcomes.toSorted((left, right) =>
      String(left.invocationId).localeCompare(String(right.invocationId)),
    ),
    [
      {
        contract: "dev.maximal.command",
        schemaVersion: 1,
        invocationId: "absent",
        ok: false,
        error: {
          kind: "invalid-input",
          code: "MAXIMAL_INVOCATION_NOT_FOUND",
          message: "Unknown invocation: absent.",
          retryable: false,
        },
      },
      {
        contract: "dev.maximal.command",
        schemaVersion: 1,
        invocationId: "missing",
        ok: false,
        error: {
          kind: "invalid-input",
          code: "MAXIMAL_COMMAND_NOT_FOUND",
          message: "Unknown command: missing.",
          retryable: false,
        },
      },
      {
        contract: "dev.maximal.command",
        schemaVersion: 1,
        invocationId: "unknown",
        ok: false,
        error: {
          kind: "invalid-input",
          code: "MAXIMAL_INVALID_REQUEST",
          message: "The stdio request is invalid.",
          retryable: false,
        },
      },
    ],
  )
})

void test("stdio context routes diagnostics and preserves invocation data", async () => {
  const stdout: Array<Uint8Array> = []
  const stderr: Array<Uint8Array> = []
  const abort = new AbortController()
  const command = registerCommand({
    ...echoCommand,
    async execute(input, context) {
      assert.deepEqual(context.invocation, {
        id: "context",
        transport: "stdio",
        interactive: false,
      })
      assert.equal(context.signal, abort.signal)
      await context.diagnostics.emit({
        level: "warn",
        severityNumber: 13,
        message: "diagnostic",
        code: "TEST_DIAGNOSTIC",
      })
      return { echoed: input.message }
    },
  })

  await runJsonStdio({
    commands: [command],
    stdin: byteInput([
      new TextEncoder().encode(
        '{"type":"invoke","id":"context","command":"echo",'
          + '"input":{"message":"ok"}}',
      ),
    ]),
    stdout: collectingWriter(stdout),
    stderr: collectingWriter(stderr),
    signal: abort.signal,
  })

  assert.equal(parseObject(stdout[0]).ok, true)
  assert.deepEqual(parseObject(stderr[0]), {
    type: "diagnostic",
    invocationId: "context",
    diagnostic: {
      level: "warn",
      severityNumber: 13,
      message: "diagnostic",
      code: "TEST_DIAGNOSTIC",
    },
  })
})

void test("stdio adapters use an injected context factory", async () => {
  let factoryCalled = false
  const stdout: Array<Uint8Array> = []
  await runJsonStdio({
    commands: [registerCommand(echoCommand)],
    stdin: byteInput([
      new TextEncoder().encode(
        '{"type":"invoke","id":"custom","command":"echo",'
          + '"input":{"message":"custom"}}',
      ),
    ]),
    stdout: collectingWriter(stdout),
    stderr: collectingWriter([]),
    createContext(invocation, diagnostics, signal) {
      factoryCalled = true
      assert.equal(invocation.id, "custom")
      return {
        ...createCommandContext({
          id: invocation.id,
          transport: "stdio",
          diagnostics,
          signal,
        }),
      }
    },
  })
  assert.equal(factoryCalled, true)
  assert.equal(parseObject(stdout[0]).ok, true)
})

void test("JSON Lines resolves commands from a live catalog", async () => {
  const catalog = new CommandCatalog()
  catalog.register(echoCommand)
  const requests = [
    '{"type":"invoke","id":"first","command":"echo",'
      + '"input":{"message":"first"}}\n',
    '{"type":"invoke","id":"second","command":"later",'
      + '"input":{"message":"second"}}\n',
  ]
  let index = 0
  const input: AsyncIterable<Uint8Array> = {
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<IteratorResult<Uint8Array>> {
          if (index === 1) {
            catalog.register({ ...echoCommand, name: "later" })
          }
          const request = requests[index]
          index += 1
          return Promise.resolve(
            request === undefined ?
              { done: true, value: undefined }
            : {
                done: false,
                value: new TextEncoder().encode(request),
              },
          )
        },
      }
    },
  }
  const stdout: Array<Uint8Array> = []

  await runJsonLinesStdio({
    catalog,
    stdin: input,
    stdout: collectingWriter(stdout),
    stderr: collectingWriter([]),
  })

  assert.deepEqual(
    stdout.map((bytes) => parseObject(bytes).invocationId),
    ["first", "second"],
  )
})

void test(
  "JSON Lines executes independent invocations concurrently",
  { timeout: 2000 },
  async () => {
    const bothStarted = deferred()
    const release = deferred()
    const started: Array<string> = []
    const catalog = new CommandCatalog()
    catalog.register({
      ...echoCommand,
      name: "wait",
      async execute(input) {
        started.push(input.message)
        if (started.length === 2) bothStarted.resolve()
        await release.promise
        return { echoed: input.message }
      },
    })
    const stdout: Array<Uint8Array> = []
    const execution = runJsonLinesStdio({
      catalog,
      stdin: byteInput([
        new TextEncoder().encode(
          '{"type":"invoke","id":"one","command":"wait",'
            + '"input":{"message":"one"}}\n'
            + '{"type":"invoke","id":"two","command":"wait",'
            + '"input":{"message":"two"}}\n',
        ),
      ]),
      stdout: collectingWriter(stdout),
      stderr: collectingWriter([]),
    })

    await bothStarted.promise
    assert.deepEqual(started, ["one", "two"])
    release.resolve()
    await execution
    assert.deepEqual(
      stdout.map((bytes) => parseObject(bytes).invocationId).toSorted(),
      ["one", "two"],
    )
  },
)

void test(
  "JSON Lines cancellation aborts only the addressed invocation",
  { timeout: 2000 },
  async () => {
    const started = deferred()
    const catalog = new CommandCatalog()
    catalog.register({
      ...echoCommand,
      name: "wait",
      async execute(_input, context) {
        started.resolve()
        await new Promise<void>((_resolve, reject) => {
          context.signal.addEventListener(
            "abort",
            () => {
              reject(new Error("aborted"))
            },
            { once: true },
          )
        })
        return { echoed: "unreachable" }
      },
    })
    let step = 0
    const input: AsyncIterable<Uint8Array> = {
      [Symbol.asyncIterator]() {
        return {
          async next(): Promise<IteratorResult<Uint8Array>> {
            step += 1
            if (step === 1) {
              return {
                done: false,
                value: new TextEncoder().encode(
                  '{"type":"invoke","id":"cancel-me","command":"wait",'
                    + '"input":{"message":"wait"}}\n',
                ),
              }
            }
            if (step === 2) {
              await started.promise
              return {
                done: false,
                value: new TextEncoder().encode(
                  '{"type":"cancel","id":"cancel-me"}\n',
                ),
              }
            }
            return { done: true, value: undefined }
          },
        }
      },
    }
    const stdout: Array<Uint8Array> = []

    await runJsonLinesStdio({
      catalog,
      stdin: input,
      stdout: collectingWriter(stdout),
      stderr: collectingWriter([]),
    })

    const outcome = parseObject(stdout[0])
    assert.equal(outcome.ok, false)
    assert.equal(requireObject(outcome.error).code, "MAXIMAL_CANCELLED")
  },
)

void test("JSON Lines propagates process-wide cancellation", async () => {
  const abort = new AbortController()
  abort.abort()
  const stdout: Array<Uint8Array> = []

  await runJsonLinesStdio({
    commands: [registerCommand(echoCommand)],
    stdin: byteInput([
      new TextEncoder().encode(
        '{"type":"invoke","id":"global","command":"echo",'
          + '"input":{"message":"cancel"}}\n',
      ),
    ]),
    stdout: collectingWriter(stdout),
    stderr: collectingWriter([]),
    signal: abort.signal,
  })

  assert.deepEqual(parseObject(stdout[0]), {
    contract: "dev.maximal.command",
    schemaVersion: 1,
    invocationId: "global",
    ok: false,
    error: {
      kind: "cancelled",
      code: "MAXIMAL_CANCELLED",
      message: "The command was cancelled.",
      retryable: false,
    },
  })
})

void test(
  "malformed JSON Lines abort active invocations before reporting failure",
  { timeout: 2000 },
  async () => {
    const started = deferred()
    let aborted = false
    const command = registerCommand({
      ...echoCommand,
      name: "wait-for-malformed",
      async execute(_input, context) {
        started.resolve()
        await new Promise<void>((resolve) => {
          context.signal.addEventListener(
            "abort",
            () => {
              aborted = true
              resolve()
            },
            { once: true },
          )
        })
        return { echoed: "unreachable" }
      },
    })
    let step = 0
    const stdin: AsyncIterable<Uint8Array> = {
      [Symbol.asyncIterator]() {
        return {
          async next(): Promise<IteratorResult<Uint8Array>> {
            step += 1
            if (step === 1) {
              return {
                done: false,
                value: new TextEncoder().encode(
                  '{"type":"invoke","id":"active",'
                    + '"command":"wait-for-malformed",'
                    + '"input":{"message":"wait"}}\n',
                ),
              }
            }
            if (step === 2) {
              await started.promise
              return {
                done: false,
                value: new TextEncoder().encode("{\n"),
              }
            }
            return { done: true, value: undefined }
          },
        }
      },
    }
    const stdout: Array<Uint8Array> = []

    await runJsonLinesStdio({
      commands: [command],
      stdin,
      stdout: collectingWriter(stdout),
      stderr: collectingWriter([]),
    })

    assert.equal(aborted, true)
    const outcomes = stdout.map((bytes) => parseObject(bytes))
    assert.deepEqual(
      outcomes.map((outcome) => requireObject(outcome.error).code).toSorted(),
      ["MAXIMAL_CANCELLED", "MAXIMAL_INVALID_JSON_LINE"],
    )
  },
)

void test("JSON Lines propagates stdout and diagnostic writer failures", async () => {
  await assert.rejects(
    runJsonLinesStdio({
      commands: [registerCommand(echoCommand)],
      stdin: byteInput([
        new TextEncoder().encode(
          '{"type":"invoke","id":"stdout","command":"echo",'
            + '"input":{"message":"fail"}}\n',
        ),
      ]),
      stdout: {
        write() {
          return Promise.reject(new Error("stdout failed"))
        },
      },
      stderr: collectingWriter([]),
    }),
    new Error("stdout failed"),
  )

  const diagnosticCommand = registerCommand({
    ...echoCommand,
    async execute(input, context) {
      await context.diagnostics.emit({
        level: "error",
        severityNumber: 17,
        message: "cannot write",
      })
      return { echoed: input.message }
    },
  })
  const stdout: Array<Uint8Array> = []
  await runJsonLinesStdio({
    commands: [diagnosticCommand],
    stdin: byteInput([
      new TextEncoder().encode(
        '{"type":"invoke","id":"stderr","command":"echo",'
          + '"input":{"message":"fail"}}\n',
      ),
    ]),
    stdout: collectingWriter(stdout),
    stderr: {
      write() {
        return Promise.reject(new Error("stderr failed"))
      },
    },
  })
  assert.equal(
    requireObject(parseObject(stdout[0]).error).code,
    "MAXIMAL_INTERNAL",
  )
})

void test(
  "JSON Lines rejects duplicate running invocation IDs",
  { timeout: 2000 },
  async () => {
    const started = deferred()
    const release = deferred()
    const catalog = new CommandCatalog()
    catalog.register({
      ...echoCommand,
      name: "wait",
      async execute(input) {
        started.resolve()
        await release.promise
        return { echoed: input.message }
      },
    })
    let step = 0
    const input: AsyncIterable<Uint8Array> = {
      [Symbol.asyncIterator]() {
        return {
          async next(): Promise<IteratorResult<Uint8Array>> {
            step += 1
            if (step === 1) {
              return {
                done: false,
                value: new TextEncoder().encode(
                  '{"type":"invoke","id":"same","command":"wait",'
                    + '"input":{"message":"first"}}\n',
                ),
              }
            }
            if (step === 2) {
              await started.promise
              const duplicate = new TextEncoder().encode(
                '{"type":"invoke","id":"same","command":"wait",'
                  + '"input":{"message":"second"}}\n',
              )
              release.resolve()
              return { done: false, value: duplicate }
            }
            return { done: true, value: undefined }
          },
        }
      },
    }
    const stdout: Array<Uint8Array> = []

    await runJsonLinesStdio({
      catalog,
      stdin: input,
      stdout: collectingWriter(stdout),
      stderr: collectingWriter([]),
    })

    const outcomes = stdout.map((bytes) => parseObject(bytes))
    assert.equal(outcomes.length, 2)
    assert.ok(outcomes.some((outcome) => outcome.ok === true))
    assert.ok(
      outcomes.some(
        (outcome) =>
          outcome.ok === false
          && requireObject(outcome.error).code
            === "MAXIMAL_DUPLICATE_INVOCATION",
      ),
    )
  },
)
