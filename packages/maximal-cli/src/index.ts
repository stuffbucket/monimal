import type {
  StandardJSONSchemaV1,
  StandardSchemaV1,
} from "@standard-schema/spec"

export const MAXIMAL_COMMAND_CONTRACT = "dev.maximal.command"
export const MAXIMAL_COMMAND_CONTRACT_VERSION = 1

export type JsonPrimitive = boolean | number | string | null
export type JsonValue = JsonPrimitive | JsonObject | ReadonlyArray<JsonValue>
export interface JsonObject {
  readonly [key: string]: JsonValue
}

export interface CommandSchema<Input = unknown, Output = Input> {
  readonly "~standard": StandardSchemaV1.Props<Input, Output>
    & StandardJSONSchemaV1.Props<Input, Output>
}

export type DiagnosticLevel =
  "trace" | "debug" | "info" | "warn" | "error" | "fatal"

export const DIAGNOSTIC_SEVERITY_NUMBER = {
  trace: 1,
  debug: 5,
  info: 9,
  warn: 13,
  error: 17,
  fatal: 21,
} as const satisfies Record<DiagnosticLevel, number>

export interface CommandDiagnostic {
  readonly level: DiagnosticLevel
  readonly severityNumber: (typeof DIAGNOSTIC_SEVERITY_NUMBER)[DiagnosticLevel]
  readonly message: string
  readonly code?: string
  readonly details?: JsonObject
}

export interface DiagnosticSink {
  emit(diagnostic: CommandDiagnostic): void | Promise<void>
}

export interface ByteInput {
  readonly kind: "closed" | "pipe" | "terminal"
  readonly bytes: AsyncIterable<Uint8Array>
}

export type InteractionRequest =
  | {
      readonly kind: "confirm"
      readonly id: string
      readonly message: string
      readonly defaultValue?: boolean
    }
  | {
      readonly kind: "select"
      readonly id: string
      readonly message: string
      readonly choices: ReadonlyArray<{
        readonly label: string
        readonly value: JsonPrimitive
      }>
    }
  | {
      readonly kind: "text" | "secret"
      readonly id: string
      readonly message: string
      readonly defaultValue?: string
    }

export interface InteractionProvider {
  request(request: InteractionRequest): Promise<JsonPrimitive>
}

export type CommandTransport = "direct" | "cli" | "stdio" | "mcp"

export interface CommandInvocation {
  readonly id: string
  readonly transport: CommandTransport
  readonly interactive: boolean
}

export interface CommandContext {
  readonly signal: AbortSignal
  readonly invocation: CommandInvocation
  readonly stdin: ByteInput
  readonly diagnostics: DiagnosticSink
  readonly interaction: InteractionProvider
}

export interface CommandAnnotations {
  readonly readOnly?: boolean
  readonly destructive?: boolean
  readonly idempotent?: boolean
  readonly openWorld?: boolean
}

export interface CommandDefinition<
  Input extends JsonObject,
  Output extends JsonObject,
> {
  readonly name: string
  readonly title: string
  readonly description: string
  readonly inputSchema: CommandSchema<unknown, Input>
  readonly outputSchema: CommandSchema<unknown, Output>
  readonly annotations?: CommandAnnotations
  execute(input: Input, context: CommandContext): Promise<Output>
}

export type CommandErrorKind =
  | "invalid-input"
  | "interaction-required"
  | "unavailable"
  | "conflict"
  | "cancelled"
  | "failed"
  | "internal"

export interface CommandErrorData {
  readonly kind: CommandErrorKind
  readonly code: string
  readonly message: string
  readonly retryable: boolean
  readonly details?: JsonObject
}

export class CommandError extends Error {
  readonly data: CommandErrorData

  constructor(data: CommandErrorData, options?: ErrorOptions) {
    super(data.message, options)
    this.name = "CommandError"
    this.data = data
  }
}

export interface CommandSuccess<Output extends JsonObject> {
  readonly contract: typeof MAXIMAL_COMMAND_CONTRACT
  readonly schemaVersion: typeof MAXIMAL_COMMAND_CONTRACT_VERSION
  readonly invocationId: string
  readonly ok: true
  readonly data: Output
}

