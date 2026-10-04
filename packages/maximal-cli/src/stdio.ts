import type {
  CommandContext,
  CommandCatalog,
  CommandDiagnostic,
  CommandFailure,
  CommandOutcome,
  CommandRegistration,
  DiagnosticSink,
  JsonObject,
} from "./index.ts"

import { commandFailure, createCommandContext } from "./index.ts"

export const JSON_LINES_MEDIA_TYPE = "application/x-ndjson"
export const UTF8_JSON_MEDIA_TYPE = "application/json"

interface DiagnosticRecord {
  readonly type: "diagnostic"
  readonly invocationId: string
  readonly diagnostic: CommandDiagnostic
}

export type MachineRecord = DiagnosticRecord | JsonObject

export interface ByteWriter {
  write(chunk: Uint8Array): Promise<void>
}

interface StdioInvocation {
  readonly type: "invoke"
  readonly id: string
  readonly command: string
  readonly input: JsonObject
}

interface StdioCancellation {
  readonly type: "cancel"
  readonly id: string
}

interface StdioAdapterBaseOptions {
  readonly stdin: AsyncIterable<Uint8Array>
  readonly stdout: ByteWriter
  readonly stderr: ByteWriter
  readonly signal?: AbortSignal
  readonly maxDocumentBytes?: number
  createContext?(
    invocation: StdioInvocation,
    diagnostics: DiagnosticSink,
    signal: AbortSignal,
  ): CommandContext
}

export type StdioAdapterOptions = StdioAdapterBaseOptions
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

export function encodeJson(value: object): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(value)}\n`)
}

export function encodeJsonLine(value: MachineRecord): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(value)}\n`)
}

type SupportedEncoding = "utf8" | "utf-16le" | "utf-16be"

function hasPrefix(bytes: Uint8Array, prefix: ReadonlyArray<number>): boolean {
  return (
    bytes.byteLength >= prefix.length
    && prefix.every((value, index) => bytes[index] === value)
  )
}

function append(left: Uint8Array, right: Uint8Array): Uint8Array<ArrayBuffer> {
  const combined = new Uint8Array(left.byteLength + right.byteLength)
  combined.set(left)
  combined.set(right, left.byteLength)
  return combined
}

function isJsonObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

export function decodeJsonObject(
  bytes: Uint8Array,
  maxDocumentBytes = 1024 * 1024,
): JsonObject {
  if (bytes.byteLength > maxDocumentBytes) {
    throw new RangeError(
      `JSON document exceeds the ${maxDocumentBytes} byte limit.`,
    )
  }
  const detection = detectEncoding(bytes, true)
  if (!detection) throw new SyntaxError("JSON encoding is incomplete.")
  const text = new TextDecoder(detection, {
    fatal: true,
  }).decode(bytes)
  const value: unknown = JSON.parse(text)
  if (!isJsonObject(value)) {
    throw new TypeError("The JSON document must contain an object.")
  }
  return value
}

function detectEncoding(
  bytes: Uint8Array,
  atEnd: boolean,
): SupportedEncoding | undefined {
  const first = bytes[0]
  if (hasPrefix(bytes, [0xff, 0xfe])) {
    return "utf-16le"
  }
  if (hasPrefix(bytes, [0xfe, 0xff])) {
    return "utf-16be"
  }
  if (
    !atEnd
    && ((first === 0xef && bytes.byteLength < 3)
      || ((first === 0xff || first === 0xfe) && bytes.byteLength < 2))
  ) {
    return undefined
  }
  return "utf8"
}

export interface JsonLineDecoderOptions {
  readonly maxRecordBytes?: number
}

export class JsonLineDecoder {
  readonly #maxRecordBytes: number
  #encoding: SupportedEncoding | undefined
  #decoder: TextDecoder | undefined
  #pendingBytes: Uint8Array = new Uint8Array()
  #pendingText = ""

  constructor(options: JsonLineDecoderOptions = {}) {
    this.#maxRecordBytes = options.maxRecordBytes ?? 1024 * 1024
  }

  push(chunk: Uint8Array): ReadonlyArray<JsonObject> {
    if (chunk.byteLength === 0) return []
    this.#pendingBytes = append(this.#pendingBytes, chunk)
    const initialized = this.#initializeDecoder(false)
    if (!initialized) return []
    return this.#decodePending(true)
  }

