import { protocolError } from "./errors.ts"

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function requiredString(
  record: Record<string, unknown>,
  key: string,
  context: string,
): string {
  const value = record[key]
  if (typeof value !== "string") {
    protocolError(`${context}.${key} must be a string`)
  }
  return value
}

export function requiredIndex(
  record: Record<string, unknown>,
  context: string,
): number {
  const value = record.index
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    protocolError(`${context}.index must be a non-negative safe integer`)
  }
  return value as number
}

export function finiteTokenCount(value: unknown, context: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    protocolError(`${context} must be a non-negative safe integer`)
  }
  return value as number
}
