import { createContext, useContext } from 'react'

import type { SettingsSectionId } from '../../shared/settings-sections'

const SettingsNavigationContext = createContext<
  (sectionId: SettingsSectionId) => void
>(() => undefined)

export const SettingsNavigationProvider = SettingsNavigationContext.Provider

export function useSettingsNavigation(): (sectionId: SettingsSectionId) => void {
  return useContext(SettingsNavigationContext)
}
