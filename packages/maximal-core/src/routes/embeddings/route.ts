import { Hono, type Context } from "hono"

import { forwardError } from "~/lib/errors/error"
import { createCopilotTokenUsageRecorder } from "~/lib/token-usage"
import {
  createEmbeddings,
  type EmbeddingRequest,
} from "~/services/copilot/create-embeddings"

export async function handleEmbeddings(c: Context): Promise<Response> {
  try {
    const payload = await c.req.json<EmbeddingRequest>()
    const response = await createEmbeddings(payload)
    const recordUsage = createCopilotTokenUsageRecorder({
      endpoint: "embeddings",
      model: payload.model,
    })

    recordUsage({
      input_tokens: response.usage?.prompt_tokens ?? 0,
      output_tokens: 0,
    })

    return c.json(response)
  } catch (error) {
    return await forwardError(c, error)
  }
}

export const embeddingRoutes = new Hono()
embeddingRoutes.post("/", handleEmbeddings)