  end(): ReadonlyArray<JsonObject> {
    this.#initializeDecoder(true)
    const records = this.#decodePending(false)
    const tail = this.#pendingText
    this.#pendingText = ""
    if (tail.length === 0) return records
    return [...records, this.#parseLine(tail)]
  }

  #initializeDecoder(atEnd: boolean): boolean {
    if (this.#decoder) return true
    const bytes = this.#pendingBytes
    if (bytes.byteLength === 0) {
      if (atEnd) {
        this.#encoding = "utf8"
        this.#decoder = new TextDecoder("utf-8", { fatal: true })
      }
      return atEnd
    }

    const detection = detectEncoding(bytes, atEnd)
    if (!detection) return false
    this.#encoding = detection
    this.#decoder = new TextDecoder(this.#encoding, {
      fatal: true,
    })
    return true
  }

  #decodePending(stream: boolean): ReadonlyArray<JsonObject> {
    if (!this.#decoder) return []
    this.#pendingText += this.#decoder.decode(this.#pendingBytes, { stream })
    this.#pendingBytes = new Uint8Array()
    const lines = this.#pendingText.split("\n")
    this.#pendingText = lines.pop() ?? ""
    this.#assertRecordSize(this.#pendingText)
    return lines.map((line) => this.#parseLine(line))
  }

  #parseLine(line: string): JsonObject {
    this.#assertRecordSize(line)
    if (line.length === 0 || line === "\r") {
      throw new SyntaxError("JSON lines must not contain blank records.")
    }
    const value: unknown = JSON.parse(line)
    if (!isJsonObject(value)) {
      throw new TypeError("Each JSON line must contain an object.")
    }
    return value
  }

  #assertRecordSize(value: string): void {
    const byteLength =
      this.#encoding === "utf8" ?
        new TextEncoder().encode(value).byteLength
      : value.length * 2
    if (byteLength > this.#maxRecordBytes) {
      throw new RangeError(
        `JSON line exceeds the ${this.#maxRecordBytes} byte limit.`,
      )
    }
  }
}

function parseInvocation(record: JsonObject): StdioInvocation | undefined {
  return (
      record.type === "invoke"
        && typeof record.id === "string"
        && typeof record.command === "string"
        && isJsonObject(record.input)
    ) ?
      {
        type: "invoke",
        id: record.id,
        command: record.command,
        input: record.input,
      }
    : undefined
}

function parseCancellation(record: JsonObject): StdioCancellation | undefined {
  return record.type === "cancel" && typeof record.id === "string" ?
      { type: "cancel", id: record.id }
    : undefined
}

function protocolFailure(
  invocationId: string,
  code: string,
  message: string,
): CommandFailure {
  return commandFailure(invocationId, {
    kind: "invalid-input",
    code,
    message,
    retryable: false,
  })
}

async function collectBytes(
  input: AsyncIterable<Uint8Array>,
  maxDocumentBytes: number,
): Promise<Uint8Array> {
  let bytes = new Uint8Array()
  for await (const chunk of input) {
    if (bytes.byteLength + chunk.byteLength > maxDocumentBytes) {
      throw new RangeError(
        `JSON document exceeds the ${maxDocumentBytes} byte limit.`,
      )
    }
    bytes = append(bytes, chunk)
  }
  return bytes
}

export async function readJsonObject(
  input: AsyncIterable<Uint8Array>,
  maxDocumentBytes = 1024 * 1024,
): Promise<JsonObject> {
  return decodeJsonObject(
    await collectBytes(input, maxDocumentBytes),
    maxDocumentBytes,
  )
}

function invalidWireInput(code: string, message: string): CommandFailure {
  return protocolFailure("unknown", code, message)
}

async function executeInvocation(
  invocation: StdioInvocation,
  execution: {
    readonly options: StdioAdapterOptions
    readonly commandFor: (name: string) => CommandRegistration | undefined
    readonly signal?: AbortSignal
    readonly diagnosticWriter?: ByteWriter
  },
): Promise<CommandOutcome<JsonObject>> {
  const command = execution.commandFor(invocation.command)
  if (!command) {
    return protocolFailure(
      invocation.id,
      "MAXIMAL_COMMAND_NOT_FOUND",
      `Unknown command: ${invocation.command}.`,
    )
  }

  const signal =
    execution.signal ?? execution.options.signal ?? new AbortController().signal
  const diagnosticWriter =
    execution.diagnosticWriter ?? execution.options.stderr
  const diagnostics: DiagnosticSink = {
    emit: async (diagnostic) => {
      await diagnosticWriter.write(
        encodeJsonLine({
          type: "diagnostic",
          invocationId: invocation.id,
          diagnostic,
        }),
      )
    },
  }
  const context =
    execution.options.createContext?.(invocation, diagnostics, signal)
    ?? createCommandContext({
      id: invocation.id,
      transport: "stdio",
      signal,
      diagnostics,
    })
  return await command.execute(invocation.input, context)
}

export async function runJsonStdio(
  options: StdioAdapterOptions,
): Promise<void> {
  const commandFor = commandResolver(options)
  let record: JsonObject
  try {
    record = await readJsonObject(
      options.stdin,
      options.maxDocumentBytes ?? 1024 * 1024,
    )
  } catch (error) {
    if (
      error instanceof SyntaxError
      || error instanceof TypeError
      || error instanceof RangeError
    ) {
      await options.stdout.write(
        encodeJson(
          invalidWireInput(
            "MAXIMAL_INVALID_JSON",
            "The JSON request is invalid.",
          ),
        ),
      )
      return
    }
    throw error
  }

  const invocation = parseInvocation(record)
  const outcome =
    invocation ?
      await executeInvocation(invocation, { options, commandFor })
    : invalidWireInput(
        "MAXIMAL_INVALID_REQUEST",
        "The JSON request is invalid.",
      )
  await options.stdout.write(encodeJson(outcome))
}

