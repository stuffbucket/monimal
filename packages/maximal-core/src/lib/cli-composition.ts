import type { CommandDef } from "citty"

import { defineCommand, parseArgs, runMain } from "citty"

import type { ProviderGatewayFactory } from "~/lib/provider-host-types"

const cliArgs = {
  apiKeyHelper: {
    type: "string",
    description:
      "Legacy alias for `maximal api <client>`; the command written into"
      + " client configs. Prints the API key for an integrated client.",
  },
  "api-home": {
    type: "string",
    description:
      "Path to the API home directory. Created if missing, unless"
      + " COPILOT_API_HOME_POLICY=require, which makes a missing one an error.",
  },
  "oauth-app": {
    type: "string",
    description: "OAuth app identifier.",
  },
  "enterprise-url": {
    type: "string",
    description: "Enterprise URL for GitHub.",
  },
} as const

export interface CliCompositionOptions {
  /**
   * Lazy start-only provider boundary. Core invokes it only after validated
   * config explicitly selects DSH mode.
   */
  createProviderGateway?: ProviderGatewayFactory
}

export interface RunCliOptions extends CliCompositionOptions {
  /** Command arguments without the runtime executable and script path. */
  rawArgs?: Array<string>
}

/**
 * Construct the complete Maximal command tree. Every command stays a lazy thunk;
 * in particular, carrying a provider factory does not import the start stack or
 * activate an external profile while another command is running.
 */
export async function createMain(
  options: CliCompositionOptions = {},
): Promise<CommandDef<typeof cliArgs>> {
  const [{ HELPER_SUBCOMMAND }, { BUILD_VERSION }] = await Promise.all([
    import("~/lib/auth/api-key-helper-tokens"),
    import("~/lib/update/build-info"),
  ])

  return defineCommand({
    meta: {
      name: "maximal",
      version: BUILD_VERSION,
      description:
        "Local proxy that exposes GitHub Copilot as OpenAI- and Anthropic-compatible HTTP endpoints.",
    },
    subCommands: {
      auth: () => import("~/auth").then((module) => module.auth),
      start: () =>
        import("~/start").then((module) =>
          module.createStartCommand({
            createProviderGateway: options.createProviderGateway,
          }),
        ),
      setup: () => import("~/setup").then((module) => module.setup),
      app: () => import("~/apps/cli").then((module) => module.appCommand),
      [HELPER_SUBCOMMAND]: () =>
        import("~/apps/cli").then((module) => module.apiCommand),
      uninstall: () => import("~/uninstall").then((module) => module.uninstall),
      "check-usage": () =>
        import("~/check-usage").then((module) => module.checkUsage),
      debug: () => import("~/debug").then((module) => module.debug),
    },
    args: cliArgs,
  })
}

/**
 * Run the real Maximal CLI with an optional lazy provider host.
 *
 * Global environment overrides are applied before any environment-sensitive
 * Core module is imported. Electron fetch binding follows that prelude exactly
 * as it does in the standalone binary.
 */
export async function runCli(options: RunCliOptions = {}): Promise<void> {
  const argv =
    options.rawArgs ? ["bun", "maximal", ...options.rawArgs] : process.argv
  const args = parseArgs(argv, cliArgs)

  if (typeof args["api-home"] === "string") {
    process.env.COPILOT_API_HOME = args["api-home"]
  }
  if (typeof args["oauth-app"] === "string") {
    process.env.COPILOT_API_OAUTH_APP = args["oauth-app"]
  }
  if (typeof args["enterprise-url"] === "string") {
    process.env.COPILOT_API_ENTERPRISE_URL = args["enterprise-url"]
  }

  if (typeof args.apiKeyHelper === "string") {
    const { runApiKeyHelper } = await import("~/lib/auth/api-key-helper")
    process.exit(runApiKeyHelper(args.apiKeyHelper))
  }

  const { bindElectronFetch } = await import("~/lib/http/electron-fetch")
  bindElectronFetch()

  const main = await createMain(options)
  await runMain(
    main,
    options.rawArgs ? { rawArgs: options.rawArgs } : undefined,
  )
}
