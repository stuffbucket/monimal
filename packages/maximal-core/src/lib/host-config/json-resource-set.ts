import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

import type {
  OwnerIdentity,
  OwnershipOptions,
} from "~/lib/host-config/ownership"
import type {
  ConditionalInverse,
  ConnectTargetResult,
  DisconnectTargetResult,
  InspectTargetResult,
  JsonObject,
  JsonValue,
  ManagedFieldPatch,
  TargetClaim,
} from "~/lib/host-config/types"

import {
  deletePath,
  isJsonObject,
  pathValue,
  setPath,
} from "~/lib/host-config/json-document"
import { sidecarDirectoryForTarget } from "~/lib/host-config/json-target"
import { withHostConfigLock } from "~/lib/host-config/lock"
import {
  activeOwnershipConflict,
  connectOwnership,
  disconnectClaim,
  validateConfiguratorId,
} from "~/lib/host-config/ownership"
import { atomicWriteJson } from "~/lib/platform/atomic-json"

export interface ManagedArrayEntryPatch {
  path: Array<string>
  key: string
  keyValue: JsonValue
  value: JsonObject
}

export interface JsonResourcePatch {
  targetPath: string
  fields:
    | Array<ManagedFieldPatch>
    | ((document: JsonObject) => Array<ManagedFieldPatch>)
  arrayEntries?: Array<ManagedArrayEntryPatch>
}

interface ResolvedJsonResourcePatch {
  targetPath: string
  fields: Array<ManagedFieldPatch>
  arrayEntries: Array<ManagedArrayEntryPatch>
}

export interface JsonResourceSetOptions extends OwnershipOptions {
  anchorPath: string
  resources: Array<JsonResourcePatch>
  sidecarDirectory?: string
}

export interface InspectJsonResourceSetOptions extends OwnershipOptions {
  anchorPath: string
  sidecarDirectory?: string
}

export interface DisconnectJsonResourceSetOptions extends OwnerIdentity {
  anchorPath: string
  sidecarDirectory?: string
}

type Document = JsonObject | null

interface ResourceJournalEntry {
  targetPath: string
  beforeFingerprint: string | null
  afterFingerprint: string | null
}

interface ResourceJournal {
  schema: 1
  anchorPath: string
  resources: Array<ResourceJournalEntry>
  claimAfter: TargetClaim | null
}

function readDocument(targetPath: string): Document {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(targetPath, "utf8"))
    if (!isJsonObject(parsed)) {
      throw new Error(`Expected a JSON object in ${targetPath}`)
    }
    return parsed
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null
    }
    throw error
  }
}

function fingerprint(document: Document): string | null {
  return document === null ? null : (
      createHash("sha256").update(JSON.stringify(document)).digest("hex")
    )
}

function pathsFor(options: { anchorPath: string; sidecarDirectory?: string }) {
  const directory =
    options.sidecarDirectory ?? sidecarDirectoryForTarget(options.anchorPath)
  return {
    directory,
    claim: path.join(directory, "owner.json"),
    journal: path.join(directory, "journal.json"),
    lock: path.join(directory, "target.lock"),
  }
}

function ensureSidecar(directory: string): void {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
  try {
    fs.chmodSync(directory, 0o700)
  } catch {
    // Windows and some shared filesystems do not implement POSIX mode bits.
  }
}

function readClaim(claimPath: string): TargetClaim | null {
  try {
    const candidate: unknown = JSON.parse(fs.readFileSync(claimPath, "utf8"))
    if (
      !isJsonObject(candidate)
      || candidate.schema !== 1
      || typeof candidate.configuratorId !== "string"
      || typeof candidate.revision !== "number"
      || typeof candidate.targetPath !== "string"
      || !Array.isArray(candidate.fields)
      || !isJsonObject(candidate.runtime)
    ) {
      throw new Error(`Unsupported target claim in ${claimPath}`)
    }
    return candidate as unknown as TargetClaim
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null
    }
    throw error
  }
}

function writeClaim(claimPath: string, claim: TargetClaim): void {
  atomicWriteJson(claimPath, claim, { label: "Maximal target claim" })
}

function clear(filePath: string): void {
  fs.rmSync(filePath, { force: true })
}

