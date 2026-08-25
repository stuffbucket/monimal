#!/usr/bin/env node
import {
  setupGitHubToken
} from "./chunk-UQM4JUWE.js";
import {
  PATHS,
  ensurePaths,
  state
} from "./chunk-4JX7327A.js";

// src/auth.ts
import { defineCommand } from "citty";
import consola from "consola";
async function runAuth(options) {
  if (options.verbose) {
    consola.level = 5;
    consola.info("Verbose logging enabled");
  }
  state.showToken = options.showToken;
  await ensurePaths();
  await setupGitHubToken({ force: true });
  consola.success("GitHub token written to", PATHS.GITHUB_TOKEN_PATH);
}
var auth = defineCommand({
  meta: {
    name: "auth",
    description: "Run GitHub auth flow without running the server"
  },
  args: {
    verbose: {
      alias: "v",
      type: "boolean",
      default: false,
      description: "Enable verbose logging"
    },
    "show-token": {
      type: "boolean",
      default: false,
      description: "Show GitHub token on auth"
    }
  },
  run({ args }) {
    return runAuth({
      verbose: args.verbose,
      showToken: args["show-token"]
    });
  }
});
export {
  auth,
  runAuth
};
