import {
  getAllApps
} from "./chunk-BFCASIWE.js";
import "./chunk-SMHXZYWZ.js";
import {
  runApiKeyHelper
} from "./chunk-LIOSYQNE.js";
import "./chunk-4JX7327A.js";
import {
  HELPER_SUBCOMMAND
} from "./chunk-KCUNSZQQ.js";

// src/apps/cli.ts
import { defineCommand } from "citty";
import consola from "consola";
var APP_OP_ARGS = {
  enable: {
    type: "boolean",
    default: false,
    description: "Point this client at the local proxy."
  },
  disable: {
    type: "boolean",
    default: false,
    description: "Remove the proxy routing this client integration wrote."
  }
};
function selectOp(args) {
  if (args.disable === true) return "disable";
  if (args.enable === true) return "enable";
  return "status";
}
async function showStatus(app) {
  const details = await app.getDetails();
  consola.info(`${details.name} (${details.id})`);
  consola.info(`  status:  ${details.status}`);
  consola.info(`  routing: ${details.enabled ? "enabled" : "disabled"}`);
  for (const i of details.installs) {
    consola.info(`  install: ${i.path}${i.version ? ` (${i.version})` : ""}`);
  }
  if (details.conflict) {
    consola.warn(`  conflict: ${details.conflict}`);
  }
  if (details.install) {
    consola.info(`  install with: ${details.install.command}`);
  }
}
async function enableApp(app) {
  const result = await app.enable();
  if (result.conflict) {
    const detail = result.conflict === "invalid-api-key-helper" ? "this maximal invocation cannot provide a safe apiKeyHelper." : `a ${result.conflict} is already set. Remove it first if you want proxy routing.`;
    consola.warn(`Left ${app.name} untouched: ${detail}`);
    return;
  }
  if (result.success) {
    consola.success(`Pointed ${app.name} at the local proxy.`);
  } else {
    consola.warn(`Could not enable ${app.name}.`);
  }
}
async function disableApp(app) {
  const result = await app.disable();
  if (result.success) {
    consola.success(`Removed proxy routing for ${app.name}.`);
  } else {
    consola.info(`${app.name} wasn't routed by us; nothing to do.`);
  }
}
async function runAppOp(app, args) {
  const op = selectOp(args);
  if (app.cli?.handle) {
    const handled = await app.cli.handle(op, args);
    if (handled) return;
  }
  if (op === "enable") return enableApp(app);
  if (op === "disable") return disableApp(app);
  return showStatus(app);
}
function appClientCommand(app) {
  return defineCommand({
    meta: {
      name: app.id,
      description: `Configure or inspect the ${app.name} integration.`
    },
    args: { ...APP_OP_ARGS, ...app.cli?.extraArgs },
    async run({ args }) {
      await runAppOp(app, args);
    }
  });
}
var listCommand = defineCommand({
  meta: {
    name: "list",
    description: "List the registered client integrations."
  },
  run() {
    for (const app of getAllApps()) {
      consola.info(`${app.id}	${app.name}`);
    }
  }
});
function clientSubcommands(build) {
  const subs = { list: listCommand };
  for (const app of getAllApps()) {
    subs[app.id] = build(app);
  }
  return subs;
}
var appCommand = defineCommand({
  meta: {
    name: "app",
    description: "Configure or inspect a client integration: `maximal app <client>` (no flag shows status; --enable/--disable to change it). `list` for the available clients."
  },
  subCommands: clientSubcommands(appClientCommand)
});
function reportNoApiKey(app) {
  process.stderr.write(`ERROR: ${app.name} has no API key to print.
`);
  return 1;
}
function apiClientCommand(app) {
  return defineCommand({
    meta: {
      name: app.id,
      description: `Print the API key for the ${app.name} client.`
    },
    run() {
      process.exitCode = app.apiKeyLabel === void 0 ? reportNoApiKey(app) : runApiKeyHelper(app.apiKeyLabel);
    }
  });
}
var apiCommand = defineCommand({
  meta: {
    name: HELPER_SUBCOMMAND,
    description: "Print a client's API key: `maximal api <client>` \u2014 the canonical surface (`--apiKeyHelper` is the legacy/machine alias). `list` for the available clients."
  },
  subCommands: clientSubcommands(apiClientCommand)
});
export {
  apiCommand,
  appCommand
};
