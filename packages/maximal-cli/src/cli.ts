import type {
  CommandCatalog,
  CommandContext,
  CommandDiagnostic,
  CommandOutcome,
  CommandRegistration,
  DiagnosticSink,
  JsonObject,
} from "./index.ts"
import type { ByteWriter } from "./stdio.ts"

import {
  COMMAND_EXIT_CODE,
  commandFailure,
  createCommandContext,
  exitCodeFor,
} from "./index.ts"
import { encodeJson, encodeJsonLine, readJsonObject } from "./stdio.ts"

interface CliAdapterBaseOptions {
  readonly argv: ReadonlyArray<string>
  readonly stdin: AsyncIterable<Uint8Array>
  readonly stdout: ByteWriter
  readonly stderr: ByteWriter
  readonly signal?: AbortSignal
  readonly invocationId?: string
  readonly maxInputBytes?: number
  createContext?(
    request: {
      readonly id: string
      readonly command: string
      readonly json: boolean
    },
    diagnostics: DiagnosticSink,
    signal: AbortSignal,
  ): CommandContext
}

export type CliAdapterOptions = CliAdapterBaseOptions
  & (
    | {
        readonly catalog: CommandCatalog
        readonly commands?: never
      }
    | {
        readonly catalog?: never
        readonly commands: ReadonlyArray<CommandRegistration>
      }
  )

interface ParsedArgv {
  readonly command: string
  readonly json: boolean
  readonly input: string | undefined
}

const encoder = new TextEncoder()

function parseArgv(argv: ReadonlyArray<string>): ParsedArgv | string {
  let command: string | undefined
  let input: string | undefined
  let json = false

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] ?? ""
    if (argument === "--json") {
      if (json) return "Duplicate --json."
      json = true
      continue
    }
    if (argument === "--input") {
      const value = argv[index + 1]
      if (value === undefined) {
        return "--input requires a JSON value or '-'."
      }
      if (input !== undefined) return "Duplicate --input."
      input = value
      index += 1
      continue
    }
    if (argument.startsWith("--input=")) {
      if (input !== undefined) return "Duplicate --input."
      input = argument.slice("--input=".length)
      continue
    }
    if (argument.startsWith("-")) {
      return `Unknown option: ${argument}.`
    }
    if (command !== undefined) {
      return "Exactly one command name is required."
    }
    command = argument
  }

  if (!command) {
    return "Exactly one command name is required."
  }
  return { command, json, input }
}

function commandResolver(
  options: CliAdapterOptions,
): (name: string) => CommandRegistration | undefined {
  if (options.catalog) return (name) => options.catalog.get(name)
  const commands = new Map(
    options.commands.map((command) => [command.name, command]),
  )
  return (name) => commands.get(name)
}

function diagnosticBytes(
  diagnostic: CommandDiagnostic,
  invocationId: string,
  json: boolean,
): Uint8Array {
  return json ?
      encodeJsonLine({
        type: "diagnostic",
        invocationId,
        diagnostic,
      })
    : encoder.encode(`[${diagnostic.level}] ${diagnostic.message}\n`)
}

async function writeOutcome(
  outcome: CommandOutcome<JsonObject>,
  json: boolean,
  writers: {
    readonly stdout: ByteWriter
    readonly stderr: ByteWriter
  },
): Promise<void> {
  if (json) {
    await writers.stdout.write(encodeJson(outcome))
  } else if (outcome.ok) {
    await writers.stdout.write(
      encoder.encode(`${JSON.stringify(outcome.data, undefined, 2)}\n`),
    )
  } else {
    await writers.stderr.write(
      encoder.encode(`${outcome.error.code}: ${outcome.error.message}\n`),
    )
  }
}

async function inputFor(
  parsed: ParsedArgv,
  options: CliAdapterOptions,
): Promise<JsonObject> {
  if (parsed.input === undefined) return {}
  if (parsed.input === "-") {
    return await readJsonObject(
      options.stdin,
      options.maxInputBytes ?? 1024 * 1024,
    )
  }
  return await readJsonObject(
    {
      [Symbol.asyncIterator]() {
        let done = false
        return {
          next(): Promise<IteratorResult<Uint8Array>> {
            if (done) {
              return Promise.resolve({ done: true, value: undefined })
            }
            done = true
            return Promise.resolve({
              done: false,
              value: encoder.encode(parsed.input),
            })
          },
        }
      },
    },
    options.maxInputBytes ?? 1024 * 1024,
  )
}

export async function runCli(options: CliAdapterOptions): Promise<number> {
  const parsed = parseArgv(options.argv)
  const invocationId = options.invocationId ?? "cli"
  if (typeof parsed === "string") {
    const outcome = commandFailure(invocationId, {
      kind: "invalid-input",
      code: "MAXIMAL_CLI_USAGE",
      message: parsed,
      retryable: false,
    })
    await writeOutcome(outcome, options.argv.includes("--json"), options)
    return exitCodeFor(outcome)
  }

  const command = commandResolver(options)(parsed.command)
  if (!command) {
    const outcome = commandFailure(invocationId, {
      kind: "invalid-input",
      code: "MAXIMAL_COMMAND_NOT_FOUND",
      message: `Unknown command: ${parsed.command}.`,
      retryable: false,
    })
    await writeOutcome(outcome, parsed.json, options)
    return exitCodeFor(outcome)
  }

  let input: JsonObject
  try {
    input = await inputFor(parsed, options)
  } catch (error) {
    if (
      error instanceof SyntaxError
      || error instanceof TypeError
      || error instanceof RangeError
    ) {
      const outcome = commandFailure(invocationId, {
        kind: "invalid-input",
        code: "MAXIMAL_INVALID_JSON",
        message: "The CLI input is not a valid JSON object.",
        retryable: false,
      })
      await writeOutcome(outcome, parsed.json, options)
      return exitCodeFor(outcome)
    }
    throw error
  }

  const signal = options.signal ?? new AbortController().signal
  const diagnostics: DiagnosticSink = {
    emit: async (diagnostic) => {
      await options.stderr.write(
        diagnosticBytes(diagnostic, invocationId, parsed.json),
      )
    },
  }
  const context =
    options.createContext?.(
      { id: invocationId, command: parsed.command, json: parsed.json },
      diagnostics,
      signal,
    )
    ?? createCommandContext({
      id: invocationId,
      transport: "cli",
      signal,
      diagnostics,
    })
  const outcome = await command.execute(input, context)
  await writeOutcome(outcome, parsed.json, options)
  return outcome.ok ? COMMAND_EXIT_CODE.success : exitCodeFor(outcome)
}
