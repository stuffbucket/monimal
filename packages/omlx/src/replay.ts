export const ANTHROPIC_REPLAY_TYPE = "anthropic-message-v1" as const

export type OmlxReplayBlock =
  | { readonly type: "text"; readonly text: string }
  | {
      readonly type: "thinking"
      readonly thinking: string
      readonly signature: string
    }
  | {
      readonly type: "tool_use"
      readonly id: string
      readonly name: string
      readonly input: Record<string, unknown>
    }

export interface OmlxReplayState {
  readonly type: typeof ANTHROPIC_REPLAY_TYPE
  readonly content: Array<OmlxReplayBlock>
}

export function replayState(content: Array<OmlxReplayBlock>): OmlxReplayState {
  return { type: ANTHROPIC_REPLAY_TYPE, content }
}
