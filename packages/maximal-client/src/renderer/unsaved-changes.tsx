import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'

import { AlertDialog, Button } from '@maximal/maximal-design-system'

import { shellOverlayContainer } from './shell-overlay-container'

export interface UnsavedChangesController {
  hasChanges: () => boolean
  canSave: () => boolean
  save: () => Promise<boolean>
  discard: () => void
}

interface PendingNavigation {
  controller: UnsavedChangesController
  proceed: () => void
}

interface UnsavedChangesContextValue {
  register: (controller: UnsavedChangesController) => () => void
  request: (proceed: () => void) => void
}

const passthrough: UnsavedChangesContextValue = {
  register: () => () => undefined,
  request: (proceed) => proceed(),
}

const UnsavedChangesContext = createContext(passthrough)

export function UnsavedChangesProvider({
  children,
}: {
  children: ReactNode
}): ReactElement {
  const controller = useRef<UnsavedChangesController | null>(null)
  const [pending, setPending] = useState<PendingNavigation | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const register = useCallback((next: UnsavedChangesController) => {
    controller.current = next
    return () => {
      if (controller.current === next) controller.current = null
    }
  }, [])

  const request = useCallback((proceed: () => void) => {
    const current = controller.current
    if (current === null || !current.hasChanges()) {
      proceed()
      return
    }
    setSaveError(null)
    setPending({ controller: current, proceed })
  }, [])

  const value = useMemo(() => ({ register, request }), [register, request])

  const save = async (): Promise<void> => {
    if (pending === null) return
    setSaving(true)
    setSaveError(null)
    try {
      const saved = await pending.controller.save()
      setPending(null)
      if (saved) pending.proceed()
    } catch {
      setSaveError('Changes could not be saved. Try again or discard them.')
    } finally {
      setSaving(false)
    }
  }

  const discard = (): void => {
    if (pending === null) return
    pending.controller.discard()
    pending.proceed()
    setSaveError(null)
    setPending(null)
  }

  const cancel = (): void => {
    setSaveError(null)
    setPending(null)
  }

  return (
    <UnsavedChangesContext.Provider value={value}>
      {children}
      <AlertDialog
        action={(
          <Button
            disabled={saving || (pending !== null && !pending.controller.canSave())}
            onClick={() => void save()}
            variant="primary"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        )}
        container={shellOverlayContainer}
        description="You have unsaved changes. Save them now, or discard them and continue."
        error={saveError ?? undefined}
        onOpenChange={(open) => {
          if (!open) cancel()
        }}
        open={pending !== null}
        pending={saving}
        popupProps={{ 'data-testid': 'unsaved-changes-dialog' }}
        tertiaryActions={(
          <Button disabled={saving} onClick={discard} variant="secondary-danger">
            Discard changes
          </Button>
        )}
        title="Save changes before leaving?"
      />
    </UnsavedChangesContext.Provider>
  )
}

export function useGuardedNavigation(): (proceed: () => void) => void {
  return useContext(UnsavedChangesContext).request
}

export function useUnsavedChangesController(
  controller: UnsavedChangesController,
): void {
  const register = useContext(UnsavedChangesContext).register
  useEffect(() => register(controller), [controller, register])
}