export async function runJsonLinesStdio(
  options: StdioAdapterOptions,
): Promise<void> {
  await new JsonLinesSession(options).run()
}

class JsonLinesSession {
  readonly #commandFor: (name: string) => CommandRegistration | undefined
  readonly #decoder: JsonLineDecoder
  readonly #options: StdioAdapterOptions
  readonly #running = new Map<string, AbortController>()
  readonly #stderr: ByteWriter
  readonly #stdout: ByteWriter
  readonly #tasks = new Set<Promise<void>>()
  #taskError: Error | undefined

  constructor(options: StdioAdapterOptions) {
    this.#options = options
    this.#commandFor = commandResolver(options)
    this.#stdout = serialWriter(options.stdout)
    this.#stderr = serialWriter(options.stderr)
    this.#decoder = new JsonLineDecoder({
      ...(options.maxDocumentBytes === undefined ?
        {}
      : { maxRecordBytes: options.maxDocumentBytes }),
    })
  }

  async run(): Promise<void> {
    for await (const chunk of this.#options.stdin) {
      const records = this.#decode(() => this.#decoder.push(chunk))
      if (!records) {
        await this.#finishInvalidInput()
        return
      }
      for (const record of records) this.#dispatch(record)
    }
    const records = this.#decode(() => this.#decoder.end())
    if (!records) {
      await this.#finishInvalidInput()
      return
    }
    for (const record of records) this.#dispatch(record)
    await this.#settle()
  }

  #decode(
    decode: () => ReadonlyArray<JsonObject>,
  ): ReadonlyArray<JsonObject> | undefined {
    try {
      return decode()
    } catch (error) {
      if (
        error instanceof SyntaxError
        || error instanceof TypeError
        || error instanceof RangeError
      ) {
        return undefined
      }
      throw error
    }
  }

  #dispatch(record: JsonObject): void {
    const cancellation = parseCancellation(record)
    if (cancellation) {
      const controller = this.#running.get(cancellation.id)
      if (controller) {
        controller.abort()
      } else {
        this.#scheduleWrite(
          protocolFailure(
            cancellation.id,
            "MAXIMAL_INVOCATION_NOT_FOUND",
            `Unknown invocation: ${cancellation.id}.`,
          ),
        )
      }
      return
    }

    const invocation = parseInvocation(record)
    if (!invocation) {
      this.#scheduleWrite(
        protocolFailure(
          "unknown",
          "MAXIMAL_INVALID_REQUEST",
          "The stdio request is invalid.",
        ),
      )
      return
    }
    if (this.#running.has(invocation.id)) {
      this.#scheduleWrite(
        protocolFailure(
          invocation.id,
          "MAXIMAL_DUPLICATE_INVOCATION",
          `Invocation is already running: ${invocation.id}.`,
        ),
      )
      return
    }

    this.#start(invocation)
  }

  #start(invocation: StdioInvocation): void {
    const controller = new AbortController()
    const abort = () => {
      controller.abort()
    }
    if (this.#options.signal?.aborted) controller.abort()
    else this.#options.signal?.addEventListener("abort", abort, { once: true })
    this.#running.set(invocation.id, controller)

    const task = executeInvocation(invocation, {
      options: this.#options,
      commandFor: this.#commandFor,
      signal: controller.signal,
      diagnosticWriter: this.#stderr,
    })
      .then(async (outcome) => {
        await this.#stdout.write(encodeJson(outcome))
      })
      .catch((error: unknown) => {
        this.#taskError ??= errorValue(error)
      })
      .finally(() => {
        this.#options.signal?.removeEventListener("abort", abort)
        if (this.#running.get(invocation.id) === controller) {
          this.#running.delete(invocation.id)
        }
        this.#tasks.delete(task)
      })
    this.#tasks.add(task)
  }

  #scheduleWrite(outcome: CommandFailure): void {
    const task = this.#stdout
      .write(encodeJson(outcome))
      .catch((error: unknown) => {
        this.#taskError ??= errorValue(error)
      })
      .finally(() => {
        this.#tasks.delete(task)
      })
    this.#tasks.add(task)
  }

  async #finishInvalidInput(): Promise<void> {
    for (const controller of this.#running.values()) controller.abort()
    this.#scheduleWrite(
      invalidWireInput(
        "MAXIMAL_INVALID_JSON_LINE",
        "The JSON Lines request is invalid.",
      ),
    )
    await this.#settle()
  }

  async #settle(): Promise<void> {
    await Promise.all(this.#tasks)
    if (this.#taskError) throw this.#taskError
  }
}

function errorValue(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

function serialWriter(writer: ByteWriter): ByteWriter {
  let pending = Promise.resolve()
  return {
    write(chunk) {
      const write = pending.then(async () => {
        await writer.write(chunk)
      })
      pending = write
      return write
    },
  }
}

function commandResolver(
  options: StdioAdapterOptions,
): (name: string) => CommandRegistration | undefined {
  if (options.catalog) {
    return (name) => options.catalog.get(name)
  }
  const commands = new Map(
    options.commands.map((command) => [command.name, command]),
  )
  return (name) => commands.get(name)
}
