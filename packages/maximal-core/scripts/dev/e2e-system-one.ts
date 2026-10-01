/**
 * Harness: System One's public REST surface through the shipping composition.
 *
 * A loopback TypeSafe-compatible fixture proves the real Maximal CLI activates
 * the plugin gateway, discovers JEV models, attaches its credential, and
 * forwards aggregate and provider-qualified inference over actual sockets.
 */
import { once } from "node:events";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { createReporter, startSidecar, waitForExit } from "./harness/sidecar";

const require = createRequire(import.meta.url);
const API_KEY = "system-one-e2e-key";

interface CapturedRequest {
  readonly authorization: string | undefined;
  readonly body: unknown;
  readonly cookie: string | undefined;
  readonly method: string | undefined;
  readonly url: string | undefined;
  readonly xApiKey: string | undefined;
}

function packageRoot(name: string): string {
  return dirname(require.resolve(`${name}/package.json`));
}

function packageVersion(name: string): string {
  const manifest: unknown = require(`${name}/package.json`);
  if (
    manifest === null
    || typeof manifest !== "object"
    || !("version" in manifest)
    || typeof manifest.version !== "string"
  ) {
    throw new Error(`Package "${name}" has no usable version.`);
  }
  return manifest.version;
}

function createProfile(directory: string): string {
  const profile = join(directory, "provider-host");
  const nodeModules = join(profile, "node_modules");
  mkdirSync(nodeModules, { recursive: true });
  for (const dependency of [
    "@deepseek-ai/cordis",
    "@deepseek-ai/dsh-llm",
  ]) {
    const destination = join(nodeModules, ...dependency.split("/"));
    mkdirSync(dirname(destination), { recursive: true });
    symlinkSync(packageRoot(dependency), destination, "dir");
  }
  writeFileSync(
    join(profile, "package.json"),
    JSON.stringify({
      private: true,
      type: "module",
      dependencies: {
        "@deepseek-ai/cordis": packageVersion("@deepseek-ai/cordis"),
        "@deepseek-ai/dsh-llm": packageVersion("@deepseek-ai/dsh-llm"),
      },
    }),
  );
  writeFileSync(
    join(profile, "providers.json"),
    JSON.stringify({
      schemaVersion: 3,
      pluginApiVersion: 1,
      runtime: {
        cordis: "@deepseek-ai/cordis",
        llm: "@deepseek-ai/dsh-llm",
      },
      services: [],
      plugins: [],
    }),
  );
  return profile;
}

async function requestBody(
  request: http.IncomingMessage,
): Promise<unknown> {
  const chunks: Array<Buffer> = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const body = Buffer.concat(chunks).toString("utf8");
  return body ? JSON.parse(body) : null;
}

async function createTypeSafeFixture(): Promise<{
  readonly baseUrl: string;
  readonly requests: Array<CapturedRequest>;
  close(): Promise<void>;
}> {
  const requests: Array<CapturedRequest> = [];
  const server = http.createServer(async (request, response) => {
    const body = await requestBody(request);
    requests.push({
      authorization: request.headers.authorization,
      body,
      cookie: request.headers.cookie,
      method: request.method,
      url: request.url,
      xApiKey: request.headers["x-api-key"] as string | undefined,
    });
    response.setHeader("content-type", "application/json");
    if (request.headers.authorization !== `Bearer ${API_KEY}`) {
      response.statusCode = 401;
      response.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
    if (request.method === "GET" && request.url === "/v1/models") {
      response.end(
        JSON.stringify({
          models: [{ name: "jev-latest" }, { name: "jev-preview" }],
        }),
      );
      return;
    }
    if (request.method === "POST" && request.url === "/v1/systemone") {
      response.end(
        JSON.stringify({
          model: (body as { model?: unknown } | null)?.model,
          answers: { outcome: 0.6 },
        }),
      );
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: "not found" }));
  });
  server.listen(0);
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("TypeSafe fixture did not bind a TCP port.");
  }
  return {
    baseUrl: `http://${address.family === "IPv6" ? `[${address.address}]` : address.address}:${address.port}`,
    requests,
    close: async () => {
      server.close();
      await once(server, "close");
    },
  };
}

const report = createReporter(
  "e2e:system-one — REST API through the shipping provider composition",
);
const directory = mkdtempSync(join(tmpdir(), "maximal-system-one-e2e-"));
const fixture = await createTypeSafeFixture();
const profileDirectory = createProfile(directory);
writeFileSync(
  join(directory, "config.json"),
  JSON.stringify({
    providerHost: {
      mode: "plugins",
      profileDirectory,
    },
    providers: {
      "typesafe-jev": {
        authType: "authorization",
        baseUrl: fixture.baseUrl,
        enabled: true,
        type: "systemone",
      },
    },
    systemOne: {
      fallbackToLocal: false,
      localProvider: "maximal",
      modelOrder: ["nimble", "tev1", "tev1:0.8b"],
    },
  }),
);

const sidecar = await startSidecar({
  entrypoint: resolve(import.meta.dirname, "../../../maximal/src/main.ts"),
  environment: { TYPESAFE_API_KEY: API_KEY },
  home: directory,
});

try {
  const modelsResponse = await fetch(`${sidecar.proxyUrl}/v1/models`);
  const modelsBody = (await modelsResponse.json()) as {
    data?: Array<{ id?: string }>;
  };
  const modelIds = modelsBody.data?.map(({ id }) => id) ?? [];
  report.check(
    "model discovery",
    modelsResponse.status === 200
      && modelIds.includes("jev-latest")
      && modelIds.includes("jev-preview"),
    `${modelsResponse.status} models=${modelIds.join(",") || "none"}`,
  );

  const request = {
    model: "jev-latest",
    state: "Will this work?",
    questions: { outcome: "Will this work?" },
  };
  const inferenceResponse = await fetch(
    `${sidecar.proxyUrl}/v1/systemone`,
    {
      method: "POST",
      headers: {
        authorization: "Bearer caller-credential",
        cookie: "session=caller-cookie",
        "content-type": "application/json",
        "x-api-key": "caller-api-key",
      },
      body: JSON.stringify(request),
    },
  );
  const inferenceBody = await inferenceResponse.json();
  report.check(
    "aggregate inference",
    inferenceResponse.status === 200
      && JSON.stringify(inferenceBody)
        === JSON.stringify({
          model: "jev-latest",
          answers: { outcome: 0.6 },
        }),
    `${inferenceResponse.status} ${JSON.stringify(inferenceBody)}`,
  );

  const upstreamModels = fixture.requests.find(
    ({ method, url }) => method === "GET" && url === "/v1/models",
  );
  const upstreamInference = fixture.requests.find(
    ({ method, url }) => method === "POST" && url === "/v1/systemone",
  );
  report.check(
    "upstream contract",
    upstreamModels?.authorization === `Bearer ${API_KEY}`
      && upstreamInference?.authorization === `Bearer ${API_KEY}`
      && upstreamInference.cookie === undefined
      && upstreamInference.xApiKey === undefined
      && JSON.stringify(upstreamInference.body) === JSON.stringify(request),
    `${fixture.requests.length} request(s), configured auth replaced caller credentials and exact inference body`,
  );

  report.check(
    "alive",
    sidecar.child.exitCode === null,
    sidecar.child.exitCode === null ?
      "the composed sidecar survived discovery and inference"
    : `sidecar exited code=${sidecar.child.exitCode}`,
  );
} finally {
  sidecar.child.kill("SIGTERM");
  await waitForExit(sidecar.child, 5_000);
  await fixture.close();
  rmSync(directory, { force: true, recursive: true });
}

report.finish();
