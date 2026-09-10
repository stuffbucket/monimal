import type {
  LocalModelCapabilities,
  LocalModelContextLimits,
  LocalModelPublication,
} from "@stuffbucket/maximal-provider-contract"

import type { LocalModelManifest, LocalModelRunnerDescriptor } from "./types.ts"

const IDENTIFIER = /^[a-z0-9][\w.-]*$/i
const SHA256 = /^[a-f0-9]{64}$/i
const HEX = /^(?:[a-f0-9]{2})+$/i

function record(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`${name} must be an object.`)
  return value as Record<string, unknown>
}

function nonEmpty(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim())
    throw new TypeError(`${name} must be a non-empty trimmed string.`)
  return value
}

function identifier(value: unknown, name: string): string {
  const result = nonEmpty(value, name)
  if (!IDENTIFIER.test(result))
    throw new TypeError(`${name} must be an identifier.`)
  return result
}

function positiveInteger(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0)
    throw new TypeError(`${name} must be a positive safe integer.`)
  return value
}

function stringList(value: unknown, name: string): ReadonlyArray<string> {
  if (!Array.isArray(value) || value.length === 0)
    throw new TypeError(`${name} must be a non-empty array.`)
  const result = value.map((item, index) =>
    identifier(item, `${name}[${index}]`),
  )
  if (new Set(result).size !== result.length)
    throw new TypeError(`${name} must not contain duplicates.`)
  return Object.freeze(result)
}

function capabilities(value: unknown, name: string): LocalModelCapabilities {
  const input = record(value, name)
  return Object.freeze({
    input: stringList(input.input, `${name}.input`),
    output: stringList(input.output, `${name}.output`),
  })
}

function contextLimits(value: unknown): LocalModelContextLimits {
  const input = record(value, "manifest.context")
  const contextWindow = positiveInteger(
    input.contextWindow,
    "manifest.context.contextWindow",
  )
  const maxOutputTokens =
    input.maxOutputTokens === undefined ?
      undefined
    : positiveInteger(input.maxOutputTokens, "manifest.context.maxOutputTokens")
  if (maxOutputTokens !== undefined && maxOutputTokens > contextWindow)
    throw new TypeError("maxOutputTokens must not exceed contextWindow.")
  return Object.freeze({
    contextWindow,
    ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
  })
}

function publication(value: unknown): LocalModelPublication {
  if (value !== "none" && value !== "provider" && value !== "aggregate")
    throw new TypeError("manifest.publication is invalid.")
  return value
}

function fileSignature(
  value: unknown,
  expectedBytes: number,
): LocalModelManifest["fileSignature"] {
  const input = record(value, "manifest.fileSignature")
  const hex = nonEmpty(input.hex, "manifest.fileSignature.hex")
  if (!HEX.test(hex))
    throw new TypeError("manifest.fileSignature.hex must contain whole bytes.")
  const offset = input.offset ?? 0
  if (typeof offset !== "number" || !Number.isSafeInteger(offset) || offset < 0)
    throw new TypeError("manifest.fileSignature.offset must be a safe integer.")
  if (offset + hex.length / 2 > expectedBytes)
    throw new TypeError(
      "manifest.fileSignature exceeds the expected file size.",
    )
  return Object.freeze({
    hex: hex.toLowerCase(),
    ...(offset === 0 ? {} : { offset }),
  })
}

export function validateManifest(value: unknown): LocalModelManifest {
  const input = record(value, "manifest")
  const expectedBytes = positiveInteger(
    input.expectedBytes,
    "manifest.expectedBytes",
  )
  const fileName = nonEmpty(input.fileName, "manifest.fileName")
  if (fileName === "." || fileName === ".." || /[/\\]/u.test(fileName))
    throw new TypeError("manifest.fileName must be a base filename.")
  const sha256 = nonEmpty(input.sha256, "manifest.sha256")
  if (!SHA256.test(sha256))
    throw new TypeError("manifest.sha256 must be a SHA-256 hex digest.")
  return Object.freeze({
    capabilities: capabilities(input.capabilities, "manifest.capabilities"),
    context: contextLimits(input.context),
    displayName: nonEmpty(input.displayName, "manifest.displayName"),
    expectedBytes,
    fileName,
    fileSignature: fileSignature(input.fileSignature, expectedBytes),
    format: identifier(input.format, "manifest.format"),
    key: identifier(input.key, "manifest.key"),
    modelId: nonEmpty(input.modelId, "manifest.modelId"),
    publication: publication(input.publication),
    sha256: sha256.toLowerCase(),
  })
}

export function validateRunner(value: unknown): LocalModelRunnerDescriptor {
  const input = record(value, "runner")
  return Object.freeze({
    capabilities: capabilities(input.capabilities, "runner.capabilities"),
    formats: stringList(input.formats, "runner.formats"),
    id: identifier(input.id, "runner.id"),
  })
}

export function assertCompatible(
  manifest: LocalModelManifest,
  runner: LocalModelRunnerDescriptor,
): void {
  if (!runner.formats.includes(manifest.format))
    throw new Error(
      `Runner "${runner.id}" does not support ${manifest.format}.`,
    )
  for (const direction of ["input", "output"] as const) {
    const supported = new Set(runner.capabilities[direction])
    const missing = manifest.capabilities[direction].filter(
      (capability) => !supported.has(capability),
    )
    if (missing.length > 0)
      throw new Error(
        `Runner "${runner.id}" does not support required ${direction} capabilities.`,
      )
  }
}
