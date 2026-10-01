import assert from "node:assert/strict"
import test from "node:test"
import * as z from "zod/v4"

import type {
  CommandErrorKind,
  CommandOutcome,
  CommandSchema,
  JsonObject,
} from "../src/index.ts"

import {
  COMMAND_EXIT_CODE,
  CommandCatalog,
  CommandError,
  createCommandContext,
  DIAGNOSTIC_SEVERITY_NUMBER,
  executeCommand,
  exitCodeFor,
  registerCommand,
} from "../src/index.ts"
import { echoCommand } from "./fixtures.ts"

void test("diagnostic levels follow OpenTelemetry severity ranges", () => {
  assert.deepEqual(DIAGNOSTIC_SEVERITY_NUMBER, {
    trace: 1,
    debug: 5,
    info: 9,
    warn: 13,
    error: 17,
    fatal: 21,
  })
})

void test("invalid input has a stable error and portable exit code", async () => {
  const outcome = await executeCommand(
    echoCommand,
    { message: false },
    createCommandContext({ id: "invalid-input" }),
  )

  if (outcome.ok) assert.fail("Invalid input unexpectedly succeeded.")
  assert.deepEqual(outcome, {
    contract: "dev.maximal.command",
    schemaVersion: 1,
    invocationId: "invalid-input",
    ok: false,
    error: {
      kind: "invalid-input",
      code: "MAXIMAL_INVALID_INPUT",
      message: "The command input is invalid.",
      retryable: false,
      details: {
        issues: [
          {
            message: "Invalid input: expected string, received boolean",
            path: ["message"],
          },
        ],
      },
    },
  })
  assert.equal(exitCodeFor(outcome), COMMAND_EXIT_CODE.usage)
})

void test("validation issues without paths retain an empty path", async () => {
  const inputSchema = {
    "~standard": {
      version: 1 as const,
      vendor: "maximal-test",
      validate() {
        return {
          issues: [{ message: "Root input is invalid." }],
        }
      },
      jsonSchema: {
        input() {
          return {}
        },
        output() {
          return {}
        },
      },
    },
  } satisfies CommandSchema<unknown, { readonly message: string }>
  const outcome = await executeCommand(
    { ...echoCommand, inputSchema },
    { message: false },
    createCommandContext({ id: "pathless" }),
  )

  if (outcome.ok) assert.fail("Pathless invalid input unexpectedly succeeded.")
  assert.deepEqual(outcome.error.details, {
    issues: [{ message: "Root input is invalid.", path: [] }],
  })
})

void test("successful execution validates and envelopes output", async () => {
  assert.deepEqual(
    await executeCommand(
      echoCommand,
      { message: "valid" },
      createCommandContext({ id: "success" }),
    ),
    {
      contract: "dev.maximal.command",
      schemaVersion: 1,
      invocationId: "success",
      ok: true,
      data: { echoed: "valid" },
    },
  )
})

void test("invalid output and unexpected failures are stable internal errors", async () => {
  function schema<Input extends JsonObject>(
    value: z.ZodType<Input>,
  ): CommandSchema<unknown, Input> {
    return value
  }
  const invalidOutput = await executeCommand(
    {
      ...echoCommand,
      outputSchema: schema(z.object({ echoed: z.number().min(10) })),
      execute() {
        return Promise.resolve({ echoed: 1 })
      },
    },
    { message: "invalid output" },
    createCommandContext({ id: "invalid-output" }),
  )
  if (invalidOutput.ok) assert.fail("Invalid output unexpectedly succeeded.")
  assert.equal(invalidOutput.error.kind, "internal")
  assert.equal(invalidOutput.error.code, "MAXIMAL_INVALID_OUTPUT")
  assert.equal(invalidOutput.error.retryable, false)
  assert.deepEqual(invalidOutput.error.details, {
    issues: [
      {
        message: "Too small: expected number to be >=10",
        path: ["echoed"],
      },
    ],
  })

  const unexpected = await executeCommand(
    {
      ...echoCommand,
      execute() {
        throw new Error("private cause")
      },
    },
    { message: "throw" },
    createCommandContext({ id: "unexpected" }),
  )
  assert.deepEqual(unexpected, {
    contract: "dev.maximal.command",
    schemaVersion: 1,
    invocationId: "unexpected",
    ok: false,
    error: {
      kind: "internal",
      code: "MAXIMAL_INTERNAL",
      message: "The command failed unexpectedly.",
      retryable: false,
    },
  })
})

void test("cancellation wins after return and after a thrown abort", async () => {
  for (const shouldThrow of [false, true]) {
    const controller = new AbortController()
    const outcome = await executeCommand(
      {
        ...echoCommand,
        execute() {
          controller.abort()
          if (shouldThrow) throw new Error("abort")
          return Promise.resolve({ echoed: "ignored" })
        },
      },
      { message: "cancel" },
      createCommandContext({
        id: shouldThrow ? "cancel-throw" : "cancel-return",
        signal: controller.signal,
      }),
    )
    if (outcome.ok) assert.fail("Cancelled execution unexpectedly succeeded.")
    assert.deepEqual(outcome.error, {
      kind: "cancelled",
      code: "MAXIMAL_CANCELLED",
      message: "The command was cancelled.",
      retryable: false,
    })
  }
})