export interface CommandFailure {
  readonly contract: typeof MAXIMAL_COMMAND_CONTRACT
  readonly schemaVersion: typeof MAXIMAL_COMMAND_CONTRACT_VERSION
  readonly invocationId: string
  readonly ok: false
  readonly error: CommandErrorData
}

export type CommandOutcome<Output extends JsonObject> =
  CommandSuccess<Output> | CommandFailure

export interface CommandRegistration {
  readonly name: string
  readonly title: string
  readonly description: string
  readonly inputSchema: CommandSchema<unknown, JsonObject>
  readonly outputSchema: CommandSchema<unknown, JsonObject>
  readonly annotations?: CommandAnnotations
  execute(
    rawInput: unknown,
    context: CommandContext,
  ): Promise<CommandOutcome<JsonObject>>
}

export const COMMAND_EXIT_CODE = {
  success: 0,
  failed: 1,
  usage: 2,
  unavailable: 3,
  conflict: 4,
  cancelled: 5,
  internal: 10,
} as const

const emptyBytes: AsyncIterable<Uint8Array> = {
  [Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
    return {
      next(): Promise<IteratorResult<Uint8Array>> {
        return Promise.resolve({ done: true, value: undefined })
      },
    }
  },
}

const silentDiagnostics: DiagnosticSink = {
  emit() {},
}

const forbiddenInteraction: InteractionProvider = {
  request(request) {
    return Promise.reject(
      new CommandError({
        kind: "interaction-required",
        code: "MAXIMAL_INTERACTION_REQUIRED",
        message: `Input is required for ${request.id}.`,
        retryable: false,
      }),
    )
  },
}

export interface CommandContextOptions {
  readonly id: string
  readonly transport?: CommandTransport
  readonly interactive?: boolean
  readonly signal?: AbortSignal
  readonly stdin?: ByteInput
  readonly diagnostics?: DiagnosticSink
  readonly interaction?: InteractionProvider
}

export function createCommandContext(
  options: CommandContextOptions,
): CommandContext {
  return {
    signal: options.signal ?? new AbortController().signal,
    invocation: {
      id: options.id,
      transport: options.transport ?? "direct",
      interactive: options.interactive ?? false,
    },
    stdin: options.stdin ?? { kind: "closed", bytes: emptyBytes },
    diagnostics: options.diagnostics ?? silentDiagnostics,
    interaction: options.interaction ?? forbiddenInteraction,
  }
}

function validationDetails(
  issues: ReadonlyArray<StandardSchemaV1.Issue>,
): JsonObject {
  return {
    issues: issues.map((issue) => ({
      message: issue.message,
      path:
        issue.path?.map((segment) =>
          typeof segment === "object" ? String(segment.key) : String(segment),
        ) ?? [],
    })),
  }
}

function errorData(error: unknown): CommandErrorData {
  if (error instanceof CommandError) return error.data
  return {
    kind: "internal",
    code: "MAXIMAL_INTERNAL",
    message: "The command failed unexpectedly.",
    retryable: false,
  }
}

function isAborted(signal: AbortSignal): boolean {
  return signal.aborted
}

export async function executeCommand<
  Input extends JsonObject,
  Output extends JsonObject,
>(
  command: CommandDefinition<Input, Output>,
  rawInput: unknown,
  context: CommandContext,
): Promise<CommandOutcome<Output>> {
  if (isAborted(context.signal)) {
    return commandFailure(context.invocation.id, {
      kind: "cancelled",
      code: "MAXIMAL_CANCELLED",
      message: "The command was cancelled.",
      retryable: false,
    })
  }

  const input = await command.inputSchema["~standard"].validate(rawInput)
  if (input.issues) {
    return commandFailure(context.invocation.id, {
      kind: "invalid-input",
      code: "MAXIMAL_INVALID_INPUT",
      message: "The command input is invalid.",
      retryable: false,
      details: validationDetails(input.issues),
    })
  }

  try {
    const output = await command.execute(input.value, context)
    if (isAborted(context.signal)) {
      return commandFailure(context.invocation.id, {
        kind: "cancelled",
        code: "MAXIMAL_CANCELLED",
        message: "The command was cancelled.",
        retryable: false,
      })
    }

    const validated = await command.outputSchema["~standard"].validate(output)
    if (validated.issues) {
      return commandFailure(context.invocation.id, {
        kind: "internal",
        code: "MAXIMAL_INVALID_OUTPUT",
        message: "The command produced output that violates its contract.",
        retryable: false,
        details: validationDetails(validated.issues),
      })
    }
    return {
      contract: MAXIMAL_COMMAND_CONTRACT,
      schemaVersion: MAXIMAL_COMMAND_CONTRACT_VERSION,
      invocationId: context.invocation.id,
      ok: true,
      data: validated.value,
    }
  } catch (error) {
    if (isAborted(context.signal)) {
      return commandFailure(context.invocation.id, {
        kind: "cancelled",
        code: "MAXIMAL_CANCELLED",
        message: "The command was cancelled.",
        retryable: false,
      })
    }
    return commandFailure(context.invocation.id, errorData(error))
  }
}

