import { useEffect, useState, type FocusEvent } from 'react'

import type {
  OllamaAccountsListResponse,
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
  const [apiKeyDirty, setApiKeyDirty] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [keyError, setKeyError] = useState<string | null>(null)
  const [keyMessage, setKeyMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let settled = false
    const refresh = async () => {
      try {
        const [next, nextSettings] = await Promise.all([
          capabilities.ollamaAccounts.list(),
          capabilities.ollamaSettings.get(),
        ])
        if (!settled) {
          setList(next)
          setSettings(nextSettings)
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
  }, [capabilities])

  const updatePreference = async (preferLocalModels: boolean) => {
    setError(null)
    try {
      setSettings(await capabilities.ollamaSettings.update({
        prefer_local_models: preferLocalModels,
      }))
    } catch (cause) {
      setError(describeError(cause))
    }
  }

  const updateApiKey = (next: string) => {
    setApiKey(next)
    setApiKeyDirty(true)
    setKeyError(null)
    setKeyMessage(null)
    setDialogError(null)
  }

  const blurApiKey = (event: FocusEvent<HTMLInputElement>) => {
    const nextTarget = event.relatedTarget as HTMLElement | null
    if (nextTarget && event.currentTarget.parentElement?.contains(nextTarget)) return
    if (!apiKeyDirty) return
    if (apiKey.trim().length === 0) {
      setApiKey('')
      setApiKeyDirty(false)
      return
    }
    setConfirmOpen(true)
    setDialogError(null)
  }

  const discardApiKey = () => {
    setApiKey('')
    setApiKeyDirty(false)
    setConfirmOpen(false)
    setDialogError(null)
  }

  const saveApiKey = async () => {
    const candidate = apiKey.trim()
    if (candidate.length < MIN_OLLAMA_KEY_LENGTH) {
      setDialogError('API key is too short to be valid.')
      return
    }

    setSaving(true)
    setDialogError(null)
    try {
      setSettings(await capabilities.ollamaSettings.update({ api_key: candidate }))
      setApiKey('')
      setApiKeyDirty(false)
      setConfirmOpen(false)
      setKeyError(null)
      setKeyMessage('Ollama API key verified and saved.')
      try {
        setList(await capabilities.ollamaAccounts.list())
      } catch (cause) {
        setError(describeError(cause))
      }
    } catch (cause) {
      setDialogError(describeError(cause))
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
      setApiKeyDirty(false)
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

  return {
    list,
    settings,
    apiKey,
    confirmOpen,
    saving,
    dialogError,
    keyError,
    keyMessage,
    error,
    updatePreference,
    updateApiKey,
    blurApiKey,
    discardApiKey,
    saveApiKey,
    removeApiKey,
  }
}