import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

const recentAssistantChatsQueryKey = ['assistant', 'chats', 'recent'] as const
const assistantPreferencesQueryKey = ['assistant', 'preferences'] as const

export function useAssistantMenu() {
  const queryClient = useQueryClient()
  const recent = useQuery({
    queryKey: recentAssistantChatsQueryKey,
    queryFn: () => window.maximal.harness.chats.list({
      status: 'active',
      sort: 'activity',
      direction: 'desc',
      limit: 5,
    }),
  })
  const preferences = useQuery({
    queryKey: assistantPreferencesQueryKey,
    queryFn: () => window.maximal.harness.preferences(),
  })

  useEffect(() => {
    const stopChats = window.maximal.harness.onChatsChanged(() => {
      void queryClient.invalidateQueries({ queryKey: recentAssistantChatsQueryKey })
    })
    const stopPreferences = window.maximal.harness.onPreferences((next) => {
      queryClient.setQueryData(assistantPreferencesQueryKey, next)
    })
    return () => {
      stopChats()
      stopPreferences()
    }
  }, [queryClient])

  return {
    recent: recent.data?.chats ?? [],
    hotkey: preferences.data?.hotkey ?? 'CommandOrControl+Shift+Space',
    toggle: () => {
      void window.maximal.harness.toggle()
    },
    openChat: (id: string) => {
      void window.maximal.harness.openChat(id)
    },
  }
}
