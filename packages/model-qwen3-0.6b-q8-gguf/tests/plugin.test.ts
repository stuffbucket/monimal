import { Context } from "@deepseek-ai/cordis"
import * as registryPlugin from "@stuffbucket/local-model-registry"
import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import * as plugin from "../src/index.ts"

void test("Cordis plugin registers one manifest and unregisters on disposal", async () => {
  const directory = await mkdtemp(join(tmpdir(), "qwen3-plugin-"))
  const context = new Context()
  const registryFiber = context.plugin(registryPlugin, {
    suiteDataRoot: directory,
  })
  await registryFiber.await()
  const fiber = context.plugin(plugin, { publication: "provider" })
  try {
    await fiber.await()
    assert.deepEqual(plugin.inject, ["localModels"])
    assert.deepEqual(context.localModels.list().models, [
      {
        capabilities: { input: ["text"], output: ["text"] },
        context: { contextWindow: 40_960 },
        displayName: "Qwen3 0.6B Q8_0",
        expectedBytes: 639_446_688,
        format: "gguf",
        key: "qwen3-0.6b-q8-gguf",
        modelId: "qwen3-0.6b",
        publication: "provider",
        state: "registered",
      },
    ])
  } finally {
    await fiber.dispose()
    assert.equal(context.localModels.list().models.length, 0)
    await registryFiber.dispose()
    await context.fiber.dispose()
    await rm(directory, { recursive: true, force: true })
  }
})

void test("publication defaults to aggregate and accepts every policy", () => {
  assert.equal(plugin.resolvePublication({}), "aggregate")
  for (const publication of plugin.PUBLICATIONS)
    assert.equal(plugin.createManifest(publication).publication, publication)
})
