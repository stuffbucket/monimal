import { Context } from "@deepseek-ai/cordis"
import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import * as plugin from "../src/index.ts"

void test("Cordis plugin provides and disposes the localModels service", async () => {
  const directory = await mkdtemp(join(tmpdir(), "local-model-plugin-"))
  const context = new Context()
  const fiber = context.plugin(
    {
      name: plugin.name,
      inject: plugin.inject,
      Config: plugin.Config,
      apply: plugin.apply,
    },
    { suiteDataRoot: directory },
  )
  try {
    await fiber.await()
    const service = context.get("localModels")
    assert.ok(service)
    assert.equal(service.modelDirectory, join(directory, "models"))
    assert.equal(service.list().models.length, 0)
  } finally {
    await fiber.dispose()
    await context.fiber.dispose()
    await rm(directory, { recursive: true, force: true })
  }
  assert.equal(context.get("localModels"), undefined)
})
