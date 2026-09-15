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

import { UnsavedChangesDialog } from 'stuffbucket-electron/renderer'

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
      <UnsavedChangesDialog
        open={pending !== null}
        saving={saving}
        saveDisabled={pending !== null && !pending.controller.canSave()}
        error={saveError}
        onSave={() => void save()}
        onDiscard={discard}
        onCancel={cancel}
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