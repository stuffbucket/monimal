import type {
  DeviceAssessment,
  ModelCandidate,
  SetupStep,
} from "@maximal/maximal-core-contract/control"

import { describe, expect, test } from "bun:test"

import {
  assertPlanIntact,
  createSetupApproval,
} from "~/lib/local-model-setup/approval"
import {
  canonicalJson,
  computeSetupPlanDigest,
} from "~/lib/local-model-setup/digest"
import { createSetupOperation } from "~/lib/local-model-setup/operation"
import { createSetupPlan } from "~/lib/local-model-setup/plan"

const digestA = `sha256:${"a".repeat(64)}`
const digestB = `sha256:${"b".repeat(64)}`

const candidate: ModelCandidate = {
  approvalRequired: true,
  eligibility: { state: "eligible" },
  experienceId: "experience/text-chat",
  files: [
    { digest: digestA, sizeBytes: 1_000 },
    { digest: digestB, sizeBytes: 500 },
  ],
  id: "candidate/nimble-q8",
  location: "device",
  modelId: "nimble",
  operations: ["systemone"],
  runtime: {
    digest: `sha256:${"d".repeat(64)}`,
    id: "ollama",
    packageId: "reviewed-ollama-runtime",
    revision: "0.35.0",
  },
  schemaVersion: 1,
  sourceId: "approved-mirror",
  variantId: "nimble:latest",
}

const assessment: DeviceAssessment = {
  candidateId: "candidate/nimble-q8",
  device: {
    accelerator: "metal",
    memoryBytes: 32 * 1024 ** 3,
    runtimeVersion: "0.35.0",
    storageBytesAvailable: 200 * 1024 ** 3,
    unifiedMemory: true,
  },
  fit: "fits",
  id: "assessment/1",
  observedAt: "2026-10-16T09:00:00.000Z",
  schemaVersion: 1,
}

const steps: ReadonlyArray<SetupStep> = [
  { digest: digestA, kind: "download-file" },
  { digest: digestA, kind: "verify-file" },
  { digest: digestB, kind: "verify-file" },
  { kind: "activate-runtime", runtimeId: "ollama" },
]

function makePlan(
  overrides: Partial<Parameters<typeof createSetupPlan>[0]> = {},
) {
  return createSetupPlan({
    assessment,
    candidate,
    id: "plan/1",
    steps,
    storeId: "managed-store",
    ...overrides,
  })
}

describe("setup plan digests", () => {
  test("canonical JSON ignores key order", () => {
    expect(canonicalJson({ b: 1, a: [{ d: 1, c: 2 }] })).toBe(
      '{"a":[{"c":2,"d":1}],"b":1}',
    )
  })

  test("the digest of an unchanged plan body is stable", () => {
    const plan = makePlan()
    const { digest, ...body } = plan
    expect(computeSetupPlanDigest(body)).toBe(digest)
  })

  test("a plan carries the facts the user approves", () => {
    const plan = makePlan()
    expect(plan.sourceId).toBe("approved-mirror")
    expect(plan.storeId).toBe("managed-store")
    // Only files with a download step count toward the download size.
    expect(plan.downloadBytes).toBe(1_000)
    expect(Object.isFrozen(plan)).toBe(true)
    expect(Object.isFrozen(plan.steps)).toBe(true)
    expect(plan.steps.every((step) => Object.isFrozen(step))).toBe(true)
    expect(Object.isFrozen(plan.files)).toBe(true)
    expect(plan.files.every((file) => Object.isFrozen(file))).toBe(true)
    expect(Object.isFrozen(plan.runtime)).toBe(true)
  })

  test("a tampered plan fails its digest check", () => {
    const plan = makePlan()
    expect(() => assertPlanIntact({ ...plan, storeId: "elsewhere" })).toThrow(
      /does not match its digest/,
    )
  })
})

