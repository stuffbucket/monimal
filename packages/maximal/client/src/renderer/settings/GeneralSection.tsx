import { useCallback, useEffect, useState, type ReactElement } from 'react'

import { Button, Dialog, Note, Switch } from 'stuffbucket-electron/renderer'

import type {
  MenuBarModeAttempt,
  MenuBarModeState,
  SettingsCapabilities,
} from './capabilities'
import { describeError } from './format'

interface GeneralSectionProps {
  capabilities: SettingsCapabilities
}

function secondsRemaining(deadlineMs: number): number {
  return Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1_000))
}

export function GeneralSection({
  capabilities,
}: GeneralSectionProps): ReactElement {
  const [state, setState] = useState<MenuBarModeState | null>(null)
  const [attempt, setAttempt] = useState<MenuBarModeAttempt | null>(null)
  const [remaining, setRemaining] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let settled = false
    void capabilities.general
      .menuBarMode()
      .then((next) => {
        if (!settled) setState(next)
      })
      .catch((cause: unknown) => {
        if (!settled) setError(describeError(cause))
      })
    return () => {
      settled = true
    }
  }, [capabilities])

  useEffect(() => {
    if (attempt === null) return
    const update = (): void => {
      const next = secondsRemaining(attempt.deadlineMs)
      setRemaining(next)
      if (next === 0) {
        setAttempt(null)
        setState({ enabled: false, pending: false })
      }
    }
    update()
    const timer = window.setInterval(update, 250)
    return () => window.clearInterval(timer)
  }, [attempt])

  const cancel = useCallback(async () => {
    if (attempt === null) return
    setBusy(true)
    setError(null)
    try {
      setState(await capabilities.general.cancelMenuBarOnly(attempt.attemptId))
      setAttempt(null)
    } catch (cause) {
      setError(describeError(cause))
      setAttempt(null)
      setState(await capabilities.general.menuBarMode())
    } finally {
      setBusy(false)
    }
  }, [attempt, capabilities])

  const changeMode = useCallback(
    async (enabled: boolean) => {
      setBusy(true)
      setError(null)
      try {
        if (enabled) {
          const nextAttempt = await capabilities.general.beginMenuBarOnly()
          setAttempt(nextAttempt)
          setRemaining(secondsRemaining(nextAttempt.deadlineMs))
          setState({ enabled: true, pending: true })
        } else {
          setState(await capabilities.general.disableMenuBarOnly())
        }
      } catch (cause) {
        setError(describeError(cause))
        setState(await capabilities.general.menuBarMode().catch(() => null))
      } finally {
        setBusy(false)
      }
    },
    [capabilities],
  )

  const confirm = useCallback(async () => {
    if (attempt === null) return
    setBusy(true)
    setError(null)
    try {
      setState(await capabilities.general.confirmMenuBarOnly(attempt.attemptId))
      setAttempt(null)
    } catch (cause) {
      setError(describeError(cause))
      setAttempt(null)
      setState(await capabilities.general.menuBarMode().catch(() => null))
    } finally {
      setBusy(false)
    }
  }, [attempt, capabilities])

  return (
    <section className="settings-section" aria-labelledby="settings-general-heading">
      <h1 id="settings-general-heading" className="settings-section__heading">
        General
      </h1>
      {error ? (
        <Note status="failed" live="assertive">
          {error}
        </Note>
      ) : null}
      {state === null ? (
        <Note live="polite">Loading desktop app preferences…</Note>
      ) : (
        <Switch
          label="Show Maximal in the menu bar only"
          checked={state.enabled}
          disabled={busy || state.pending}
          onChange={(next) => void changeMode(next)}
          testId="menu-bar-only-switch"
        />
      )}
      <Note>
        When enabled, use the Maximal icon in the menu bar to reopen the desktop
        app. Dock and taskbar presence is the default.
      </Note>

      <Dialog
        open={attempt !== null}
        onOpenChange={(open) => {
          if (!open) void cancel()
        }}
        title="Keep menu bar only?"
        description="Confirm before Maximal removes its Dock or taskbar entry."
        testId="menu-bar-mode-confirmation"
      >
        <h2 className="settings-dialog__heading">Keep menu bar only?</h2>
        <p>
          Maximal will restore its Dock or taskbar entry in{' '}
          <strong aria-live="polite">{remaining} seconds</strong> unless you keep
          this setting.
        </p>
        <div className="settings-dialog__actions">
          <Button onClick={() => void cancel()} disabled={busy}>
            Revert
          </Button>
          <Button variant="primary" onClick={() => void confirm()} disabled={busy}>
            Keep menu bar only
          </Button>
        </div>
      </Dialog>
    </section>
  )
}
