import { createHash } from "node:crypto"
import { ZodError } from "zod"

import type { ModelCatalogIndex } from "./catalog.ts"
import type { ModelCatalogReleasePin } from "./release.ts"

import { parseModelCatalogJson } from "./catalog.ts"
import {
  MODEL_CATALOG_MAX_BYTES,
  modelCatalogReleaseUrl,
  resolveModelCatalogReleasePin,
} from "./release.ts"

export type ModelCatalogLoadFailureReason =
  | "download-failed"
  | "download-too-large"
  | "digest-mismatch"
  | "invalid-encoding"
  | "invalid-json"
  | "invalid-catalog"
  | "unexpected-download-host"

export class ModelCatalogLoadError extends Error {
  readonly reason: ModelCatalogLoadFailureReason

  constructor(
    reason: ModelCatalogLoadFailureReason,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = "ModelCatalogLoadError"
    this.reason = reason
  }
}

export interface LoadModelCatalogReleaseOptions {
  readonly fetch?: typeof fetch
  readonly maxBytes?: number
  readonly signal?: AbortSignal
}

const ALLOWED_DOWNLOAD_HOSTS = new Set([
  "github.com",
  "objects.githubusercontent.com",
  "release-assets.githubusercontent.com",
])

async function readBounded(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array> {
  const declaredLength = response.headers.get("content-length")
  if (
    declaredLength !== null
    && Number.isFinite(Number(declaredLength))
    && Number(declaredLength) > maxBytes
  ) {
    throw new ModelCatalogLoadError(
      "download-too-large",
      `Model catalog exceeds the ${maxBytes}-byte download limit.`,
    )
  }
  if (response.body === null) {
    throw new ModelCatalogLoadError(
      "download-failed",
      "Model catalog response did not contain a body.",
    )
  }
  const reader = response.body.getReader()
  const chunks: Array<Uint8Array> = []
  let length = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    length += value.byteLength
    if (length > maxBytes) {
      await reader.cancel()
      throw new ModelCatalogLoadError(
        "download-too-large",
        `Model catalog exceeds the ${maxBytes}-byte download limit.`,
      )
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

function decode(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch (cause) {
    throw new ModelCatalogLoadError(
      "invalid-encoding",
      "Model catalog is not valid UTF-8.",
      { cause },
    )
  }
}

function requireMaxBytes(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError("Model catalog byte limit must be a positive integer.")
  }
  return value
}

interface DownloadReleaseOptions {
  readonly url: URL
  readonly tag: string
  readonly request: typeof fetch
  readonly signal: AbortSignal | undefined
}

async function downloadRelease({
  url,
  tag,
  request,
  signal,
}: DownloadReleaseOptions): Promise<Response> {
  try {
    return await request(url, signal === undefined ? {} : { signal })
  } catch (cause) {
    throw new ModelCatalogLoadError(
      "download-failed",
      `Could not download model catalog release ${tag}.`,
      { cause },
    )
  }
}

function assertTrustedResponse(response: Response, requestUrl: URL): void {
  if (!response.ok) {
    throw new ModelCatalogLoadError(
      "download-failed",
      `Model catalog download failed with HTTP ${response.status}.`,
    )
  }
  const responseUrl = new URL(response.url || requestUrl.href)
  if (
    responseUrl.protocol !== "https:"
    || !ALLOWED_DOWNLOAD_HOSTS.has(responseUrl.hostname)
  ) {
    throw new ModelCatalogLoadError(
      "unexpected-download-host",
      `Model catalog download resolved to untrusted host "${responseUrl.hostname}".`,
    )
  }
}

async function readRelease(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array> {
  try {
    return await readBounded(response, maxBytes)
  } catch (cause) {
    if (cause instanceof ModelCatalogLoadError) throw cause
    throw new ModelCatalogLoadError(
      "download-failed",
      "Model catalog download ended before the complete asset was read.",
      { cause },
    )
  }
}

function verifyDigest(bytes: Uint8Array, expected: string): void {
  const digest = createHash("sha256").update(bytes).digest("hex")
  if (digest !== expected) {
    throw new ModelCatalogLoadError(
      "digest-mismatch",
      "Model catalog SHA-256 does not match the pinned digest.",
    )
  }
}

function parseDownloadedCatalog(bytes: Uint8Array): ModelCatalogIndex {
  const json = decode(bytes)
  try {
    return parseModelCatalogJson(json)
  } catch (cause) {
    if (cause instanceof SyntaxError) {
      throw new ModelCatalogLoadError(
        "invalid-json",
        "Model catalog is not valid JSON.",
        { cause },
      )
    }
    if (cause instanceof ZodError) {
      throw new ModelCatalogLoadError(
        "invalid-catalog",
        "Model catalog does not satisfy the supported schema.",
        { cause },
      )
    }
    throw cause
  }
}

export async function loadModelCatalogRelease(
  pin: ModelCatalogReleasePin,
  options: LoadModelCatalogReleaseOptions = {},
): Promise<ModelCatalogIndex> {
  const resolved = resolveModelCatalogReleasePin(pin)
  const maxBytes = requireMaxBytes(options.maxBytes ?? MODEL_CATALOG_MAX_BYTES)
  const request = options.fetch ?? fetch
  const url = modelCatalogReleaseUrl(resolved)
  const response = await downloadRelease({
    url,
    tag: resolved.tag,
    request,
    signal: options.signal,
  })
  assertTrustedResponse(response, url)
  const bytes = await readRelease(response, maxBytes)
  verifyDigest(bytes, resolved.sha256)
  return parseDownloadedCatalog(bytes)
}
