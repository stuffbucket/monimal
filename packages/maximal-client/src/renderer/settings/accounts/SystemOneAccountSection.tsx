import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type ReactElement } from 'react'

import {
  Banner,
  Button,
  FormField,
  PartitionedSortableList,
  Select,
  SettingsGroup,
  SettingsItem,
  SettingsSection,
  Switch,
  TextInput,
  type PartitionedSortableItem,
} from '@maximal/maximal-electron/renderer'
import {
  type SystemOneLocalModel,
  type SystemOneLocalProvider,
  type SystemOneSettingsResponse,
  type SystemOneSettingsUpdateRequest,
} from '@maximal/maximal-core-contract/settings'

import { describeError } from '../../shared/errors'
import type { SettingsCapabilities } from '../capabilities'

const systemOneSettingsQueryKey = ['settings', 'system-one'] as const

const MODEL_DETAILS: Record<
  SystemOneLocalModel,
  { label: string; description: string }
> = {
  nimble: { label: 'Nimble', description: 'Nimble 9B · nimble' },
  tev1: { label: 'Tev1', description: 'Tev1 4B · tev1' },
  'tev1:0.8b': { label: 'Tev1 0.8B', description: 'tev1:0.8b' },
}

interface SystemOneAccountSectionProps {
  capabilities: SettingsCapabilities
}

function SystemOneSettingsForm({
  capabilities,
  settings,
}: SystemOneAccountSectionProps & {
  settings: SystemOneSettingsResponse
}): ReactElement {
  const queryClient = useQueryClient()
  const [apiKey, setApiKey] = useState(settings.api_key ?? '')
  const [modelOrder, setModelOrder] = useState<readonly SystemOneLocalModel[]>(
    settings.model_order,
  )
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const update = async (
    input: SystemOneSettingsUpdateRequest,
  ): Promise<void> => {
    setSaving(true)
    setActionError(null)
    try {
      const next = await capabilities.systemOneSettings.update(input)
      queryClient.setQueryData(systemOneSettingsQueryKey, next)
    } catch (cause) {
      setActionError(describeError(cause))
    } finally {
      setSaving(false)
    }
  }

  const items = modelOrder.map(
    (id): PartitionedSortableItem => ({
      id,
      ...MODEL_DETAILS[id],
      testId: `system-one-model-${id}`,
      toggleDisabled: true,
    }),
  )
  const providerOptions: Array<{
    value: SystemOneLocalProvider
    label: string
  }> = [
    { value: 'maximal', label: 'Maximal' },
    ...(settings.ollama_configured
      ? [{ value: 'ollama' as const, label: 'Ollama' }]
      : []),
  ]

  return (
    <>
      {actionError ? <Banner status="failed">{actionError}</Banner> : null}
      <SettingsGroup>
        <SettingsItem
          title="Calibrated Decisions"
          description="AI system that predicts the probability of an outcome occurring (60% of the time it works every time)"
        >
          <FormField label="TypeSafe JEV Direct Cloud API key">
            {(control) => (
              <span className="settings-credential-field">
                <span className="settings-credential-input">
                  <TextInput
                    {...control}
                    value={apiKey}
                    type="password"
                    placeholder="Enter a TypeSafe API key."
                    revealLabel="TypeSafe JEV API key"
                    disabled={saving}
                    testId="typesafe-jev-api-key"
                    onChange={setApiKey}
                  />
                </span>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={
                    saving
                    || apiKey.trim() === (settings.api_key ?? '')
                  }
                  onClick={() => void update({ api_key: apiKey })}
                >
                  {saving ? 'Saving…' : 'Save API Key'}
                </Button>
                {settings.has_api_key ? (
                  <Button
                    size="sm"
                    disabled={saving}
                    onClick={() => {
                      setApiKey('')
                      void update({ api_key: '' })
                    }}
                  >
                    Remove saved key
                  </Button>
                ) : null}
              </span>
            )}
          </FormField>
        </SettingsItem>
        <SettingsItem
          title="Local provider"
          description={
            settings.ollama_configured
              ? 'Choose which local provider executes System One models.'
              : 'Configure a local Ollama endpoint in Ollama settings to make it selectable here.'
          }
          control={
            <Select<SystemOneLocalProvider>
              value={settings.local_provider}
              options={providerOptions}
              disabled={saving}
              aria-label="System One local provider"
              testId="system-one-local-provider"
              onChange={(localProvider) =>
                void update({ local_provider: localProvider })}
            />
          }
        />
        <SettingsItem
          title="Fallback to local models"
          description="If TypeSafe JEV cannot serve a request, try the configured local models in the order below."
          control={
            <Switch
              label="Fallback to local models"
              displayLabel={null}
              checked={settings.fallback_to_local}
              disabled={saving}
              testId="system-one-local-fallback"
              onChange={(fallbackToLocal) =>
                void update({ fallback_to_local: fallbackToLocal })}
            />
          }
        />
      </SettingsGroup>
      <SettingsSection
        title="Local model order"
        as="h3"
        description="Drag models into the order Maximal should offer and try them."
      >
        <PartitionedSortableList
          ariaLabel="System One local model order"
          enabledItems={items}
          disabledItems={[]}
          disabled={saving}
          onChange={(nextEnabled) => {
            const next = nextEnabled.map(
              ({ id }) => id as SystemOneLocalModel,
            )
            setModelOrder(next)
            void update({ model_order: next })
          }}
        />
      </SettingsSection>
    </>
  )
}

export function SystemOneAccountSection({
  capabilities,
}: SystemOneAccountSectionProps): ReactElement {
  const settingsQuery = useQuery({
    queryKey: systemOneSettingsQueryKey,
    queryFn: () => capabilities.systemOneSettings.get(),
  })

  return (
    <SettingsSection title="System 1">
      {settingsQuery.error ? (
        <Banner status="failed">{describeError(settingsQuery.error)}</Banner>
      ) : null}
      {settingsQuery.data ? (
        <SystemOneSettingsForm
          capabilities={capabilities}
          settings={settingsQuery.data}
        />
      ) : null}
    </SettingsSection>
  )
}
