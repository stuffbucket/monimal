#!/usr/bin/env node
import {
  __setBootSecretsForTests,
  __setServeForTests,
  runServer
} from "./chunk-5VVNBNUK.js";
import "./chunk-46RLBQDX.js";
import "./chunk-SMHXZYWZ.js";
import "./chunk-OHHBYIL4.js";
import "./chunk-LIOSYQNE.js";
import "./chunk-SRWM5VCG.js";
import "./chunk-5T53LY3F.js";
import "./chunk-GMUJZD4A.js";
import "./chunk-UQM4JUWE.js";
import {
  parseAccountType
} from "./chunk-4JX7327A.js";
import {
  BOOT_STATUS_MARKER,
  emitBootStatus
} from "./chunk-7GPE5USJ.js";
import "./chunk-KCUNSZQQ.js";
import "./chunk-CXWZH3X6.js";

// src/lib/start/cli.ts
import { defineCommand } from "citty";
var startArgs = {
  port: {
    alias: "p",
    type: "string",
    default: "4141",
    description: "Public port for the /v1 proxy that third-party tools call. Falls back to the next free port if held."
  },
  "control-port": {
    type: "string",
    default: "0",
    description: "Port for the private control plane (JSON-RPC, events). 0 picks an ephemeral port; the boot banner reports it."
  },
  verbose: {
    alias: "v",
    type: "boolean",
    default: false,
    description: "Enable verbose logging"
  },
  "account-type": {
    alias: "a",
    type: "string",
    default: "individual",
    description: "Account type to use (individual, business, enterprise)"
  },
  manual: {
    type: "boolean",
    default: false,
    description: "Enable manual request approval"
  },
  "rate-limit": {
    alias: "r",
    type: "string",
    description: "Rate limit in seconds between requests"
  },
  wait: {
    alias: "w",
    type: "boolean",
    default: false,
    description: "Wait instead of error when rate limit is hit. Has no effect if rate limit is not set"
  },
  "github-token": {
    alias: "g",
    type: "string",
    description: "Provide GitHub token directly (must be generated using the `auth` subcommand)"
  },
  "claude-code": {
    alias: "c",
    type: "boolean",
    default: false,
    description: "Generate a command to launch Claude Code with Copilot API config"
  },
  "show-token": {
    type: "boolean",
    default: false,
    description: "Show GitHub and Copilot tokens on fetch and refresh"
  },
  "proxy-env": {
    type: "boolean",
    default: false,
    description: "Initialize proxy from environment variables"
  },
  replace: {
    type: "boolean",
    default: false,
    description: "Evict any running instance and take over the port"
  }
};
function createStartCommand(options = {}) {
  const run = options.runServer ?? runServer;
  return defineCommand({
    meta: {
      name: "start",
      description: "Start the Copilot API server"
    },
    args: startArgs,
    run({ args }) {
      const rateLimitRaw = args["rate-limit"];
      const rateLimit = (
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        rateLimitRaw === void 0 ? void 0 : Number.parseInt(rateLimitRaw, 10)
      );
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
        createProviderGateway: options.createProviderGateway
      });
    }
  });
}
var start = createStartCommand();
export {
  BOOT_STATUS_MARKER,
  __setBootSecretsForTests,
  __setServeForTests,
  createStartCommand,
  emitBootStatus,
  runServer,
  start
};
