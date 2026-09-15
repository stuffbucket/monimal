import assert from "node:assert/strict"
import test from "node:test"

import * as contract from "../src/index.ts"

void test("public runtime exports contain only contract constants and schemas", () => {
  const exports = Object.keys(contract)

  assert.ok(exports.includes("TRAFFIC_OBSERVABILITY_CONTRACT_VERSION"))
  assert.ok(exports.includes("TrafficRequestListSchema"))
  assert.ok(exports.includes("TrafficRequestPageSchema"))
  assert.ok(exports.includes("TrafficRequestDetailSchema"))
  assert.ok(exports.includes("TrafficOverviewSchema"))
  assert.ok(exports.includes("TrafficInvalidationSchema"))
  assert.ok(exports.includes("TrafficObservationStartSchema"))
  assert.equal(
    exports.some((name) => name.includes("React")),
    false,
  )
  assert.equal(
    exports.some((name) => name.includes("Electron")),
    false,
  )
})
