import { lilconfigSync } from "lilconfig"
import { lstatSync, mkdirSync, realpathSync, unlinkSync } from "node:fs"
import { dirname, extname, isAbsolute, join, basename } from "node:path"
import lockfile from "proper-lockfile"
import writeFileAtomic from "write-file-atomic"
import { z } from "zod"

import { singletonRegistry } from "./singleton-registry.ts"

export type JsonDocument = Record<string, unknown>

export interface JsonDocumentOptions {
  namespace: string
  filePath: string
}

export interface JsonDocumentStore {
  readonly filePath: string
  read(): JsonDocument | undefined
  create(document: JsonDocument): Promise<void>
  update(mutate: (document: JsonDocument) => JsonDocument): Promise<void>
  transact(mutate: (document: JsonDocument) => JsonDocument): Promise<void>
  delete(): Promise<void>
}

const maximumDocumentBytes = 1024 * 1024

export function rejectUnsafeKeys(value: unknown): void {
  if (typeof value !== "object" || value === null) return
  for (const [key, child] of Object.entries(value)) {
    if (["__proto__", "$import", "constructor", "prototype"].includes(key)) {
      throw new Error("Unsafe settings key")
    }
    rejectUnsafeKeys(child)
  }
}

function missing(error: unknown): boolean {
  return (
    typeof error === "object"
    && error !== null
    && "code" in error
    && error.code === "ENOENT"
  )
}

export function readDocument(
  filePath: string,
  namespace: string,
): JsonDocument | undefined {
  if (extname(filePath) !== ".json")
    throw new Error(`Settings require JSON: ${filePath}`)
  try {
    const stat = lstatSync(filePath)
    if (!stat.isFile() || stat.size > maximumDocumentBytes)
      throw new Error("Invalid document file")
    const explorer = lilconfigSync(namespace, {
      searchPlaces: [],
      cache: false,
      loaders: {
        ".json": (_filename, contents) => {
          if (Buffer.byteLength(contents) > maximumDocumentBytes)
            throw new Error("Document too large")
          const parsed: unknown = JSON.parse(contents)
          rejectUnsafeKeys(parsed)
          return z.record(z.string(), z.unknown()).parse(parsed)
        },
      },
    })
    return z
      .record(z.string(), z.unknown())
      .parse(explorer.load(filePath)?.config)
  } catch (error) {
    if (missing(error)) return undefined
  }
  throw new Error(`Invalid settings file: ${filePath}`)
}

function canonicalFile(filePath: string): string {
  if (!isAbsolute(filePath) || extname(filePath) !== ".json")
    throw new Error("An absolute JSON file path is required")
  let parent = dirname(filePath)
  const suffix = [basename(filePath)]
  for (;;) {
    try {
      return join(realpathSync(parent), ...suffix)
    } catch (error) {
      if (!missing(error)) break
      suffix.unshift(basename(parent))
      parent = dirname(parent)
    }
  }
  throw new Error("Cannot resolve settings directory")
}

interface Registration {
  namespace: string
  store: JsonDocumentStore
}
const registry = singletonRegistry<Registration>(
  "@stuffbucket/maximal-settings/document-stores/v1",
)

export function getJsonDocumentStore(
  options: JsonDocumentOptions,
): JsonDocumentStore {
  if (!options.namespace) throw new Error("A document namespace is required")
  const filePath = canonicalFile(options.filePath)
  const existing = registry.get(filePath)
  if (existing) {
    if (existing.namespace !== options.namespace)
      throw new Error("Conflicting settings file registration")
    return existing.store
  }
  let queue: Promise<void> = Promise.resolve()
  const run = (action: () => Promise<void> | void) => {
    const operation = queue.then(async () => {
      mkdirSync(dirname(filePath), { recursive: true, mode: 0o700 })
      const release = await lockfile.lock(filePath, {
        realpath: false,
        stale: 10_000,
        update: 2_000,
        retries: { retries: 20, factor: 1, minTimeout: 25, maxTimeout: 50 },
      })
      try {
        await action()
      } finally {
        await release()
      }
    })
    queue = operation.catch(() => undefined)
    return operation
  }
  const read = () => readDocument(filePath, options.namespace)
  const save = async (document: JsonDocument) => {
    try {
      rejectUnsafeKeys(document)
      z.record(z.string(), z.json()).parse(document)
      const serialized = JSON.stringify(document, null, 2) + "\n"
      if (Buffer.byteLength(serialized) > maximumDocumentBytes)
        throw new Error("Document too large")
      await writeFileAtomic(filePath, serialized, { mode: 0o600, fsync: true })
    } catch {
      throw new Error(`Cannot persist settings file: ${filePath}`)
    }
  }
  const store: JsonDocumentStore = Object.freeze({
    filePath,
    read,
    create: (document: JsonDocument) => {
      const copy = structuredClone(document)
      return run(async () => {
        if (read() !== undefined)
          throw new Error("Settings document already exists")
        await save(copy)
      })
    },
    update: (mutate: (document: JsonDocument) => JsonDocument) =>
      run(async () => {
        const current = read()
        if (current === undefined)
          throw new Error("Settings document does not exist")
        await save(mutate(current))
      }),
    transact: (mutate: (document: JsonDocument) => JsonDocument) =>
      run(async () => {
        await save(mutate(read() ?? {}))
      }),
    delete: () =>
      run(() => {
        if (read() === undefined)
          throw new Error("Settings document does not exist")
        unlinkSync(filePath)
      }),
  })
  registry.set(filePath, { namespace: options.namespace, store })
  return store
}
