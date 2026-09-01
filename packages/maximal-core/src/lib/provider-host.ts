import type { RunServerOptions } from "~/lib/start/run-server"
import type { CreateServerAppsOptions, ServerApps } from "~/server"

export type {
  CliCompositionOptions,
  RunCliOptions,
} from "~/lib/cli-composition"
export { createMain, runCli } from "~/lib/cli-composition"
export type {
  ProviderCompatibilityConfig,
  ProviderCompatibilityModelConfig,
  ProviderGatewayFactory,
  ProviderGatewayFactoryContext,
  ProviderHostConfigFailureReason,
  ProviderHostConfigSnapshot,
  ProviderHostConfigSource,
  ProviderHostConfigStatus,
} from "~/lib/provider-host-types"
export type { RunServerOptions } from "~/lib/start/run-server"
export type { CreateServerAppsOptions, ServerApps } from "~/server"

/** Load the environment-sensitive start stack only when a caller starts it. */
export async function runServer(options: RunServerOptions): Promise<void> {
  const module = await import("~/lib/start/run-server")
  await module.runServer(options)
}

/** Load the environment-sensitive server graph only when explicitly requested. */
export async function createServerApps(
  options: CreateServerAppsOptions = {},
): Promise<ServerApps> {
  const module = await import("~/server")
  return module.createServerApps(options)
}
