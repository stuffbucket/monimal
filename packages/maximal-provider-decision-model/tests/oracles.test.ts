import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readdir, readFile } from "node:fs/promises"
import test from "node:test"

import {
  ollamaSystemOneProfile,
  systemOneOracleSchema,
  typeSafeSystemOneProfile,
  validateSystemOneResponse,
  type SystemOneOracle,
  type SystemOneRequest,
  type SystemOneResponse,
  type SystemOneWireProfile,
} from "../src/index.ts"

const oracleDirectory = new URL("../fixtures/oracles/", import.meta.url)

async function loadOracle(file: string): Promise<SystemOneOracle> {
  const encoded = await readFile(new URL(file, oracleDirectory), "utf8")
  const value: unknown = JSON.parse(encoded)
  return systemOneOracleSchema.parse(value)
}

function profileFor(oracle: SystemOneOracle): SystemOneWireProfile {
  return oracle.profile === "ollama" ?
      ollamaSystemOneProfile
    : typeSafeSystemOneProfile
}

void test("validates every recorded provider oracle", async (t) => {
  const oracleFiles = (await readdir(oracleDirectory))
    .filter((file) => file.endsWith(".json"))
    .sort()
  for (const file of oracleFiles) {
    await t.test(file, async () => {
      const oracle = await loadOracle(file)
      const profile = profileFor(oracle)
      const request = profile.request.parse(oracle.request) as SystemOneRequest
      const parsedResponse = profile.response.parse(oracle.response)
      if (oracle.source.kind === "live-capture") {
        assert.equal(oracle.source.repeat_capture, "exact")
        assert.match(oracle.source.model_digest, /^[a-f0-9]{64}$/)
        assert.equal(
          oracle.source.response_sha256,
          createHash("sha256")
            .update(JSON.stringify(oracle.response))
            .digest("hex"),
        )
      }
      if (
        file === "typesafe-jev-latest.json"
        || file === "typesafe-jev-preview.json"
      ) {
        assert.equal((parsedResponse as SystemOneResponse).model, "jev-1.13.0")
      }
      assert.deepEqual(
        validateSystemOneResponse(request, oracle.response, profile),
        [],
      )
    })
  }
})

void test("rejects stale or fabricated oracle provenance", async () => {
  const oracle = await loadOracle("ollama-nimble.json")
  assert.equal(oracle.source.kind, "live-capture")

  assert.equal(
    systemOneOracleSchema.safeParse({
      ...oracle,
      source: { ...oracle.source, model_digest: "0".repeat(64) },
    }).success,
    false,
  )
  assert.equal(
    systemOneOracleSchema.safeParse({
      ...oracle,
      response: { tampered: oracle.response },
    }).success,
    false,
  )
})

void test("proves the recorded Jev alias fixture equivalence", async () => {
  const latest = await loadOracle("typesafe-jev-latest.json")
  const preview = await loadOracle("typesafe-jev-preview.json")
  assert.equal(preview.source.kind, "published-alias-equivalence")
  assert.equal(preview.source.equivalent_to, "typesafe-jev-latest.json")
  assert.deepEqual(preview.response, latest.response)
  assert.deepEqual(
    {
      ...(preview.request as Readonly<Record<string, unknown>>),
      model: "jev-latest",
    },
    latest.request,
  )
})
