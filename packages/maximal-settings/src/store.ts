import { z } from "zod"

import { getJsonDocumentStore, type JsonDocument } from "./document.ts"
import { settingsFields, setSetting, type SettingField } from "./environment.ts"
import {
  loadSettings,
  lookup,
  resolveSettings,
  settingsLocations,
  type SettingsOptions,
  type SettingsSnapshot,
} from "./settings.ts"
import { singletonRegistry } from "./singleton-registry.ts"

export type SettingsPersistence = "memory" | "user" | "project"

export interface SettingsStoreOptions<
  Settings,
> extends SettingsOptions<Settings> {
  instanceId: string
  persistence: Readonly<Record<string, SettingsPersistence>>
  onListenerError: (error: unknown) => void
}

export interface SettingsStore<Settings> {
  getSnapshot(): SettingsSnapshot<Settings>
  refresh(): Promise<SettingsSnapshot<Settings>>
  subscribe(
    listener: (snapshot: SettingsSnapshot<Settings>) => void,
  ): () => void
  create(path: string, value: unknown): Promise<SettingsSnapshot<Settings>>
  update(path: string, value: unknown): Promise<SettingsSnapshot<Settings>>
  delete(path: string): Promise<SettingsSnapshot<Settings>>
}

interface Registration {
  fingerprint: string
  schema: z.ZodType
  onListenerError: (error: unknown) => void
  store: SettingsStore<unknown>
}

const registry = singletonRegistry<Registration>(
  "@stuffbucket/maximal-settings/typed-stores/v1",
)

function removeSetting(document: JsonDocument, path: Array<string>): void {
  const parentPath = path.slice(0, -1)
  const parent = parentPath.length > 0 ? lookup(document, parentPath) : document
  if (typeof parent !== "object" || parent === null) return
  const key = path.at(-1)
  if (key === undefined) throw new Error("Setting path must not be empty")
  Reflect.deleteProperty(parent, key)
  if (parentPath.length > 0 && Object.keys(parent).length === 0)
    removeSetting(document, parentPath)
}

function prepareStore<Settings>(input: SettingsStoreOptions<Settings>) {
  if (!input.instanceId)
    throw new Error("A settings instance identity is required")
  const options = {
    ...input,
    environment: { ...input.environment },
    argv: [...(input.argv ?? [])],
    defaults: structuredClone(input.defaults ?? {}),
    transient: structuredClone(input.transient ?? {}),
    persistence: { ...input.persistence },
    legacyFiles: [...(input.legacyFiles ?? [])],
  }
  const fields = settingsFields(options.schema, options.environmentPrefix)
  const locations = settingsLocations(options)
  const namespace = `${options.applicationName}:${options.instanceId}`
  const destinations = new Map<
    SettingsPersistence,
    ReturnType<typeof getJsonDocumentStore>
  >()
  for (const field of fields) {
    const policy = options.persistence[field.path.join(".")]
    if (!["memory", "project", "user"].includes(policy))
      throw new Error("Every setting requires a persistence policy")
    if (policy === "project" && options.project === false)
      throw new Error("Project persistence is disabled")
  }
  for (const path of Object.keys(options.persistence)) {
    if (!fields.some((field) => field.path.join(".") === path))
      throw new Error("Unknown persistence policy path")
  }
  const snapshot = loadSettings(options)
  for (const policy of new Set(Object.values(options.persistence))) {
    if (policy !== "memory")
      destinations.set(
        policy,
        getJsonDocumentStore({
          namespace,
          filePath:
            policy === "user" ? locations.userFile : locations.projectFile,
        }),
      )
  }
  return { options, fields, locations, namespace, destinations, snapshot }
}

