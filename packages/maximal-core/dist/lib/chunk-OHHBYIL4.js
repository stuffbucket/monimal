import {
  GITHUB_API_TIMEOUT_MS,
  getGitHubApiBaseUrl,
  githubHeaders,
  sendRequestJson
} from "./chunk-UQM4JUWE.js";
import {
  state
} from "./chunk-4JX7327A.js";

// src/services/github/get-copilot-usage.ts
import { z } from "zod";
var getCopilotUsage = async (githubToken) => {
  const resolvedGithubToken = githubToken ?? state.githubToken;
  if (!resolvedGithubToken) {
    throw new Error("GitHub token not found");
  }
  return await sendRequestJson(
    `${getGitHubApiBaseUrl()}/copilot_internal/user`,
    {
      githubToken: resolvedGithubToken,
      headers: githubHeaders(),
      timeoutMs: GITHUB_API_TIMEOUT_MS,
      errorMessage: "Failed to get Copilot usage"
    },
    CopilotUsageResponseSchema
  );
};
var QuotaDetailSchema = z.object({
  entitlement: z.number().optional(),
  overage_count: z.number().optional(),
  overage_permitted: z.boolean().optional(),
  percent_remaining: z.number().optional(),
  quota_id: z.string().optional(),
  quota_remaining: z.number().optional(),
  remaining: z.number().optional(),
  unlimited: z.boolean().optional()
}).loose();
var QuotaSnapshotsSchema = z.object({
  chat: QuotaDetailSchema.optional(),
  completions: QuotaDetailSchema.optional(),
  premium_interactions: QuotaDetailSchema.optional()
}).loose();
var CopilotUsageResponseSchema = z.object({
  login: z.string().optional(),
  copilot_plan: z.string().optional(),
  quota_reset_date: z.string().optional(),
  quota_snapshots: QuotaSnapshotsSchema.nullish()
}).loose();

export {
  getCopilotUsage
};
