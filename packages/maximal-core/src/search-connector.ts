import type { ConnectorPlugin } from "~/lib/config/connector-plugins"

/** Build the optional first-party Search connector only when the host starts. */
export async function createBuiltinConnectorPlugins(): Promise<
  ReadonlyArray<ConnectorPlugin>
> {
  const { createBuiltinSearchConnectorPlugin } =
    await import("~/routes/messages/web-tools/executor")

  return [createBuiltinSearchConnectorPlugin()]
}
