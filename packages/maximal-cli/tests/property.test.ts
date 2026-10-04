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

// V8 (Node 24.x and 26.x) can corrupt a one-character escaped key (`"` or `\`)
// in a later JSON.parse call; see https://github.com/nodejs/node/issues/63785.
// Remove this filter once Node ships V8 commit 93cd21e825.
function hasEscapedSingleCharacterKey(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => hasEscapedSingleCharacterKey(item))
  }
  if (value === null || typeof value !== "object") return false
  return Object.entries(value).some(
    ([key, child]) =>
      key === '"' || key === "\\" || hasEscapedSingleCharacterKey(child),
  )
}

const jsonObject = fc
  .dictionary(fc.string(), fc.jsonValue())
  .filter((value) => !hasEscapedSingleCharacterKey(value))

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
