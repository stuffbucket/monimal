import { useCallback, useEffect, useMemo, useState } from 'react'

import type {
  ConnectorSettingValue,
  SearchSettingsResponse,
  SearchSettingsUpdateRequest,
  SettingsCapabilities,
} from '../capabilities'
import { useUnsavedChangesController } from '../../unsaved-changes'
import { describeError } from '../../shared/errors'
import {
  hasBlockingValidationError,
  providerEnabled,
  sameItems,
  type ProviderCheckState,
} from './search-settings-helpers'
import type { PartitionedSortableItem } from 'stuffbucket-electron/renderer'

interface SearchSettingsState {
  snapshot: SearchSettingsResponse | null
  updates: SearchSettingsUpdateRequest
  busy: boolean
  error: string | null
  providerChecks: Record<string, ProviderCheckState>
  blockingValidationError: boolean
  setGlobal: (key: string, value: ConnectorSettingValue | null) => void
  setProviderLayout: (
    enabledItems: PartitionedSortableItem[],
    disabledItems: PartitionedSortableItem[],
  ) => void
  setProviderSetting: (
    providerId: string,
    key: string,
    value: ConnectorSettingValue | null,
  ) => void
  validateProviderForEnable: (providerId: string) => Promise<boolean>
}

export function useSearchSettings(
  capabilities: SettingsCapabilities,
): SearchSettingsState {
  const [snapshot, setSnapshot] = useState<SearchSettingsResponse | null>(null)
  const [updates, setUpdates] = useState<SearchSettingsUpdateRequest>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [providerChecks, setProviderChecks] = useState<Record<string, ProviderCheckState>>({})

  useEffect(() => {
    let active = true
    void capabilities.search
      .get()
      .then((next) => {
        if (active) setSnapshot(next)
      })
      .catch((cause: unknown) => {
        if (active) setError(describeError(cause))
      })
    return () => {
      active = false
    }
  }, [capabilities])

  const setGlobal = (key: string, value: ConnectorSettingValue | null): void => {
    setUpdates((previous) => ({
      ...previous,
      settings: { ...previous.settings, [key]: value },
    }))
  }

  const setProviderLayout = (
    enabledItems: PartitionedSortableItem[],
    disabledItems: PartitionedSortableItem[],
  ): void => {
    if (snapshot === null) return
    const priority = [...enabledItems, ...disabledItems].map(({ id }) => id)
    const configuredPriority = snapshot.settings.priority
    const originalPriority = Array.isArray(configuredPriority)
      ? configuredPriority.filter((item): item is string => typeof item === 'string')
      : snapshot.manifest.providers.map(({ id }) => id)

    setUpdates((previous) => {
      const settings = { ...previous.settings }
      if (sameItems(priority, originalPriority)) delete settings.priority
      else settings.priority = priority

      const providers = { ...previous.providers }
      const enabledIds = new Set(enabledItems.map(({ id }) => id))
      for (const provider of snapshot.manifest.providers) {
        const configured = snapshot.providers[provider.id]?.enabled ?? true
        const enabled = enabledIds.has(provider.id)
        const providerUpdate = { ...providers[provider.id] }
        if (enabled === configured) delete providerUpdate.enabled
        else providerUpdate.enabled = enabled
        if (Object.keys(providerUpdate).length === 0) delete providers[provider.id]
        else providers[provider.id] = providerUpdate
      }

      return {
        ...(Object.keys(settings).length > 0 ? { settings } : {}),
        ...(Object.keys(providers).length > 0 ? { providers } : {}),
      }
    })
  }

  const setProviderSetting = (
    providerId: string,
    key: string,
    value: ConnectorSettingValue | null,
  ): void => {
    setProviderChecks((previous) => {
      if (previous[providerId] === undefined) return previous
      const next = { ...previous }
      delete next[providerId]
      return next
    })
    setUpdates((previous) => ({
      ...previous,
      providers: {
        ...previous.providers,
        [providerId]: {
          ...previous.providers?.[providerId],
          settings: {
            ...previous.providers?.[providerId]?.settings,
            [key]: value,
          },
        },
      },
    }))
  }

  const validateProviderForEnable = useCallback(async (
    providerId: string,
  ): Promise<boolean> => {
    try {
      const settings = updates.providers?.[providerId]?.settings
      const result = await capabilities.search.validateProvider({
        providerId,
        ...(settings === undefined ? {} : { settings }),
      })
      if (result.status === 'valid') {
        setProviderChecks((previous) => {
          const next = { ...previous }
          delete next[providerId]
          return next
        })
        return true
      }
      setProviderChecks((previous) => ({
        ...previous,
        [providerId]: {
          fieldErrors: result.fieldErrors,
          ...(result.message === undefined ? {} : { message: result.message }),
        },
      }))
      return false
    } catch (cause) {
      setProviderChecks((previous) => ({
        ...previous,
        [providerId]: {
          fieldErrors: {},
          message: describeError(cause),
        },
      }))
      return false
    }
  }, [capabilities, updates])

  const hasUpdates =
    Object.keys(updates.settings ?? {}).length > 0
    || Object.keys(updates.providers ?? {}).length > 0
  const blockingValidationError = snapshot !== null
    && (
      hasBlockingValidationError(snapshot, updates)
      || Object.values(providerChecks).some(
        ({ fieldErrors }) => Object.keys(fieldErrors).length > 0,
      )
    )

  const saveChanges = useCallback(async (): Promise<boolean> => {
    if (!hasUpdates) return true
    if (blockingValidationError) return false
    setBusy(true)
    setError(null)
    try {
      if (snapshot !== null) {
        const changedEnabledProviderIds = Object.entries(updates.providers ?? {})
          .filter(
            ([providerId, update]) =>
              update.settings !== undefined
              && Object.keys(update.settings).length > 0
              && providerEnabled(snapshot, updates, providerId),
          )
          .map(([providerId]) => providerId)
        for (const providerId of changedEnabledProviderIds) {
          if (!await validateProviderForEnable(providerId)) return false
        }
      }
      setSnapshot(await capabilities.search.update(updates))
      setUpdates({})
      setProviderChecks({})
      return true
    } catch (cause) {
      setError(describeError(cause))
      return false
    } finally {
      setBusy(false)
    }
  }, [
    blockingValidationError,
    capabilities,
    hasUpdates,
    snapshot,
    updates,
    validateProviderForEnable,
  ])

  const discardChanges = useCallback(() => {
    setUpdates({})
    setProviderChecks({})
  }, [])
  const unsavedChanges = useMemo(
    () => ({
      hasChanges: () => hasUpdates,
      canSave: () => !busy && !blockingValidationError,
      save: saveChanges,
      discard: discardChanges,
    }),
    [blockingValidationError, busy, discardChanges, hasUpdates, saveChanges],
  )
  useUnsavedChangesController(unsavedChanges)

  return {
    snapshot,
    updates,
    busy,
    error,
    providerChecks,
    blockingValidationError,
    setGlobal,
    setProviderLayout,
    setProviderSetting,
    validateProviderForEnable,
  }
}