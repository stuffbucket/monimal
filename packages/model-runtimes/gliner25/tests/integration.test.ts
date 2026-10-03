import { Context } from "@deepseek-ai/cordis"
import { MAXIMAL_GLINER25_PROVIDER_ID } from "@maximal/maximal-model-catalog"
import { SystemOneRegistry } from "@maximal/maximal-models"
import assert from "node:assert/strict"
import test from "node:test"

import * as plugin from "../src/index.ts"

const config = {
  backend: "pytorch" as const,
  baseUrl: "https://gliner.test",
  headers: { authorization: "Bearer fixture" },
  modelMapping: {
    "fastino/GLiNER2.5-Decide": "decide-340m",
  },
  precision: "fp16" as const,
  provider: MAXIMAL_GLINER25_PROVIDER_ID,
}

void test("exports a genuine System One Cordis plugin with strict config", () => {
  assert.equal(plugin.name, "maximal-runtime-gliner25")
  assert.deepEqual(plugin.inject, ["systemOne"])
  assert.equal(typeof plugin.Config, "function")
  assert.equal(typeof plugin.apply, "function")

  for (const invalid of [
    { ...config, provider: "" },
    { ...config, provider: "gliner-local" },
    { ...config, baseUrl: "" },
    { ...config, backend: "auto" },
    { ...config, precision: "auto" },
    { ...config, unknown: true },
    { ...config, modelMapping: { gliner25: "decide-340m" } },
    {
      baseUrl: config.baseUrl,
      precision: config.precision,
      provider: config.provider,
    },
  ]) {
    assert.throws(() => plugin.resolveConfig(invalid))
  }

  const resolved = plugin.resolveConfig(config)
  const resolveRunnerModel = resolved.providerOptions.resolveRunnerModel
  assert.ok(resolveRunnerModel)
  assert.equal(resolveRunnerModel("gliner25:340m"), "decide-340m")
  assert.equal(resolveRunnerModel("gliner25:1b"), "fastino/GLiNER2.5-Decide-1B")
  assert.throws(() => resolveRunnerModel("fastino/GLiNER2.5-Decide"))
})

void test("registers canonical models and unloads cleanly", async () => {
  const ctx = new Context()
  const registry = new SystemOneRegistry()
  const removeService = ctx.provide("systemOne", registry)
  try {
    const fiber = ctx.plugin(plugin, config)
    await fiber
    assert.deepEqual(registry.listProviders(), [
      { id: MAXIMAL_GLINER25_PROVIDER_ID, name: "Local GLiNER2.5" },
    ])
    assert.deepEqual(registry.listModels(MAXIMAL_GLINER25_PROVIDER_ID), [
      {
        family: "gliner25",
        id: "gliner25:340m",
        name: "GLiNER2.5 Decide 340M",
      },
      {
        family: "gliner25",
        id: "gliner25:1b",
        name: "GLiNER2.5 Decide 1B",
      },
      {
        family: "gliner25",
        id: "gliner25:multi",
        name: "GLiNER2.5 Multilingual Decide",
      },
    ])

    await fiber.dispose()
    assert.deepEqual(registry.listProviders(), [])
  } finally {
    removeService()
    registry.dispose()
    await ctx.fiber.dispose()
  }
})
