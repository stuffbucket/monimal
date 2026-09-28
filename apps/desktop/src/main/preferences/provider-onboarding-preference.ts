import type { ProviderOnboardingPreference } from '@maximal/maximal-client/shared/host'
import { readUserPreferences, updateUserPreferences } from './user-preferences.js'

export async function getProviderOnboardingPreference(): Promise<ProviderOnboardingPreference> {
  const preferences = await readUserPreferences()
  return { dismissed: preferences.providerOnboardingDismissed === true }
}

export async function setProviderOnboardingPreference(
  dismissed: boolean,
): Promise<ProviderOnboardingPreference> {
  await updateUserPreferences({ providerOnboardingDismissed: dismissed })
  return { dismissed }
}