import deepmerge from "deepmerge"
import { isAbsolute, join } from "node:path"
import { parseArgs } from "node:util"
import { z } from "zod"

import { readDocument, rejectUnsafeKeys } from "./document.ts"
import {
  parseSetting,
  environmentLayer,
  setSetting,
  settingsFields,
  type SettingField,
} from "./environment.ts"

export interface SettingsOptions<Settings> {
  applicationName: string
  environmentPrefix: string
  schema: z.ZodType<Settings>
  defaults?: Record<string, unknown>
  environment: Readonly<Record<string, string | undefined>>
  argv?: ReadonlyArray<string>
  cwd: string
  homeDirectory: string
  legacyFiles?: ReadonlyArray<string>
  project?: boolean
  transient?: Record<string, unknown>
  userFile?: string
  projectFile?: string
}

export interface SettingsSnapshot<Settings> {
  readonly settings: Readonly<Settings>
  readonly origins: Readonly<Record<string, string>>
  readonly files: ReadonlyArray<string>
  readonly remainingArgs: ReadonlyArray<string>
}

export function lookup(
  values: Record<string, unknown>,
  path: Array<string>,
): unknown {
  let current: unknown = values
  for (const key of path) {
    if (
      typeof current !== "object"
      || current === null
      || !Object.hasOwn(current, key)
    )
      return undefined
    current = Reflect.get(current, key)
  }
  return current
}

function freeze<Value>(value: Value): Value {
  if (typeof value === "object" && value !== null) {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value
}

function cliSettings(fields: Array<SettingField>, argv: ReadonlyArray<string>) {
  const { tokens } = parseArgs({
    args: [...argv],
    options: { setting: { type: "string", multiple: true } },
    strict: false,
    allowPositionals: true,
    tokens: true,
  })
  const values: Record<string, unknown> = {}
  const consumed = new Set<number>()
  const paths = new Set<string>()
  for (const token of tokens) {
    if (token.kind !== "option" || token.name !== "setting") continue
    if (typeof token.value !== "string")
      throw new Error("--setting requires path=value")
    const separator = token.value.indexOf("=")
    const key = token.value.slice(0, separator)
    const field = fields.find((candidate) => candidate.path.join(".") === key)
    if (separator < 1 || !field)
      throw new Error(
        "Unknown --setting path; use a declared JSON setting path",
      )
    if (paths.has(key)) throw new Error(`Duplicate --setting path: ${key}`)
    paths.add(key)
    setSetting(
      values,
      field.path,
      parseSetting(field, token.value.slice(separator + 1), "--setting"),
    )
    consumed.add(token.index)
    if (!token.inlineValue) consumed.add(token.index + 1)
  }
  return {
    values,
    remainingArgs: argv.filter((_argument, index) => !consumed.has(index)),
  }
}

export function settingsLocations<Settings>(
  options: SettingsOptions<Settings>,
) {
  if (!/^[a-z][a-z0-9-]*$/.test(options.applicationName))
    throw new Error("Invalid application name")
  const { environment, homeDirectory: home, cwd } = options
  if (!isAbsolute(home) || !isAbsolute(cwd))
    throw new Error("Settings home and working directory must be absolute")
  const xdg = environment.XDG_CONFIG_HOME
  const userFile =
    options.userFile
    ?? join(
      xdg && isAbsolute(xdg) ? xdg : join(home, ".config"),
      options.applicationName,
      "settings.json",
    )
  const projectFile =
    options.projectFile
    ?? join(cwd, `.${options.applicationName}`, "settings.json")
  if (!isAbsolute(userFile) || !isAbsolute(projectFile))
    throw new Error("Settings files must be absolute")
  return { userFile, projectFile }
}

export function loadSettings<Settings>(
  options: SettingsOptions<Settings>,
): SettingsSnapshot<Settings> {
  return resolveSettings(options)
}

export function resolveSettings<Settings>(
  options: SettingsOptions<Settings>,
  documents: ReadonlyMap<string, Record<string, unknown>> = new Map(),
): SettingsSnapshot<Settings> {
  const { userFile, projectFile } = settingsLocations(options)
  const { environment } = options
  const fields = settingsFields(options.schema, options.environmentPrefix)
  const environmentValues = environmentLayer(fields, environment)
  const cli = cliSettings(fields, options.argv ?? [])
  let values: Record<string, unknown> = {}
  const origins: Record<string, string> = {}
  const files: Array<string> = []
  const apply = (layer: Record<string, unknown>, source: string) => {
    rejectUnsafeKeys(layer)
    for (const field of fields) {
      const value = lookup(layer, field.path)
      if (value === undefined) continue
      if (!field.schema.safeParse(value).success) {
        throw new Error(`Invalid ${source} setting: ${field.path.join(".")}`)
      }
      origins[field.path.join(".")] =
        source === "environment" ? field.name : source
    }
    values = deepmerge(values, structuredClone(layer), {
      arrayMerge: (_target: Array<unknown>, sourceArray: Array<unknown>) =>
        sourceArray,
    })
  }
  apply(options.defaults ?? {}, "defaults")
  const candidates = [...(options.legacyFiles ?? []), userFile]
  if (options.project !== false) candidates.push(projectFile)
  for (const filePath of new Set(candidates)) {
    const document =
      documents.get(filePath) ?? readDocument(filePath, options.applicationName)
    if (document === undefined) continue
    apply(document, filePath)
    files.push(filePath)
  }
  apply(options.transient ?? {}, "transient")
  apply(environmentValues, "environment")
  apply(cli.values, "cli")
  const result = options.schema.safeParse(values)
  if (!result.success) {
    throw new Error(
      `Invalid resolved settings: ${result.error.issues.map((issue) => issue.path.join(".")).join(", ")}`,
    )
  }
  for (const field of fields) {
    if (
      !Object.hasOwn(origins, field.path.join("."))
      && lookup(
        z.record(z.string(), z.unknown()).parse(result.data),
        field.path,
      ) !== undefined
    ) {
      origins[field.path.join(".")] = "defaults"
    }
  }
  return freeze({
    settings: result.data,
    origins,
    files,
    remainingArgs: cli.remainingArgs,
  })
}
