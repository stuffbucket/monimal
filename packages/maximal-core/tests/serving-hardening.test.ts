import type {
  ServingHardeningDecision,
  ServingHardeningReport,
} from "@maximal/maximal-core-contract/control"

import {
  SERVING_HARDENING_CONTROLS,
  ServingHardeningReportSchema,
} from "@maximal/maximal-core-contract/control"
import { describe, expect, test } from "bun:test"
import assert from "node:assert/strict"

import { createSharingHardeningGate } from "~/lib/model-exposure/hardening"

const observedAt = "2026-10-16T10:00:00.000Z"
const checkedAt = Date.parse("2026-10-16T10:00:10.000Z")
const digest = (character: string) => `sha256:${character.repeat(64)}`

function report(
  overrides: Partial<ServingHardeningReport> = {},
): ServingHardeningReport {
  return ServingHardeningReportSchema.parse({
    schemaVersion: 1,
    id: "review/1",
    inspectorId: "trusted-host-inspector",
    observedAt,
    expiresAt: "2026-10-16T10:10:00.000Z",
    binding: {
      targetId: "deployment/perun/brain",
      deploymentRevision: "deployment-revision/1",
      runtimeDigest: digest("a"),
      configurationDigest: digest("b"),
      artifactDigests: [digest("c"), digest("d")],
      ingressPolicyDigest: digest("e"),
      egressPolicyDigest: digest("f"),
    },
    controls: Object.fromEntries(
      SERVING_HARDENING_CONTROLS.map((control) => [control, "pass"]),
    ),
    ...overrides,
  })
}

function gate(value: unknown) {
  return createSharingHardeningGate({
    readTrustedReport: () => Promise.resolve(value),
    isTrustedInspector: (id) => id === "trusted-host-inspector",
    maxEvidenceAgeMs: 60_000,
    now: () => checkedAt,
  })
}

function blockingKinds(decision: ServingHardeningDecision) {
  if (decision.state !== "blocked")
    throw new Error("Expected blocked hardening")
  return decision.issues.map(({ kind }) => kind)
}

