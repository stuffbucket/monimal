import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

import type {
  ConditionalInverse,
  ConnectTargetResult,
  DisconnectTargetResult,
  InspectTargetResult,
  JsonObject,
  JsonValue,
  ManagedFieldPatch,
  RuntimeIdentity,
  RuntimeIdentityProbe,
  TargetClaim,
} from "~/lib/host-config/types"

import {
  deletePath,
  isJsonObject,
  pathValue,
  setPath,
} from "~/lib/host-config/json-document"
import { withHostConfigLock } from "~/lib/host-config/lock"
import {
  activeOwnershipConflict,
  connectOwnership,
  disconnectClaim,
  validateConfiguratorId,
} from "~/lib/host-config/ownership"
import { atomicWriteJson } from "~/lib/platform/atomic-json"

export interface JsonTargetOptions {
  targetPath: string
  configuratorId: string
  runtime: RuntimeIdentity
  fields:
    | Array<ManagedFieldPatch>
    | ((document: JsonObject) => Array<ManagedFieldPatch>)
  probeRuntime: RuntimeIdentityProbe
  sidecarDirectory?: string
}

export interface DisconnectJsonTargetOptions {
  targetPath: string
  configuratorId: string
  runtime: RuntimeIdentity
  sidecarDirectory?: string
}

export interface InspectJsonTargetOptions extends DisconnectJsonTargetOptions {
  probeRuntime: RuntimeIdentityProbe
}

interface TargetJournal {
  schema: 1
  targetPath: string
  beforeFingerprint: string
  afterFingerprint: string
  claimAfter: TargetClaim | null
}

function readJsonObject(filePath: string): JsonObject {
  let raw: string
  try {
    raw = fs.readFileSync(filePath, "utf8")
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return {}
    }
    throw error
  }
  const parsed: unknown = JSON.parse(raw)
  if (!isJsonObject(parsed)) {
    throw new Error(`Expected a JSON object in ${filePath}`)
  }
  return parsed
}

function cloneJsonObject(value: JsonObject): JsonObject {
  return structuredClone(value)
}

function valuesEqual(left: JsonValue | undefined, right: JsonValue): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function assertUniquePaths(fields: Array<ManagedFieldPatch>): void {
  const seen = new Set<string>()
  for (const field of fields) {
    if (field.path.length === 0 || field.path.some((part) => !part)) {
      throw new Error("Managed field paths must contain non-empty segments")
    }
    const key = JSON.stringify(field.path)
    if (seen.has(key)) throw new Error(`Duplicate managed field path: ${key}`)
    seen.add(key)
  }
}

function resolveManagedFields(
  options: JsonTargetOptions,
  document: JsonObject,
): Array<ManagedFieldPatch> {
  const fields =
    typeof options.fields === "function" ?
      options.fields(document)
    : options.fields
  assertUniquePaths(fields)
  return fields
}

export function sidecarDirectoryForTarget(targetPath: string): string {
  const absolute = path.resolve(targetPath)
  const targetHash = createHash("sha256")
    .update(absolute)
    .digest("hex")
    .slice(0, 24)
  return path.join(path.dirname(absolute), ".maximal-configurators", targetHash)
}

function sidecarPaths(targetPath: string, override?: string) {
  const directory = override ?? sidecarDirectoryForTarget(targetPath)
  return {
    directory,
    claim: path.join(directory, "owner.json"),
    journal: path.join(directory, "journal.json"),
    lock: path.join(directory, "target.lock"),
  }
}

function ensureSidecarDirectory(directory: string): void {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
  try {
    fs.chmodSync(directory, 0o700)
  } catch {
    // Windows and some shared filesystems do not implement POSIX mode bits.
  }
}

function readClaim(filePath: string): TargetClaim | null {
  try {
    const candidate: unknown = JSON.parse(fs.readFileSync(filePath, "utf8"))
    if (
      !isJsonObject(candidate)
      || candidate.schema !== 1
      || typeof candidate.revision !== "number"
      || typeof candidate.configuratorId !== "string"
      || typeof candidate.targetPath !== "string"
      || !Array.isArray(candidate.fields)
      || !isJsonObject(candidate.runtime)
    ) {
      throw new Error(`Unsupported target claim in ${filePath}`)
    }
    return candidate as unknown as TargetClaim
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null
    }
    throw error
  }
}

function writeClaim(filePath: string, claim: TargetClaim): void {
  atomicWriteJson(filePath, claim, { label: "Maximal target claim" })
}

function clearClaim(filePath: string): void {
  fs.rmSync(filePath, { force: true })
}

function fingerprint(document: JsonObject): string {
  return createHash("sha256").update(JSON.stringify(document)).digest("hex")
}

function readJournal(filePath: string): TargetJournal | null {
  try {
    const candidate: unknown = JSON.parse(fs.readFileSync(filePath, "utf8"))
    if (
      !isJsonObject(candidate)
      || candidate.schema !== 1
      || typeof candidate.targetPath !== "string"
      || typeof candidate.beforeFingerprint !== "string"
      || typeof candidate.afterFingerprint !== "string"
      || (candidate.claimAfter !== null && !isJsonObject(candidate.claimAfter))
    ) {
      throw new Error(`Unsupported target journal in ${filePath}`)
    }
    return candidate as unknown as TargetJournal
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null
    }
    throw error
  }
}

