import { defineCommand } from "citty"

import type { ProviderGatewayFactory } from "~/lib/provider-host-types"

import { parseAccountType } from "~/lib/auth/auth-types"

import type { RunServerOptions } from "./run-server"

import { runServer } from "./run-server"

interface CreateStartCommandOptions {
  createProviderGateway?: ProviderGatewayFactory
  runServer?: (options: RunServerOptions) => Promise<void>
}

const startArgs = {
  port: {
    alias: "p",
    type: "string",
    default: "4141",
    description:
      "Public port for the /v1 proxy that third-party tools call. Falls back to the next free port if held.",
  },
  "control-port": {
    type: "string",
    default: "0",
    description:
      "Port for the private control plane (JSON-RPC, events). 0 picks an ephemeral port; the boot banner reports it.",
  },
  verbose: {
    alias: "v",
    type: "boolean",
    default: false,
    description: "Enable verbose logging",
  },
  "account-type": {
    alias: "a",
    type: "string",
    default: "individual",
    description: "Account type to use (individual, business, enterprise)",
  },
  manual: {
    type: "boolean",
    default: false,
    description: "Enable manual request approval",
  },
  "rate-limit": {
    alias: "r",
    type: "string",
    description: "Rate limit in seconds between requests",
  },
  wait: {
    alias: "w",
    type: "boolean",
    default: false,
    description:
      "Wait instead of error when rate limit is hit. Has no effect if rate limit is not set",
  },
  "github-token": {
    alias: "g",
    type: "string",
    description:
      "Provide GitHub token directly (must be generated using the `auth` subcommand)",
  },
  "claude-code": {
    alias: "c",
    type: "boolean",
    default: false,
    description:
      "Generate a command to launch Claude Code with Copilot API config",
  },
  "show-token": {
    type: "boolean",
    default: false,
    description: "Show GitHub and Copilot tokens on fetch and refresh",
  },
  "proxy-env": {
    type: "boolean",
    default: false,
    description: "Initialize proxy from environment variables",
  },
  replace: {
    type: "boolean",
    default: false,
    description: "Evict any running instance and take over the port",
  },
} as const

/** Build the lazy `start` command around a host-provided gateway factory. */
export function createStartCommand(options: CreateStartCommandOptions = {}) {
  const run = options.runServer ?? runServer
  return defineCommand({
    meta: {
      name: "start",
      description: "Start the Copilot API server",
    },
    args: startArgs,
    run({ args }) {
      const rateLimitRaw = args["rate-limit"]
      const rateLimit =
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        rateLimitRaw === undefined ? undefined : (
          Number.parseInt(rateLimitRaw, 10)
        )

      return run({
        port: Number.parseInt(args.port, 10),
        controlPort: Number.parseInt(args["control-port"], 10),
        verbose: args.verbose,
        accountType: parseAccountType(args["account-type"]),
        manual: args.manual,
        rateLimit,
        rateLimitWait: args.wait,
        githubToken: args["github-token"],
        claudeCode: args["claude-code"],
        showToken: args["show-token"],
        proxyEnv: args["proxy-env"],
        replace: args.replace,
        createProviderGateway: options.createProviderGateway,
      })
    },
  })
}

/** @internal Legacy standalone command instance. */
export const start = createStartCommand()
