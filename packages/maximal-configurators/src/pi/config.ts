import { readFile } from "node:fs/promises"
import { SocketAddress } from "node:net"
import { z } from "zod"

// Node's IPv4 SocketAddress default is loopback; do not depend on inference
// provider packages merely to validate the CLI's local credential destination.
const LOOPBACK_HOSTNAME = new SocketAddress({ family: "ipv4" }).address

/** Literal IPv4 loopback only; hostnames and alternate transports require HTTPS. */
function isLiteralLoopback(url: URL): boolean {
  return url.hostname === LOOPBACK_HOSTNAME
}

const PiCostSchema = z
  .object({
    input: z.number().nonnegative(),
    output: z.number().nonnegative(),
    cacheRead: z.number().nonnegative(),
    cacheWrite: z.number().nonnegative(),
  })
  .strict()
export type PiCost = z.infer<typeof PiCostSchema>

const limits = {
  contextWindowTokens: z.number().int().positive().optional(),
  maxOutputTokens: z.number().int().positive().optional(),
  cost: PiCostSchema.optional(),
}

const OverrideSchema = z
  .object({
    source: z.enum(["copilot", "local", "provider"]),
    provider: z.string().min(1).max(512),
    // Omit id only for explicit provider-wide defaults, never to create models.
    id: z.string().min(1).max(512).optional(),
    ...limits,
  })
  .strict()

export const PiDiscoveryConfigSchema = z
  .object({
    schemaVersion: z.literal(1),
    origin: z
      .url()
      .max(2048)
      .refine((value) => {
        try {
          const url = new URL(value)
          return (
            !url.username
            && !url.password
            && !url.search
            && !url.hash
            && url.pathname === "/"
            && (url.protocol === "https:"
              || (url.protocol === "http:" && isLiteralLoopback(url)))
          )
        } catch {
          return false
        }
      }, "Use a credential-free Maximal HTTP loopback origin or HTTPS origin."),
    apiKeyEnv: z
      .string()
      .regex(/^[A-Z_][A-Z0-9_]*$/u)
      .nullable(),
    overrides: z.array(OverrideSchema).max(2048).default([]),
  })
  .strict()
  .superRefine((config, ctx) => {
    try {
      if (
        config.apiKeyEnv === null
        && !isLiteralLoopback(new URL(config.origin))
      ) {
        ctx.addIssue({
          code: "custom",
          message:
            "A remote Maximal proxy requires an explicit API-key environment reference.",
        })
      }
    } catch {
      // The origin refinement already reports malformed URL input.
      return
    }
    const keys = config.overrides.map(({ source, provider, id }) =>
      JSON.stringify([source, provider, id ?? null]),
    )
    if (new Set(keys).size !== keys.length) {
      ctx.addIssue({
        code: "custom",
        message: "Override identities must be unique.",
      })
    }
  })
export type PiDiscoveryConfig = z.infer<typeof PiDiscoveryConfigSchema>

function configReadError(error: unknown): Error {
  if (error instanceof Error && "code" in error && error.code === "ENOENT")
    return new Error(
      "Maximal Pi config file not found. MAXIMAL_PI_CONFIG or --config must point to a JSON file you have created, not a placeholder path. See packages/maximal-configurators/README.md for the required schema.",
    )
  // Never retain a parser error as cause: it may include secret config content.
  return new Error(
    "Invalid Maximal Pi config. Supply schemaVersion 1, a trusted proxy origin, an API-key environment reference (or null for loopback), and reviewed overrides without credential values.",
  )
}

/** The path is explicitly selected by the operator; no project config or secrets are written. */
export async function readPiDiscoveryConfig(
  file: string,
): Promise<PiDiscoveryConfig> {
  try {
    const bytes = await readFile(file)
    if (bytes.byteLength > 1024 * 1024) throw new Error()
    const value: unknown = JSON.parse(bytes.toString("utf8"))
    return PiDiscoveryConfigSchema.parse(value)
  } catch (error) {
    throw configReadError(error)
  }
}

export function proxyApiKey(
  config: PiDiscoveryConfig,
  environment: NodeJS.ProcessEnv,
): string | undefined {
  if (config.apiKeyEnv === null) return undefined
  const key = environment[config.apiKeyEnv]
  if (!key?.trim() || /[\r\n]/u.test(key)) {
    throw new Error(
      "The configured Maximal API-key environment variable is missing or invalid.",
    )
  }
  return key
}