interface JournalRecovery {
  paths: ReturnType<typeof sidecarPaths>
  targetPath: string
  document: JsonObject
}

function recoverJournal({
  paths,
  targetPath,
  document,
}: JournalRecovery): boolean {
  const journal = readJournal(paths.journal)
  if (!journal) return true
  if (journal.targetPath !== path.resolve(targetPath)) return false
  const liveFingerprint = fingerprint(document)
  if (liveFingerprint === journal.afterFingerprint) {
    if (journal.claimAfter) writeClaim(paths.claim, journal.claimAfter)
    else clearClaim(paths.claim)
    clearClaim(paths.journal)
    return true
  }
  if (liveFingerprint === journal.beforeFingerprint) {
    clearClaim(paths.journal)
    return true
  }
  return false
}

interface TargetChange {
  targetPath: string
  before: JsonObject
  after: JsonObject
  claimAfter: TargetClaim | null
  label: string
}

function commitTargetChange(
  paths: ReturnType<typeof sidecarPaths>,
  change: TargetChange,
): void {
  const journal: TargetJournal = {
    schema: 1,
    targetPath: path.resolve(change.targetPath),
    beforeFingerprint: fingerprint(change.before),
    afterFingerprint: fingerprint(change.after),
    claimAfter: change.claimAfter,
  }
  atomicWriteJson(paths.journal, journal, { label: "Maximal target journal" })
  atomicWriteJson(change.targetPath, change.after, { label: change.label })
  if (change.claimAfter) writeClaim(paths.claim, change.claimAfter)
  else clearClaim(paths.claim)
  clearClaim(paths.journal)
}

function managedFieldsMatch(
  document: JsonObject,
  fields: Array<ConditionalInverse>,
): boolean {
  return fields.every((field) => {
    const live = pathValue(document, field.path)
    return live.exists && valuesEqual(live.value, field.writtenValue)
  })
}

function restoreFields(
  document: JsonObject,
  fields: Array<ConditionalInverse>,
): { document: JsonObject; preservedPaths: Array<Array<string>> } {
  const next = cloneJsonObject(document)
  const preservedPaths: Array<Array<string>> = []
  for (const field of fields) {
    const live = pathValue(document, field.path)
    if (!live.exists || !valuesEqual(live.value, field.writtenValue)) {
      preservedPaths.push(field.path)
      continue
    }
    if (field.priorExists && field.priorValue !== undefined) {
      setPath(next, field.path, field.priorValue)
    } else {
      deletePath(next, field.path)
    }
  }
  return { document: next, preservedPaths }
}

interface ClaimBuild {
  document: JsonObject
  managedFields: Array<ManagedFieldPatch>
  priorClaim?: TargetClaim
}

function buildClaim(
  options: JsonTargetOptions,
  { document, managedFields, priorClaim }: ClaimBuild,
): TargetClaim {
  const priorByPath = new Map(
    priorClaim?.fields.map((field) => [JSON.stringify(field.path), field]),
  )
  const fields = managedFields.map((field): ConditionalInverse => {
    const prior = priorByPath.get(JSON.stringify(field.path))
    if (prior) return { ...prior, writtenValue: field.value }
    const live = pathValue(document, field.path)
    return {
      path: field.path,
      priorExists: live.exists,
      ...(live.exists ? { priorValue: live.value } : {}),
      writtenValue: field.value,
    }
  })
  return {
    schema: 1,
    revision: (priorClaim?.revision ?? 0) + 1,
    configuratorId: options.configuratorId,
    runtime: options.runtime,
    targetPath: path.resolve(options.targetPath),
    fields,
  }
}

function applyFields(
  document: JsonObject,
  fields: Array<ManagedFieldPatch>,
): JsonObject {
  const next = cloneJsonObject(document)
  for (const field of fields) setPath(next, field.path, field.value)
  return next
}

function documentsEqual(left: JsonObject, right: JsonObject): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

/** Inspect one target under the same lock used by connect and disconnect. */
export async function inspectJsonTarget(
  options: InspectJsonTargetOptions,
): Promise<InspectTargetResult> {
  validateConfiguratorId(options.configuratorId)
  const paths = sidecarPaths(options.targetPath, options.sidecarDirectory)
  ensureSidecarDirectory(paths.directory)

  return withHostConfigLock(paths.lock, async () => {
    const document = readJsonObject(options.targetPath)
    if (
      !recoverJournal({
        paths,
        targetPath: options.targetPath,
        document,
      })
    ) {
      return { status: "recovery-required" }
    }
    const claim = readClaim(paths.claim)
    if (!claim) return { status: "available" }
    const ownershipConflict = await activeOwnershipConflict(claim, options)
    if (ownershipConflict) return ownershipConflict
    if (!managedFieldsMatch(document, claim.fields)) {
      return { status: "changed-externally", claim }
    }
    return { status: "connected", claim }
  })
}

