import { z } from "zod"

import type { SystemOneJsonValue } from "./contract.ts"

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false
  }
  const prototype: unknown = Object.getPrototypeOf(value)
  return prototype === null || prototype === Object.prototype
}

function setRecordEntry<T>(
  target: Record<string, T>,
  key: string,
  value: T,
): void {
  if (key === "__proto__") {
    Object.defineProperty(target, key, {
      configurable: true,
      enumerable: true,
      value,
      writable: true,
    })
    return
  }
  target[key] = value
}

export function preservingRecordSchema<TValue extends z.ZodType>(
  keySchema: z.ZodType<string>,
  valueSchema: TValue,
): z.ZodType<Record<string, z.output<TValue>>> {
  return z.unknown().transform((value, context) => {
    if (!isRecord(value)) {
      context.addIssue({
        code: "custom",
        message: "Expected an object record",
      })
      return z.NEVER
    }

    const result: Record<string, z.output<TValue>> = {}
    let valid = true
    for (const [key, entry] of Object.entries(value)) {
      const parsedKey = keySchema.safeParse(key)
      if (!parsedKey.success) {
        valid = false
        for (const issue of parsedKey.error.issues) {
          context.addIssue({ ...issue, path: [key, ...issue.path] })
        }
        continue
      }
      const parsedValue = valueSchema.safeParse(entry)
      if (!parsedValue.success) {
        valid = false
        for (const issue of parsedValue.error.issues) {
          context.addIssue({ ...issue, path: [key, ...issue.path] })
        }
        continue
      }
      setRecordEntry(result, parsedKey.data, parsedValue.data)
    }
    return valid ? result : z.NEVER
  })
}

export const preservingJsonSchema: z.ZodType<SystemOneJsonValue> = z.lazy(() =>
  z.union([
    z.boolean(),
    z.number(),
    z.string(),
    z.null(),
    z.array(preservingJsonSchema),
    preservingRecordSchema(z.string(), preservingJsonSchema),
  ]),
)