function readJournal(journalPath: string): ResourceJournal | null {
  try {
    const candidate: unknown = JSON.parse(fs.readFileSync(journalPath, "utf8"))
    if (
      !isJsonObject(candidate)
      || candidate.schema !== 1
      || typeof candidate.anchorPath !== "string"
      || !Array.isArray(candidate.resources)
      || (candidate.claimAfter !== null && !isJsonObject(candidate.claimAfter))
    ) {
      throw new Error(`Unsupported target journal in ${journalPath}`)
    }
    return candidate as unknown as ResourceJournal
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null
    }
    throw error
  }
}

function recoverJournal(
  journalPath: string,
  claimPath: string,
  anchorPath: string,
): boolean {
  const journal = readJournal(journalPath)
  if (!journal) return true
  if (journal.anchorPath !== path.resolve(anchorPath)) return false
  const states = journal.resources.map((resource) => ({
    live: fingerprint(readDocument(resource.targetPath)),
    before: resource.beforeFingerprint,
    after: resource.afterFingerprint,
  }))
  if (states.every((state) => state.live === state.after)) {
    if (journal.claimAfter) writeClaim(claimPath, journal.claimAfter)
    else clear(claimPath)
    clear(journalPath)
    return true
  }
  if (states.every((state) => state.live === state.before)) {
    clear(journalPath)
    return true
  }
  return false
}

function documentMap(targetPaths: Iterable<string>): Map<string, Document> {
  return new Map(
    [
      ...new Set(
        [...targetPaths].map((targetPath) => path.resolve(targetPath)),
      ),
    ].map((targetPath) => [targetPath, readDocument(targetPath)]),
  )
}

function claimTargets(claim: TargetClaim): Array<string> {
  return [
    ...new Set(
      claim.fields
        .map((field) => field.targetPath)
        .filter(
          (targetPath): targetPath is string => typeof targetPath === "string",
        ),
    ),
  ]
}

function arrayEntryValue(
  document: Document,
  patch: Pick<ManagedArrayEntryPatch, "path" | "key" | "keyValue">,
): { arrayExists: boolean; entryExists: boolean; value?: JsonObject } {
  const arrayValue = pathValue(document, patch.path)
  if (!arrayValue.exists || !Array.isArray(arrayValue.value)) {
    return { arrayExists: false, entryExists: false }
  }
  const entry = arrayValue.value.find(
    (candidate) =>
      isJsonObject(candidate)
      && JSON.stringify(candidate[patch.key])
        === JSON.stringify(patch.keyValue),
  )
  return entry && isJsonObject(entry) ?
      { arrayExists: true, entryExists: true, value: entry }
    : { arrayExists: true, entryExists: false }
}

function setArrayEntry(
  document: JsonObject,
  patch: ManagedArrayEntryPatch,
): void {
  const arrayValue = pathValue(document, patch.path)
  const entries = Array.isArray(arrayValue.value) ? [...arrayValue.value] : []
  const index = entries.findIndex(
    (candidate) =>
      isJsonObject(candidate)
      && JSON.stringify(candidate[patch.key])
        === JSON.stringify(patch.keyValue),
  )
  if (index === -1) entries.push(structuredClone(patch.value))
  else entries[index] = structuredClone(patch.value)
  setPath(document, patch.path, entries)
}

function restoreArrayEntry(
  document: JsonObject,
  field: ConditionalInverse,
): void {
  const entry = field.arrayEntry
  if (!entry) return
  const arrayValue = pathValue(document, field.path)
  if (!Array.isArray(arrayValue.value)) return
  const entries = [...arrayValue.value]
  const index = entries.findIndex(
    (candidate) =>
      isJsonObject(candidate)
      && JSON.stringify(candidate[entry.key])
        === JSON.stringify(entry.keyValue),
  )
  if (index === -1) return
  if (field.priorExists && field.priorValue !== undefined) {
    entries[index] = structuredClone(field.priorValue)
  } else {
    entries.splice(index, 1)
  }
  if (entries.length === 0 && !entry.priorArrayExists)
    deletePath(document, field.path)
  else setPath(document, field.path, entries)
}

function managedFieldsMatch(
  documents: Map<string, Document>,
  fields: Array<ConditionalInverse>,
): boolean {
  return fields.every((field) => {
    if (!field.targetPath) return false
    const document = documents.get(path.resolve(field.targetPath)) ?? null
    if (field.arrayEntry) {
      const live = arrayEntryValue(document, {
        path: field.path,
        key: field.arrayEntry.key,
        keyValue: field.arrayEntry.keyValue,
      })
      return (
        live.entryExists
        && JSON.stringify(live.value) === JSON.stringify(field.writtenValue)
      )
    }
    const live = pathValue(document, field.path)
    return (
      live.exists
      && JSON.stringify(live.value) === JSON.stringify(field.writtenValue)
    )
  })
}

