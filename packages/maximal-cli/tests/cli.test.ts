import assert from "node:assert/strict"
import test from "node:test"

import { runCli } from "../src/cli.ts"
import {
  CommandCatalog,
  createCommandContext,
  registerCommand,
} from "../src/index.ts"
import { echoCommand } from "./fixtures.ts"

function byteInput(
  chunks: ReadonlyArray<Uint8Array> = [],
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

function text(chunks: ReadonlyArray<Uint8Array>): string {
  return new TextDecoder().decode(Buffer.concat(chunks))
}

function requireObject(value: unknown): Record<string, unknown> {
  assert.ok(value && typeof value === "object" && !Array.isArray(value))
  return value as Record<string, unknown>
}

function parseOutput(
  chunks: ReadonlyArray<Uint8Array>,
): Record<string, unknown> {
  return requireObject(JSON.parse(text(chunks)))
}

function baseOptions(argv: ReadonlyArray<string>) {
  const stdout: Array<Uint8Array> = []
  const stderr: Array<Uint8Array> = []
  return {
    options: {
      argv,
      commands: [registerCommand(echoCommand)],
      stdin: byteInput(),
      stdout: collectingWriter(stdout),
      stderr: collectingWriter(stderr),
    },
    stdout,
    stderr,
  } as const
}

void test("CLI --json executes an arbitrary command with inline input", async () => {
  const { options, stdout, stderr } = baseOptions([
    "echo",
    "--input",
    '{"message":"inline"}',
    "--json",
  ])

  assert.equal(await runCli(options), 0)
  assert.equal(stderr.length, 0)
  assert.deepEqual(JSON.parse(text(stdout)), {
    contract: "dev.maximal.command",
    schemaVersion: 1,
    invocationId: "cli",
    ok: true,
    data: { echoed: "inline" },
  })
})

void test("CLI accepts piped JSON and resolves a live catalog", async () => {
  const catalog = new CommandCatalog()
  catalog.register({ ...echoCommand, name: "dynamic" })
  const stdout: Array<Uint8Array> = []
  const stderr: Array<Uint8Array> = []

  const exitCode = await runCli({
    argv: ["--json", "dynamic", "--input=-"],
    catalog,
    stdin: byteInput([
      new TextEncoder().encode('{"message":'),
      new TextEncoder().encode('"piped"}'),
    ]),
    stdout: collectingWriter(stdout),
    stderr: collectingWriter(stderr),
  })

  assert.equal(exitCode, 0)
  assert.equal(stderr.length, 0)
  assert.deepEqual(parseOutput(stdout).data, { echoed: "piped" })
})

void test("human CLI output is readable and diagnostics remain on stderr", async () => {
  const stdout: Array<Uint8Array> = []
  const stderr: Array<Uint8Array> = []
  const command = registerCommand({
    ...echoCommand,
    async execute(input, context) {
      assert.deepEqual(context.invocation, {
        id: "cli",
        transport: "cli",
        interactive: false,
      })
      await context.diagnostics.emit({
        level: "info",
        severityNumber: 9,
        message: "working",
      })
      return { echoed: input.message }
    },
  })

  assert.equal(
    await runCli({
      argv: ["echo", '--input={"message":"human"}'],
      commands: [command],
      stdin: byteInput(),
      stdout: collectingWriter(stdout),
      stderr: collectingWriter(stderr),
    }),
    0,
  )
  assert.equal(text(stdout), '{\n  "echoed": "human"\n}\n')
  assert.equal(text(stderr), "[info] working\n")
})

void test("JSON CLI diagnostics and injected context share identity", async () => {
  const stdout: Array<Uint8Array> = []
  const stderr: Array<Uint8Array> = []
  const abort = new AbortController()
  let request:
    | {
        readonly id: string
        readonly command: string
        readonly json: boolean
      }
    | undefined
  const command = registerCommand({
    ...echoCommand,
    async execute(input, context) {
      await context.diagnostics.emit({
        level: "warn",
        severityNumber: 13,
        message: "machine",
      })
      return { echoed: input.message }
    },
  })

  assert.equal(
    await runCli({
      argv: ["echo", "--json", '--input={"message":"custom"}'],
      commands: [command],
      stdin: byteInput(),
      stdout: collectingWriter(stdout),
      stderr: collectingWriter(stderr),
      invocationId: "custom-id",
      signal: abort.signal,
      createContext(value, diagnostics, signal) {
        request = value
        assert.equal(signal, abort.signal)
        return createCommandContext({
          id: value.id,
          transport: "cli",
          diagnostics,
          signal,
        })
      },
    }),
    0,
  )
  assert.deepEqual(request, {
    id: "custom-id",
    command: "echo",
    json: true,
  })
  assert.deepEqual(JSON.parse(text(stderr)), {
    type: "diagnostic",
    invocationId: "custom-id",
    diagnostic: {
      level: "warn",
      severityNumber: 13,
      message: "machine",
    },
  })
  assert.equal(parseOutput(stdout).invocationId, "custom-id")
})

void test("CLI usage failures are structured in --json mode", async () => {
  const cases = [
    [["--json"], "Exactly one command name is required."],
    [["--json", "--json", "echo"], "Duplicate --json."],
    [["echo", "--json", "--input"], "--input requires a JSON value or '-'."],
    [["echo", "--json", "--input", "{}", "--input={}"], "Duplicate --input."],
    [["echo", "--json", "--input={}", "--input", "{}"], "Duplicate --input."],
    [["echo", "--json", "--unknown"], "Unknown option: --unknown."],
    [["echo", "--json", "extra"], "Exactly one command name is required."],
  ] as const

  for (const [argv, message] of cases) {
    const { options, stdout, stderr } = baseOptions(argv)
    assert.equal(await runCli(options), 2)
    assert.equal(stderr.length, 0)
    assert.deepEqual(JSON.parse(text(stdout)), {
      contract: "dev.maximal.command",
      schemaVersion: 1,
      invocationId: "cli",
      ok: false,
      error: {
        kind: "invalid-input",
        code: "MAXIMAL_CLI_USAGE",
        message,
        retryable: false,
      },
    })
  }

  const sparse = baseOptions(Array<string>(1))
  assert.equal(await runCli(sparse.options), 2)
  assert.equal(
    text(sparse.stderr),
    "MAXIMAL_CLI_USAGE: Exactly one command name is required.\n",
  )
})

void test("CLI reports unknown commands and command validation failures", async () => {
  const unknown = baseOptions(["missing"])
  assert.equal(await runCli(unknown.options), 2)
  assert.equal(unknown.stdout.length, 0)
  assert.equal(
    text(unknown.stderr),
    "MAXIMAL_COMMAND_NOT_FOUND: Unknown command: missing.\n",
  )

  const invalid = baseOptions(["echo", "--json"])
  assert.equal(await runCli(invalid.options), 2)
  assert.equal(
    requireObject(parseOutput(invalid.stdout).error).code,
    "MAXIMAL_INVALID_INPUT",
  )
  assert.equal(invalid.stderr.length, 0)
})

void test("CLI rejects malformed, non-object, and oversized JSON input", async () => {
  for (const input of ["{", "[]"]) {
    const { options, stdout } = baseOptions([
      "echo",
      "--json",
      `--input=${input}`,
    ])
    assert.equal(await runCli(options), 2)
    assert.deepEqual(requireObject(parseOutput(stdout).error), {
      kind: "invalid-input",
      code: "MAXIMAL_INVALID_JSON",
      message: "The CLI input is not a valid JSON object.",
      retryable: false,
    })
  }

  const stdout: Array<Uint8Array> = []
  assert.equal(
    await runCli({
      argv: ["echo", "--json", "--input", "-"],
      commands: [registerCommand(echoCommand)],
      stdin: byteInput([new TextEncoder().encode('{"message":"too long"}')]),
      stdout: collectingWriter(stdout),
      stderr: collectingWriter([]),
      maxInputBytes: 4,
    }),
    2,
  )
  assert.equal(
    requireObject(parseOutput(stdout).error).code,
    "MAXIMAL_INVALID_JSON",
  )

  const inline = baseOptions([
    "echo",
    "--json",
    '--input={"message":"too long"}',
  ])
  assert.equal(await runCli({ ...inline.options, maxInputBytes: 4 }), 2)
  assert.equal(
    requireObject(parseOutput(inline.stdout).error).code,
    "MAXIMAL_INVALID_JSON",
  )
})

void test("CLI does not disguise unexpected stdin failures", async () => {
  const failure = new Error("stdin failed")
  await assert.rejects(
    runCli({
      argv: ["echo", "--json", "--input", "-"],
      commands: [registerCommand(echoCommand)],
      stdin: {
        [Symbol.asyncIterator]() {
          return {
            next(): Promise<IteratorResult<Uint8Array>> {
              return Promise.reject(failure)
            },
          }
        },
      },
      stdout: collectingWriter([]),
      stderr: collectingWriter([]),
    }),
    failure,
  )
})

void test("CLI propagates writer failures", async () => {
  await assert.rejects(
    runCli({
      argv: ["echo", "--json", '--input={"message":"write"}'],
      commands: [registerCommand(echoCommand)],
      stdin: byteInput(),
      stdout: {
        write() {
          return Promise.reject(new Error("closed stdout"))
        },
      },
      stderr: collectingWriter([]),
    }),
    new Error("closed stdout"),
  )
})
