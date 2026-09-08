import type { TrafficRequestOutcome } from "@stuffbucket/maximal-observability-contract"

import {
  FormField,
  Select,
  Switch,
} from "@stuffbucket/maximal-electron/renderer"

import {
  useObservability,
  type FilterDimension,
  type TimePreset,
} from "./state.tsx"

const TIME_OPTIONS: Array<{ value: TimePreset; label: string }> = [
  { value: "15m", label: "Last 15 minutes" },
  { value: "1h", label: "Last hour" },
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "all", label: "All retained traffic" },
]

const OUTCOME_OPTIONS: Array<{
  value: "all" | TrafficRequestOutcome
  label: string
}> = [
  { value: "all", label: "All outcomes" },
  { value: "succeeded", label: "Succeeded" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
]

function distinct(values: Array<string | null>): Array<string> {
  return [
    ...new Set(values.filter((value): value is string => value !== null)),
  ].sort()
}

function DimensionFilter({
  label,
  dimension,
  values,
}: {
  label: string
  dimension: FilterDimension
  values: Array<string>
}) {
  const { filters, setDimension } = useObservability()
  const value = filters[dimension][0] ?? "all"
  const options = [
    { value: "all", label: `All ${label.toLowerCase()}` },
    ...values.map((entry) => ({ value: entry, label: entry })),
  ]
  return (
    <FormField label={label}>
      {(field) => (
        <Select
          {...field}
          value={value}
          options={options}
          onChange={(next) => setDimension(dimension, next)}
        />
      )}
    </FormField>
  )
}

export function ObservabilityFilters({ title }: { title: string }) {
  const {
    filters,
    live,
    overview,
    requestItems,
    setLive,
    setOutcome,
    setTimePreset,
    timePreset,
  } = useObservability()
  const nodes =
    overview.status === "ready" || overview.status === "empty" ?
      overview.data.flow.nodes
    : []
  const values = {
    clients: distinct([
      ...requestItems.map(({ attribution }) => attribution.client),
      ...nodes
        .filter(({ kind }) => kind === "client")
        .map(({ label }) => label),
    ]),
    operations: distinct([
      ...requestItems.map(({ route }) => route.operation),
      ...nodes.filter(({ kind }) => kind === "route").map(({ label }) => label),
    ]),
    providers: distinct([
      ...requestItems.map(({ attribution }) => attribution.provider),
      ...nodes
        .filter(({ kind }) => kind === "provider")
        .map(({ label }) => label),
    ]),
    models: distinct([
      ...requestItems.map(({ attribution }) => attribution.model),
      ...nodes.filter(({ kind }) => kind === "model").map(({ label }) => label),
    ]),
  }

  return (
    <aside className="mo-rail" aria-label={`${title} filters`}>
      <h2>{title}</h2>
      <div className="mo-filter-stack">
        <FormField label="Time range">
          {(field) => (
            <Select
              {...field}
              value={timePreset}
              options={TIME_OPTIONS}
              onChange={setTimePreset}
            />
          )}
        </FormField>
        <DimensionFilter
          label="Client"
          dimension="clients"
          values={values.clients}
        />
        <DimensionFilter
          label="Endpoint"
          dimension="operations"
          values={values.operations}
        />
        <DimensionFilter
          label="Provider"
          dimension="providers"
          values={values.providers}
        />
        <DimensionFilter
          label="Model"
          dimension="models"
          values={values.models}
        />
        <FormField label="Outcome">
          {(field) => (
            <Select
              {...field}
              value={filters.outcomes[0] ?? "all"}
              options={OUTCOME_OPTIONS}
              onChange={setOutcome}
            />
          )}
        </FormField>
        <Switch
          label={live ? "Live updates on" : "Live updates paused"}
          checked={live}
          onChange={setLive}
        />
      </div>
    </aside>
  )
}
