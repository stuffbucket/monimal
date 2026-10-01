import assert from "node:assert/strict"
import test from "node:test"

import {
  decodeJsonObject,
  JsonLineDecoder,
  readJsonObject,
} from "../src/stdio.ts"

function utf16Bytes(text: string, bigEndian = false): Uint8Array {
  const bytes = Buffer.from(text, "utf16le")
  if (bigEndian) {
    for (let index = 0; index < bytes.length; index += 2) {
      const first = bytes[index]
      bytes[index] = bytes[index + 1] ?? 0
      bytes[index + 1] = first ?? 0
    }
  }
  return Uint8Array.from([
    ...(bigEndian ? [0xfe, 0xff] : [0xff, 0xfe]),
    ...bytes,
  ])
}

void test("JSON documents enforce object shape, encoding, and exact bounds", () => {
  const json = '{"message":"héllo"}'
  const utf8 = new TextEncoder().encode(json)

  assert.deepEqual(decodeJsonObject(utf8, utf8.byteLength), {
    message: "héllo",
  })
  assert.deepEqual(decodeJsonObject(utf16Bytes(json)), { message: "héllo" })
  assert.deepEqual(decodeJsonObject(utf16Bytes(json, true)), {
    message: "héllo",
  })
  assert.throws(
    () => decodeJsonObject(utf8, utf8.byteLength - 1),
    new RangeError(
      `JSON document exceeds the ${utf8.byteLength - 1} byte limit.`,
    ),
  )
  for (const value of ["null", "[]", '"text"', "42"]) {
    assert.throws(
      () => decodeJsonObject(new TextEncoder().encode(value)),
      new TypeError("The JSON document must contain an object."),
    )
  }
  assert.throws(() => decodeJsonObject(Uint8Array.of(0xef)), TypeError)
})

void test("decoder accepts every BOM split and a final unterminated record", () => {
  const expected = { message: "héllo" }
  for (const bytes of [
    Uint8Array.from([
      0xef,
      0xbb,
      0xbf,
      ...new TextEncoder().encode(JSON.stringify(expected)),
    ]),
    utf16Bytes(JSON.stringify(expected)),
    utf16Bytes(JSON.stringify(expected), true),
  ]) {
    for (let split = 0; split <= Math.min(3, bytes.byteLength); split += 1) {
      const decoder = new JsonLineDecoder()
      assert.deepEqual(decoder.push(bytes.subarray(0, split)), [])
      assert.deepEqual(decoder.push(new Uint8Array()), [])
      assert.deepEqual(decoder.push(bytes.subarray(split)), [])
      assert.deepEqual(decoder.end(), [expected])
    }
  }
  const empty = new JsonLineDecoder()
  assert.deepEqual(empty.end(), [])
  assert.deepEqual(empty.end(), [])

  const once = new JsonLineDecoder()
  once.push(new TextEncoder().encode('{"once":true}'))
  assert.deepEqual(once.end(), [{ once: true }])
  assert.deepEqual(once.end(), [])
})

void test("decoder rejects blank and non-object records exactly", () => {
  for (const [line, error] of [
    ["\n", new SyntaxError("JSON lines must not contain blank records.")],
    ["\r\n", new SyntaxError("JSON lines must not contain blank records.")],
    ["[]\n", new TypeError("Each JSON line must contain an object.")],
    ["null\n", new TypeError("Each JSON line must contain an object.")],
  ] as const) {
    const decoder = new JsonLineDecoder()
    assert.throws(() => decoder.push(new TextEncoder().encode(line)), error)
  }
})

void test("decoder counts record bytes in the detected encoding", () => {
  const utf8 = new JsonLineDecoder({ maxRecordBytes: 8 })
  assert.deepEqual(utf8.push(new TextEncoder().encode('{"é":1}\n')), [{ é: 1 }])
  assert.throws(
    () =>
      new JsonLineDecoder({ maxRecordBytes: 7 }).push(
        new TextEncoder().encode('{"é":1}\n'),
      ),
    /7 byte limit/u,
  )

  const utf16 = utf16Bytes('{"a":1}\n')
  assert.deepEqual(new JsonLineDecoder({ maxRecordBytes: 14 }).push(utf16), [
    { a: 1 },
  ])
  assert.throws(
    () => new JsonLineDecoder({ maxRecordBytes: 13 }).push(utf16),
    /13 byte limit/u,
  )
})

void test("decoder flushes and rejects truncated UTF-8 at EOF", () => {
  const decoder = new JsonLineDecoder()
  assert.deepEqual(
    decoder.push(
      Uint8Array.from([...new TextEncoder().encode('{"message":"'), 0xc3]),
    ),
    [],
  )
  assert.throws(() => decoder.end(), TypeError)
})

void test("bounded JSON reads stop before consuming excess input", async () => {
  const exact = new TextEncoder().encode('{"a":1}')
  await assert.doesNotReject(
    readJsonObject(
      {
        [Symbol.asyncIterator]() {
          const chunks = [exact.subarray(0, 3), exact.subarray(3)]
          let index = 0
          return {
            next(): Promise<IteratorResult<Uint8Array>> {
              const chunk = chunks[index]
              index += 1
              return Promise.resolve(
                chunk === undefined ?
                  { done: true, value: undefined }
                : { done: false, value: chunk },
              )
            },
          }
        },
      },
      exact.byteLength,
    ),
  )

  let reads = 0
  await assert.rejects(
    readJsonObject(
      {
        [Symbol.asyncIterator]() {
          const chunks = [exact.subarray(0, 4), exact.subarray(4)] as const
          return {
            next(): Promise<IteratorResult<Uint8Array>> {
              reads += 1
              const chunk = chunks[reads - 1]
              if (chunk) {
                return Promise.resolve({ done: false, value: chunk })
              }
              return Promise.reject(new Error("read past bound"))
            },
          }
        },
      },
      exact.byteLength - 1,
    ),
    new RangeError(
      `JSON document exceeds the ${exact.byteLength - 1} byte limit.`,
    ),
  )
  assert.equal(reads, 2)
})
