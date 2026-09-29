import { useCallback, useEffect, useMemo, useState } from 'react'

import type { ModelsListResponse, SettingsCapabilities } from './capabilities'
import { describeError } from '../shared/errors'

export interface CloudModelProvider {
  id: string
  name: string
  active: boolean
  configured: boolean
  available: boolean
  enabled: boolean
  configurable: boolean
  description: string
  account?: string
}

export interface ProviderAccess {
  accounts: Awaited<ReturnType<SettingsCapabilities['accounts']['list']>>
  ollamaAccounts: Awaited<ReturnType<SettingsCapabilities['ollamaAccounts']['list']>>
  ollamaSettings: Awaited<ReturnType<SettingsCapabilities['ollamaSettings']['get']>>
  ollamaPreferences: Awaited<ReturnType<SettingsCapabilities['ollamaRuntime']['preferences']>>
}

export function cloudProviderId(
  model: ModelsListResponse['models'][number],
): string {
  const source = model.provider?.trim().toLowerCase() ?? 'github-copilot'
  if (source === 'ollama' || source === 'ollama-cloud') return 'ollama'
  if (source.includes('github') || source.includes('copilot')) {
    return 'github-copilot'
  }
  return source
}

export function cloudProviderName(id: string, vendor?: string): string {
  if (id === 'github-copilot') return 'GitHub Copilot'
  if (id === 'ollama') return 'Ollama'
  return vendor?.trim() || id
}

export async function readProviderAccess(
  capabilities: SettingsCapabilities,
): Promise<ProviderAccess> {
  const [accounts, ollamaAccounts, ollamaSettings, ollamaPreferences] =
    await Promise.all([
      capabilities.accounts.list(),
      capabilities.ollamaAccounts.list(),
      capabilities.ollamaSettings.get(),
      capabilities.ollamaRuntime.preferences(),
    ])
  return { accounts, ollamaAccounts, ollamaSettings, ollamaPreferences }
}

export function configuredCloudProviderIds(
  access: ProviderAccess,
): ReadonlySet<string> {
  const configured = new Set<string>()
  if (access.accounts.accounts.length > 0) configured.add('github-copilot')
  if (
    access.ollamaSettings.has_api_key
    || access.ollamaAccounts.accounts.length > 0
  ) {
    configured.add('ollama')
  }
  return configured
}

function providerDescription(
  available: boolean,
  enabled: boolean,
  path: string,
): string {
  if (!available) return `Unavailable · ${path}`
  return `${enabled ? 'Enabled' : 'Disabled'} · ${path}`
}

function localOllamaCloudAvailable(
  access: ProviderAccess,
  catalogue: ModelsListResponse,
): boolean {
  const localEndpointAvailable = access.ollamaAccounts.accounts.some(
    (account) => account.scope !== 'remote' && account.availability === 'available',
  )
  const localCloudModelAvailable = catalogue.models.some(
    (model) =>
      model.location === 'cloud'
      && model.provider?.trim().toLowerCase() === 'ollama',
  )
  return localEndpointAvailable && localCloudModelAvailable
}

