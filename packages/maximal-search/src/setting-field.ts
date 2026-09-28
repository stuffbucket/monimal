/** A connector setting and its value, the leaf that validation and the manifest share. */

export type ConnectorSettingValue =
  boolean | number | string | ReadonlyArray<string>

interface SettingFieldBase {
  readonly key: string
  readonly label: string
  readonly description?: string
  readonly helpLink?: {
    readonly label: string
    readonly url: string
  }
  readonly required?: boolean
  readonly format?: "url"
  readonly unit?: "seconds"
  readonly layout?: "full"
  readonly emptyDescription?: string
  readonly validation?: {
    readonly url: {
      readonly protocols: ReadonlyArray<"http:" | "https:">
      readonly pathname: string
    }
    readonly message: string
  }
}

export type ConnectorSettingField =
  | (SettingFieldBase & {
      readonly type: "boolean"
      readonly default?: boolean
    })
  | (SettingFieldBase & {
      readonly type: "integer"
      readonly default?: number
      readonly min?: number
      readonly max?: number
    })
  | (SettingFieldBase & {
      readonly type: "secret" | "string"
      readonly default?: string
      readonly placeholder?: string
    })
  | (SettingFieldBase & {
      readonly type: "string-list"
      readonly default?: ReadonlyArray<string>
    })
  | (SettingFieldBase & {
      readonly type: "select"
      readonly default?: string
      readonly options: ReadonlyArray<{
        readonly label: string
        readonly value: string
      }>
    })
