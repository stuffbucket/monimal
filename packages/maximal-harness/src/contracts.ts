export type AgentApproval = 'all' | 'writes' | 'none'
export type AgentProvider = 'maximal' | 'ollama' | 'embedded'

export type ProviderStatus =
  | { state: 'probing' }
  | { state: 'ready'; provider: AgentProvider; model: string }
  | { state: 'needs-model'; model: string; approxMb: number }
  | { state: 'unavailable'; reason: string }

export type ModelProgress =
  | { state: 'absent' }
  | { state: 'downloading'; received: number; total: number }
  | { state: 'ready' }
  | { state: 'error'; reason: string }

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