function resolveResources(
  resources: Array<JsonResourcePatch>,
  documents: Map<string, Document>,
): Array<ResolvedJsonResourcePatch> {
  return resources.map((resource) => {
    const targetPath = path.resolve(resource.targetPath)
    return {
      targetPath,
      fields:
        typeof resource.fields === "function" ?
          resource.fields(documents.get(targetPath) ?? {})
        : resource.fields,
      arrayEntries: resource.arrayEntries ?? [],
    }
  })
}

function inverseKey(
  targetPath: string | undefined,
  fieldPath: Array<string>,
  arrayEntry?: { key: string; keyValue: JsonValue },
): string {
  return JSON.stringify([
    targetPath,
    fieldPath,
    arrayEntry ? [arrayEntry.key, arrayEntry.keyValue] : null,
  ])
}

interface ResourceClaimBuild {
  resources: Array<ResolvedJsonResourcePatch>
  documents: Map<string, Document>
  prior?: TargetClaim
}

function buildClaim(
  options: JsonResourceSetOptions,
  { resources, documents, prior }: ResourceClaimBuild,
): TargetClaim {
  const priorByField = new Map(
    prior?.fields.map((field) => [
      inverseKey(field.targetPath, field.path, field.arrayEntry),
      field,
    ]),
  )
  const fields = resources.flatMap((resource): Array<ConditionalInverse> => {
    const targetPath = path.resolve(resource.targetPath)
    const fieldInverses = resource.fields.map((field): ConditionalInverse => {
      const previous = priorByField.get(inverseKey(targetPath, field.path))
      if (previous) return { ...previous, writtenValue: field.value }
      const live = pathValue(documents.get(targetPath) ?? null, field.path)
      return {
        targetPath,
        path: [...field.path],
        priorExists: live.exists,
        ...(live.exists ? { priorValue: live.value } : {}),
        writtenValue: field.value,
      }
    })
    const entryInverses = resource.arrayEntries.map(
      (entry): ConditionalInverse => {
        const arrayEntry = {
          key: entry.key,
          keyValue: entry.keyValue,
          priorArrayExists: arrayEntryValue(
            documents.get(targetPath) ?? null,
            entry,
          ).arrayExists,
        }
        const previous = priorByField.get(
          inverseKey(targetPath, entry.path, arrayEntry),
        )
        if (previous) {
          return { ...previous, writtenValue: entry.value }
        }
        const live = arrayEntryValue(documents.get(targetPath) ?? null, entry)
        return {
          targetPath,
          path: [...entry.path],
          arrayEntry,
          priorExists: live.entryExists,
          ...(live.entryExists ? { priorValue: live.value } : {}),
          writtenValue: entry.value,
        }
      },
    )
    return [...fieldInverses, ...entryInverses]
  })
  const targetPaths = resources.map((resource) =>
    path.resolve(resource.targetPath),
  )
  return {
    schema: 1,
    revision: (prior?.revision ?? 0) + 1,
    configuratorId: options.configuratorId,
    runtime: options.runtime,
    targetPath: path.resolve(options.anchorPath),
    fields,
    createdTargets:
      prior?.createdTargets
      ?? targetPaths.filter((targetPath) => documents.get(targetPath) === null),
  }
}

function applyResources(
  documents: Map<string, Document>,
  resources: Array<ResolvedJsonResourcePatch>,
): Map<string, Document> {
  const next = new Map(documents)
  for (const resource of resources) {
    const targetPath = path.resolve(resource.targetPath)
    const document = structuredClone(next.get(targetPath) ?? {})
    for (const field of resource.fields)
      setPath(document, field.path, field.value)
    for (const entry of resource.arrayEntries) setArrayEntry(document, entry)
    next.set(targetPath, document)
  }
  return next
}