describe("setup approvals", () => {
  test("an approval covers its plan and starts a queued operation", () => {
    const plan = makePlan()
    const approval = createSetupApproval({
      approvedAt: "2026-10-16T09:05:00.000Z",
      id: "approval/1",
      plan,
    })
    const operation = createSetupOperation({
      approval,
      id: "operation/1",
      plan,
      revision: 1,
    })

    expect(operation.state).toBe("queued")
    expect(operation.approvalId).toBe("approval/1")
    expect(Object.isFrozen(operation)).toBe(true)
    expect(Object.isFrozen(operation.ownedWorkerIds)).toBe(true)
    expect(() =>
      Array.prototype.push.call(operation.ownedWorkerIds, "worker/unrelated"),
    ).toThrow(TypeError)
  })

  test("a changed plan cannot run under an earlier approval", () => {
    const plan = makePlan()
    const approval = createSetupApproval({
      approvedAt: "2026-10-16T09:05:00.000Z",
      id: "approval/1",
      plan,
    })
    const changed = makePlan({ storeId: "other-store" })

    expect(changed.digest).not.toBe(plan.digest)
    expect(() =>
      createSetupOperation({
        approval,
        id: "operation/2",
        plan: changed,
        revision: 1,
      }),
    ).toThrow(/needs a new approval/)
  })

  test("a tampered plan cannot be approved", () => {
    const plan = makePlan()
    expect(() =>
      createSetupApproval({
        approvedAt: "2026-10-16T09:05:00.000Z",
        id: "approval/2",
        plan: { ...plan, storeId: "elsewhere" },
      }),
    ).toThrow(/does not match its digest/)
  })
})

describe("setup plan snapshots", () => {
  test("changing caller-owned input cannot change the plan", () => {
    const step = { digest: digestA, kind: "download-file" } as const
    const mutableStep = { ...step }
    const files = candidate.files.map((file) => ({ ...file }))
    const runtime = { ...candidate.runtime }
    const plan = makePlan({
      candidate: { ...candidate, files, runtime },
      steps: [mutableStep, ...steps.slice(1)],
    })

    mutableStep.digest = digestB
    files[0].sizeBytes = 2_000
    runtime.revision = "changed-after-planning"
    expect(plan.steps[0]).toEqual(step)
    expect(plan.files[0].sizeBytes).toBe(1_000)
    expect(plan.runtime.revision).toBe("0.35.0")
    expect(() => assertPlanIntact(plan)).not.toThrow()
  })

  test("nested output rejects mutation at runtime", () => {
    const plan = makePlan()
    expect(() => {
      Array.prototype.pop.call(plan.steps)
    }).toThrow(TypeError)
    expect(() => Object.assign(plan.steps[0], { digest: digestB })).toThrow(
      TypeError,
    )
    expect(() => Object.assign(plan.files[0], { sizeBytes: 1 })).toThrow(
      TypeError,
    )
    expect(() => Object.assign(plan.runtime, { revision: "other" })).toThrow(
      TypeError,
    )
  })

  test("snapshot types also reject nested writes", () => {
    const plan = makePlan()
    expect(() => {
      // @ts-expect-error the snapshot's steps are readonly
      plan.steps[0] = steps[0]
    }).toThrow(TypeError)
    expect(() => {
      // @ts-expect-error the runtime snapshot is readonly
      plan.runtime.revision = "different-revision"
    }).toThrow(TypeError)
    expect(() => {
      // @ts-expect-error the model-file snapshot is readonly
      plan.files[0].sizeBytes = 1
    }).toThrow(TypeError)
  })

  test("model and runtime changes invalidate the previous approval", () => {
    const plan = makePlan()
    const approval = createSetupApproval({
      approvedAt: "2026-10-16T09:05:00.000Z",
      id: "approval/identity",
      plan,
    })
    const changes: ReadonlyArray<Partial<ModelCandidate>> = [
      { modelId: "different-model" },
      { variantId: "different-variant" },
      { runtime: { ...candidate.runtime, packageId: "different-package" } },
      { runtime: { ...candidate.runtime, revision: "0.36.0" } },
      { runtime: { ...candidate.runtime, digest: `sha256:${"e".repeat(64)}` } },
      {
        files: candidate.files.map((file) =>
          file.digest === digestB ?
            { ...file, sizeBytes: file.sizeBytes + 1 }
          : file,
        ),
      },
    ]
    for (const change of changes) {
      const changed = makePlan({ candidate: { ...candidate, ...change } })
      expect(changed.digest).not.toBe(plan.digest)
      expect(() =>
        createSetupOperation({
          approval,
          id: "operation/identity",
          plan: changed,
          revision: 1,
        }),
      ).toThrow(/needs a new approval/)
    }
  })
})

