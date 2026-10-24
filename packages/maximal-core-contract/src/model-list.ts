import { MODEL_OPERATIONS } from "@maximal/maximal-model-contract"
import { z } from "zod"

const positiveTokens = z.number().int().positive().nullable()

/**
 * Opt-in public GET /v1/models?format=maximal projection for external selectors.
 * Identity is (source, provider, id), never a display name or served alias alone.
 * This is configured inventory, not connection approval or proof of readiness.
 */
export const MaximalModelListEntry = z
  .object({
    source: z.enum(["copilot", "local", "provider"]),
    provider: z.string().min(1),
    providerName: z.string().min(1),
    id: z.string().min(1),
    name: z.string().min(1),
    // Null means that routing is ambiguous or unavailable. Provider-scoped
    // entries use a proxy-relative path, never the deployment's upstream URL.
    basePath: z
      .string()
      .regex(/^\/(?:[^/?#]+\/)?v1$/u)
      .nullable(),
    operations: z.array(z.enum(MODEL_OPERATIONS)).nullable(),
    contextWindowTokens: positiveTokens,
    maxOutputTokens: positiveTokens,
    capabilities: z
      .object({
        vision: z.boolean().nullable(),
        tools: z.boolean().nullable(),
        reasoning: z.boolean().nullable(),
      })
      .strict(),
    targets: z.array(
      z
        .object({
          id: z.string().min(1),
          location: z.enum(["device", "lan", "cloud"]),
          availability: z.enum([
            "available",
            "degraded",
            "unavailable",
            "disabled",
            "unknown",
          ]),
          lifecycle: z.enum([
            "declared",
            "provisioning",
            "starting",
            "running",
            "stopping",
            "stopped",
            "failed",
            "unknown",
          ]),
          contextWindowTokens: positiveTokens,
          maxOutputTokens: positiveTokens,
        })
        .strict(),
    ),
  })
  .strict()

export type MaximalModelListEntry = z.infer<typeof MaximalModelListEntry>

export const MaximalModelList = z
  .object({
    schemaVersion: z.literal(1),
    data: z.array(MaximalModelListEntry),
  })
  .strict()

export type MaximalModelList = z.infer<typeof MaximalModelList>
