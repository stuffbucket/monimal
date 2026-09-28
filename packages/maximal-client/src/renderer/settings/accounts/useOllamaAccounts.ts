import { useEffect, useState } from 'react'

import type {
  OllamaAccountsListResponse,
  OllamaRuntimeStatus,
  OllamaRuntimePreferences,
  OllamaSettingsResponse,
  SettingsCapabilities,
} from '../capabilities'
import { describeError } from '../../shared/errors'

const POLL_MS = 5000
const MIN_OLLAMA_KEY_LENGTH = 8

export function useOllamaAccounts(capabilities: SettingsCapabilities) {
  const [list, setList] = useState<OllamaAccountsListResponse | null>(null)
  const [settings, setSettings] = useState<OllamaSettingsResponse | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [endpoint, setEndpoint] = useState('')
  const [saving, setSaving] = useState(false)
  const [runtime, setRuntime] = useState<OllamaRuntimeStatus | null>(null)
  const [runtimePreferences, setRuntimePreferences] =
    useState<OllamaRuntimePreferences | null>(null)
  const [keyError, setKeyError] = useState<string | null>(null)
  const [keyMessage, setKeyMessage] = useState<string | null>(null)
  const [endpointError, setEndpointError] = useState<string | null>(null)
  const [endpointMessage, setEndpointMessage] = useState<string | null>(null)
  const [suggestedEndpoint, setSuggestedEndpoint] = useState<string | null>(null)
  const [dismissedEndpoint, setDismissedEndpoint] = useState<string | null>(null)
  const [startPromptOpen, setStartPromptOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let settled = false
    void Promise.all([
      capabilities.ollamaSettings.get(),
      capabilities.ollamaRuntime.preferences(),
    ]).then(([nextSettings, nextRuntimePreferences]) => {
      if (settled) return
      setSettings(nextSettings)
      setApiKey(nextSettings.api_key ?? '')
      setEndpoint(nextSettings.local_endpoint)
      setRuntimePreferences(nextRuntimePreferences)
      setError(null)
    }).catch((cause: unknown) => {
      if (!settled) setError(describeError(cause))
    })
    return () => {
      settled = true
    }
  }, [capabilities])

  useEffect(() => {
    if (settings === null) return
    let settled = false
    const refresh = async () => {
      try {
        const [next, nextRuntime] = await Promise.all([
          capabilities.ollamaAccounts.list(),
          capabilities.ollamaRuntime.status(settings.local_endpoint),
        ])
        if (!settled) {
          setList(next)
          setRuntime(nextRuntime)
          if (
            nextRuntime.suggested_endpoint !== null
            && nextRuntime.suggested_endpoint !== dismissedEndpoint
          ) {
            setSuggestedEndpoint(nextRuntime.suggested_endpoint)
          }
          setError(null)
        }
      } catch (cause) {
        if (!settled) setError(describeError(cause))
      }
    }

    void refresh()
    const poll = setInterval(() => void refresh(), POLL_MS)
    return () => {
      settled = true
      clearInterval(poll)
    }
  }, [capabilities, dismissedEndpoint, settings])

  const updateApiKey = (next: string) => {
    setApiKey(next)
    setKeyError(null)
    setKeyMessage(null)
  }

  const saveApiKey = async () => {
    const candidate = apiKey.trim()
    if (candidate.length < MIN_OLLAMA_KEY_LENGTH) {
      setKeyError('API key is too short to be valid.')
      return
    }

    setSaving(true)
    setKeyError(null)
    setKeyMessage(null)
    try {
      const result = await capabilities.ollamaSettings.testApiKey({
        api_key: candidate,
      })
      if (result.status !== 'valid') {
        setKeyError(result.message)
        return
      }
      const nextSettings = await capabilities.ollamaSettings.update({
        api_key: candidate,
      })
      setSettings(nextSettings)
      setApiKey(nextSettings.api_key ?? candidate)
      setKeyError(null)
      setKeyMessage('Ollama API key saved.')
      try {
        setList(await capabilities.ollamaAccounts.list())
      } catch (cause) {
        setError(describeError(cause))
      }
    } catch (cause) {
      setKeyError(describeError(cause))
    } finally {
      setSaving(false)
    }
  }

  const removeApiKey = async () => {
    setSaving(true)
    setKeyError(null)
    setKeyMessage(null)
    try {
      setSettings(await capabilities.ollamaSettings.update({ api_key: '' }))
      setApiKey('')
      setKeyMessage('Saved API key removed.')
      try {
        setList(await capabilities.ollamaAccounts.list())
      } catch (cause) {
        setError(describeError(cause))
      }
    } catch (cause) {
      setKeyError(describeError(cause))
    } finally {
      setSaving(false)
    }
  }

  const updateEndpoint = (next: string) => {
    setEndpoint(next)
    setEndpointError(null)
    setEndpointMessage(null)
  }

  const saveEndpoint = async (candidate = endpoint) => {
    const value = candidate.trim()
    let normalized = ''
    if (value.length > 0) {
      let parsed: URL
      try {
        parsed = new URL(value)
      } catch {
        setEndpointError('Enter a valid Ollama HTTP or HTTPS URL.')
        return
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        setEndpointError('Enter a valid Ollama HTTP or HTTPS URL.')
        return
      }
      normalized = parsed.href.replace(/\/$/u, '')
    }
    setSaving(true)
    setEndpointError(null)
    setEndpointMessage(null)
    try {
      const nextSettings = await capabilities.ollamaSettings.update({
        local_endpoint: normalized,
      })
      const [nextRuntime, nextList] = await Promise.all([
        capabilities.ollamaRuntime.status(nextSettings.local_endpoint),
        capabilities.ollamaAccounts.list(),
      ])
      setSettings(nextSettings)
      setEndpoint(nextSettings.local_endpoint)
      setRuntime(nextRuntime)
      setList(nextList)
      setSuggestedEndpoint(null)
      setEndpointMessage(
        nextRuntime.running
          ? 'Connected to Ollama.'
          : 'Ollama was not found at this URL.',
      )
    } catch (cause) {
      setEndpointError(describeError(cause))
    } finally {
      setSaving(false)
    }
  }

  const updateRuntimePreferences = async (
    update: Parameters<SettingsCapabilities['ollamaRuntime']['updatePreferences']>[0],
  ) => {
    setSaving(true)
    setError(null)
    try {
      const next = await capabilities.ollamaRuntime.updatePreferences(update)
      setRuntimePreferences(next)
      if (
        update.start_on_maximal_launch === true
        && runtime?.installed === true
        && runtime.process_id === null
        && !runtime.running
      ) {
        setStartPromptOpen(true)
      }
      if (next.restart_required) {
        setError('Restart Ollama for the cloud-model setting to take effect.')
      }
    } catch (cause) {
      setError(describeError(cause))
    } finally {
      setSaving(false)
    }
  }

  const launchOllama = async () => {
    if (settings === null) return
    setSaving(true)
    setError(null)
    try {
      setRuntime(await capabilities.ollamaRuntime.launch(settings.local_endpoint))
      setList(await capabilities.ollamaAccounts.list())
      setStartPromptOpen(false)
    } catch (cause) {
      setError(describeError(cause))
    } finally {
      setSaving(false)
    }
  }

  const dismissEndpointSuggestion = () => {
    setDismissedEndpoint(suggestedEndpoint)
    setSuggestedEndpoint(null)
  }

  return {
    list,
    settings,
    apiKey,
    endpoint,
    saving,
    runtime,
    runtimePreferences,
    keyError,
    keyMessage,
    endpointError,
    endpointMessage,
    suggestedEndpoint,
    startPromptOpen,
    error,
    updateApiKey,
    saveApiKey,
    removeApiKey,
    updateEndpoint,
    saveEndpoint,
    updateRuntimePreferences,
    launchOllama,
    dismissEndpointSuggestion,
    setStartPromptOpen,
  }
}