describe("serving hardening precondition", () => {
  test("fresh trusted evidence permits checks only, bounded by the stricter policy expiry", async () => {
    const evidence = report()
    const decision = await gate(evidence).require(evidence.binding)
    expect(decision).toEqual({
      state: "checks-passed",
      reportId: evidence.id,
      expiresAt: "2026-10-16T10:01:00.000Z",
    })
    expect(Object.isFrozen(decision)).toBe(true)
  })

  test("the current Perun risk pattern blocks exposure despite passing API authentication", async () => {
    const evidence = report()
    const unsafe = report({
      controls: {
        ...evidence.controls,
        "unprivileged-process": "fail",
        "isolated-network": "fail",
        "read-only-root": "fail",
        "resource-limits": "fail",
        "egress-default-deny": "unknown",
        "host-and-lan-access-restricted": "unknown",
      },
    })
    const decision = await gate(unsafe).check(evidence.binding)
    expect(decision.state).toBe("blocked")
    if (decision.state !== "blocked")
      throw new Error("Expected blocked Perun pattern")
    expect(decision.issues).toContainEqual({
      kind: "control",
      control: "isolated-network",
      state: "fail",
    })
    expect(decision.issues).toContainEqual({
      kind: "control",
      control: "egress-default-deny",
      state: "unknown",
    })
    await assert.rejects(gate(unsafe).require(evidence.binding), /did not pass/)
  })

  test("every failed or unknown control blocks, rather than contributing to a score", async () => {
    const evidence = report()
    for (const control of SERVING_HARDENING_CONTROLS) {
      for (const state of ["fail", "unknown"] as const) {
        const value = report({
          controls: { ...evidence.controls, [control]: state },
        })
        expect(await gate(value).check(evidence.binding)).toEqual({
          state: "blocked",
          issues: [{ kind: "control", control, state }],
        })
      }
    }
  })

  test("missing, malformed, or unavailable inspection never passes", async () => {
    const evidence = report()
    expect(
      blockingKinds(await gate(undefined).check(evidence.binding)),
    ).toEqual(["missing-report"])
    const incomplete = { ...evidence.controls }
    Reflect.deleteProperty(incomplete, "egress-default-deny")
    expect(
      blockingKinds(
        await gate({ ...evidence, controls: incomplete }).check(
          evidence.binding,
        ),
      ),
    ).toEqual(["invalid-report"])
    const unavailable = createSharingHardeningGate({
      readTrustedReport: () =>
        Promise.reject(new Error("private collector error")),
      isTrustedInspector: () => true,
      maxEvidenceAgeMs: 60_000,
    })
    const decision = await unavailable.check(evidence.binding)
    expect(blockingKinds(decision)).toEqual(["inspection-unavailable"])
    expect(JSON.stringify(decision)).not.toContain("private collector error")
  })

  test("inspector names alone cannot establish trust", async () => {
    const evidence = report({ inspectorId: "model-server-self-report" })
    expect(blockingKinds(await gate(evidence).check(evidence.binding))).toEqual(
      ["untrusted-inspector"],
    )
  })

  test("stale, expired, future, and invalid-lifetime reports are rejected", async () => {
    const evidence = report()
    const cases = [
      {
        value: report({ observedAt: "2026-10-16T09:59:00.000Z" }),
        kind: "stale-report",
      },
      {
        value: report({ expiresAt: "2026-10-16T10:00:10.000Z" }),
        kind: "stale-report",
      },
      {
        value: report({ observedAt: "2026-10-16T10:00:11.000Z" }),
        kind: "future-report",
      },
      { value: report({ expiresAt: observedAt }), kind: "invalid-report" },
    ] as const
    for (const { value, kind } of cases) {
      expect(blockingKinds(await gate(value).check(evidence.binding))).toEqual([
        kind,
      ])
    }
  })

  test("target, revision, runtime, artifacts, configuration, and network policy changes require new inspection", async () => {
    const evidence = report()
    const changes = [
      { targetId: "deployment/other/brain" },
      { deploymentRevision: "deployment-revision/2" },
      { runtimeDigest: digest("0") },
      { configurationDigest: digest("0") },
      { artifactDigests: [digest("0")] },
      { ingressPolicyDigest: digest("0") },
      { egressPolicyDigest: digest("0") },
    ]
    for (const change of changes) {
      const current = { ...evidence.binding, ...change }
      expect(blockingKinds(await gate(evidence).check(current))).toEqual([
        "deployment-changed",
      ])
    }
    expect(
      (
        await gate(evidence).check({
          ...evidence.binding,
          artifactDigests: [...evidence.binding.artifactDigests].reverse(),
        })
      ).state,
    ).toBe("checks-passed")
  })

  test("every action re-reads evidence and current inspector authorization", async () => {
    let reads = 0
    let trusted = true
    const evidence = report()
    const checker = createSharingHardeningGate({
      readTrustedReport: () => {
        reads += 1
        return Promise.resolve(evidence)
      },
      isTrustedInspector: () => trusted,
      maxEvidenceAgeMs: 60_000,
      now: () => checkedAt,
    })
    expect((await checker.check(evidence.binding)).state).toBe("checks-passed")
    trusted = false
    expect(blockingKinds(await checker.check(evidence.binding))).toEqual([
      "untrusted-inspector",
    ])
    expect(reads).toBe(2)
  })

  test("an explicit positive policy age is required", () => {
    for (const maxEvidenceAgeMs of [0, -1, Number.NaN, Infinity]) {
      expect(() =>
        createSharingHardeningGate({
          readTrustedReport: () => Promise.resolve(undefined),
          isTrustedInspector: () => false,
          maxEvidenceAgeMs,
        }),
      ).toThrow(/explicit evidence age/)
    }
  })
})
