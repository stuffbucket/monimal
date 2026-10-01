import assert from "node:assert/strict"
import path from "node:path"
import { test } from "node:test"

import { ESLint } from "eslint"
import tseslint from "typescript-eslint"

import { unsafeTypeAssertionsPlugin } from "../unsafe-type-assertions.js"

function linter() {
  return new ESLint({
    cwd: path.resolve(import.meta.dirname, ".."),
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ["**/*.ts"],
        languageOptions: { parser: tseslint.parser },
        plugins: { "maximal-model-policy": unsafeTypeAssertionsPlugin },
        rules: {
          "maximal-model-policy/no-unsafe-type-assertions": "warn",
        },
      },
    ],
  })
}

async function messages(source, filePath = "src/example.ts") {
  const [result] = await linter().lintText(source, { filePath })
  return result.messages.map((message) => message.message)
}

test("warns once for each unsafe assertion category", async () => {
  const findings = await messages(`
    declare const response: Response
    declare const value: unknown
    const one = value as unknown as { id: string }
    const two = JSON.parse("{}") as { id: string }
    const three = (await response.json()) as { id: string }
    const four = process.env.PORT as string
    const five = value as any
    const six = value as never
    // @ts-ignore
    const seven: string = 1
  `)
  assert.deepEqual(findings, [
    "Unsafe type assertion (double-assertion); validate the value or narrow it without an assertion.",
    "Unsafe type assertion (unvalidated-json-parse); validate the value or narrow it without an assertion.",
    "Unsafe type assertion (unvalidated-response-json); validate the value or narrow it without an assertion.",
    "Unsafe type assertion (unvalidated-environment); validate the value or narrow it without an assertion.",
    "Unsafe type assertion (as-any); validate the value or narrow it without an assertion.",
    "Unsafe type assertion (as-never); validate the value or narrow it without an assertion.",
    "Unsafe TypeScript suppression (ts-ignore); use a checked expectation or fix the type.",
  ])
})

test("allows safe narrowing forms and test-only never assertions", async () => {
  assert.deepEqual(
    await messages(`
      const value = { id: "x" } as const
      const checked = value satisfies { id: string }
      void checked
    `),
    [],
  )
  assert.deepEqual(
    await messages("const impossible = {} as never", "tests/example.test.ts"),
    [],
  )
})
