import type { ConnectorSettingField } from "../setting-field.js"

/** The request timeout every HTTP provider exposes. */
export const TIMEOUT_FIELD: ConnectorSettingField = {
  key: "timeoutMs",
  type: "integer",
  label: "Timeout (s)",
  default: 300_000,
  min: 1_000,
  max: 600_000,
  unit: "seconds",
  emptyDescription: "Uses 300 seconds when empty.",
}

/** The per-provider result cap every HTTP provider exposes. */
export const MAX_RESULTS_FIELD: ConnectorSettingField = {
  key: "maxResults",
  type: "integer",
  label: "Provider result limit",
  default: 5,
  min: 1,
  max: 20,
  emptyDescription: "Uses 5 results when empty.",
}
