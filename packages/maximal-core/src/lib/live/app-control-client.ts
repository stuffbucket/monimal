import type { AppEntry, AppsListResponse } from "~/lib/config/settings-types"

import { connectToLiveControl } from "~/lib/live/runtime-endpoint"

export interface LiveAppControlClient {
  listApps(): Promise<AppsListResponse>
  setAppEnabled(appId: AppEntry["id"], enabled: boolean): Promise<AppEntry>
}

/** Connect to the verified daemon and expose its app compatibility surface. */
export async function connectToLiveAppControl(): Promise<LiveAppControlClient | null> {
  const client = await connectToLiveControl()
  if (!client) return null
  return {
    listApps: () => client.call<AppsListResponse>("apps/list"),
    setAppEnabled: (appId, enabled) =>
      client.call<AppEntry>("apps/setEnabled", { appId, enabled }),
  }
}