function restoreClaim(
  documents: Map<string, Document>,
  claim: TargetClaim,
): { documents: Map<string, Document>; preservedPaths: Array<Array<string>> } {
  const next = new Map(documents)
  const preservedPaths: Array<Array<string>> = []
  for (const field of claim.fields) {
    if (!field.targetPath) continue
    const targetPath = path.resolve(field.targetPath)
    const original = next.get(targetPath) ?? null
    const live =
      field.arrayEntry ?
        arrayEntryValue(original, {
          path: field.path,
          key: field.arrayEntry.key,
          keyValue: field.arrayEntry.keyValue,
        })
      : pathValue(original, field.path)
    const exists = "entryExists" in live ? live.entryExists : live.exists
    if (
      !exists
      || JSON.stringify(live.value) !== JSON.stringify(field.writtenValue)
    ) {
      preservedPaths.push(field.path)
      continue
    }
    const document = structuredClone(original ?? {})
    if (field.arrayEntry) {
      restoreArrayEntry(document, field)
    } else if (field.priorExists && field.priorValue !== undefined) {
      setPath(document, field.path, field.priorValue)
    } else {
      deletePath(document, field.path)
    }
    next.set(targetPath, document)
  }
  for (const targetPath of claim.createdTargets ?? []) {
    const document = next.get(path.resolve(targetPath))
    if (document && Object.keys(document).length === 0)
      next.set(path.resolve(targetPath), null)
  }
  return { documents: next, preservedPaths }
}

function documentsEqual(
  left: Map<string, Document>,
  right: Map<string, Document>,
): boolean {
  const paths = new Set([...left.keys(), ...right.keys()])
  return [...paths].every(
    (targetPath) =>
      JSON.stringify(left.get(targetPath) ?? null)
      === JSON.stringify(right.get(targetPath) ?? null),
  )
}

interface ResourceChange {
  anchorPath: string
  before: Map<string, Document>
  after: Map<string, Document>
  claimAfter: TargetClaim | null
  label: string
}

function commit(
  paths: ReturnType<typeof pathsFor>,
  change: ResourceChange,
): void {
  const targetPaths = [
    ...new Set([...change.before.keys(), ...change.after.keys()]),
  ]
  const journal: ResourceJournal = {
    schema: 1,
    anchorPath: path.resolve(change.anchorPath),
    resources: targetPaths.map((targetPath) => ({
      targetPath,
      beforeFingerprint: fingerprint(change.before.get(targetPath) ?? null),
      afterFingerprint: fingerprint(change.after.get(targetPath) ?? null),
    })),
    claimAfter: change.claimAfter,
  }
  atomicWriteJson(paths.journal, journal, { label: "Maximal target journal" })
  for (const targetPath of targetPaths) {
    const document = change.after.get(targetPath) ?? null
    if (document === null) clear(targetPath)
    else atomicWriteJson(targetPath, document, { label: change.label })
  }
  if (change.claimAfter) writeClaim(paths.claim, change.claimAfter)
  else clear(paths.claim)
  clear(paths.journal)
}

export async function inspectJsonResourceSet(
  options: InspectJsonResourceSetOptions,
): Promise<InspectTargetResult> {
  validateConfiguratorId(options.configuratorId)
  const paths = pathsFor(options)
  ensureSidecar(paths.directory)
  return withHostConfigLock(paths.lock, async () => {
    if (!recoverJournal(paths.journal, paths.claim, options.anchorPath)) {
      return { status: "recovery-required" }
    }
    const claim = readClaim(paths.claim)
    if (!claim) return { status: "available" }
    const ownershipConflict = await activeOwnershipConflict(claim, options)
    if (ownershipConflict) return ownershipConflict
    const documents = documentMap(claimTargets(claim))
    return managedFieldsMatch(documents, claim.fields) ?
        { status: "connected", claim }
      : { status: "changed-externally", claim }
  })
}

async function prepareConnectClaim(
  paths: ReturnType<typeof pathsFor>,
  options: JsonResourceSetOptions,
): Promise<{ claim: TargetClaim | null } | ConnectTargetResult> {
  if (!recoverJournal(paths.journal, paths.claim, options.anchorPath)) {
    return { status: "recovery-required" }
  }
  let claim = readClaim(paths.claim)
  if (!claim) return { claim }

  const ownership = await connectOwnership(claim, options)
  if (ownership.conflict) return ownership.conflict
  if (ownership.stale) {
    const staleDocuments = documentMap(claimTargets(claim))
    if (!managedFieldsMatch(staleDocuments, claim.fields)) {
      return { status: "stale-recovery-required", claim }
    }
    const restored = restoreClaim(staleDocuments, claim)
    commit(paths, {
      anchorPath: options.anchorPath,
      before: staleDocuments,
      after: restored.documents,
      claimAfter: null,
      label: `${options.configuratorId} target`,
    })
    claim = null
  }
  return { claim }
}

