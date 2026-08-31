/**
 * Which upstream endpoint a Copilot model can serve.
 *
 * Owned here rather than in a route handler because several callers need the
 * same answer: `routes/messages/handler.ts` picks the API flow for an ordinary
 * turn, `routes/messages/web-tools/flow.ts` picks the transport for each turn
 * of the agent loop, `routes/responses/handler.ts` gates the native
 * passthrough, and `web-tools/executor.ts` screens broker candidates. While the rule lived privately in the handler the
 * agent loop had no way to ask, so it hardcoded `/chat/completions` — and a
 * `/responses`-only model (`gpt-5.6-sol`) failed with
 * `unsupported_api_for_model` the moment a request declared a web tool.
 */

import type { Model } from "~/services/copilot/get-models"

import { isMessagesApiEnabled } from "~/lib/config/config"

const RESPONSES_ENDPOINT = "/responses"
const MESSAGES_ENDPOINT = "/v1/messages"

/** True when Copilot lists `/responses` among the model's endpoints. A model
 *  missing from the catalog reports `undefined` and answers `false`, which
 *  keeps the caller on its existing fallback. */
export const shouldUseResponsesApi = (
  selectedModel: Model | undefined,
): boolean =>
  selectedModel?.supported_endpoints?.includes(RESPONSES_ENDPOINT) ?? false

/** True when the native Messages API is both enabled in config and listed by
 *  the model. The config flag is checked first so disabling it routes every
 *  model away from `/v1/messages` regardless of catalog contents. */
export const shouldUseMessagesApi = (
  selectedModel: Model | undefined,
): boolean => {
  if (!isMessagesApiEnabled()) {
    return false
  }
  return (
    selectedModel?.supported_endpoints?.includes(MESSAGES_ENDPOINT) ?? false
  )
}
