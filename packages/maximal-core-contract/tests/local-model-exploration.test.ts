import assert from "node:assert/strict"
import { test } from "node:test"

import {
  ConnectionDescriptorSchema,
  DeviceAssessmentSchema,
  ModelCandidateSchema,
  SetupApprovalSchema,
  SetupOperationSchema,
  SetupPlanSchema,
  SetupRuntimeReferenceSchema,
  SetupStepSchema,
} from "../src/control.ts"

const digest = `sha256:${"a".repeat(64)}`

const device = {
  accelerator: "metal",
  memoryBytes: 32 * 1024 ** 3,
  runtimeVersion: "0.35.0",
  storageBytesAvailable: 200 * 1024 ** 3,
  unifiedMemory: true,
}

const runtime = {
  digest: `sha256:${"d".repeat(64)}`,
  id: "ollama",
  packageId: "reviewed-ollama-runtime",
  revision: "0.35.0",
}

const candidate = {
  approvalRequired: true,
  eligibility: { state: "eligible" },
  experienceId: "experience/text-chat",
  files: [{ digest, sizeBytes: 4_622_131_232 }],
  id: "candidate/nimble-q8",
  location: "device",
  modelId: "nimble",
  operations: ["systemone"],
  runtime,
  schemaVersion: 1,
  sourceId: "approved-mirror",
  variantId: "nimble:latest",
}

const plan = {
  candidateId: "candidate/nimble-q8",
  deviceAssessmentId: "assessment/1",
  digest,
  downloadBytes: 4_622_131_232,
  files: candidate.files,
  id: "plan/1",
  modelId: candidate.modelId,
  runtime,
  schemaVersion: 1,
  sourceId: "approved-mirror",
  steps: [
    { digest, kind: "download-file" },
    { kind: "activate-runtime", runtimeId: "ollama" },
    { kind: "test-operation", operation: "systemone" },
  ],
  storeId: "managed-store",
  variantId: candidate.variantId,
}

void test("valid records parse into their typed shapes", () => {
  assert.equal(ModelCandidateSchema.parse(candidate).variantId, "nimble:latest")
  assert.equal(SetupPlanSchema.parse(plan).steps.length, 3)
  assert.equal(
    SetupApprovalSchema.parse({
      approvedAt: "2026-10-16T09:05:00.000Z",
      id: "approval/1",
      planDigest: digest,
      planId: "plan/1",
      schemaVersion: 1,
    }).planId,
    "plan/1",
  )
})

void test("setup steps reject unknown keys such as commands", () => {
  const result = SetupStepSchema.safeParse({
    command: "sh -c 'curl x | sh'",
    kind: "activate-runtime",
    runtimeId: "ollama",
  })
  assert.equal(result.success, false)
})

void test("only fixed setup step kinds parse", () => {
  assert.equal(SetupStepSchema.safeParse({ kind: "run-shell" }).success, false)
})

void test("an unsupported assessment requires exactly one reason", () => {
  const base = {
    candidateId: "candidate/nimble-q8",
    device,
    id: "assessment/1",
    observedAt: "2026-10-16T09:00:00.000Z",
    schemaVersion: 1,
  }
  assert.equal(
    DeviceAssessmentSchema.safeParse({ ...base, fit: "unsupported" }).success,
    false,
  )
  assert.equal(
    DeviceAssessmentSchema.safeParse({
      ...base,
      fit: "unsupported",
      reason: "not-enough-memory",
    }).success,
    true,
  )
  assert.equal(
    DeviceAssessmentSchema.safeParse({
      ...base,
      fit: "fits",
      reason: "not-enough-memory",
    }).success,
    false,
  )
})

