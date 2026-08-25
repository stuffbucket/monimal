import {
  getCopilotUsage
} from "./chunk-OHHBYIL4.js";
import {
  setupGitHubToken
} from "./chunk-UQM4JUWE.js";
import {
  ensurePaths
} from "./chunk-4JX7327A.js";

// src/check-usage.ts
import { defineCommand } from "citty";
import consola from "consola";
var checkUsage = defineCommand({
  meta: {
    name: "check-usage",
    description: "Show current GitHub Copilot usage/quota information"
  },
  async run() {
    await ensurePaths();
    await setupGitHubToken();
    try {
      let summarizeQuota2 = function(name, snap) {
        if (!snap) return `${name}: N/A`;
        const total = snap.entitlement;
        const remaining = snap.remaining;
        if (total === void 0 || remaining === void 0) {
          return `${name}: ${snap.unlimited ? "unlimited" : "N/A"}`;
        }
        const used = total - remaining;
        const percentUsed = total > 0 ? used / total * 100 : 0;
        const percentRemaining = snap.percent_remaining ?? (total > 0 ? remaining / total * 100 : 0);
        return `${name}: ${used}/${total} used (${percentUsed.toFixed(1)}% used, ${percentRemaining.toFixed(1)}% remaining)`;
      };
      var summarizeQuota = summarizeQuota2;
      const usage = await getCopilotUsage();
      const premiumLine = summarizeQuota2(
        "Premium",
        usage.quota_snapshots?.premium_interactions
      );
      const chatLine = summarizeQuota2("Chat", usage.quota_snapshots?.chat);
      const completionsLine = summarizeQuota2(
        "Completions",
        usage.quota_snapshots?.completions
      );
      consola.box(
        `Copilot Usage (plan: ${usage.copilot_plan})
Quota resets: ${usage.quota_reset_date}

Quotas:
  ${premiumLine}
  ${chatLine}
  ${completionsLine}`
      );
    } catch (err) {
      consola.error("Failed to fetch Copilot usage:", err);
      process.exit(1);
    }
  }
});
export {
  checkUsage
};
