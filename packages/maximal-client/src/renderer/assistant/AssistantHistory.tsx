import { useCallback, useEffect, useState } from 'react'
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
  const [chats, setChats] = useState<AssistantChat[]>([])
  const [selected, setSelected] = useState<string>()
  const [messages, setMessages] = useState<AssistantChatMessage[]>([])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [sort, setSort] = useState<AssistantChatSort>('activity')

  const reload = useCallback(() => {
    void window.maximal.harness.chats.list({
      search: search || undefined,
      status,
      sort,
      direction: 'desc',
      limit: 500,
    }).then((result) => {
      setChats(result.chats)
      if (result.chats.length === 0) setMessages([])
      setSelected((current) =>
        current && result.chats.some((chat) => chat.id === current)
          ? current
          : result.chats[0]?.id)
    })
  }, [search, sort, status])

  useEffect(reload, [reload])
  useEffect(() => window.maximal.harness.onChatsChanged(reload), [reload])

  useEffect(() => {
    if (!selected) return
    void window.maximal.harness.chats.messages(selected).then(setMessages)
  }, [selected])

  const activeChat = chats.find((chat) => chat.id === selected)
  const update = async (
    chat: AssistantChat,
    next: Parameters<typeof window.maximal.harness.chats.update>[1],
  ) => {
    await window.maximal.harness.chats.update(chat.id, next)
    reload()
  }

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
                aria-current={selected === chat.id}
                onClick={() => {
                  setSelected(chat.id)
                  void window.maximal.harness.chats.open(chat.id).then(reload)
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
                  onClick={() => void update(activeChat, { pinned: !activeChat.pinned })}
                >
                  {activeChat.pinned ? 'Unpin' : 'Pin'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const title = globalThis.prompt('Rename chat', activeChat.title)?.trim()
                    if (title) void update(activeChat, { title })
                  }}
                >
                  Rename
                </button>
                <button
                  type="button"
                  onClick={() => void update(activeChat, {
                    status: activeChat.status === 'active' ? 'archived' : 'active',
                  })}
                >
                  {activeChat.status === 'active' ? 'Archive' : 'Restore'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!globalThis.confirm(`Delete “${activeChat.title}”?`)) return
                    void window.maximal.harness.chats.remove(activeChat.id).then(reload)
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
