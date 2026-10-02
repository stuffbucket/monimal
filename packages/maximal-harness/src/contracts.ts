export type AgentApproval = 'all' | 'read-only' | 'writes' | 'none'
export type AgentProvider = 'maximal' | 'ollama' | 'embedded'
export type AgentEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
export type AssistantOutputFont =
  | 'auto'
  | 'default'
  | 'terminal'
  | 'open-dyslexic'
  | 'serif'

export interface AssistantOverlayPreferences {
  candy: boolean
  approval: AgentApproval
  outputFont: AssistantOutputFont
  hotkey: string
}

export type AssistantChatStatus = 'active' | 'archived'
export type AssistantChatAttention = 'read' | 'unread' | 'notification'
export type AssistantChatSort = 'activity' | 'created' | 'title'

export interface AssistantChat {
  id: string
  title: string
  status: AssistantChatStatus
  attention: AssistantChatAttention
  pinned: boolean
  createdAt: number
  updatedAt: number
  lastOpenedAt: number
}

export interface AssistantChatMessage {
  id: number
  chatId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: number
}

export interface AssistantChatListQuery {
  search?: string
  status?: AssistantChatStatus | 'all'
  sort?: AssistantChatSort
  direction?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

export interface AssistantChatList {
  chats: AssistantChat[]
  total: number
}

export interface AssistantChatUpdate {
  title?: string
  status?: AssistantChatStatus
  attention?: AssistantChatAttention
  pinned?: boolean
}

export interface AgentModelOption {
  key: string
  label: string
  model: string
  provider: AgentProvider
  description: string
  efforts: AgentEffort[]
}

export type ProviderStatus =
  | { state: 'probing' }
  | {
      state: 'ready'
      provider: AgentProvider
      model: string
      modelKey: string
      models: AgentModelOption[]
      effort?: AgentEffort
    }
  | {
      state: 'select-model'
      preferredModel?: string
      models: AgentModelOption[]
    }
  | { state: 'needs-model'; model: string; approxMb: number }
  | { state: 'unavailable'; reason: string }

export type { ModelProgress } from '@maximal/maximal-llama-cpp'

export interface AskRequest {
  prompt: string
  chatId?: string
  attachments?: AssistantAttachment[]
}

export interface AssistantAttachment {
  name: string
  mimeType: string
  data: string
}

export type AskAccepted =
  | { started: true; chatId: string }
  | { started: false; reason: string }

export interface AgentToolEvent {
  id: string
  name: string
  phase: 'start' | 'end'
  isError?: boolean
}

export type AgentEnd = { ok: true } | { ok: false; error: string }

export interface AgentApprovalRequest {
  id: string
  tool: string
  summary: string
}

export interface ApproveRequest {
  id: string
  allow: boolean
  remember: boolean
}
