import assert from "node:assert/strict"
import test from "node:test"

import {
  TRAFFIC_INVALIDATION_REQUEST_IDS_MAX,
  TRAFFIC_OBSERVABILITY_CONTRACT_VERSION,
  TrafficInvalidationSchema,
} from "../src/index.ts"
import { timestamp } from "./fixtures.ts"

void test("live invalidations are versioned bounded hints", () => {
  const invalidation = {
    contractVersion: TRAFFIC_OBSERVABILITY_CONTRACT_VERSION,
    revision: 12,
    emittedAt: timestamp,
    scopes: ["requests", "request-detail", "overview"] as const,
    requestIds: ["request-1"],
  }
  assert.deepEqual(TrafficInvalidationSchema.parse(invalidation), invalidation)

  assert.throws(() =>
    TrafficInvalidationSchema.parse({
      ...invalidation,
      requestIds: Array.from(
        { length: TRAFFIC_INVALIDATION_REQUEST_IDS_MAX + 1 },
        (_, index) => `request-${index}`,
      ),
    }),
  )
  assert.throws(() =>
    TrafficInvalidationSchema.parse({
      ...invalidation,
      scopes: ["requests", "requests"],
    }),
  )
  assert.throws(() =>
    TrafficInvalidationSchema.parse({ ...invalidation, results: [] }),
  )
})