export function registerCommand<
  Input extends JsonObject,
  Output extends JsonObject,
>(command: CommandDefinition<Input, Output>): CommandRegistration {
  return {
    name: command.name,
    title: command.title,
    description: command.description,
    inputSchema: command.inputSchema,
    outputSchema: command.outputSchema,
    ...(command.annotations ? { annotations: command.annotations } : {}),
    execute: async (rawInput, context) =>
      await executeCommand(command, rawInput, context),
  }
}

export class CommandCatalog {
  readonly #commands = new Map<string, CommandRegistration>()
  readonly #listeners = new Set<
    (change: {
      readonly revision: number
      readonly type: "added" | "removed" | "replaced"
      readonly name: string
    }) => void
  >()
  #revision = 0

  get revision(): number {
    return this.#revision
  }

  register<Input extends JsonObject, Output extends JsonObject>(
    command: CommandDefinition<Input, Output>,
    options: { readonly replace?: boolean } = {},
  ): CommandRegistration {
    const exists = this.#commands.has(command.name)
    if (exists && !options.replace) {
      throw new Error(`Command is already registered: ${command.name}`)
    }
    const registration = registerCommand(command)
    this.#commands.set(command.name, registration)
    this.#emit(exists ? "replaced" : "added", command.name)
    return registration
  }

  remove(name: string): boolean {
    if (!this.#commands.delete(name)) return false
    this.#emit("removed", name)
    return true
  }

  get(name: string): CommandRegistration | undefined {
    return this.#commands.get(name)
  }

  list(): ReadonlyArray<CommandRegistration> {
    return [...this.#commands.values()].toSorted((left, right) =>
      left.name.localeCompare(right.name),
    )
  }

  subscribe(
    listener: (change: {
      readonly revision: number
      readonly type: "added" | "removed" | "replaced"
      readonly name: string
    }) => void,
  ): () => void {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  #emit(type: "added" | "removed" | "replaced", name: string): void {
    this.#revision += 1
    const change = { revision: this.#revision, type, name } as const
    for (const listener of this.#listeners) listener(change)
  }
}

export function commandFailure(
  invocationId: string,
  error: CommandErrorData,
): CommandFailure {
  return {
    contract: MAXIMAL_COMMAND_CONTRACT,
    schemaVersion: MAXIMAL_COMMAND_CONTRACT_VERSION,
    invocationId,
    ok: false,
    error,
  }
}

export function exitCodeFor(outcome: CommandOutcome<JsonObject>): number {
  if (outcome.ok) return COMMAND_EXIT_CODE.success
  switch (outcome.error.kind) {
    case "invalid-input":
    case "interaction-required": {
      return COMMAND_EXIT_CODE.usage
    }
    case "unavailable": {
      return COMMAND_EXIT_CODE.unavailable
    }
    case "conflict": {
      return COMMAND_EXIT_CODE.conflict
    }
    case "cancelled": {
      return COMMAND_EXIT_CODE.cancelled
    }
    case "internal": {
      return COMMAND_EXIT_CODE.internal
    }
    case "failed": {
      return COMMAND_EXIT_CODE.failed
    }
    default: {
      const unreachable: never = outcome.error.kind
      return unreachable
    }
  }
}
