#!/usr/bin/env node
import {
  ANTHROPIC_API_VERSION
} from "./chunk-TVYI7M5Y.js";
import {
  runDebug
} from "./chunk-VTIG25X4.js";
import {
  resolveSmallToolModel
} from "./chunk-SRWM5VCG.js";
import "./chunk-5T53LY3F.js";
import "./chunk-GMUJZD4A.js";
import {
  setupGitHubToken
} from "./chunk-UQM4JUWE.js";
import {
  ensurePaths,
  state
} from "./chunk-4JX7327A.js";
import "./chunk-CXWZH3X6.js";

// src/setup.ts
import { defineCommand } from "citty";
import consola from "consola";
async function runSetup(opts) {
  consola.box("maximal setup");
  await ensurePaths();
  if (!opts.skipAuth) {
    consola.info("Step 1/3: GitHub authentication");
    try {
      await setupGitHubToken({ force: false, noBrowser: opts.noBrowser });
      consola.success("GitHub authenticated");
    } catch (err) {
      consola.error("GitHub auth failed", err);
      if (!opts.unattended) throw err;
    }
  } else {
    consola.info("Step 1/3: GitHub authentication (skipped)");
  }
  consola.info("Step 2/3: Effective config");
  await runDebug({ json: false });
  let smokePassed = null;
  if (!opts.skipSmoke && !opts.unattended) {
    consola.info("Step 3/3: Smoke test");
    const result = await smokeTest(opts.port);
    smokePassed = result.ok;
    if (result.ok && opts.deepSmoke) {
      const deepOk = await deepSmokeTest(opts.port, result.models);
      smokePassed = deepOk;
    }
  } else {
    consola.info("Step 3/3: Smoke test (skipped)");
  }
  if (smokePassed === false) {
    consola.box("Setup finished \u2014 but the smoke test didn't pass.");
    consola.info(
      "Auth and config are in place. The proxy just wasn't reachable yet.\n  1. Start it:   maximal start\n  2. Re-check:   maximal setup\nPair Claude Desktop once it's up: maximal app claude-desktop --enable"
    );
    return;
  }
  consola.box("Setup complete.");
  consola.info(
    "To pair Claude Desktop with this proxy, run:\n  maximal app claude-desktop --enable"
  );
}
async function smokeTest(port) {
  const url = `http://localhost:${port}/models`;
  let response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5e3)
    });
  } catch (err) {
    consola.warn(
      `  Could not reach the proxy at ${url}. Start it with \`maximal start\` in another terminal, then re-run setup.`,
      err
    );
    return { ok: false, models: [] };
  }
  if (response.status === 401) {
    consola.warn(
      "  Proxy is up but not authenticated to GitHub. Run `maximal auth`, then re-run setup."
    );
    return { ok: false, models: [] };
  }
  if (!response.ok) {
    consola.warn(`  Proxy responded ${response.status} ${response.statusText}`);
    return { ok: false, models: [] };
  }
  const body = await response.json().catch(() => null);
  if (!body || !Array.isArray(body.data) || body.data.length === 0) {
    consola.warn(
      "  Proxy has a valid token but returned an empty Copilot model catalog (upstream or entitlement issue). Re-run setup once resolved."
    );
    return { ok: false, models: [] };
  }
  consola.success(
    `  Proxy responded 200 from ${url} (${body.data.length} models available)`
  );
  return { ok: true, models: body.data };
}
async function deepSmokeTest(port, models) {
  const model = resolveSmallToolModel(models);
  if (!model) {
    consola.warn(
      "  --deep-smoke: no usable model in the catalog to send a completion."
    );
    return false;
  }
  const url = `http://localhost:${port}/v1/messages`;
  const payload = {
    model,
    max_tokens: 16,
    messages: [{ role: "user", content: "ping" }]
  };
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "anthropic-version": ANTHROPIC_API_VERSION
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(3e4)
    });
  } catch (err) {
    consola.warn(`  --deep-smoke: could not reach ${url}.`, err);
    return false;
  }
  if (!response.ok) {
    consola.warn(
      `  --deep-smoke: completion failed ${response.status} ${response.statusText}`
    );
    return false;
  }
  consola.success(`  --deep-smoke: completion round-tripped via ${model}`);
  return true;
}
var setup = defineCommand({
  meta: {
    name: "setup",
    description: "First-run wizard: GitHub auth + smoke test. Client wiring (Claude Desktop, etc.) is opt-in via separate subcommands."
  },
  args: {
    unattended: {
      type: "boolean",
      default: false,
      description: "Run without prompts. No smoke test."
    },
    "skip-auth": {
      type: "boolean",
      default: false,
      description: "Skip the GitHub device-code flow. Useful for post-install scripts that run as a different user."
    },
    "skip-smoke": {
      type: "boolean",
      default: false,
      description: "Skip the GET /models smoke-test step."
    },
    "deep-smoke": {
      type: "boolean",
      default: false,
      description: "After the GET /models check, also send ONE real completion end-to-end (spends a little Copilot quota; model auto-picked from the catalog)."
    },
    "no-browser": {
      type: "boolean",
      default: false,
      description: "Don't auto-open the device-code verification URL. Print it for manual paste (useful over SSH)."
    },
    port: {
      alias: "p",
      type: "string",
      default: "4141",
      description: "Port the proxy listens on (smoke test only)."
    }
  },
  run({ args }) {
    state.showToken = false;
    return runSetup({
      unattended: args.unattended,
      skipAuth: args["skip-auth"],
      skipSmoke: args["skip-smoke"],
      deepSmoke: args["deep-smoke"],
      noBrowser: args["no-browser"],
      port: Number.parseInt(args.port, 10)
    });
  }
});
export {
  deepSmokeTest,
  runSetup,
  setup,
  smokeTest
};
