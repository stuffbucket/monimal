import assert from "node:assert/strict"
import test from "node:test"

import {
  SERVING_HARDENING_CONTROLS,
  ServingHardeningDecisionSchema,
  ServingHardeningReportSchema,
} from "../src/control.ts"

function report() {
  return {
    schemaVersion: 1,
    id: "inspection/1",
    inspectorId: "host-inspector",
    observedAt: "2026-10-16T10:00:00.000Z",
    expiresAt: "2026-10-16T10:01:00.000Z",
    binding: {
      targetId: "target/1",
      deploymentRevision: "revision/1",
      runtimeDigest: `sha256:${"a".repeat(64)}`,
      configurationDigest: `sha256:${"b".repeat(64)}`,
      artifactDigests: [`sha256:${"c".repeat(64)}`],
      ingressPolicyDigest: `sha256:${"d".repeat(64)}`,
      egressPolicyDigest: `sha256:${"e".repeat(64)}`,
    },
    controls: Object.fromEntries(
      SERVING_HARDENING_CONTROLS.map((control) => [control, "pass"]),
    ),
  }
}

void test("hardening evidence requires every control, binding, and schema version", () => {
  assert.equal(ServingHardeningReportSchema.safeParse(report()).success, true)
  for (const control of SERVING_HARDENING_CONTROLS) {
    const value = report()
    Reflect.deleteProperty(value.controls, control)
    assert.equal(ServingHardeningReportSchema.safeParse(value).success, false)
  }
  assert.equal(
    ServingHardeningReportSchema.safeParse({ ...report(), schemaVersion: 2 })
      .success,
    false,
  )
  assert.equal(
    ServingHardeningReportSchema.safeParse({
      ...report(),
      binding: { ...report().binding, artifactDigests: [] },
    }).success,
    false,
  )
})

void test("hardening evidence rejects credentials, endpoint URLs, commands, and extra control claims", () => {
  for (const field of ["apiKey", "endpoint", "command", "filesystemPath"]) {
    assert.equal(
      ServingHardeningReportSchema.safeParse({
        ...report(),
        [field]: "untrusted-value",
      }).success,
      false,
    )
  }
  assert.equal(
    ServingHardeningReportSchema.safeParse({
      ...report(),
      controls: { ...report().controls, "server-says-safe": "pass" },
    }).success,
    false,
  )
})

void test("validated evidence is detached and deeply immutable", () => {
  const input = report()
  const parsed = ServingHardeningReportSchema.parse(input)
  input.controls["isolated-network"] = "fail"
  input.binding.artifactDigests[0] = `sha256:${"f".repeat(64)}`
  assert.equal(parsed.controls["isolated-network"], "pass")
  assert.notEqual(
    parsed.binding.artifactDigests[0],
    input.binding.artifactDigests[0],
  )
  for (const value of [
    parsed,
    parsed.controls,
    parsed.binding,
    parsed.binding.artifactDigests,
  ])
    assert.equal(Object.isFrozen(value), true)
})

void test("a blocked decision requires explicit reasons and cannot be labeled authorized", () => {
  assert.equal(
    ServingHardeningDecisionSchema.safeParse({ state: "blocked", issues: [] })
      .success,
    false,
  )
  assert.equal(
    ServingHardeningDecisionSchema.safeParse({ state: "authorized" }).success,
    false,
  )
})
