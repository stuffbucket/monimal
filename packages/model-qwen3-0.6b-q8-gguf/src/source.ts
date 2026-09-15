import type { LocalModelSource } from "@stuffbucket/local-model-registry"

import { createReadStream } from "node:fs"
import { lstat } from "node:fs/promises"

import { QWEN3_0_6B_Q8_0_ARTIFACT } from "./manifest.ts"

export type Fetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

export interface SourceOptions {
  fetch?: Fetch
  modelPath?: () => string | undefined
}

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error ?
      signal.reason
    : new DOMException("Opening the model source was aborted.", "AbortError")
}

function assertNotAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortError(signal)
}

export async function openCompleteFile(
  filePath: string,
  expectedBytes: number,
  signal: AbortSignal,
): Promise<AsyncIterable<Uint8Array>> {
  assertNotAborted(signal)
  const info = await lstat(filePath)
  assertNotAborted(signal)
  if (!info.isFile() || info.isSymbolicLink())
    throw new Error("STUFFBUCKET_MODEL_PATH must name a regular file.")
  if (info.size !== expectedBytes)
    throw new Error(
      "STUFFBUCKET_MODEL_PATH does not contain the complete model artifact.",
    )
  return createReadStream(filePath, { signal }) as AsyncIterable<Uint8Array>
}

export class Qwen3ModelSource implements LocalModelSource {
  readonly #fetch: Fetch
  readonly #modelPath: () => string | undefined

  constructor(options: SourceOptions = {}) {
    this.#fetch = options.fetch ?? globalThis.fetch
    this.#modelPath =
      options.modelPath ?? (() => process.env.STUFFBUCKET_MODEL_PATH)
  }

  async open(signal: AbortSignal): Promise<AsyncIterable<Uint8Array>> {
    const modelPath = this.#modelPath()
    if (modelPath !== undefined && modelPath.length > 0)
      return openCompleteFile(
        modelPath,
        QWEN3_0_6B_Q8_0_ARTIFACT.expectedBytes,
        signal,
      )

    assertNotAborted(signal)
    const response = await this.#fetch(QWEN3_0_6B_Q8_0_ARTIFACT.url, {
      headers: { "Accept-Encoding": "identity" },
      signal,
    })
    if (!response.ok)
      throw new Error(
        `Qwen3 model download failed with HTTP ${response.status}.`,
      )
    if (response.body === null)
      throw new Error("Qwen3 model download returned no response body.")

    const contentLength = response.headers.get("content-length")
    if (
      contentLength !== null
      && contentLength !== String(QWEN3_0_6B_Q8_0_ARTIFACT.expectedBytes)
    )
      throw new Error("Qwen3 model download has an unexpected content length.")

    return response.body
  }
}
