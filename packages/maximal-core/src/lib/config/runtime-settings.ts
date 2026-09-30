import { loadSettings } from "@maximal/maximal-settings"
import os from "node:os"
import process from "node:process"
import { z } from "zod"

let cliArguments: Array<string> = []
const runtimeEnvironmentNames = [
  "MAXIMAL_HOME",
  "MAXIMAL_HOME_POLICY",
  "MAXIMAL_API_SQLITE_DB_PATH",
] as const

const optionalTrimmedString = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().min(1).optional(),
)

const optionalHomePolicy = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value
    const normalized = value.trim().toLowerCase()
    return normalized === "" ? undefined : normalized
  },
  z.enum(["create", "require"]).optional(),
)

export const RuntimeSettingsSchema = z
  .object({
    home: optionalTrimmedString,
    homePolicy: optionalHomePolicy,
    apiSqliteDbPath: optionalTrimmedString,
  })
  .loose()

export type RuntimeSettings = z.output<typeof RuntimeSettingsSchema>

export interface RuntimeSettingsContext {
  environment?: Readonly<Record<string, string | undefined>>
  argv?: ReadonlyArray<string>
  cwd?: string
  homeDirectory?: string
}

export function setRuntimeHomeCliOverride(home: string | undefined): void {
  cliArguments = home === undefined ? [] : [`--setting=home=${home}`]
}

function runtimeEnvironment(
  values: Readonly<Record<string, string | undefined>>,
): Record<string, string | undefined> {
  const environment = { ...values }
  for (const name of runtimeEnvironmentNames) {
    if (environment[name]?.trim() === "") {
      Reflect.deleteProperty(environment, name)
    }
  }
  return environment
}

export function loadRuntimeSettings(
  context: RuntimeSettingsContext = {},
): RuntimeSettings {
  const homeDirectory = context.homeDirectory ?? os.homedir()
  return loadSettings({
    applicationName: "maximal",
    environmentPrefix: "MAXIMAL",
    schema: RuntimeSettingsSchema,
    environment: runtimeEnvironment(context.environment ?? process.env),
    cwd: context.cwd ?? process.cwd(),
    homeDirectory,
    project: false,
    argv: [...(context.argv ?? cliArguments)],
  }).settings
}
