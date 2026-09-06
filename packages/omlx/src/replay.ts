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

/**
 * The response-level half of the envelope: what is true of the whole reply
 * rather than of one block. It carries only the adapter discriminator today,
 * which is what lets a consumer reject replay state belonging to some other
 * adapter.
 */
export interface OmlxReplayResponse {
  readonly type: typeof ANTHROPIC_REPLAY_TYPE
}

/**
 * `ReplayEnvelope` as dsh-llm defines it: response-level metadata, plus one
 * `blocks` entry per emitted content block in stream order.
 *
 * The per-block half MUST live in `blocks` rather than inside `response`.
 * dsh-llm's assembler prunes `blocks` in step when it drops a block -- a
 * max-tokens finish drops tool calls that cannot safely be executed -- so the
 * envelope stays aligned with the content it describes. Anything under
 * `response` is opaque to the assembler and would silently fall out of step
 * with the message, which every consumer here rejects by comparing lengths.
 *
 * The alignment is load-bearing in the other direction too: an envelope whose
 * `blocks` length disagrees with the emitted block count is DISCARDED WHOLE by
 * the assembler, without an error. The replay simply goes missing, and the
 * signature a reasoning block needs goes with it.
 */
export interface OmlxReplayState {
  readonly response: OmlxReplayResponse
  readonly blocks: ReadonlyArray<OmlxReplayBlock>
}

export function replayState(blocks: Array<OmlxReplayBlock>): OmlxReplayState {
  return { response: { type: ANTHROPIC_REPLAY_TYPE }, blocks }
}
