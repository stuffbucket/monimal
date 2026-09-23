import { useEffect, useRef, useState, type ReactElement } from 'react'
import { Button, Checkbox, Dialog } from 'stuffbucket-electron/renderer'

import type { SettingsCapabilities } from './settings/capabilities'

interface ProviderOnboardingProps {
  capabilities: SettingsCapabilities
  onSetup: () => void
}

export function ProviderOnboarding({
  capabilities,
  onSetup,
}: ProviderOnboardingProps): ReactElement {
  const [open, setOpen] = useState(false)
  const [doNotAskAgain, setDoNotAskAgain] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const answered = useRef(false)

  useEffect(() => {
    let cancelled = false

    const refresh = async (): Promise<void> => {
      if (answered.current) return
      try {
        const [preference, accounts, ollamaAccounts] = await Promise.all([
          capabilities.providerOnboarding.get(),
          capabilities.accounts.list(),
          capabilities.ollamaAccounts.list(),
        ])
        const configured = accounts.accounts.some((account) => account.enabled)
          || ollamaAccounts.accounts.length > 0
        if (!cancelled && !preference.dismissed && !configured) setOpen(true)
      } catch {
        // Core may still be starting. A later control event retries the check.
      }
    }

    void refresh()
    const unsubscribe = capabilities.subscribe(() => void refresh())
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [capabilities])

  const finish = async (setup: boolean): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      if (doNotAskAgain) await capabilities.providerOnboarding.setDismissed(true)
      answered.current = true
      setOpen(false)
      if (setup) onSetup()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
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
      {error ? <p role="alert">{error}</p> : null}
      <div className="provider-onboarding__actions">
        <Button onClick={() => void finish(false)} disabled={busy}>
          Not now
        </Button>
        <Button variant="primary" onClick={() => void finish(true)} disabled={busy}>
          Set up a provider
        </Button>
      </div>
      <style>{`
        .provider-onboarding__actions {
          display: flex;
          justify-content: flex-end;
          gap: var(--shell-space-2, 8px);
          flex-wrap: wrap;
        }
      `}</style>
    </Dialog>
  )
}