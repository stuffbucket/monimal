import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type ReactElement } from 'react'
import { Button, Checkbox, Dialog } from '@maximal/maximal-electron/renderer'

import type { SettingsCapabilities } from './settings/capabilities'

interface ProviderOnboardingProps {
  capabilities: SettingsCapabilities
  onSetup: () => void
}

const providerOnboardingQueryKey = ['provider-onboarding', 'eligible'] as const

export function ProviderOnboarding({
  capabilities,
  onSetup,
}: ProviderOnboardingProps): ReactElement {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: providerOnboardingQueryKey,
    queryFn: async () => {
      const [preference, accounts, ollamaAccounts] = await Promise.all([
        capabilities.providerOnboarding.get(),
        capabilities.accounts.list(),
        capabilities.ollamaAccounts.list(),
      ])
      const configured =
        accounts.accounts.some((account) => account.enabled)
        || ollamaAccounts.accounts.length > 0
      return !preference.dismissed && !configured
    },
  })
  const [answered, setAnswered] = useState(false)
  const [doNotAskAgain, setDoNotAskAgain] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(
    () =>
      capabilities.subscribe(() => {
        if (!answered) {
          void queryClient.invalidateQueries({
            queryKey: providerOnboardingQueryKey,
          })
        }
      }),
    [answered, capabilities, queryClient],
  )

  const finish = async (setup: boolean): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      if (doNotAskAgain) {
        await capabilities.providerOnboarding.setDismissed(true)
        queryClient.setQueryData(providerOnboardingQueryKey, false)
      }
      setAnswered(true)
      if (setup) onSetup()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={!answered && query.data === true}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !busy) void finish(false)
      }}
      title="Connect a model provider"
      description="Set up a provider for model requests, or continue without one."
      showTitle
      showDescription
      testId="provider-onboarding"
    >
      <p>
        Maximal can connect to GitHub Copilot or Ollama. You can skip this and
        still use terminals and the rest of the desktop app.
      </p>
      <Checkbox
        label="Don’t ask me again"
        checked={doNotAskAgain}
        onChange={setDoNotAskAgain}
        disabled={busy}
      />
      {error ?? query.error ? (
        <p role="alert">
          {error ?? 'Unable to check configured model providers.'}
        </p>
      ) : null}
      <div className="provider-onboarding__actions">
        <Button onClick={() => void finish(false)} disabled={busy}>
          Not now
        </Button>
        <Button
          variant="primary"
          onClick={() => void finish(true)}
          disabled={busy}
        >
          Set up a provider
        </Button>
      </div>
    </Dialog>
  )
}
