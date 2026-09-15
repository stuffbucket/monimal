import { createContext, useContext, type ReactNode } from 'react'

type SetHeaderActions = (actions: ReactNode | null) => void

interface SettingsHeaderActions {
  hasHeader: boolean
  setActions: SetHeaderActions
}

const SettingsHeaderActionsContext = createContext<SettingsHeaderActions>({
  hasHeader: false,
  setActions: () => {},
})

export const SettingsHeaderActionsProvider = SettingsHeaderActionsContext.Provider

export function useSettingsHeaderActions(): SettingsHeaderActions {
  return useContext(SettingsHeaderActionsContext)
}
