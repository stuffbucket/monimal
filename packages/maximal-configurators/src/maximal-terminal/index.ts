import type {
  TerminalProfileConfigurator,
  TerminalProfileConfiguratorMetadata,
  TerminalProfileConfiguratorMaterial,
} from "@maximal/maximal-core/configurator-host"

export const maximalTerminalMetadata = Object.freeze({
  id: "maximal-terminal",
  name: "Maximal",
  profileId: "maximal",
  application: "Maximal",
} satisfies TerminalProfileConfiguratorMetadata)

function trimTrailingSlashes(value: string): string {
  let end = value.length
  while (end > 0 && value[end - 1] === "/") end -= 1
  return value.slice(0, end)
}

export function maximalTerminalEnvironment(
  material: TerminalProfileConfiguratorMaterial,
): Readonly<Record<string, string>> {
  const baseUrl = trimTrailingSlashes(material.baseUrl)
  return Object.freeze({
    MAXIMAL_TERMINAL_SESSION_ID: material.sessionId,
    STUFFBUCKET_PROVIDER: "maximal",
    STUFFBUCKET_PROVIDER_URL: baseUrl,
    STUFFBUCKET_PROVIDER_API_KEY: material.credential,
    ANTHROPIC_BASE_URL: baseUrl,
    ANTHROPIC_AUTH_TOKEN: material.credential,
    OPENAI_BASE_URL: `${baseUrl}/v1`,
    OPENAI_API_KEY: material.credential,
  })
}

export function createMaximalTerminalConfigurator(): TerminalProfileConfigurator {
  return Object.freeze({
    metadata: maximalTerminalMetadata,
    environment: maximalTerminalEnvironment,
  })
}