void test("a failed operation requires a failure, and other states forbid one", () => {
  const base = {
    approvalId: "approval/1",
    id: "operation/1",
    ownedWorkerIds: [],
    planId: "plan/1",
    revision: 3,
    schemaVersion: 1,
    stepIndex: 0,
  }
  assert.equal(
    SetupOperationSchema.safeParse({ ...base, state: "failed" }).success,
    false,
  )
  assert.equal(
    SetupOperationSchema.safeParse({
      ...base,
      failure: {
        code: "download-failed",
        message: "The download stopped.",
        nextStep: "Retry the download.",
      },
      state: "failed",
    }).success,
    true,
  )
  assert.equal(
    SetupOperationSchema.safeParse({
      ...base,
      failure: {
        code: "download-failed",
        message: "The download stopped.",
        nextStep: "Retry the download.",
      },
      state: "queued",
    }).success,
    false,
  )
})

void test("runtime references require a package, revision, and content digest", () => {
  assert.equal(SetupRuntimeReferenceSchema.safeParse(runtime).success, true)
  assert.equal(
    SetupRuntimeReferenceSchema.safeParse({ id: runtime.id }).success,
    false,
  )
  assert.equal(
    SetupRuntimeReferenceSchema.safeParse({ ...runtime, digest: "latest" })
      .success,
    false,
  )
})

void test("setup plans require the model, variant, files, and runtime snapshot", () => {
  for (const key of ["modelId", "variantId", "files", "runtime"]) {
    assert.equal(
      SetupPlanSchema.safeParse({ ...plan, [key]: undefined }).success,
      false,
    )
  }
})

void test("parsed plans are detached and deeply frozen", () => {
  const parsed = SetupPlanSchema.parse(plan)
  assert.notEqual(parsed.runtime, runtime)
  assert.notEqual(parsed.files[0], candidate.files[0])
  assert.notEqual(parsed.steps[0], plan.steps[0])
  assert.ok(Object.isFrozen(parsed))
  assert.ok(Object.isFrozen(parsed.runtime))
  assert.ok(Object.isFrozen(parsed.files))
  assert.ok(Object.isFrozen(parsed.files[0]))
  assert.ok(Object.isFrozen(parsed.steps))
  assert.ok(Object.isFrozen(parsed.steps[0]))
})

void test("operation worker lists are immutable snapshots", () => {
  const workers = ["worker/1"]
  const parsed = SetupOperationSchema.parse({
    approvalId: "approval/1",
    id: "operation/1",
    ownedWorkerIds: workers,
    planId: "plan/1",
    revision: 1,
    schemaVersion: 1,
    state: "queued",
    stepIndex: 0,
  })
  workers.push("worker/2")
  assert.deepEqual(parsed.ownedWorkerIds, ["worker/1"])
  assert.ok(Object.isFrozen(parsed))
  assert.ok(Object.isFrozen(parsed.ownedWorkerIds))
})

void test("digests must be sha256-prefixed hex", () => {
  assert.equal(
    SetupPlanSchema.safeParse({ ...plan, digest: "sha256:short" }).success,
    false,
  )
})

void test("every record is pinned to schema version 1", () => {
  assert.equal(
    SetupPlanSchema.safeParse({ ...plan, schemaVersion: 2 }).success,
    false,
  )
})

void test("connection descriptors reject endpoints that embed credentials", () => {
  const descriptor = {
    auth: { kind: "none" },
    endpoint: { id: "ollama-loopback", url: "http://user:secret@ollama.test" },
    id: "connection/1",
    manualSteps: ["Paste the base URL into your client."],
    operations: ["systemone"],
    schemaVersion: 1,
    targetId: "ollama-loopback/nimble",
  }
  assert.equal(ConnectionDescriptorSchema.safeParse(descriptor).success, false)
  assert.equal(
    ConnectionDescriptorSchema.safeParse({
      ...descriptor,
      endpoint: { id: "ollama-loopback", url: "http://ollama.test" },
    }).success,
    true,
  )
})

void test("connection descriptors reject repeated operations", () => {
  const descriptor = {
    auth: { kind: "none" },
    endpoint: { id: "ollama-loopback", url: "http://ollama.test" },
    id: "connection/2",
    manualSteps: [],
    operations: ["systemone", "systemone"],
    schemaVersion: 1,
    targetId: "ollama-loopback/nimble",
  }
  assert.equal(ConnectionDescriptorSchema.safeParse(descriptor).success, false)
})