void test("interaction is denied unless a transport provides it", async () => {
  const context = createCommandContext({ id: "non-interactive" })

  assert.deepEqual(context.invocation, {
    id: "non-interactive",
    transport: "direct",
    interactive: false,
  })
  assert.equal(context.stdin.kind, "closed")
  assert.deepEqual(await context.stdin.bytes[Symbol.asyncIterator]().next(), {
    done: true,
    value: undefined,
  })
  assert.equal(
    context.diagnostics.emit({
      level: "info",
      severityNumber: 9,
      message: "ignored",
    }),
    undefined,
  )
  await assert.rejects(
    context.interaction.request({
      kind: "text",
      id: "account",
      message: "Account",
    }),
    (error: unknown) => {
      assert.ok(error instanceof CommandError)
      assert.equal(error.name, "CommandError")
      assert.equal(error.message, "Input is required for account.")
      assert.deepEqual(error.data, {
        kind: "interaction-required",
        code: "MAXIMAL_INTERACTION_REQUIRED",
        message: "Input is required for account.",
        retryable: false,
      })
      return true
    },
  )
})

void test("context dependencies are injected without replacement", () => {
  const controller = new AbortController()
  const stdin = {
    kind: "terminal" as const,
    bytes: {
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
              value: Uint8Array.of(1),
            })
          },
        }
      },
    },
  }
  const diagnostics = { emit() {} }
  const interaction = {
    request() {
      return Promise.resolve("answer")
    },
  }
  const context = createCommandContext({
    id: "custom",
    transport: "cli",
    interactive: true,
    signal: controller.signal,
    stdin,
    diagnostics,
    interaction,
  })

  assert.deepEqual(context.invocation, {
    id: "custom",
    transport: "cli",
    interactive: true,
  })
  assert.equal(context.signal, controller.signal)
  assert.equal(context.stdin, stdin)
  assert.equal(context.diagnostics, diagnostics)
  assert.equal(context.interaction, interaction)
})

void test("every failure kind maps to its portable exit code", () => {
  const expected: ReadonlyArray<readonly [CommandErrorKind, number]> = [
    ["invalid-input", 2],
    ["interaction-required", 2],
    ["unavailable", 3],
    ["conflict", 4],
    ["cancelled", 5],
    ["internal", 10],
    ["failed", 1],
  ]
  for (const [kind, exitCode] of expected) {
    const outcome: CommandOutcome<JsonObject> = {
      contract: "dev.maximal.command",
      schemaVersion: 1,
      invocationId: kind,
      ok: false,
      error: {
        kind,
        code: `TEST_${kind}`,
        message: kind,
        retryable: false,
      },
    }
    assert.equal(exitCodeFor(outcome), exitCode)
  }
  assert.equal(
    exitCodeFor({
      contract: "dev.maximal.command",
      schemaVersion: 1,
      invocationId: "success",
      ok: true,
      data: {},
    }),
    0,
  )
})

void test("registration preserves metadata and delegates execution", async () => {
  const registration = registerCommand(echoCommand)
  assert.equal(registration.name, "echo")
  assert.equal(registration.title, "Echo")
  assert.equal(registration.description, "Returns the supplied message.")
  assert.equal(registration.inputSchema, echoCommand.inputSchema)
  assert.equal(registration.outputSchema, echoCommand.outputSchema)
  assert.deepEqual(registration.annotations, echoCommand.annotations)
  assert.deepEqual(
    await registration.execute(
      { message: "registered" },
      createCommandContext({ id: "registered" }),
    ),
    {
      contract: "dev.maximal.command",
      schemaVersion: 1,
      invocationId: "registered",
      ok: true,
      data: { echoed: "registered" },
    },
  )
})

void test("command catalog is deterministic, revisioned, and replaceable", () => {
  const catalog = new CommandCatalog()
  const changes: Array<{
    readonly revision: number
    readonly type: "added" | "removed" | "replaced"
    readonly name: string
  }> = []
  const unsubscribe = catalog.subscribe((change) => {
    changes.push(change)
  })

  catalog.register({ ...echoCommand, name: "zulu" })
  catalog.register({ ...echoCommand, name: "alpha" })
  assert.deepEqual(
    catalog.list().map((command) => command.name),
    ["alpha", "zulu"],
  )
  assert.throws(
    () => catalog.register({ ...echoCommand, name: "alpha" }),
    /already registered/u,
  )
  catalog.register(
    { ...echoCommand, name: "alpha", title: "Replacement" },
    { replace: true },
  )
  assert.equal(catalog.get("alpha")?.title, "Replacement")
  assert.equal(catalog.remove("zulu"), true)
  assert.equal(catalog.remove("missing"), false)
  unsubscribe()
  catalog.register({ ...echoCommand, name: "after-unsubscribe" })

  assert.equal(catalog.revision, 5)
  assert.deepEqual(changes, [
    { revision: 1, type: "added", name: "zulu" },
    { revision: 2, type: "added", name: "alpha" },
    { revision: 3, type: "replaced", name: "alpha" },
    { revision: 4, type: "removed", name: "zulu" },
  ])
})
