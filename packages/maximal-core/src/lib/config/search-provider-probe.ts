import type {
  SearchProvider,
  SearchProviderConfig,
} from "@stuffbucket/maximal-harness"

import type { SearchProviderValidationResponse } from "~/lib/config/settings-types"

import {
  sendProviderRequest,
  type ProviderCredential,
  type SendRequestInit,
} from "~/lib/http/send-request"

export type SearchProviderRequest = (
  credential: ProviderCredential,
  url: string,
  init?: SendRequestInit,
) => Promise<Response>

const SEARCH_PROVIDER_PROBE_TIMEOUT_MS = 5_000

interface SearchProviderProbeOptions {
  provider: SearchProvider
  settings: SearchProviderConfig["settings"]
  env: NodeJS.ProcessEnv
  request?: SearchProviderRequest
}

export async function probeSearchProvider({
  provider,
  settings,
  env,
  request = sendProviderRequest,
}: SearchProviderProbeOptions): Promise<SearchProviderValidationResponse> {
  const probe = provider.credentialProbe
  if (probe === undefined) return { status: "valid", fieldErrors: {} }

  const secretValue = settings?.[probe.secretKey]
  const environmentValue =
    probe.environmentVariable === undefined ?
      undefined
    : env[probe.environmentVariable]
  const apiKey =
    typeof secretValue === "string" ? secretValue : environmentValue
  const baseUrlValue =
    settings?.[probe.baseUrlKey]
    ?? provider.settings?.find(({ key }) => key === probe.baseUrlKey)?.default
  if (typeof apiKey !== "string" || typeof baseUrlValue !== "string") {
    return {
      status: "invalid",
      fieldErrors: {},
      message: `${provider.label} cannot be enabled: required settings are missing.`,
    }
  }

  try {
    const response = await request(
      { apiKey, authType: "authorization" },
      `${baseUrlValue}${probe.path}`,
      {
        method: "POST",
        timeoutMs: SEARCH_PROVIDER_PROBE_TIMEOUT_MS,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(probe.body),
      },
    )
    return probeResponse(provider, probe, response)
  } catch {
    return {
      status: "unavailable",
      fieldErrors: {},
      message: `${provider.label} could not be reached to verify these settings.`,
    }
  }
}

function probeResponse(
  provider: SearchProvider,
  probe: NonNullable<SearchProvider["credentialProbe"]>,
  response: Response,
): SearchProviderValidationResponse {
  if (response.status === 401 || response.status === 403) {
    const label = provider.settings?.find(
      ({ key }) => key === probe.secretKey,
    )?.label
    return {
      status: "invalid",
      fieldErrors: {
        [probe.secretKey]: `${label ?? "Credential"} was rejected by ${provider.label}.`,
      },
    }
  }
  if (response.ok || response.status === 429) {
    return { status: "valid", fieldErrors: {} }
  }
  if (response.status === 404) {
    const label = provider.settings?.find(
      ({ key }) => key === probe.baseUrlKey,
    )?.label
    return {
      status: "invalid",
      fieldErrors: {
        [probe.baseUrlKey]: `${label ?? "Base URL"} does not expose ${probe.path}.`,
      },
    }
  }
  return {
    status: "unavailable",
    fieldErrors: {},
    message: `${provider.label} could not verify these settings (HTTP ${String(response.status)}).`,
  }
}
