import {
  assertCredentialFreeEndpoint,
  MODEL_DISCOVERY_SCHEMA_VERSION,
  type ModelDiscoveryAction,
  type ModelDiscoverySnapshot,
} from "@maximal/maximal-model-contract"
import { z } from "zod"

const Id = z.string().min(1).max(512)
const endpointUrl = z
  .url()
  .max(2048)
  .superRefine((url, ctx) => {
    try {
      assertCredentialFreeEndpoint({ id: "discovery", url })
      const parsed = new URL(url)
      if (
        !["http:", "https:"].includes(parsed.protocol)
        || parsed.pathname !== "/"
        || parsed.search
        || parsed.hash
      )
        throw new Error()
    } catch {
      ctx.addIssue({
        code: "custom",
        message:
          "Discovery endpoints must be root HTTP(S) URLs without credentials.",
      })
    }
  })

export const ModelDiscoveryActionSchema: z.ZodType<ModelDiscoveryAction> =
  z.discriminatedUnion("action", [
    z.object({ action: z.literal("describe") }).strict(),
    z
      .object({
        action: z.literal("start"),
        includeLocalNetwork: z.boolean(),
        networkScopeIds: z
          .array(Id)
          .max(8)
          .refine((ids) => new Set(ids).size === ids.length),
      })
      .strict()
      .refine(
        (value) =>
          value.includeLocalNetwork || value.networkScopeIds.length === 0,
        "Network scopes require explicit local-network consent.",
      ),
    z.object({ action: z.enum(["read", "cancel"]), id: Id }).strict(),
  ])

export const ModelDiscoverySnapshotSchema: z.ZodType<ModelDiscoverySnapshot> = z
  .object({
    schemaVersion: z.literal(MODEL_DISCOVERY_SCHEMA_VERSION),
    id: Id.nullable(),
    revision: z.number().int().nonnegative(),
    state: z.enum([
      "idle",
      "running",
      "completed",
      "cancelled",
      "failed",
      "unsupported",
    ]),
    includeLocalNetwork: z.boolean(),
    networkScopes: z
      .array(
        z
          .object({
            id: Id,
            interfaceName: Id,
            cidr: Id,
            hostCount: z.number().int().min(1).max(256),
          })
          .strict(),
      )
      .max(8),
    endpoints: z
      .array(
        z
          .object({
            id: Id,
            url: endpointUrl,
            address: Id,
            scope: z.enum(["device", "lan"]),
            protocol: z.enum(["ollama", "openai-compatible", "unverified"]),
            runtime: z.string().max(120).nullable(),
            observedAt: z.iso.datetime({ offset: true }),
            authenticationRequired: z.boolean(),
            reachability: z.literal("responded"),
            isolation: z.literal("unverified"),
            models: z
              .array(
                z
                  .object({
                    id: Id,
                    name: z.string().min(1).max(512),
                    executionLocation: z.enum([
                      "device",
                      "lan",
                      "cloud",
                      "unknown",
                    ]),
                    configuredTargetId: Id.optional(),
                  })
                  .strict(),
              )
              .max(128),
          })
          .strict(),
      )
      .max(64),
    completedProbes: z.number().int().nonnegative(),
    totalProbes: z.number().int().nonnegative().max(2048),
    truncated: z.boolean(),
    message: z.string().max(500).nullable(),
  })
  .strict()
  .refine(
    (value) => value.completedProbes <= value.totalProbes,
    "Completed probes cannot exceed the approved scope.",
  )

export type {
  ModelDiscoveryAction,
  ModelDiscoverySnapshot,
} from "@maximal/maximal-model-contract"
