import { useCallback, useEffect, useState } from 'react'

import type { SettingsCapabilities } from '../capabilities'
import { describeError } from '../../shared/errors'

export function useGeneralDesktopSettings(capabilities: SettingsCapabilities) {
  const [desktop, setDesktop] = useState<Awaited<
    ReturnType<SettingsCapabilities['general']['desktopSettings']>
  > | null>(null)
  const [notifications, setNotifications] = useState<Awaited<
    ReturnType<SettingsCapabilities['general']['systemNotificationStatus']>
  > | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savingStartup, setSavingStartup] = useState(false)
  const [openingNotificationSettings, setOpeningNotificationSettings] =
    useState(false)

  useEffect(() => {
    let settled = false
    void Promise.all([
      capabilities.general.desktopSettings(),
      capabilities.general.systemNotificationStatus(),
    ]).then(
      ([desktopSettings, notificationStatus]) => {
        if (!settled) {
          setDesktop(desktopSettings)
          setNotifications(notificationStatus)
        }
      },
      (cause: unknown) => {
        if (!settled) setError(describeError(cause))
      },
    )
    return () => {
      settled = true
    }
  }, [capabilities])

  const changeStartup = useCallback(async (enabled: boolean) => {
    setSavingStartup(true)
    setError(null)
    try {
      setDesktop(await capabilities.general.setStartOnLogin(enabled))
    } catch (cause) {
      setError(describeError(cause))
    } finally {
      setSavingStartup(false)
    }
  }, [capabilities])

  const openNotificationSettings = useCallback(async () => {
    setOpeningNotificationSettings(true)
    setError(null)
    try {
      await capabilities.general.openSystemNotificationSettings()
    } catch (cause) {
      setError(describeError(cause))
    } finally {
      setOpeningNotificationSettings(false)
    }
  }, [capabilities])

  return {
    changeStartup,
    desktop,
    error,
    notifications,
    openNotificationSettings,
    openingNotificationSettings,
    savingStartup,
  }
}
