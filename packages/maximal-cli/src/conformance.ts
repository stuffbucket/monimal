import type { CommandDefinition, JsonObject } from "./index.ts"

import { createCommandContext, executeCommand } from "./index.ts"
import { encodeJsonLine, JsonLineDecoder } from "./stdio.ts"

interface ConformanceCheck {
  readonly name: string
  readonly passed: boolean
  readonly message?: string
}

export interface ConformanceReport {
  readonly passed: boolean
  readonly checks: ReadonlyArray<ConformanceCheck>
}

type Check = () => void | Promise<void>

async function runChecks(
  checks: ReadonlyArray<readonly [name: string, check: Check]>,
): Promise<ConformanceReport> {
  const results: Array<ConformanceCheck> = []
  for (const [name, check] of checks) {
    try {
      await check()
      results.push({ name, passed: true })
    } catch (error) {
      results.push({
        name,
        passed: false,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return {
    passed: results.every((result) => result.passed),
    checks: results,
  }
}

function requireCondition(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) throw new Error(message)
}

function isObject(value: unknown): value is object {
  return value !== null && typeof value === "object"
}

export interface CommandConformanceFixture<
  Input extends JsonObject,
  Output extends JsonObject,
> {
  readonly validInput: Input
  readonly expectedOutput: Output
  readonly invalidInput: unknown
}

export async function checkCommandConformance<
  Input extends JsonObject,
  Output extends JsonObject,
>(
  command: CommandDefinition<Input, Output>,
  fixture: CommandConformanceFixture<Input, Output>,
): Promise<ConformanceReport> {
  return await runChecks([
    [
      "metadata",
      () => {
        requireCondition(
          /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u.test(command.name),
          "Command name is not portable across CLI and MCP adapters.",
        )
        requireCondition(command.title.trim().length > 0, "Title is empty.")
        requireCondition(
          command.description.trim().length > 0,
          "Description is empty.",
        )
      },
    ],
    [
      "json-schema",
      () => {
        const options = { target: "draft-2020-12" } as const
        const inputSchema =
          command.inputSchema["~standard"].jsonSchema.input(options)
        requireCondition(
          isObject(inputSchema),
          "Input JSON Schema is unavailable.",
        )
        const outputSchema =
          command.outputSchema["~standard"].jsonSchema.output(options)
        requireCondition(
          isObject(outputSchema),
          "Output JSON Schema is unavailable.",
        )
      },
    ],
    [
      "successful-execution",
      async () => {
        const outcome = await executeCommand(
          command,
          fixture.validInput,
          createCommandContext({ id: "conformance-success" }),
        )
        requireCondition(outcome.ok, "Valid input did not succeed.")
        requireCondition(
          JSON.stringify(outcome.data)
            === JSON.stringify(fixture.expectedOutput),
          "Success output does not match the fixture.",
        )
      },
    ],
    [
      "invalid-input",
      async () => {
        const outcome = await executeCommand(
          command,
          fixture.invalidInput,
          createCommandContext({ id: "conformance-invalid" }),
        )
        requireCondition(!outcome.ok, "Invalid input unexpectedly succeeded.")
        requireCondition(
          outcome.error.kind === "invalid-input",
          "Invalid input did not produce an invalid-input failure.",
        )
      },
    ],
    [
      "pre-cancelled",
      async () => {
        const abort = new AbortController()
        abort.abort()
        const outcome = await executeCommand(
          command,
          fixture.validInput,
          createCommandContext({
            id: "conformance-cancelled",
            signal: abort.signal,
          }),
        )
        requireCondition(!outcome.ok, "Pre-cancelled execution succeeded.")
        requireCondition(
          outcome.error.kind === "cancelled",
          "Pre-cancelled execution did not produce a cancelled failure.",
        )
      },
    ],
  ])
}

function concat(chunks: ReadonlyArray<Uint8Array>): Uint8Array {
  const length = chunks.reduce((total, chunk) => total + chunk.byteLength, 0)
  const output = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.byteLength
  }
  return output
}

function utf16Line(value: JsonObject): Uint8Array {
  const body = Buffer.from(`${JSON.stringify(value)}\r\n`, "utf16le")
  return concat([Uint8Array.of(0xff, 0xfe), body])
}

function decodeFragments(
  bytes: Uint8Array,
  widths: ReadonlyArray<number>,
): ReadonlyArray<JsonObject> {
  const decoder = new JsonLineDecoder()
  const records: Array<JsonObject> = []
  let offset = 0
  for (const width of widths) {
    records.push(...decoder.push(bytes.subarray(offset, offset + width)))
    offset += width
  }
  const finalChunk = decoder.push(bytes.subarray(offset))
  const finalRecords = decoder.end()
  records.push(...finalChunk, ...finalRecords)
  return records
}

export async function checkJsonLinesConformance(): Promise<ConformanceReport> {
  const fixture = { text: "héllo 🧪", count: 2 } as const
  return await runChecks([
    [
      "fragmented-utf8",
      () => {
        const records = decodeFragments(
          encodeJsonLine(fixture),
          [1, 1, 2, 3, 5],
        )
        requireCondition(
          JSON.stringify(records) === JSON.stringify([fixture]),
          "Fragmented UTF-8 changed the record.",
        )
      },
    ],
    [
      "crlf",
      () => {
        const bytes = new TextEncoder().encode(`${JSON.stringify(fixture)}\r\n`)
        const records = decodeFragments(bytes, [2, 4])
        requireCondition(
          JSON.stringify(records) === JSON.stringify([fixture]),
          "CRLF input changed the record.",
        )
      },
    ],
    [
      "powershell-utf16le",
      () => {
        const records = decodeFragments(utf16Line(fixture), [1, 1, 3, 7])
        requireCondition(
          JSON.stringify(records) === JSON.stringify([fixture]),
          "Windows PowerShell UTF-16LE input changed the record.",
        )
      },
    ],
    [
      "fragmented-record-bound",
      () => {
        const decoder = new JsonLineDecoder({ maxRecordBytes: 8 })
        const bytes = encodeJsonLine({ oversized: true })
        let rejected = false
        try {
          for (let offset = 0; offset < bytes.byteLength; offset += 4) {
            decoder.push(bytes.subarray(offset, offset + 4))
          }
        } catch {
          rejected = true
        }
        requireCondition(
          rejected,
          "A fragmented oversized JSON line was accepted.",
        )
      },
    ],
    [
      "rejects-blank-record",
      () => {
        const decoder = new JsonLineDecoder()
        let rejected = false
        try {
          decoder.push(new TextEncoder().encode("\n"))
        } catch {
          rejected = true
        }
        requireCondition(rejected, "Blank JSON line was accepted.")
      },
    ],
  ])
}

export function assertConformance(report: ConformanceReport): void {
  const failures = report.checks.filter((check) => !check.passed)
  if (failures.length === 0) return
  throw new Error(
    failures
      .map((failure) => `${failure.name}: ${failure.message ?? "failed"}`)
      .join("\n"),
  )
}
