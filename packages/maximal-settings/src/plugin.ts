export interface PluginSettingsIssue {
  readonly path?: ReadonlyArray<PropertyKey>
  readonly message: string
}

export interface PluginSettingsSchema<T> {
  readonly "~standard": {
    readonly version: 1
    readonly vendor: string
    validate(
      value: unknown,
    ):
      | { readonly value: T }
      | { readonly issues: ReadonlyArray<PluginSettingsIssue> }
  }
}

export interface PluginSettingsRegistration<T = unknown> {
  readonly id: string
  readonly schema: PluginSettingsSchema<T>
}

export class PluginSettingsError extends Error {
  readonly pluginId: string
  readonly issues: ReadonlyArray<PluginSettingsIssue>

  constructor(pluginId: string, issues: ReadonlyArray<PluginSettingsIssue>) {
    super(
      issues
        .map(({ path, message }) => {
          const field = path?.map(String).join(".")
          return `${pluginId}${field ? `.${field}` : ""}: ${message}`
        })
        .join("\n"),
    )
    this.name = "PluginSettingsError"
    this.pluginId = pluginId
    this.issues = issues
  }
}

export function parsePluginSettings<T>(
  registration: PluginSettingsRegistration<T>,
  settings: Readonly<Record<string, unknown>> | undefined,
): T {
  const result = registration.schema["~standard"].validate(
    settings?.[registration.id],
  )
  if ("issues" in result) {
    throw new PluginSettingsError(registration.id, result.issues)
  }
  return result.value
}

export function pluginSettingsIssues(
  registrations: Iterable<PluginSettingsRegistration>,
  settings: Readonly<Record<string, unknown>> | undefined,
  path: ReadonlyArray<PropertyKey>,
): ReadonlyArray<PluginSettingsIssue> {
  const issues: Array<PluginSettingsIssue> = []
  for (const registration of registrations) {
    const result = registration.schema["~standard"].validate(
      settings?.[registration.id],
    )
    if (!("issues" in result)) continue
    for (const issue of result.issues) {
      issues.push({
        path: [...path, registration.id, ...(issue.path ?? [])],
        message: issue.message,
      })
    }
  }
  return issues
}