function settingMutation(
  fields: Array<SettingField>,
  request: {
    operation: "create" | "update" | "delete"
    path: string
    value?: unknown
  },
) {
  const { operation, path, value } = request
  const field = fields.find((candidate) => candidate.path.join(".") === path)
  if (!field) throw new Error("Unknown setting path")
  const parsed = field.schema.safeParse(value)
  if (operation !== "delete" && (value === undefined || !parsed.success))
    throw new Error(`Invalid setting: ${path}`)
  const copy: unknown =
    operation === "delete" ? undefined : (
      structuredClone(parsed.success ? parsed.data : undefined)
    )
  return (document: JsonDocument) => {
    const present = lookup(document, field.path) !== undefined
    if (operation === "create" && present)
      throw new Error(`Setting already exists in its configured layer: ${path}`)
    if (operation !== "create" && !present)
      throw new Error(`Setting does not exist in its configured layer: ${path}`)
    if (operation === "delete") removeSetting(document, field.path)
    else setSetting(document, field.path, copy)
    return document
  }
}

function createStore<Settings>(
  context: ReturnType<typeof prepareStore<Settings>>,
): SettingsStore<Settings> {
  const {
    options,
    fields,
    locations,
    destinations,
    snapshot: initial,
  } = context
  let snapshot = initial
  let transient = options.transient
  let queue: Promise<unknown> = Promise.resolve()
  const listeners = new Set<(snapshot: SettingsSnapshot<Settings>) => void>()
  const publish = (next: SettingsSnapshot<Settings>) => {
    snapshot = next
    for (const listener of listeners) {
      try {
        listener(snapshot)
      } catch (error) {
        try {
          options.onListenerError(error)
        } catch {
          continue
        }
      }
    }
    return snapshot
  }
  const enqueue = (
    action: () =>
      Promise<SettingsSnapshot<Settings>> | SettingsSnapshot<Settings>,
  ) => {
    const operation = queue.then(action)
    queue = operation.catch(() => undefined)
    return operation
  }
  const mutate = (
    operation: "create" | "update" | "delete",
    path: string,
    value?: unknown,
  ) => {
    let edit: (document: JsonDocument) => JsonDocument
    try {
      edit = settingMutation(fields, { operation, path, value })
    } catch (error) {
      return Promise.reject(
        error instanceof Error ? error : new Error("Invalid settings mutation"),
      )
    }
    return enqueue(async () => {
      const policy = options.persistence[path]
      let nextSnapshot: SettingsSnapshot<Settings> | undefined
      if (policy === "memory") {
        const next = edit(structuredClone(transient))
        nextSnapshot = loadSettings({ ...options, transient: next })
        transient = next
      } else {
        const destination = destinations.get(policy)
        if (!destination)
          throw new Error("Settings destination is not configured")
        await destination.transact((document) => {
          const next = edit(document)
          nextSnapshot = resolveSettings(
            { ...options, transient },
            new Map([
              [
                policy === "user" ? locations.userFile : locations.projectFile,
                next,
              ],
            ]),
          )
          return next
        })
      }
      if (!nextSnapshot)
        throw new Error("Settings mutation did not produce a snapshot")
      return publish(nextSnapshot)
    })
  }
  const store: SettingsStore<Settings> = Object.freeze({
    getSnapshot: () => snapshot,
    refresh: () =>
      enqueue(() => publish(loadSettings({ ...options, transient }))),
    subscribe: (listener: (snapshot: SettingsSnapshot<Settings>) => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    create: (path: string, value: unknown) => mutate("create", path, value),
    update: (path: string, value: unknown) => mutate("update", path, value),
    delete: (path: string) => mutate("delete", path),
  })
  return store
}

export function getSettingsStore<Settings>(
  input: SettingsStoreOptions<Settings>,
): SettingsStore<Settings> {
  const context = prepareStore(input)
  const { options, destinations, locations, namespace } = context
  const fingerprint = JSON.stringify({
    ...options,
    schema: undefined,
    onListenerError: undefined,
    userFile: destinations.get("user")?.filePath ?? locations.userFile,
    projectFile: destinations.get("project")?.filePath ?? locations.projectFile,
  })
  const existing = registry.get(namespace)
  if (existing) {
    if (
      existing.fingerprint !== fingerprint
      || existing.schema !== input.schema
      || existing.onListenerError !== input.onListenerError
    ) {
      throw new Error("Conflicting settings instance registration")
    }
    return existing.store as SettingsStore<Settings>
  }
  const store = createStore(context)
  registry.set(namespace, {
    fingerprint,
    schema: input.schema,
    onListenerError: input.onListenerError,
    store: store,
  })
  return store
}
