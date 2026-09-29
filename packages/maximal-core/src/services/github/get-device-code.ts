import {
  type GitHubDeviceCodeResponse,
  requestGitHubDeviceCode,
} from "@maximal/maximal-github/device-auth"

import { getGitHubBaseUrl, getOauthAppConfig } from "~/lib/config/api-config"
import { GITHUB_API_TIMEOUT_MS } from "~/lib/http/http-timeouts"
import { sendRequestJson } from "~/lib/http/send-request"

export { GitHubDeviceCodeResponseSchema as DeviceCodeResponseSchema } from "@maximal/maximal-github/device-auth"
export type DeviceCodeResponse = GitHubDeviceCodeResponse

export async function getDeviceCode(): Promise<DeviceCodeResponse> {
  const { clientId, headers, scope } = getOauthAppConfig()

  return await requestGitHubDeviceCode({
    oauthBaseUrl: getGitHubBaseUrl(),
    clientId,
    scope,
    headers,
    timeoutMs: GITHUB_API_TIMEOUT_MS,
    requestJson: sendRequestJson,
  })
}
