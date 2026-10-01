import assert from "node:assert/strict"
import test from "node:test"

import {
  assertConformance,
  checkCommandConformance,
  checkJsonLinesConformance,
} from "../src/conformance.ts"
import { echoCommand, echoInputSchema, echoOutputSchema } from "./fixtures.ts"

void test("reference command satisfies operation conformance", async () => {
  const report = await checkCommandConformance(echoCommand, {
    validInput: { message: "hello" },
    expectedOutput: { echoed: "hello" },
    invalidInput: { message: 42 },
  })

  assertConformance(report)
  assert.deepEqual(report, {
    passed: true,
    checks: [
      { name: "metadata", passed: true },
      { name: "json-schema", passed: true },
      { name: "successful-execution", passed: true },
      { name: "invalid-input", passed: true },
      { name: "pre-cancelled", passed: true },
    ],
  })
})

void test("command conformance reports independent contract failures", async () => {
  const report = await checkCommandConformance(
    {
      ...echoCommand,
      name: "Invalid Name",
      title: " ",
      description: "",
    },
    {
      validInput: { message: "hello" },
      expectedOutput: { echoed: "different" },
      invalidInput: { message: "also valid" },
    },
  )

  assert.deepEqual(report, {
    passed: false,
    checks: [
      {
        name: "metadata",
        passed: false,
        message: "Command name is not portable across CLI and MCP adapters.",
      },
      { name: "json-schema", passed: true },
      {
        name: "successful-execution",
        passed: false,
        message: "Success output does not match the fixture.",
      },
      {
        name: "invalid-input",
        passed: false,
        message: "Invalid input unexpectedly succeeded.",
      },
      { name: "pre-cancelled", passed: true },
    ],
  })
})

void test("command metadata checks title and description independently", async () => {
  for (const [field, message] of [
    ["title", "Title is empty."],
    ["description", "Description is empty."],
  ] as const) {
    const report = await checkCommandConformance(
      { ...echoCommand, [field]: " \t " },
      {
        validInput: { message: "hello" },
        expectedOutput: { echoed: "hello" },
        invalidInput: { message: 42 },
      },
    )
    assert.deepEqual(report.checks[0], {
      name: "metadata",
      passed: false,
      message,
    })
  }
})

void test("command metadata rejects every non-portable name form", async () => {
  for (const name of [
    "",
    "Upper",
    "two words",
    "-leading",
    "trailing-",
    "a-!",
    "double--separator",
  ]) {
    const report = await checkCommandConformance(
      { ...echoCommand, name },
      {
        validInput: { message: "hello" },
        expectedOutput: { echoed: "hello" },
        invalidInput: { message: 42 },
      },
    )
    assert.deepEqual(report.checks[0], {
      name: "metadata",
      passed: false,
      message: "Command name is not portable across CLI and MCP adapters.",
    })
  }
})

void test("command execution checks report exact failure reasons", async () => {
  const validFailure = await checkCommandConformance(
    {
      ...echoCommand,
      execute() {
        return Promise.reject(new Error("fixture failure"))
      },
    },
    {
      validInput: { message: "hello" },
      expectedOutput: { echoed: "hello" },
      invalidInput: { message: 42 },
    },
  )
  assert.deepEqual(validFailure.checks[2], {
    name: "successful-execution",
    passed: false,
    message: "Valid input did not succeed.",
  })

  const wrongInvalidKind = await checkCommandConformance(
    {
      ...echoCommand,
      execute(input, context) {
        assert.equal(context.invocation.id, "conformance-success")
        return Promise.resolve({ echoed: input.message })
      },
    },
    {
      validInput: { message: "hello" },
      expectedOutput: { echoed: "hello" },
      invalidInput: { message: "valid-too" },
    },
  )
  assert.deepEqual(wrongInvalidKind.checks[3], {
    name: "invalid-input",
    passed: false,
    message: "Invalid input did not produce an invalid-input failure.",
  })
  assert.deepEqual(wrongInvalidKind.checks[2], {
    name: "successful-execution",
    passed: true,
  })
})

void test("command conformance reports unavailable projected schemas", async () => {
  const unavailableInput = {
    input() {
      return null as unknown as Record<string, unknown>
    },
    output() {
      return {}
    },
  }
  const unavailableOutput = {
    input() {
      return {}
    },
    output() {
      return null as unknown as Record<string, unknown>
    },
  }
  const fixture = {
    validInput: { message: "hello" },
    expectedOutput: { echoed: "hello" },
    invalidInput: { message: 42 },
  } as const
  const inputReport = await checkCommandConformance(
    {
      ...echoCommand,
      inputSchema: {
        "~standard": {
          ...echoInputSchema["~standard"],
          jsonSchema: unavailableInput,
        },
      },
    },
    fixture,
  )
  assert.deepEqual(inputReport.checks[1], {
    name: "json-schema",
    passed: false,
    message: "Input JSON Schema is unavailable.",
  })

  const outputReport = await checkCommandConformance(
    {
      ...echoCommand,
      outputSchema: {
        "~standard": {
          ...echoOutputSchema["~standard"],
          jsonSchema: unavailableOutput,
        },
      },
    },
    fixture,
  )
  assert.deepEqual(outputReport.checks[1], {
    name: "json-schema",
    passed: false,
    message: "Output JSON Schema is unavailable.",
  })

  const stringSchema = {
    input() {
      return "not-an-object" as unknown as Record<string, unknown>
    },
    output() {
      return {}
    },
  }
  const stringReport = await checkCommandConformance(
    {
      ...echoCommand,
      inputSchema: {
        "~standard": {
          ...echoInputSchema["~standard"],
          jsonSchema: stringSchema,
        },
      },
    },
    fixture,
  )
  assert.deepEqual(stringReport.checks[1], {
    name: "json-schema",
    passed: false,
    message: "Input JSON Schema is unavailable.",
  })
})

void test("JSON lines codec satisfies pipe conformance", async () => {
  const report = await checkJsonLinesConformance()

  assertConformance(report)
  assert.deepEqual(report, {
    passed: true,
    checks: [
      { name: "fragmented-utf8", passed: true },
      { name: "crlf", passed: true },
      { name: "powershell-utf16le", passed: true },
      { name: "fragmented-record-bound", passed: true },
      { name: "rejects-blank-record", passed: true },
    ],
  })
})

void test("assertConformance includes every failure", () => {
  assert.throws(
    () =>
      assertConformance({
        passed: false,
        checks: [
          { name: "first", passed: false, message: "broken" },
          { name: "second", passed: false },
          { name: "passing", passed: true },
        ],
      }),
    {
      message: "first: broken\nsecond: failed",
    },
  )
})
