import fc from "fast-check"
import assert from "node:assert/strict"
import test from "node:test"

import type { JsonObject } from "../src/index.ts"

import {
  decodeJsonObject,
  encodeJson,
  encodeJsonLine,
  JsonLineDecoder,
} from "../src/stdio.ts"

const jsonObject = fc.dictionary(fc.string(), fc.jsonValue())

function split(
  bytes: Uint8Array,
  widths: ReadonlyArray<number>,
): ReadonlyArray<Uint8Array> {
  const chunks: Array<Uint8Array> = []
  let offset = 0
  for (const width of widths) {
    if (offset >= bytes.byteLength) break
    const end = Math.min(offset + width + 1, bytes.byteLength)
    chunks.push(bytes.subarray(offset, end))
    offset = end
  }
  if (offset < bytes.byteLength) chunks.push(bytes.subarray(offset))
  return chunks
}

void test("JSON object encoding round-trips generated values", () => {
  fc.assert(
    fc.property(jsonObject, (value) => {
      assert.equal(
        JSON.stringify(decodeJsonObject(encodeJson(value))),
        JSON.stringify(value),
      )
    }),
    { numRuns: 250 },
  )
})

void test("JSON Lines decoding is independent of generated chunk boundaries", () => {
  fc.assert(
    fc.property(
      jsonObject,
      fc.array(fc.nat({ max: 31 }), { maxLength: 30 }),
      (value, widths) => {
        const normalized = decodeJsonObject(encodeJson(value))
        const decoder = new JsonLineDecoder()
        const records: Array<JsonObject> = []
        for (const chunk of split(encodeJsonLine(normalized), widths)) {
          records.push(...decoder.push(chunk))
        }
        records.push(...decoder.end())
        assert.deepEqual(records, [normalized])
      },
    ),
    { numRuns: 250 },
  )
})