/** Claim and patch one JSON target. All Maximal writers share the sidecar lock. */
export async function connectJsonTarget(
  options: JsonTargetOptions,
): Promise<ConnectTargetResult> {
  validateConfiguratorId(options.configuratorId)
  const paths = sidecarPaths(options.targetPath, options.sidecarDirectory)
  ensureSidecarDirectory(paths.directory)

  return withHostConfigLock(paths.lock, async () => {
    let document = readJsonObject(options.targetPath)
    if (
      !recoverJournal({
        paths,
        targetPath: options.targetPath,
        document,
      })
    ) {
      return { status: "recovery-required" }
    }
    let claim = readClaim(paths.claim)

    if (claim) {
      const ownership = await connectOwnership(claim, options)
      if (ownership.conflict) return ownership.conflict
      if (ownership.stale) {
        if (!managedFieldsMatch(document, claim.fields)) {
          return { status: "stale-recovery-required", claim }
        }
        const restored = restoreFields(document, claim.fields)
        commitTargetChange(paths, {
          targetPath: options.targetPath,
          before: document,
          after: restored.document,
          claimAfter: null,
          label: `${options.configuratorId} target`,
        })
        claim = null
        document = restored.document
      }
    }

    if (claim && claim.configuratorId !== options.configuratorId) {
      return { status: "owned-by-another-configurator", claim }
    }
    if (claim && !managedFieldsMatch(document, claim.fields)) {
      return { status: "changed-externally", claim }
    }

    const fields = resolveManagedFields(options, document)
    const nextClaim = buildClaim(options, {
      document,
      managedFields: fields,
      priorClaim: claim ?? undefined,
    })
    const nextDocument = applyFields(document, fields)
    const unchanged = claim !== null && documentsEqual(document, nextDocument)
    if (!documentsEqual(document, nextDocument)) {
      commitTargetChange(paths, {
        targetPath: options.targetPath,
        before: document,
        after: nextDocument,
        claimAfter: nextClaim,
        label: `${options.configuratorId} target`,
      })
    } else {
      writeClaim(paths.claim, nextClaim)
    }
    return {
      status: unchanged ? "already-connected" : "connected",
      claim: nextClaim,
    }
  })
}

/** Explicitly adopt the current managed values, then reapply this owner's patch. */
export async function reconnectJsonTarget(
  options: JsonTargetOptions,
): Promise<ConnectTargetResult> {
  validateConfiguratorId(options.configuratorId)
  const paths = sidecarPaths(options.targetPath, options.sidecarDirectory)
  ensureSidecarDirectory(paths.directory)

  return withHostConfigLock(paths.lock, async () => {
    const document = readJsonObject(options.targetPath)
    if (
      !recoverJournal({
        paths,
        targetPath: options.targetPath,
        document,
      })
    ) {
      return { status: "recovery-required" }
    }
    const claim = readClaim(paths.claim)

    if (claim) {
      const ownershipConflict = await activeOwnershipConflict(claim, options)
      if (ownershipConflict) return ownershipConflict
    }

    const changedExternally =
      claim !== null && !managedFieldsMatch(document, claim.fields)
    const fields = resolveManagedFields(options, document)
    const nextClaim = buildClaim(options, {
      document,
      managedFields: fields,
      priorClaim: changedExternally ? undefined : (claim ?? undefined),
    })
    if (claim) nextClaim.revision = claim.revision + 1
    const nextDocument = applyFields(document, fields)
    const unchanged = claim !== null && documentsEqual(document, nextDocument)

    if (!documentsEqual(document, nextDocument)) {
      commitTargetChange(paths, {
        targetPath: options.targetPath,
        before: document,
        after: nextDocument,
        claimAfter: nextClaim,
        label: `${options.configuratorId} target`,
      })
    } else {
      writeClaim(paths.claim, nextClaim)
    }
    return {
      status: unchanged ? "already-connected" : "connected",
      claim: nextClaim,
    }
  })
}

/** Conditionally undo fields still equal to this runtime's recorded output. */
export async function disconnectJsonTarget(
  options: DisconnectJsonTargetOptions,
): Promise<DisconnectTargetResult> {
  validateConfiguratorId(options.configuratorId)
  const paths = sidecarPaths(options.targetPath, options.sidecarDirectory)
  ensureSidecarDirectory(paths.directory)

  return withHostConfigLock(paths.lock, () => {
    const document = readJsonObject(options.targetPath)
    if (
      !recoverJournal({
        paths,
        targetPath: options.targetPath,
        document,
      })
    ) {
      return { status: "recovery-required", preservedPaths: [] }
    }
    const claim = disconnectClaim(
      readClaim(paths.claim),
      options.configuratorId,
      options.runtime,
    )
    if ("status" in claim) return claim

    const restored = restoreFields(document, claim.fields)
    if (!documentsEqual(document, restored.document)) {
      commitTargetChange(paths, {
        targetPath: options.targetPath,
        before: document,
        after: restored.document,
        claimAfter: null,
        label: `${options.configuratorId} target`,
      })
    } else {
      clearClaim(paths.claim)
    }
    return {
      status: "disconnected",
      preservedPaths: restored.preservedPaths,
    }
  })
}