describe("setup plan refusals", () => {
  test("blocked candidates never produce a plan", () => {
    expect(() =>
      makePlan({
        candidate: {
          ...candidate,
          eligibility: { reason: "policy", state: "blocked" },
        },
      }),
    ).toThrow(/blocked \(policy\)/)
  })

  test("unsupported assessments refuse setup and name the reason", () => {
    expect(() =>
      makePlan({
        assessment: {
          ...assessment,
          fit: "unsupported",
          reason: "not-enough-memory",
        },
      }),
    ).toThrow(/unsupported on this device \(not-enough-memory\)/)
  })

  test("an assessment must belong to the candidate", () => {
    expect(() =>
      makePlan({
        assessment: { ...assessment, candidateId: "candidate/other" },
      }),
    ).toThrow(/does not belong to candidate/)
  })

  test("plans may only name files the candidate declares", () => {
    expect(() =>
      makePlan({
        steps: [{ digest: `sha256:${"c".repeat(64)}`, kind: "download-file" }],
      }),
    ).toThrow(/does not declare/)
  })

  test("a plan needs at least one step", () => {
    expect(() => makePlan({ steps: [] })).toThrow(/has no steps/)
  })

  test("activation must use the candidate runtime", () => {
    expect(() =>
      makePlan({
        steps: [
          ...steps.slice(0, -1),
          { kind: "activate-runtime", runtimeId: "other-runtime" },
        ],
      }),
    ).toThrow(/runtime does not match/)
  })

  test("test steps must use a supported operation", () => {
    expect(() =>
      makePlan({
        steps: [...steps, { kind: "test-operation", operation: "embeddings" }],
      }),
    ).toThrow(/operation is not supported/)
  })

  test("activation, deployment, and tests each require verified files", () => {
    const executionSteps: ReadonlyArray<SetupStep> = [
      { kind: "activate-runtime", runtimeId: "ollama" },
      { kind: "start-deployment", deploymentId: "deployment/1" },
      { kind: "test-operation", operation: "systemone" },
    ]
    for (const executionStep of executionSteps) {
      expect(() => makePlan({ steps: [steps[0], executionStep] })).toThrow(
        /must be verified before runtime execution/,
      )
    }
  })

  test("a download-only plan cannot skip verification", () => {
    expect(() => makePlan({ steps: [steps[0]] })).toThrow(
      /must be verified after its download/,
    )
  })

  test("verification before a download does not cover the new file", () => {
    expect(() =>
      makePlan({
        steps: [steps[1], steps[0], steps[2], steps[3]],
      }),
    ).toThrow(/must be verified before runtime execution/)
  })

  test("file changes cannot follow activation", () => {
    expect(() => makePlan({ steps: [...steps, steps[0]] })).toThrow(
      /File steps must precede/,
    )
  })

  test("duplicate file identities are rejected instead of double-counted", () => {
    expect(() =>
      makePlan({
        candidate: {
          ...candidate,
          files: [candidate.files[0], candidate.files[0]],
        },
      }),
    ).toThrow(/file digests must be unique/)
  })

  test("unknown command fields are rejected at the planner boundary", () => {
    const injected = {
      command: "unreviewed-command",
      kind: "activate-runtime" as const,
      runtimeId: "ollama",
    }
    expect(() =>
      makePlan({ steps: [...steps.slice(0, -1), injected] }),
    ).toThrow()
  })

  test("invalid operation revisions are rejected", () => {
    const plan = makePlan()
    const approval = createSetupApproval({
      approvedAt: "2026-10-16T09:05:00.000Z",
      id: "approval/revision",
      plan,
    })
    expect(() =>
      createSetupOperation({
        approval,
        id: "operation/revision",
        plan,
        revision: -1,
      }),
    ).toThrow()
  })
})
