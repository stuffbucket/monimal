// src/lib/cli-composition.ts
import { defineCommand, parseArgs, runMain } from "citty";
var cliArgs = {
  apiKeyHelper: {
    type: "string",
    description: "Legacy alias for `maximal api <client>`; the command written into client configs. Prints the API key for an integrated client."
  },
  "api-home": {
    type: "string",
    description: "Path to the API home directory. Created if missing, unless COPILOT_API_HOME_POLICY=require, which makes a missing one an error."
  },
  "oauth-app": {
    type: "string",
    description: "OAuth app identifier."
  },
  "enterprise-url": {
    type: "string",
    description: "Enterprise URL for GitHub."
  }
};
async function createMain(options = {}) {
  const [{ HELPER_SUBCOMMAND }, { BUILD_VERSION }] = await Promise.all([
    import("./api-key-helper-tokens-VRHKNZM6.js"),
    import("./build-info-LLYXWEU7.js")
  ]);
  return defineCommand({
    meta: {
      name: "maximal",
      version: BUILD_VERSION,
      description: "Local proxy that exposes GitHub Copilot as OpenAI- and Anthropic-compatible HTTP endpoints."
    },
    subCommands: {
      auth: () => import("./auth-Y2HWC4YS.js").then((module) => module.auth),
      start: () => import("./start-V2MWJG5A.js").then(
        (module) => module.createStartCommand({
          createProviderGateway: options.createProviderGateway
        })
      ),
      setup: () => import("./setup-CQHIBRMN.js").then((module) => module.setup),
      app: () => import("./cli-YI3A56XN.js").then((module) => module.appCommand),
      [HELPER_SUBCOMMAND]: () => import("./cli-YI3A56XN.js").then((module) => module.apiCommand),
      uninstall: () => import("./uninstall-QNZLW4FQ.js").then((module) => module.uninstall),
      "check-usage": () => import("./check-usage-JUZIXTWY.js").then((module) => module.checkUsage),
      debug: () => import("./debug-54BLDBWP.js").then((module) => module.debug)
    },
    args: cliArgs
  });
}
async function runCli(options = {}) {
  const argv = options.rawArgs ? ["bun", "maximal", ...options.rawArgs] : process.argv;
  const args = parseArgs(argv, cliArgs);
  if (typeof args["api-home"] === "string") {
    process.env.COPILOT_API_HOME = args["api-home"];
  }
  if (typeof args["oauth-app"] === "string") {
    process.env.COPILOT_API_OAUTH_APP = args["oauth-app"];
  }
  if (typeof args["enterprise-url"] === "string") {
    process.env.COPILOT_API_ENTERPRISE_URL = args["enterprise-url"];
  }
  if (typeof args.apiKeyHelper === "string") {
    const { runApiKeyHelper } = await import("./api-key-helper-N3NOE3IP.js");
    process.exit(runApiKeyHelper(args.apiKeyHelper));
  }
  const { bindElectronFetch } = await import("./electron-fetch-7YKD3FVZ.js");
  bindElectronFetch();
  const main = await createMain(options);
  await runMain(
    main,
    options.rawArgs ? { rawArgs: options.rawArgs } : void 0
  );
}

// src/lib/provider-host.ts
async function runServer(options) {
  const module = await import("./run-server-OE3EC6ZE.js");
  await module.runServer(options);
}
async function createServerApps(options = {}) {
  const module = await import("./server-2VFBUTIV.js");
  return module.createServerApps(options);
}
export {
  createMain,
  createServerApps,
  runCli,
  runServer
};
