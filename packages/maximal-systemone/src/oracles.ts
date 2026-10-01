import { createHash } from "node:crypto"
import { z } from "zod"

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
const recordedAtSchema = z.iso.datetime({ offset: true })

const ollamaModels = {
  "nimble:latest": {
    digest: "24e550a16a7081881be2f1f0d91e8cc13a597472735c04119f035a0a85c67e0c",
    size: 9_527_502_277,
  },
  "tev1:0.8b": {
    digest: "d45e875d63fed9465390a4eb9e55f51f470390a446667b55d0a075a15e0336bf",
    size: 811_856_202,
  },
  "tev1:4b": {
    digest: "cef45ef93cf6df8bf32bdd689b0a8fd01f88ae9034d33ce890c54f77e4cd981e",
    size: 4_482_415_847,
  },
} as const

const liveCaptureSourceSchema = z
  .strictObject({
    kind: z.literal("live-capture"),
    ollama_version: z.literal("0.35.0"),
    api_spec_commit: z.literal("1abe35e6e6e777e858bbfbba283667ee8d516801"),
    api_spec_sha256: z.literal(
      "9e7dac7361a9159310e265b56a2505933b446b61ef34053cd76ce97e4ad723f1",
    ),
    requested_model: z.string().min(1),
    resolved_model: z.string().min(1),
    model_tag: z.enum(["nimble:latest", "tev1:0.8b", "tev1:4b"]),
    model_digest: sha256Schema,
    model_size: z.number().int().positive(),
    response_sha256: sha256Schema,
    repeat_capture: z.literal("exact"),
    recorded_at: recordedAtSchema,
  })
  .superRefine((source, context) => {
    const expected = ollamaModels[source.model_tag]
    if (source.model_digest !== expected.digest) {
      context.addIssue({
        code: "custom",
        path: ["model_digest"],
        message: "Model digest does not match the recorded model tag",
      })
    }
    if (source.model_size !== expected.size) {
      context.addIssue({
        code: "custom",
        path: ["model_size"],
        message: "Model size does not match the recorded model tag",
      })
    }
  })

const publishedExampleSourceSchema = z.strictObject({
  kind: z.literal("published-example"),
  url: z.url(),
  api_spec_version: z.literal("0.2.0"),
  api_spec_sha256: z.literal(
    "a191f8a7df6bd6fedced8120dd0fd106f88575d1d1c8360d08900a6c7c0360d5",
  ),
  requested_model: z.literal("jev-latest"),
  resolved_model: z.literal("jev-1.13.0"),
  recorded_at: recordedAtSchema,
})

const publishedAliasSourceSchema = z.strictObject({
  kind: z.literal("published-alias-equivalence"),
  url: z.url(),
  api_spec_version: z.literal("0.2.0"),
  api_spec_sha256: z.literal(
    "a191f8a7df6bd6fedced8120dd0fd106f88575d1d1c8360d08900a6c7c0360d5",
  ),
  requested_model: z.literal("jev-preview"),
  resolved_model: z.literal("jev-1.13.0"),
  equivalent_to: z.literal("typesafe-jev-latest.json"),
  recorded_at: recordedAtSchema,
})

export const systemOneOracleSchema = z
  .strictObject({
    schema_version: z.literal(1),
    id: z.string().regex(/\S/),
    profile: z.enum(["ollama", "typesafe"]),
    source: z.discriminatedUnion("kind", [
      liveCaptureSourceSchema,
      publishedExampleSourceSchema,
      publishedAliasSourceSchema,
    ]),
    request: z.unknown(),
    response: z.unknown(),
  })
  .superRefine((oracle, context) => {
    if (oracle.source.kind !== "live-capture") return
    const responseHash = createHash("sha256")
      .update(JSON.stringify(oracle.response))
      .digest("hex")
    if (responseHash !== oracle.source.response_sha256) {
      context.addIssue({
        code: "custom",
        path: ["source", "response_sha256"],
        message: "Response hash does not match the canonical response JSON",
      })
    }
  })

export type SystemOneOracle = z.infer<typeof systemOneOracleSchema>
