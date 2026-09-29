import { useCallback, useEffect, useState } from 'react'

import type {
  AssistantChat,
  AssistantOverlayPreferences,
} from '@maximal/maximal-harness'

export function useAssistantMenu() {
  const [recent, setRecent] = useState<AssistantChat[]>([])
  const [preferences, setPreferences] =
    useState<AssistantOverlayPreferences | null>(null)

  const reload = useCallback(() => {
    void Promise.all([
      window.maximal.harness.chats.list({
        status: 'active',
        sort: 'activity',
        direction: 'desc',
        limit: 5,
      }),
      window.maximal.harness.preferences(),
    ]).then(([chatList, nextPreferences]) => {
      setRecent(chatList.chats)
      setPreferences(nextPreferences)
    })
  }, [])

  useEffect(() => {
    reload()
    const stopChats = window.maximal.harness.onChatsChanged(reload)
    const stopPreferences = window.maximal.harness.onPreferences(setPreferences)
    return () => {
      stopChats()
      stopPreferences()
    }
  }, [reload])

  return {
    recent,
    hotkey: preferences?.hotkey ?? 'CommandOrControl+Shift+Space',
    toggle: () => {
      void window.maximal.harness.toggle()
    },
    openChat: (id: string) => {
      void window.maximal.harness.openChat(id)
    },
  }
}
