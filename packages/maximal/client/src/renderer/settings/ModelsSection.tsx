import {
  BrainCircuit,
  CircleHelp,
  Database,
  Eye,
  MessageSquareText,
  Radio,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'

import { Button, Note } from 'stuffbucket-electron/renderer'

import type {
  ModelsListResponse,
  SettingsCapabilities,
} from './capabilities'
import { describeError, formatTimestamp } from './format'

interface ModelsSectionProps {
  capabilities: SettingsCapabilities
}

type ModelSummary = ModelsListResponse['models'][number]
type ModelCapability = keyof ModelSummary['capabilities']

interface VendorGroup {
  vendor: string
  models: ModelSummary[]
}

function formatExactNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

const CAPABILITY_DETAILS = {
  vision: { label: 'Vision', Icon: Eye },
  tool_calls: { label: 'Tool calls', Icon: Wrench },
  streaming: { label: 'Streaming', Icon: Radio },
  reasoning: { label: 'Reasoning', Icon: BrainCircuit },
} satisfies Record<ModelCapability, { label: string; Icon: LucideIcon }>

const CAPABILITY_KEYS = Object.keys(CAPABILITY_DETAILS) as ModelCapability[]

const MODEL_TYPE_DETAILS: Readonly<
  Record<string, { label: string; Icon: LucideIcon }>
> = {
  chat: { label: 'Chat', Icon: MessageSquareText },
  embeddings: { label: 'Embeddings', Icon: Database },
}

function TokenCount({ value }: { value: number | null }): ReactElement {
  if (value === null) {
    return (
      <span title="Not reported" aria-label="Not reported">
        —
      </span>
    )
  }

  const exact = `${formatExactNumber(value)} ${value === 1 ? 'token' : 'tokens'}`
  return (
    <span title={exact} aria-label={exact}>
      {formatCompactNumber(value)}
    </span>
  )
}

function CapabilityIcons({ model }: { model: ModelSummary }): ReactElement {
  const capabilities = CAPABILITY_KEYS.filter((key) => model.capabilities[key])
  if (capabilities.length === 0) {
    return (
      <span title="No capabilities reported" aria-label="No capabilities reported">
        —
      </span>
    )
  }

  return (
    <span className="settings-table__capabilities">
      {capabilities.map((key) => {
        const { label, Icon } = CAPABILITY_DETAILS[key]
        return (
          <span
            key={key}
            className="settings-table__capability"
            role="img"
            aria-label={label}
            title={label}
          >
            <Icon size={16} aria-hidden="true" />
          </span>
        )
      })}
    </span>
  )
}

function ModelTypeIcon({ model }: { model: ModelSummary }): ReactElement {
  const type = model.type.trim()
  const details = MODEL_TYPE_DETAILS[type.toLowerCase()]
  const label = details?.label ?? (type || 'Type not reported')
  const Icon = details?.Icon ?? CircleHelp
  const description = `${label} model type`

  return (
    <span
      className="settings-table__type"
      role="img"
      aria-label={description}
      title={description}
    >
      <Icon size={16} aria-hidden="true" />
    </span>
  )
}

function groupModels(models: ModelSummary[]): VendorGroup[] {
  const vendors = new Map<string, ModelSummary[]>()
  for (const model of models) {
    const vendor = model.vendor.trim() || 'Vendor not reported'
    const group = vendors.get(vendor) ?? []
    group.push(model)
    vendors.set(vendor, group)
  }

  return [...vendors].map(([vendor, groupedModels]) => ({
    vendor,
    models: groupedModels,
  }))
}

export function ModelsSection({ capabilities }: ModelsSectionProps): ReactElement {
  const [catalogue, setCatalogue] = useState<ModelsListResponse | null>(null)
  const [refreshing, setRefreshing] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setRefreshing(true)
    setError(null)
    try {
      setCatalogue(await capabilities.models.refresh())
    } catch (cause) {
      setError(describeError(cause))
    } finally {
      setRefreshing(false)
    }
  }, [capabilities])

  useEffect(() => {
    let active = true
    void capabilities.models
      .list()
      .then((next) => {
        if (active) setCatalogue(next)
      })
      .catch((cause: unknown) => {
        if (active) setError(describeError(cause))
      })
      .finally(() => {
        if (active) setRefreshing(false)
      })
    return () => {
      active = false
    }
  }, [capabilities])

  const groups = useMemo(
    () => groupModels(catalogue?.models ?? []),
    [catalogue],
  )

  return (
    <section className="settings-section" aria-labelledby="settings-models-heading">
      <div className="settings-section__title-row">
        <h1 id="settings-models-heading" className="settings-section__heading">
          Models
        </h1>
        <Button
          variant="primary"
          size="sm"
          onClick={() => void load()}
          disabled={refreshing}
        >
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>
      {catalogue?.loaded_at ? (
        <Note>Updated {formatTimestamp(catalogue.loaded_at)}.</Note>
      ) : null}
      {error ? (
        <Note status="failed" live="assertive">
          {error}
        </Note>
      ) : catalogue === null ? (
        <Note live="polite">Loading model catalogue…</Note>
      ) : catalogue.models.length === 0 ? (
        <Note>No models are available yet.</Note>
      ) : (
        <div className="settings-model-vendor-groups">
          {groups.map(({ vendor, models }, vendorIndex) => {
            const vendorHeadingId = `settings-model-vendor-${String(vendorIndex)}`
            return (
              <section
                key={vendor}
                className="settings-model-vendor"
                aria-labelledby={vendorHeadingId}
              >
                <h2 id={vendorHeadingId} className="settings-section__subheading">
                  {vendor}
                </h2>
                <div className="settings-model-tables">
                  <div
                    className="settings-table-wrap settings-table-wrap--models"
                    role="region"
                    aria-labelledby={vendorHeadingId}
                    tabIndex={0}
                  >
                    <table
                      className="settings-table settings-table--models"
                      aria-labelledby={vendorHeadingId}
                    >
                      <thead>
                        <tr>
                          <th scope="col">Model</th>
                          <th scope="col">Type</th>
                          <th scope="col" className="settings-table__number">Context</th>
                          <th scope="col" className="settings-table__number">Max output</th>
                          <th scope="col">Capabilities</th>
                        </tr>
                      </thead>
                      <tbody>
                        {models.map((model) => (
                          <tr key={model.id}>
                            <th scope="row">
                              <span className="settings-table__model-name">{model.name}</span>
                              <code>{model.id}</code>
                            </th>
                            <td>
                              <ModelTypeIcon model={model} />
                            </td>
                            <td className="settings-table__number">
                              <TokenCount value={model.context_window_tokens} />
                            </td>
                            <td className="settings-table__number">
                              <TokenCount value={model.max_output_tokens} />
                            </td>
                            <td>
                              <CapabilityIcons model={model} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            )
          })}
        </div>
      )}
    </section>
  )
}
