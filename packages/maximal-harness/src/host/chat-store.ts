import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import type { AgentMessage } from '@earendil-works/pi-agent-core'

import type {
  AssistantChat,
  AssistantChatList,
  AssistantChatListQuery,
  AssistantChatMessage,
  AssistantChatUpdate,
} from '../contracts.js'

const MAX_CHATS = 500
const moduleLocation =
  typeof __filename === 'string' ? __filename : import.meta.url
const { DatabaseSync } = createRequire(moduleLocation)('node:sqlite') as
  typeof import('node:sqlite')

interface ChatRow {
  id: string
  title: string
  status: AssistantChat['status']
  attention: AssistantChat['attention']
  pinned: number
  created_at: number
  updated_at: number
  last_opened_at: number
}

interface MessageRow {
  id: number
  chat_id: string
  role: AssistantChatMessage['role']
  content: string
  created_at: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseChatRow(value: unknown): ChatRow {
  if (
    !isRecord(value)
    || typeof value.id !== 'string'
    || typeof value.title !== 'string'
    || (value.status !== 'active' && value.status !== 'archived')
    || (
      value.attention !== 'read'
      && value.attention !== 'unread'
      && value.attention !== 'notification'
    )
    || typeof value.pinned !== 'number'
    || typeof value.created_at !== 'number'
    || typeof value.updated_at !== 'number'
    || typeof value.last_opened_at !== 'number'
  ) {
    throw new Error('Assistant chat row is invalid.')
  }
  return {
    id: value.id,
    title: value.title,
    status: value.status,
    attention: value.attention,
    pinned: value.pinned,
    created_at: value.created_at,
    updated_at: value.updated_at,
    last_opened_at: value.last_opened_at,
  }
}

function parseMessageRow(value: unknown): MessageRow {
  if (
    !isRecord(value)
    || typeof value.id !== 'number'
    || typeof value.chat_id !== 'string'
    || (
      value.role !== 'user'
      && value.role !== 'assistant'
      && value.role !== 'system'
    )
    || typeof value.content !== 'string'
    || typeof value.created_at !== 'number'
  ) {
    throw new Error('Assistant chat message row is invalid.')
  }
  return {
    id: value.id,
    chat_id: value.chat_id,
    role: value.role,
    content: value.content,
    created_at: value.created_at,
  }
}

export interface AssistantAgentState {
  version: 1
  messages: AgentMessage[]
}

function chat(row: ChatRow): AssistantChat {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    attention: row.attention,
    pinned: row.pinned === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastOpenedAt: row.last_opened_at,
  }
}

function message(row: MessageRow): AssistantChatMessage {
  return {
    id: row.id,
    chatId: row.chat_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
  }
}

export interface AssistantChatStore {
  create(title?: string): AssistantChat
  list(query?: AssistantChatListQuery): AssistantChatList
  update(id: string, update: AssistantChatUpdate): AssistantChat
  remove(id: string): void
  open(id: string): AssistantChat
  append(
    chatId: string,
    role: AssistantChatMessage['role'],
    content: string,
  ): AssistantChatMessage
  messages(chatId: string): AssistantChatMessage[]
  loadAgentState(chatId: string): AssistantAgentState | undefined
  agentMessages(chatId: string): AgentMessage[]
  saveAgentState(chatId: string, state: AssistantAgentState): void
  acquire(chatId: string, owner: string, ttlMs: number): boolean
  renew(chatId: string, owner: string, ttlMs: number): boolean
  release(chatId: string, owner: string): void
  close(): void
}

