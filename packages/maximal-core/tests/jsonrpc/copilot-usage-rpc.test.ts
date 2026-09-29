import { expect, test } from "bun:test"

import type { ControlSnapshot } from "~/lib/live/resources"

import { invokeRpcMethod } from "~/lib/jsonrpc/dispatch"
import { ControlHub } from "~/lib/live/hub"
import { AsyncMutex } from "~/lib/live/mutex"
import { createControlRpcMethods } from "~/routes/control/rpc"

test("copilotUsage/get returns typed quota data from its operation", async () => {
  const usage = {
    copilot_plan: "enterprise",
    quota_reset_date: "2026-09-30",
    quota_snapshots: {
      premium_interactions: {
        entitlement: 100,
        remaining: 65,
        percent_remaining: 65,
      },
      completions: { unlimited: true },
    },
  }
  const hub = new ControlHub<ControlSnapshot>({
    buildSnapshot: () => Promise.reject(new Error("snapshot is not used")),
  })
  const methods = createControlRpcMethods({
    hub: () => hub,
    mutex: new AsyncMutex(),
    listClients: () => [],
    operations: {
      getCopilotUsage: () => Promise.resolve(usage),
    },
  })

  try {
    const result = await invokeRpcMethod(methods, {
      method: "copilotUsage/get",
    })

    expect(result).toEqual({ kind: "result", result: usage })
  } finally {
    hub.dispose()
  }
})