export async function connectJsonResourceSet(
  options: JsonResourceSetOptions,
): Promise<ConnectTargetResult> {
  validateConfiguratorId(options.configuratorId)
  const paths = pathsFor(options)
  ensureSidecar(paths.directory)
  return withHostConfigLock(paths.lock, async () => {
    const prepared = await prepareConnectClaim(paths, options)
    if ("status" in prepared) return prepared
    const { claim } = prepared
    if (claim && claim.configuratorId !== options.configuratorId) {
      return { status: "owned-by-another-configurator", claim }
    }
    const targetPaths = [
      ...options.resources.map((resource) => resource.targetPath),
      ...(claim ? claimTargets(claim) : []),
    ]
    const documents = documentMap(targetPaths)
    if (claim && !managedFieldsMatch(documents, claim.fields)) {
      return { status: "changed-externally", claim }
    }
    const resources = resolveResources(options.resources, documents)
    const nextClaim = buildClaim(options, {
      resources,
      documents,
      prior: claim ?? undefined,
    })
    const nextDocuments = applyResources(documents, resources)
    const unchanged = claim !== null && documentsEqual(documents, nextDocuments)
    if (documentsEqual(documents, nextDocuments))
      writeClaim(paths.claim, nextClaim)
    else
      commit(paths, {
        anchorPath: options.anchorPath,
        before: documents,
        after: nextDocuments,
        claimAfter: nextClaim,
        label: `${options.configuratorId} target`,
      })
    return {
      status: unchanged ? "already-connected" : "connected",
      claim: nextClaim,
    }
  })
}

/** Explicitly adopt current managed values, then reapply this owner's resource set. */
export async function reconnectJsonResourceSet(
  options: JsonResourceSetOptions,
): Promise<ConnectTargetResult> {
  validateConfiguratorId(options.configuratorId)
  const paths = pathsFor(options)
  ensureSidecar(paths.directory)
  return withHostConfigLock(paths.lock, async () => {
    if (!recoverJournal(paths.journal, paths.claim, options.anchorPath)) {
      return { status: "recovery-required" }
    }
    const claim = readClaim(paths.claim)
    if (claim) {
      const ownershipConflict = await activeOwnershipConflict(claim, options)
      if (ownershipConflict) return ownershipConflict
    }
    const targetPaths = [
      ...options.resources.map((resource) => resource.targetPath),
      ...(claim ? claimTargets(claim) : []),
    ]
    const documents = documentMap(targetPaths)
    const resources = resolveResources(options.resources, documents)
    const changedExternally =
      claim !== null && !managedFieldsMatch(documents, claim.fields)
    const nextClaim = buildClaim(options, {
      resources,
      documents,
      prior: changedExternally ? undefined : (claim ?? undefined),
    })
    if (claim) {
      nextClaim.revision = claim.revision + 1
      nextClaim.createdTargets = claim.createdTargets
    }
    const nextDocuments = applyResources(documents, resources)
    const unchanged = claim !== null && documentsEqual(documents, nextDocuments)
    if (documentsEqual(documents, nextDocuments))
      writeClaim(paths.claim, nextClaim)
    else
      commit(paths, {
        anchorPath: options.anchorPath,
        before: documents,
        after: nextDocuments,
        claimAfter: nextClaim,
        label: `${options.configuratorId} target`,
      })
    return {
      status: unchanged ? "already-connected" : "connected",
      claim: nextClaim,
    }
  })
}

export async function disconnectJsonResourceSet(
  options: DisconnectJsonResourceSetOptions,
): Promise<DisconnectTargetResult> {
  validateConfiguratorId(options.configuratorId)
  const paths = pathsFor(options)
  ensureSidecar(paths.directory)
  return withHostConfigLock(paths.lock, () => {
    if (!recoverJournal(paths.journal, paths.claim, options.anchorPath)) {
      return { status: "recovery-required", preservedPaths: [] }
    }
    const claim = disconnectClaim(
      readClaim(paths.claim),
      options.configuratorId,
      options.runtime,
    )
    if ("status" in claim) return claim
    const documents = documentMap(claimTargets(claim))
    const restored = restoreClaim(documents, claim)
    if (documentsEqual(documents, restored.documents)) clear(paths.claim)
    else
      commit(paths, {
        anchorPath: options.anchorPath,
        before: documents,
        after: restored.documents,
        claimAfter: null,
        label: `${options.configuratorId} target`,
      })
    return { status: "disconnected", preservedPaths: restored.preservedPaths }
  })
}
