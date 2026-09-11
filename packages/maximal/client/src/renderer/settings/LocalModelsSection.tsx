import { useCallback, useEffect, useState, type ReactElement } from 'react'

import { Button, Note } from 'stuffbucket-electron/renderer'

import type {
  LocalModelCatalogEntry,
  LocalModelCatalogSnapshot,
  LocalModelOperationEvent,
} from '../../shared/bridge-types'
import type { SettingsCapabilities } from './capabilities'
import { describeError } from './format'

interface LocalModelsSectionProps {
  capabilities: SettingsCapabilities
}

interface ActiveOperation {
  operationId: string
  completedBytes?: number
  phase?: string
  totalBytes?: number
}

function formatBytes(value: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
    style: 'unit',
    unit: 'byte',
    unitDisplay: 'narrow',
  }).format(value)
}

function publicationLabel(model: LocalModelCatalogEntry): string {
  if (model.publication === 'aggregate') return 'Published in aggregate catalogues'
  if (model.publication === 'provider') return 'Published by its configured provider'
  return 'Not published in model catalogues'
}

function progressLabel(operation: ActiveOperation): string | null {
  if (operation.phase === undefined) return null
  const phase = `${operation.phase[0]?.toUpperCase() ?? ''}${operation.phase.slice(1)}`
  if (
    operation.completedBytes === undefined ||
    operation.totalBytes === undefined ||
    operation.totalBytes === 0
  ) {
    return `${phase}…`
  }
  return `${phase} ${formatBytes(operation.completedBytes)} of ${formatBytes(operation.totalBytes)}`
}

function replaceModel(
  snapshot: LocalModelCatalogSnapshot | null,
  model: LocalModelCatalogEntry,
): LocalModelCatalogSnapshot {
  const models = snapshot?.models ?? []
  const index = models.findIndex(({ key }) => key === model.key)
  return {
    revision: snapshot?.revision ?? 0,
    models:
      index === -1
        ? [...models, model]
        : models.map((candidate) => (candidate.key === model.key ? model : candidate)),
  }
}

export function LocalModelsSection({
  capabilities,
}: LocalModelsSectionProps): ReactElement {
  const [catalogue, setCatalogue] = useState<LocalModelCatalogSnapshot | null>(null)
  const [operations, setOperations] = useState<Record<string, ActiveOperation>>({})
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setCatalogue(await capabilities.localModels.list())
    } catch (cause) {
      setError(describeError(cause))
    }
  }, [capabilities])

  useEffect(() => {
    let active = true
    const unsubscribe = capabilities.localModels.subscribe(
      (event: LocalModelOperationEvent) => {
        if (!active) return
        if (event.type === 'catalog') {
          setCatalogue(event.snapshot)
          return
        }
        if (event.type === 'progress') {
          setOperations((current) => ({
            ...current,
            [event.progress.modelKey]: {
              operationId: event.operationId,
              phase: event.progress.phase,
              completedBytes: event.progress.completedBytes,
              totalBytes: event.progress.totalBytes,
            },
          }))
          return
        }
        if (event.type === 'completed') {
          setCatalogue((current) => replaceModel(current, event.model))
          setOperations((current) => {
            const next = { ...current }
            delete next[event.model.key]
            return next
          })
          return
        }

        setOperations((current) =>
          Object.fromEntries(
            Object.entries(current).filter(
              ([, operation]) => operation.operationId !== event.operationId,
            ),
          ),
        )
        if (event.type === 'failed') setError(event.error.message)
        void refresh()
      },
    )

    void capabilities.localModels
      .list()
      .then((snapshot) => {
        if (active) setCatalogue(snapshot)
      })
      .catch((cause: unknown) => {
        if (active) setError(describeError(cause))
      })

    return () => {
      active = false
      unsubscribe()
    }
  }, [capabilities, refresh])

  const openFolder = useCallback(async () => {
    setError(null)
    try {
      await capabilities.localModels.openFolder()
    } catch (cause) {
      setError(describeError(cause))
    }
  }, [capabilities])

  const ensure = useCallback(
    async (modelKey: string) => {
      setError(null)
      try {
        const result = await capabilities.localModels.ensure(modelKey)
        setOperations((current) => ({
          ...current,
          [modelKey]: { operationId: result.operationId },
        }))
      } catch (cause) {
        setError(describeError(cause))
      }
    },
    [capabilities],
  )

  const cancel = useCallback(
    async (modelKey: string, operationId: string) => {
      try {
        await capabilities.localModels.cancel(operationId)
        setOperations((current) => {
          const next = { ...current }
          delete next[modelKey]
          return next
        })
      } catch (cause) {
        setError(describeError(cause))
      }
    },
    [capabilities],
  )

  return (
    <section className="settings-section">
      <div className="settings-section__actions">
        <Button size="sm" onClick={() => void openFolder()}>
          Open models folder
        </Button>
      </div>
      <Note>
        Model files stay on this device until you remove them from the models
        folder.
      </Note>
      {error ? (
        <Note status="failed" live="assertive">
          {error}
        </Note>
      ) : null}
      {catalogue === null ? (
        <Note live="polite">Loading local models…</Note>
      ) : catalogue.models.length === 0 ? (
        <Note>No local models are configured.</Note>
      ) : (
        <ul className="settings-list">
          {catalogue.models.map((model) => {
            const operation = operations[model.key]
            const progress = operation === undefined ? null : progressLabel(operation)
            const canEnsure =
              operation === undefined &&
              (model.state === 'registered' || model.state === 'failed')
            return (
              <li
                key={model.key}
                className="settings-list__row settings-local-model__row"
              >
                <div className="settings-list__content settings-local-model__content">
                  <strong>{model.displayName}</strong>
                  <code>{model.modelId}</code>
                  <span className="settings-list__meta">
                    {model.format.toUpperCase()} · {formatBytes(model.expectedBytes)} ·{' '}
                    {model.state}
                  </span>
                  <span className="settings-list__detail">
                    {publicationLabel(model)}
                  </span>
                  {progress ? (
                    <span className="settings-list__detail" aria-live="polite">
                      {progress}
                    </span>
                  ) : null}
                </div>
                <div className="settings-local-model__actions">
                  {operation !== undefined ? (
                    <Button
                      size="sm"
                      onClick={() =>
                        void cancel(model.key, operation.operationId)
                      }
                    >
                      Cancel
                    </Button>
                  ) : canEnsure ? (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => void ensure(model.key)}
                    >
                      Download
                    </Button>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
