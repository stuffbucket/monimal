import {
  CopilotAccountUsage as CopilotAccountUsageSchema,
  type CopilotAccountUsage,
  type CopilotQuotaDetail,
} from "@maximal/maximal-core-contract/settings"

import { getGitHubApiBaseUrl, githubHeaders } from "~/lib/config/api-config"
import { GITHUB_API_TIMEOUT_MS } from "~/lib/http/http-timeouts"
import { sendRequestJson } from "~/lib/http/send-request"
import { state } from "~/lib/runtime-state/state"

export const getCopilotUsage = async (
  githubToken?: string,
): Promise<CopilotAccountUsage> => {
  const resolvedGithubToken = githubToken ?? state.githubToken
  if (!resolvedGithubToken) {
    throw new Error("GitHub token not found")
  }

  return await sendRequestJson(
    `${getGitHubApiBaseUrl()}/copilot_internal/user`,
    {
      githubToken: resolvedGithubToken,
      headers: githubHeaders(),
      timeoutMs: GITHUB_API_TIMEOUT_MS,
      errorMessage: "Failed to get Copilot usage",
    },
    CopilotAccountUsageSchema,
  )
}

export type QuotaDetail = CopilotQuotaDetail
