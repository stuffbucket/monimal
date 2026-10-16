import type { SetupPlan } from "@maximal/maximal-core-contract/control"

import { SetupPlanSchema } from "@maximal/maximal-core-contract/control"
import { createHash } from "node:crypto"

export type SetupPlanBody = Omit<SetupPlan, "digest">

const SetupPlanBodySchema = SetupPlanSchema.unwrap().omit({ digest: true })

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item: unknown) => sortKeys(item))
  if (value === null || typeof value !== "object") return value
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => {
        if (left === right) return 0
        return left < right ? -1 : 1
      })
      .map(([key, item]) => [key, sortKeys(item)]),
  )
}

/** JSON with object keys sorted, so equal values always produce equal bytes. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value))
}

/** The digest that approvals bind to: SHA-256 over the canonical plan body. */
export function computeSetupPlanDigest(body: SetupPlanBody): string {
  const validated = SetupPlanBodySchema.parse(body)
  const hash = createHash("sha256")
    .update(canonicalJson(validated))
    .digest("hex")
  return `sha256:${hash}`
}