function knownProviders(
  access: ProviderAccess,
  catalogue: ModelsListResponse,
): CloudModelProvider[] {
  const githubAvailable = access.accounts.accounts.length > 0
  const githubAccount =
    access.accounts.accounts.find(
      (account) => account.key === access.accounts.active_key,
    )
    ?? access.accounts.accounts.find((account) => account.active)
    ?? access.accounts.accounts.find((account) => account.enabled)
    ?? access.accounts.accounts[0]
  const githubActive = githubAccount?.active ?? false
  const githubEnabled = access.accounts.accounts.some((account) => account.enabled)
  const ollamaLocalAvailable = localOllamaCloudAvailable(access, catalogue)
  const ollamaDirectAvailable = access.ollamaSettings.has_api_key
  const ollamaAvailable = ollamaDirectAvailable || ollamaLocalAvailable
  const ollamaEnabled =
    (ollamaDirectAvailable && access.ollamaSettings.cloud_enabled)
    || (ollamaLocalAvailable && !access.ollamaPreferences.cloud_disabled)
  const ollamaPath =
    ollamaDirectAvailable && ollamaLocalAvailable
      ? 'API key and local Ollama application'
      : ollamaDirectAvailable
        ? 'API key'
        : ollamaLocalAvailable
          ? 'Local Ollama application'
          : 'Add an API key or sign in through the Ollama application'

  return [
    {
      id: 'github-copilot',
      name: 'GitHub Copilot',
      active: githubActive,
      configured: githubAvailable,
      available: githubAvailable,
      enabled: githubAvailable && githubEnabled,
      configurable: true,
      description: providerDescription(
        githubAvailable,
        githubEnabled,
        githubAccount === undefined
          ? 'Sign in with a GitHub account'
          : `Signed in as ${githubAccount.login}`,
      ),
      account: githubAccount?.login || githubAccount?.key,
    },
    {
      id: 'ollama',
      name: 'Ollama',
      active: ollamaAvailable,
      configured:
        ollamaDirectAvailable || access.ollamaAccounts.accounts.length > 0,
      available: ollamaAvailable,
      enabled: ollamaAvailable && ollamaEnabled,
      configurable: true,
      description: providerDescription(ollamaAvailable, ollamaEnabled, ollamaPath),
    },
  ]
}

function discoveredProviders(
  catalogue: ModelsListResponse,
  known: ReadonlySet<string>,
): CloudModelProvider[] {
  const models = catalogue.models.filter((model) => model.location !== 'local')
  const providers = new Map<string, string>()
  for (const model of models) {
    const id = cloudProviderId(model)
    if (!known.has(id) && !providers.has(id)) providers.set(id, model.vendor)
  }
  return [...providers].map(([id, vendor]) => ({
    id,
    name: cloudProviderName(id, vendor),
    active: true,
    configured: true,
    available: true,
    enabled: true,
    configurable: false,
    description: 'Enabled · Configured outside Maximal',
  }))
}

export function useCloudModelProviders(
  capabilities: SettingsCapabilities,
  catalogue: ModelsListResponse | null,
) {
  const [access, setAccess] = useState<ProviderAccess | null>(null)
  const [updating, setUpdating] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setAccess(await readProviderAccess(capabilities))
      setError(null)
    } catch (cause) {
      setError(describeError(cause))
    }
  }, [capabilities])

  useEffect(() => {
    let active = true
    const refresh = () => {
      void readProviderAccess(capabilities).then(
        (next) => {
          if (!active) return
          setAccess(next)
          setError(null)
        },
        (cause: unknown) => {
          if (active) setError(describeError(cause))
        },
      )
    }
    refresh()
    const unsubscribe = capabilities.subscribe(refresh)
    return () => {
      active = false
      unsubscribe()
    }
  }, [capabilities])

  const providers = useMemo(() => {
    if (catalogue === null || access === null) return []
    const known = knownProviders(access, catalogue)
    return [
      ...known,
      ...discoveredProviders(catalogue, new Set(known.map(({ id }) => id))),
    ]
  }, [access, catalogue])

  const setEnabled = useCallback(async (providerId: string, enabled: boolean) => {
    if (access === null) return
    setUpdating(providerId)
    setError(null)
    try {
      if (providerId === 'github-copilot') {
        await Promise.all(
          access.accounts.accounts.map((account) =>
            capabilities.accounts.setEnabled(account.key, enabled),
          ),
        )
        if (enabled && access.accounts.accounts[0] !== undefined) {
          await capabilities.accounts.switchTo(access.accounts.accounts[0].key)
        }
      } else if (providerId === 'ollama') {
        const direct = access.ollamaSettings.has_api_key
        const local =
          catalogue !== null && localOllamaCloudAvailable(access, catalogue)
        await Promise.all([
          direct
            ? capabilities.ollamaSettings.update({ cloud_enabled: enabled })
            : Promise.resolve(access.ollamaSettings),
          local
            ? capabilities.ollamaRuntime.updatePreferences({
                cloud_disabled: !enabled,
              })
            : Promise.resolve(access.ollamaPreferences),
        ])
      }
      await reload()
    } catch (cause) {
      setError(describeError(cause))
    } finally {
      setUpdating(null)
    }
  }, [access, capabilities, catalogue, reload])

  return { error, providers, setEnabled, updating }
}
