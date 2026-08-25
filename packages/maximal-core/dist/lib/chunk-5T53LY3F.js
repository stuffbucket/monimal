// src/lib/models/model-profile.ts
function resolveModelProfile(model) {
  const capabilities = model.capabilities ?? {};
  const limits = capabilities.limits ?? {};
  const supports = capabilities.supports ?? {};
  const ladder = supports.reasoning_effort;
  return {
    id: model.id,
    isReasoning: supports.adaptive_thinking === true || (ladder?.length ?? 0) > 0,
    supportsAdaptiveThinking: supports.adaptive_thinking === true,
    reasoningEffortLadder: ladder && ladder.length > 0 ? ladder : void 0,
    maxThinkingBudget: supports.max_thinking_budget ?? 0,
    minThinkingBudget: supports.min_thinking_budget ?? 1024,
    supportsVision: supports.vision === true,
    supportsToolCalls: supports.tool_calls === true,
    supportsStructuredOutputs: supports.structured_outputs === true,
    maxContextWindowTokens: limits.max_context_window_tokens ?? 0,
    maxOutputTokens: limits.max_output_tokens ?? 0,
    maxPromptTokens: limits.max_prompt_tokens ?? 0
  };
}

export {
  resolveModelProfile
};
