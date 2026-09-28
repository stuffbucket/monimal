export type AgentApproval = 'all' | 'writes' | 'none'
export type AgentProvider = 'maximal' | 'ollama' | 'embedded'

export interface AgentModelOption {
  key: string
  label: string
  model: string
  provider: AgentProvider
}

export type ProviderStatus =
  | { state: 'probing' }
  | {
      state: 'ready'
      provider: AgentProvider
      model: string
      modelKey: string
      models: AgentModelOption[]
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
}

export type AskAccepted = { started: true } | { started: false; reason: string }

export interface AgentToolEvent {
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
