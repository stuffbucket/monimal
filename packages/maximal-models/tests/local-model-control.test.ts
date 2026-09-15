import assert from "node:assert/strict"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import test from "node:test"

import { createDshHost, startDshHost } from "../src/index.ts"
import { createFixtureProfile } from "./fixture.ts"

const serviceSource = `
export const name = "fixture-local-models"
export const inject = []
export const Config = {
  "~standard": {
    version: 1,
    vendor: "fixture",
    validate(value) { return { value: value ?? {} } },
  },
}
const model = Object.freeze({
  capabilities: Object.freeze({ input: Object.freeze(["text"]), output: Object.freeze(["text"]) }),
  context: Object.freeze({ contextWindow: 2048 }),
  displayName: "Fixture Local Model",
  expectedBytes: 4,
  format: "gguf",
  key: "fixture-local",
  modelId: "fixture/local",
  publication: "provider",
  state: "registered",
})
const snapshot = Object.freeze({ models: Object.freeze([model]), revision: 1 })
export function apply(ctx, config) {
  const service = config.invalid === true
    ? { list() { return snapshot } }
    : {
        async ensure() { return Object.freeze({ ...model, state: "ready" }) },
        list() { return snapshot },
        subscribe(listener) { listener(snapshot); return () => undefined },
      }
  ctx.provide("localModels", service)
}
`

async function installService(
  directory: string,
  invalid: boolean,
): Promise<void> {
  const root = join(directory, "node_modules", "fixture-local-models")
  await mkdir(root, { recursive: true })
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      name: "fixture-local-models",
      version: "1.0.0",
      type: "module",
      exports: {
        ".": { import: "./index.js" },
        "./package.json": "./package.json",
      },
    }),
  )
  await writeFile(join(root, "index.js"), serviceSource)

  const profilePath = join(directory, "package.json")
  const profile = JSON.parse(await readFile(profilePath, "utf8")) as {
    dependencies: Record<string, string>
  }
  profile.dependencies["fixture-local-models"] = "1.0.0"
  await writeFile(profilePath, JSON.stringify(profile))
  await writeFile(
    join(directory, "providers.json"),
    JSON.stringify({
      schemaVersion: 1,
      runtime: {
        cordis: "@deepseek-ai/cordis",
        llm: "@deepseek-ai/dsh-llm",
      },
      services: [
        {
          id: "localModels",
          package: "fixture-local-models",
          config: invalid ? { invalid: true } : {},
        },
      ],
      plugins: [
        { id: "fixture", package: "fixture-provider", providers: ["fixture"] },
      ],
    }),
  )
}

void test("DSH host structurally adapts a conforming localModels service", async () => {
  const fixture = await createFixtureProfile()
  await installService(fixture.directory, false)
  const host = await startDshHost({
    profileDirectory: fixture.directory,
    activation: { fixture: { enabled: false } },
  })
  try {
    const control = host.localModels
    assert.ok(control)
    const snapshots: Array<number> = []
    const unsubscribe = control.subscribe(({ revision }) =>
      snapshots.push(revision),
    )
    assert.deepEqual(snapshots, [1])
    assert.equal(control.list().models[0]?.key, "fixture-local")
    assert.equal(
      (await control.ensure("fixture-local", new AbortController().signal))
        .state,
      "ready",
    )
    unsubscribe()
  } finally {
    await host.dispose()
  }
  assert.equal(host.localModels, undefined)
})

void test("DSH host rejects a malformed localModels service without a concrete import", async () => {
  const fixture = await createFixtureProfile()
  await installService(fixture.directory, true)
  const host = createDshHost({
    profileDirectory: fixture.directory,
    activation: { fixture: { enabled: false } },
  })
  try {
    const result = await host.reconcile()
    assert.equal(result.committed, false)
    assert.equal(result.diagnostics[0]?.code, "provider-invalid")
  } finally {
    await host.dispose()
  }
})
