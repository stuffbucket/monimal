import type { LocalModelPublication } from "@stuffbucket/local-model-registry"

import Schema from "@deepseek-ai/schemastery"

export const PUBLICATIONS = ["none", "provider", "aggregate"] as const
export const DEFAULT_PUBLICATION: LocalModelPublication = "aggregate"

export interface Config {
  publication?: LocalModelPublication
}

export const Config = Schema.object({
  publication: Schema.union(
    PUBLICATIONS.map((publication) => Schema.const(publication)),
  ).default(DEFAULT_PUBLICATION),
}) as Schema<Config>

export function resolvePublication(config: Config): LocalModelPublication {
  return config.publication ?? DEFAULT_PUBLICATION
}
