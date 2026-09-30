import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import test from "node:test"

import {
  MODEL_CATALOG_DEFAULT_ASSET,
  modelCatalogReleaseUrl,
  resolveModelCatalogReleasePin,
} from "../src/index.ts"
import { loadModelCatalogRelease, ModelCatalogLoadError } from "../src/node.ts"
import { catalogFixture } from "./fixtures.ts"

function pinFor(json: string) {
  return {
    tag: "catalog-v1.2026.09.30.1",
    sha256: createHash("sha256").update(json).digest("hex"),
  }
}

function response(body: string): Response {
  return new Response(body, {
    headers: { "content-length": String(Buffer.byteLength(body)) },
    status: 200,
  })
}

void test("builds an exact immutable release URL", () => {
  const pin = pinFor("{}")
  assert.deepEqual(resolveModelCatalogReleasePin(pin), {
    asset: MODEL_CATALOG_DEFAULT_ASSET,
    sha256: pin.sha256,
    tag: pin.tag,
  })
  assert.equal(
    modelCatalogReleaseUrl(pin).href,
    "https://github.com/stuffbucket/model-catalog/releases/download/"
      + "catalog-v1.2026.09.30.1/maximal-model-catalog-v1.json",
  )
  assert.throws(
    () => modelCatalogReleaseUrl({ ...pin, tag: "latest" }),
    /Invalid model catalog release tag/u,
  )
})

void test("downloads, verifies, and validates a catalog", async () => {
  const json = JSON.stringify(catalogFixture())
  const catalog = await loadModelCatalogRelease(pinFor(json), {
    fetch: () => Promise.resolve(response(json)),
  })

  assert.equal(catalog.catalog.models[0]?.name, "Claude Sonnet")
})

void test("rejects modified and oversized release assets", async () => {
  const json = JSON.stringify(catalogFixture())
  await assert.rejects(
    loadModelCatalogRelease(
      { ...pinFor(json), sha256: "0".repeat(64) },
      { fetch: () => Promise.resolve(response(json)) },
    ),
    (error: unknown) =>
      error instanceof ModelCatalogLoadError
      && error.reason === "digest-mismatch",
  )
  await assert.rejects(
    loadModelCatalogRelease(pinFor(json), {
      fetch: () => Promise.resolve(response(json)),
      maxBytes: 10,
    }),
    (error: unknown) =>
      error instanceof ModelCatalogLoadError
      && error.reason === "download-too-large",
  )
  await assert.rejects(
    loadModelCatalogRelease(pinFor(json), {
      fetch: () => Promise.resolve(response(json)),
      maxBytes: 0,
    }),
    /byte limit must be a positive integer/u,
  )
})

void test("rejects assets resolved through an untrusted host", async () => {
  const json = JSON.stringify(catalogFixture())
  const untrustedResponse = response(json)
  Object.defineProperty(untrustedResponse, "url", {
    value: "https://catalog.invalid/model-catalog.json",
  })

  await assert.rejects(
    loadModelCatalogRelease(pinFor(json), {
      fetch: () => Promise.resolve(untrustedResponse),
    }),
    (error: unknown) =>
      error instanceof ModelCatalogLoadError
      && error.reason === "unexpected-download-host",
  )
})

void test("distinguishes invalid JSON from an invalid catalog", async () => {
  const invalidJson = "{"
  await assert.rejects(
    loadModelCatalogRelease(pinFor(invalidJson), {
      fetch: () => Promise.resolve(response(invalidJson)),
    }),
    (error: unknown) =>
      error instanceof ModelCatalogLoadError && error.reason === "invalid-json",
  )

  const invalidCatalog = "{}"
  await assert.rejects(
    loadModelCatalogRelease(pinFor(invalidCatalog), {
      fetch: () => Promise.resolve(response(invalidCatalog)),
    }),
    (error: unknown) =>
      error instanceof ModelCatalogLoadError
      && error.reason === "invalid-catalog",
  )
})
