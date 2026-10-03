import assert from "node:assert/strict"
import test from "node:test"

import {
  createModelCatalogIndex,
  MAXIMAL_GLINER25_PROVIDER_ID,
  MAXIMAL_MODEL_CATALOG,
  ModelCatalogSchema,
  parseModelCatalogJson,
} from "../src/index.ts"
import { catalogFixture } from "./fixtures.ts"

void test("validates and indexes a released catalog", () => {
  const fixture = catalogFixture()
  const index = createModelCatalogIndex(fixture)

  assert.equal(index.catalog.schemaVersion, 1)
  assert.equal(index.provider("anthropic")?.name, "Anthropic")
  assert.equal(
    index.canonicalModel("anthropic/claude-sonnet")?.family,
    "claude",
  )
  assert.equal(
    index.offering("anthropic", "claude-sonnet")?.limits.outputTokens,
    64_000,
  )
  assert.equal(
    parseModelCatalogJson(JSON.stringify(fixture)).catalog.source.commit,
    fixture.source.commit,
  )
  assert.equal(Object.isFrozen(index.catalog), true)
  assert.equal(Object.isFrozen(index.catalog.models), true)
  assert.equal(Object.isFrozen(index.catalog.models[0]), true)
})

void test("indexes reviewed Maximal GLiNER models and offerings", () => {
  assert.equal(
    MAXIMAL_MODEL_CATALOG.provider(MAXIMAL_GLINER25_PROVIDER_ID)?.name,
    "Maximal GLiNER2.5",
  )
  assert.equal(
    MAXIMAL_MODEL_CATALOG.canonicalModel("fastino/GLiNER2.5-Decide")?.license,
    "Apache-2.0",
  )
  assert.equal(
    MAXIMAL_MODEL_CATALOG.offering(
      MAXIMAL_GLINER25_PROVIDER_ID,
      "gliner25:340m",
    )?.canonicalModelId,
    "fastino/GLiNER2.5-Decide",
  )
  assert.equal(Object.isFrozen(MAXIMAL_MODEL_CATALOG.supplement), true)
})

void test("rejects unknown properties", () => {
  const fixture = catalogFixture()
  assert.throws(() =>
    ModelCatalogSchema.parse({
      ...fixture,
      models: [{ ...fixture.models[0], description: "untrusted prose" }],
    }),
  )
})

void test("rejects duplicates, dangling references, and unstable order", () => {
  const fixture = catalogFixture()
  assert.throws(
    () =>
      ModelCatalogSchema.parse({
        ...fixture,
        models: [...fixture.models, fixture.models[0]],
      }),
    /Duplicate canonical model/u,
  )
  assert.throws(
    () =>
      ModelCatalogSchema.parse({
        ...fixture,
        offerings: [
          {
            ...fixture.offerings[0],
            canonicalModelId: "anthropic/missing",
          },
        ],
      }),
    /Unknown canonical model/u,
  )
  assert.throws(
    () =>
      ModelCatalogSchema.parse({
        ...fixture,
        providers: [...fixture.providers].reverse(),
      }),
    /Providers must be sorted/u,
  )
})
