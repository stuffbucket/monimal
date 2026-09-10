import type { JsonObject, JsonValue } from "~/lib/host-config/types"

export interface PathValue {
  exists: boolean
  value?: JsonValue
}

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function pathValue(
  document: JsonObject | null,
  fieldPath: Array<string>,
): PathValue {
  if (document === null) return { exists: false }
  let current: JsonValue = document
  for (const segment of fieldPath) {
    if (!isJsonObject(current) || !Object.hasOwn(current, segment)) {
      return { exists: false }
    }
    current = current[segment]
  }
  return { exists: true, value: current }
}

export function setPath(
  document: JsonObject,
  fieldPath: Array<string>,
  value: JsonValue,
): void {
  if (fieldPath.length === 0) {
    throw new Error("Managed field path cannot be empty")
  }
  let current = document
  for (const segment of fieldPath.slice(0, -1)) {
    const nested = current[segment]
    if (!isJsonObject(nested)) current[segment] = {}
    current = current[segment] as JsonObject
  }
  current[fieldPath.at(-1) ?? ""] = structuredClone(value)
}

export function deletePath(
  document: JsonObject,
  fieldPath: Array<string>,
): void {
  if (fieldPath.length === 0) {
    throw new Error("Managed field path cannot be empty")
  }
  const parents: Array<[JsonObject, string]> = []
  let current = document
  for (const segment of fieldPath.slice(0, -1)) {
    const nested = current[segment]
    if (!isJsonObject(nested)) return
    parents.push([current, segment])
    current = nested
  }
  Reflect.deleteProperty(current, fieldPath.at(-1) ?? "")
  for (const [parent, segment] of parents.reverse()) {
    const nested = parent[segment]
    if (isJsonObject(nested) && Object.keys(nested).length === 0) {
      Reflect.deleteProperty(parent, segment)
    } else {
      break
    }
  }
}
