import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type {
  AssistantChat,
  AssistantChatMessage,
  AssistantChatSort,
  AssistantChatStatus,
} from '@maximal/maximal-harness'

import './AssistantHistory.css'

type StatusFilter = AssistantChatStatus | 'all'

function attentionMark(chat: AssistantChat) {
  if (chat.attention === 'notification') return '▲'
  return chat.attention === 'unread' ? '●' : '○'
}

export function AssistantHistory({
  onOpenTerminal,
}: {
  onOpenTerminal: (chatId: string) => void
}) {
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<string>()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [sort, setSort] = useState<AssistantChatSort>('activity')
  const chatsQueryKey = ['assistant', 'chats', 'history', search, status, sort] as const
  const chatsQuery = useQuery({
    queryKey: chatsQueryKey,
    queryFn: () => window.maximal.harness.chats.list({
      search: search || undefined,
      status,
      sort,
      direction: 'desc',
      limit: 500,
    }),
  })
  const chats = chatsQuery.data?.chats ?? []
  const selectedChatId = selected && chats.some((chat) => chat.id === selected)
    ? selected
    : chats[0]?.id
  const messagesQuery = useQuery({
    queryKey: ['assistant', 'chats', 'messages', selectedChatId],
    queryFn: () => window.maximal.harness.chats.messages(selectedChatId ?? ''),
    enabled: selectedChatId !== undefined,
  })
  const messages: AssistantChatMessage[] = messagesQuery.data ?? []

  useEffect(() => window.maximal.harness.onChatsChanged(() => {
    void queryClient.invalidateQueries({ queryKey: ['assistant', 'chats'] })
  }), [queryClient])

  const invalidateChats = async () => {
    await queryClient.invalidateQueries({ queryKey: ['assistant', 'chats'] })
  }
  const updateMutation = useMutation({
    mutationFn: ({
      chat,
      next,
    }: {
      chat: AssistantChat
      next: Parameters<typeof window.maximal.harness.chats.update>[1]
    }) => window.maximal.harness.chats.update(chat.id, next),
    onSuccess: invalidateChats,
  })
  const openMutation = useMutation({
    mutationFn: (id: string) => window.maximal.harness.chats.open(id),
    onSuccess: invalidateChats,
  })
  const removeMutation = useMutation({
    mutationFn: (id: string) => window.maximal.harness.chats.remove(id),
    onSuccess: invalidateChats,
  })

  const activeChat = chats.find((chat) => chat.id === selectedChatId)

  return (
    <section className="assistant-history" aria-label="Assistant chats">
      <aside className="assistant-history__sidebar">
        <header className="assistant-history__header">
          <h1>Assistant</h1>
          <input
            className="assistant-history__search"
            type="search"
            placeholder="Search chats"
            aria-label="Search chats"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="assistant-history__filters" aria-label="Chat status">
            {(['all', 'active', 'archived'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={status === value}
                onClick={() => setStatus(value)}
              >
                {value[0]?.toUpperCase()}{value.slice(1)}
              </button>
            ))}
          </div>
          <div className="assistant-history__sort">
            <select
              className="assistant-history__select"
              aria-label="Sort chats"
              value={sort}
              onChange={(event) => setSort(event.target.value as AssistantChatSort)}
            >
              <option value="activity">Recent activity</option>
              <option value="created">Date created</option>
              <option value="title">Title</option>
            </select>
          </div>
        </header>
        <ul className="assistant-history__list">
          {chats.map((chat) => (
            <li key={chat.id}>
              <button
                className="assistant-history__chat"
                type="button"
                aria-current={selectedChatId === chat.id}
                onClick={() => {
                  setSelected(chat.id)
                  openMutation.mutate(chat.id)
                }}
              >
                <span
                  className={`assistant-history__attention assistant-history__attention--${chat.attention}`}
                  aria-label={chat.attention}
                >
                  {attentionMark(chat)}
                </span>
                <span className="assistant-history__chat-copy">
                  <span className="assistant-history__chat-title">{chat.title}</span>
                  <span className="assistant-history__chat-time">
                    {new Date(chat.updatedAt).toLocaleString()}
                  </span>
                </span>
                <span aria-label={chat.pinned ? 'Pinned' : undefined}>
                  {chat.pinned ? '◆' : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <div className="assistant-history__content">
        {activeChat ? (
          <>
            <header className="assistant-history__content-header">
              <h2>{activeChat.title}</h2>
              <div className="assistant-history__actions">
                <button
                  type="button"
                  onClick={() => updateMutation.mutate({
                    chat: activeChat,
                    next: { pinned: !activeChat.pinned },
                  })}
                >
                  {activeChat.pinned ? 'Unpin' : 'Pin'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const title = globalThis.prompt('Rename chat', activeChat.title)?.trim()
                    if (title) updateMutation.mutate({ chat: activeChat, next: { title } })
                  }}
                >
                  Rename
                </button>
                <button
                  type="button"
                  onClick={() => updateMutation.mutate({
                    chat: activeChat,
                    next: {
                      status: activeChat.status === 'active' ? 'archived' : 'active',
                    },
                  })}
                >
                  {activeChat.status === 'active' ? 'Archive' : 'Restore'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!globalThis.confirm(`Delete “${activeChat.title}”?`)) return
                    removeMutation.mutate(activeChat.id)
                  }}
                >
                  Delete
                </button>
                <button
                  className="assistant-history__continue"
                  type="button"
                  onClick={() => {
                    onOpenTerminal(activeChat.id)
                  }}
                >
                  Continue chat
                </button>
              </div>
            </header>
            <div className="assistant-history__transcript">
              {messages.length === 0 ? (
                <p className="assistant-history__empty">This chat has no messages.</p>
              ) : messages.map((message) => (
                <p className="assistant-history__message" key={message.id}>
                  <strong>{message.role === 'user' ? 'You' : 'Maximal'}</strong>
                  {message.content}
                </p>
              ))}
            </div>
          </>
        ) : (
          <p className="assistant-history__empty">No chats match these filters.</p>
        )}
      </div>
    </section>
  )
}
