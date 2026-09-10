import assert from "node:assert/strict"
import { mkdtemp, open, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import { QWEN3_0_6B_Q8_0_ARTIFACT } from "../src/manifest.ts"
import {
  openCompleteFile,
  Qwen3ModelSource,
  type Fetch,
} from "../src/source.ts"

async function bytes(iterable: AsyncIterable<Uint8Array>): Promise<Buffer> {
  const chunks: Array<Uint8Array> = []
  for await (const chunk of iterable) chunks.push(chunk)
  return Buffer.concat(chunks)
}

void test("HTTP source opens the pinned URL as a byte stream", async () => {
  const controller = new AbortController()
  const chunks = [Buffer.from("GG"), Buffer.from("UFfixture")]
  let input: string | URL | Request | undefined
  let init: RequestInit | undefined
  const fetch: Fetch = (nextInput, nextInit) => {
    input = nextInput
    init = nextInit
    const body = new ReadableStream<Uint8Array>({
      start(stream) {
        for (const chunk of chunks) stream.enqueue(chunk)
        stream.close()
      },
    })
    return Promise.resolve(new Response(body))
  }

  const source = new Qwen3ModelSource({ fetch, modelPath: () => undefined })
  const result = await source.open(controller.signal)

  assert.equal(input, QWEN3_0_6B_Q8_0_ARTIFACT.url)
  assert.ok(init)
  assert.equal(init.signal, controller.signal)
  assert.deepEqual(init.headers, { "Accept-Encoding": "identity" })
  assert.equal((await bytes(result)).toString(), "GGUFfixture")
})

void test("complete-file override rejects partial files and leaves files intact", async () => {
  const directory = await mkdtemp(join(tmpdir(), "qwen3-source-"))
  const filePath = join(directory, "fixture.gguf")
  await writeFile(filePath, "GGUFfixture")
  try {
    await assert.rejects(
      openCompleteFile(filePath, 12, new AbortController().signal),
      /complete model artifact/,
    )
    assert.equal((await stat(filePath)).isFile(), true)
    assert.equal((await stat(filePath)).size, 11)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

void test("STUFFBUCKET_MODEL_PATH overrides fetch with an exact-size file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "qwen3-override-"))
  const filePath = join(directory, "Qwen3-0.6B-Q8_0.gguf")
  const handle = await open(filePath, "w")
  await handle.truncate(QWEN3_0_6B_Q8_0_ARTIFACT.expectedBytes)
  await handle.close()
  let fetchCalls = 0
  const source = new Qwen3ModelSource({
    fetch: () => {
      fetchCalls += 1
      return Promise.reject(new Error("fetch must not be called"))
    },
    modelPath: () => filePath,
  })
  try {
    const stream = await source.open(new AbortController().signal)
    assert.equal(fetchCalls, 0)
    assert.equal(
      (await stat(filePath)).size,
      QWEN3_0_6B_Q8_0_ARTIFACT.expectedBytes,
    )
    assert.equal(Symbol.asyncIterator in stream, true)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