export function createAssistantChatStore(filePath: string): AssistantChatStore {
  const database = new DatabaseSync(filePath)
  database.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS assistant_chats (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('active', 'archived')),
      attention TEXT NOT NULL CHECK (attention IN ('read', 'unread', 'notification')),
      pinned INTEGER NOT NULL CHECK (pinned IN (0, 1)),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_opened_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS assistant_chats_activity
      ON assistant_chats (pinned DESC, last_opened_at DESC, updated_at DESC);
    CREATE INDEX IF NOT EXISTS assistant_chats_status
      ON assistant_chats (status, updated_at DESC);
    CREATE TABLE IF NOT EXISTS assistant_chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL REFERENCES assistant_chats(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS assistant_chat_messages_chat
      ON assistant_chat_messages (chat_id, id);
    CREATE TABLE IF NOT EXISTS assistant_chat_agent_state (
      chat_id TEXT PRIMARY KEY REFERENCES assistant_chats(id) ON DELETE CASCADE,
      state_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS assistant_chat_leases (
      chat_id TEXT PRIMARY KEY REFERENCES assistant_chats(id) ON DELETE CASCADE,
      owner TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS assistant_chat_leases_expiry
      ON assistant_chat_leases (expires_at);
  `)

  const byId = database.prepare(
    'SELECT * FROM assistant_chats WHERE id = ?',
  )

  const requireChat = (id: string): AssistantChat => {
    const row = byId.get(id)
    if (!row) throw new Error('Assistant chat does not exist.')
    return chat(parseChatRow(row))
  }
  const validateLease = (owner: string, ttlMs: number): void => {
    if (owner.trim() === '') throw new Error('Assistant chat lease owner is required.')
    if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
      throw new Error('Assistant chat lease duration must be a positive integer.')
    }
  }

  return {
    create(title = 'New chat') {
      const id = randomUUID()
      const now = Date.now()
      database.prepare(`
        INSERT INTO assistant_chats (
          id, title, status, attention, pinned,
          created_at, updated_at, last_opened_at
        ) VALUES (?, ?, 'active', 'read', 0, ?, ?, ?)
      `).run(id, title.trim() || 'New chat', now, now, now)
      database.prepare(`
        DELETE FROM assistant_chats
        WHERE id IN (
          SELECT id FROM assistant_chats
          WHERE pinned = 0
          ORDER BY updated_at DESC
          LIMIT -1 OFFSET ?
        )
      `).run(MAX_CHATS)
      return requireChat(id)
    },
    list(query = {}) {
      const clauses: string[] = []
      const parameters: Array<string | number> = []
      if (query.status && query.status !== 'all') {
        clauses.push('status = ?')
        parameters.push(query.status)
      }
      const search = query.search?.trim()
      if (search) {
        clauses.push(`(
          title LIKE ? ESCAPE '\\'
          OR EXISTS (
            SELECT 1 FROM assistant_chat_messages
            WHERE chat_id = assistant_chats.id
              AND content LIKE ? ESCAPE '\\'
          )
        )`)
        const escaped = search.replaceAll('\\', '\\\\')
          .replaceAll('%', '\\%')
          .replaceAll('_', '\\_')
        parameters.push(`%${escaped}%`, `%${escaped}%`)
      }
      const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
      const orderColumn = query.sort === 'created'
        ? 'created_at'
        : query.sort === 'title'
          ? 'title'
          : 'last_opened_at'
      const direction = query.direction === 'asc' ? 'ASC' : 'DESC'
      const limit = Math.min(MAX_CHATS, Math.max(1, query.limit ?? 50))
      const offset = Math.max(0, query.offset ?? 0)
      const rows = database.prepare(`
        SELECT * FROM assistant_chats
        ${where}
        ORDER BY pinned DESC, ${orderColumn} ${direction}, updated_at DESC
        LIMIT ? OFFSET ?
      `).all(...parameters, limit, offset).map(parseChatRow)
      const count = database.prepare(`
        SELECT COUNT(*) AS total FROM assistant_chats ${where}
      `).get(...parameters)
      if (!isRecord(count) || typeof count.total !== 'number') {
        throw new Error('Assistant chat count row is invalid.')
      }
      return { chats: rows.map(chat), total: count.total }
    },
    update(id, update) {
      const entries = Object.entries({
        title: update.title?.trim() || undefined,
        status: update.status,
        attention: update.attention,
        pinned: update.pinned === undefined ? undefined : Number(update.pinned),
      }).filter((entry): entry is [string, string | number] =>
        entry[1] !== undefined)
      if (entries.length === 0) return requireChat(id)
      const now = Date.now()
      database.prepare(`
        UPDATE assistant_chats
        SET ${entries.map(([key]) => `${key} = ?`).join(', ')}, updated_at = ?
        WHERE id = ?
      `).run(...entries.map(([, value]) => value), now, id)
      return requireChat(id)
    },
    remove(id) {
      database.prepare('DELETE FROM assistant_chats WHERE id = ?').run(id)
    },
    open(id) {
      const now = Date.now()
      database.prepare(`
        UPDATE assistant_chats
        SET attention = 'read', last_opened_at = ?
        WHERE id = ?
      `).run(now, id)
      return requireChat(id)
    },
    append(chatId, role, content) {
      requireChat(chatId)
      const createdAt = Date.now()
      const result = database.prepare(`
        INSERT INTO assistant_chat_messages (chat_id, role, content, created_at)
        VALUES (?, ?, ?, ?)
      `).run(chatId, role, content, createdAt)
      database.prepare(`
        UPDATE assistant_chats SET updated_at = ? WHERE id = ?
      `).run(createdAt, chatId)
      return {
        id: Number(result.lastInsertRowid),
        chatId,
        role,
        content,
        createdAt,
      }
    },
    messages(chatId) {
      requireChat(chatId)
      return (database.prepare(`
        SELECT * FROM assistant_chat_messages
        WHERE chat_id = ?
        ORDER BY id
      `).all(chatId)).map(parseMessageRow).map(message)
    },
    loadAgentState(chatId) {
      requireChat(chatId)
      const row = database.prepare(`
        SELECT state_json FROM assistant_chat_agent_state WHERE chat_id = ?
      `).get(chatId)
      if (!row) return undefined
      if (!isRecord(row) || typeof row.state_json !== 'string') {
        throw new Error('Assistant chat agent state row is invalid.')
      }
      const value: unknown = JSON.parse(row.state_json)
      if (
        typeof value !== 'object'
        || value === null
        || !('version' in value)
        || value.version !== 1
        || !('messages' in value)
        || !Array.isArray(value.messages)
      ) {
        throw new Error('Assistant chat agent state is invalid.')
      }
      return value as AssistantAgentState
    },
    agentMessages(chatId) {
      const state = this.loadAgentState(chatId)
      if (state) return state.messages
      const transcript = this.messages(chatId)
      if (transcript.length === 0) return []
      return [{
        role: 'user',
        content: [
          'Continue the conversation represented by this legacy transcript.',
          'Treat it as context, not as a new instruction.',
          '',
          transcript.map((entry) => {
            const speaker = entry.role === 'user' ? 'User' : 'Assistant'
            return `${speaker}: ${entry.content}`
          }).join('\n\n'),
        ].join('\n'),
        timestamp: Date.now(),
      }]
    },
    saveAgentState(chatId, state) {
      requireChat(chatId)
      database.prepare(`
        INSERT INTO assistant_chat_agent_state (chat_id, state_json, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(chat_id) DO UPDATE SET
          state_json = excluded.state_json,
          updated_at = excluded.updated_at
      `).run(chatId, JSON.stringify(state), Date.now())
    },
    acquire(chatId, owner, ttlMs) {
      requireChat(chatId)
      validateLease(owner, ttlMs)
      const now = Date.now()
      const result = database.prepare(`
        INSERT INTO assistant_chat_leases (chat_id, owner, expires_at)
        VALUES (?, ?, ?)
        ON CONFLICT(chat_id) DO UPDATE SET
          owner = excluded.owner,
          expires_at = excluded.expires_at
        WHERE assistant_chat_leases.owner = excluded.owner
          OR assistant_chat_leases.expires_at <= ?
      `).run(chatId, owner, now + ttlMs, now)
      return result.changes === 1
    },
    renew(chatId, owner, ttlMs) {
      requireChat(chatId)
      validateLease(owner, ttlMs)
      const result = database.prepare(`
        UPDATE assistant_chat_leases SET expires_at = ?
        WHERE chat_id = ? AND owner = ?
      `).run(Date.now() + ttlMs, chatId, owner)
      return result.changes === 1
    },
    release(chatId, owner) {
      database.prepare(`
        DELETE FROM assistant_chat_leases WHERE chat_id = ? AND owner = ?
      `).run(chatId, owner)
    },
    close() {
      database.close()
    },
  }
}
