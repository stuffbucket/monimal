import { describe, expect, test } from "bun:test"
import { Hono } from "hono"

import type { AccountRecord } from "~/lib/auth/github-token-store"
import type {
  ApiKeyEntry,
  AppEntry,
  DiagnosticsResponse,
} from "~/lib/config/settings-types"
import type { GhCliStatus } from "~/lib/system/gh-cli"
import type { SettingsEndpointDeps } from "~/routes/control/settings-endpoints"

import { SettingsOperationError } from "~/lib/config/settings-operations"
import { registerSettingsEndpoints } from "~/routes/control/settings-endpoints"

const apiKey: ApiKeyEntry = {
  id: "key-1",
  label: "Primary",
  key: "abcdefgh",
  enabled: true,
  created_at: "2026-09-08T00:00:00.000Z",
}

const diagnostics: DiagnosticsResponse = {
  version: "1.2.3",
  source_revision: null,
  source_branch: null,
  launch_path: "/tmp/maximal",
  launch_kind: "dev",
  pid: 42,
  uptime_ms: 1000,
  account_type: "github",
  models_cached: 2,
  tokens: {
    github_token_present: true,
    copilot_token_present: false,
  },
  rate_limit: {
    interval_seconds: null,
    last_request_at: null,
    wait_when_throttled: false,
  },
  web_search: { kind: "none", detail: null },
}

function appEntry(id: AppEntry["id"], enabled: boolean): AppEntry {
  return {
    id,
    name: id === "claude-code" ? "Claude Code" : "Claude Desktop",
    kind: "config",
    enabled,
    status: "ready",
    installs: [],
    install: null,
    conflict: null,
  }
}

const ghStatus: GhCliStatus = {
  installed: true,
  version: "2.92.0",
  accounts: [
    {
      login: "octocat",
      host: "github.com",
      active: true,
      scopes: ["read:org"],
    },
  ],
}

function accountRecord(input: {
  login: string
  host: string
  token: string
  addedVia: "device-code" | "gh-cli" | "migration"
}): AccountRecord {
  return {
    ...input,
    tokenType: "gho_",
    obtainedAt: "2026-09-08T00:00:00.000Z",
  }
}

function makeDeps(
  overrides: Partial<SettingsEndpointDeps> = {},
): SettingsEndpointDeps {
  return {
    addAccountToDefaultRegistry: () => Promise.resolve(),
    buildDiagnostics: () => diagnostics,
    createApiKey: () => apiKey,
    listApiKeys: () => ({ entries: [apiKey], enforcing: false }),
    loadGhCli: () =>
      Promise.resolve({
        detectGhCli: () => Promise.resolve(ghStatus),
        getGhAccountToken: () => Promise.resolve("gho_test_token"),
      }),
    makeAccountRecord: accountRecord,
    preflightCopilotError: () => Promise.resolve(null),
    removeApiKey: () => undefined,
    setApiKeyEnforcement: (enforcing) => ({
      entries: [apiKey],
      enforcing,
    }),
    setAppEnabled: (id, enabled) => Promise.resolve(appEntry(id, enabled)),
    updateApiKey: (id, update) => ({ ...apiKey, id, ...update }),
    ...overrides,
  }
}

function makeApp(deps: SettingsEndpointDeps = makeDeps()): Hono {
  const app = new Hono()
  registerSettingsEndpoints(app, deps)
  return app
}

function jsonRequest(method: "PATCH" | "POST", body: unknown): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }
}

async function expectJsonError(
  response: Response,
  ...[status, message, type]: [number, string, string?]
): Promise<void> {
  expect(response.status).toBe(status)
  const expected = type ? { message, type } : { message }
  expect(await response.json()).toEqual({ error: expected })
}

describe("control settings endpoints — API keys", () => {
  test("GET /api-keys returns the operation response", async () => {
    const response = await makeApp().request("/api-keys")

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      entries: [apiKey],
      enforcing: false,
    })
  })

  test("POST /api-keys validates and forwards the complete payload", async () => {
    let received: unknown
    const app = makeApp(
      makeDeps({
        createApiKey: (input) => {
          received = input
          return apiKey
        },
      }),
    )
    const response = await app.request(
      "/api-keys",
      jsonRequest("POST", {
        label: "Primary",
        key: "abcdefgh",
        enabled: false,
      }),
    )

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual(apiKey)
    expect(received).toEqual({
      label: "Primary",
      key: "abcdefgh",
      enabled: false,
    })
  })

  test("POST /api-keys rejects malformed and invalid payloads", async () => {
    const app = makeApp()
    const malformed = await app.request("/api-keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    })
    await expectJsonError(malformed, 400, "Invalid payload", "validation_error")

    const invalid = await app.request(
      "/api-keys",
      jsonRequest("POST", { label: "" }),
    )
    await expectJsonError(invalid, 400, "Invalid payload", "validation_error")
  })

  test("PATCH /api-keys/enforce validates and forwards the boolean", async () => {
    const values: Array<boolean> = []
    const app = makeApp(
      makeDeps({
        setApiKeyEnforcement: (enforcing) => {
          values.push(enforcing)
          return { entries: [apiKey], enforcing }
        },
      }),
    )

    const enabled = await app.request(
      "/api-keys/enforce",
      jsonRequest("PATCH", { enforce: true }),
    )
    expect(enabled.status).toBe(200)
    expect(await enabled.json()).toEqual({ entries: [apiKey], enforcing: true })

    const disabled = await app.request(
      "/api-keys/enforce",
      jsonRequest("PATCH", { enforce: false }),
    )
    expect(disabled.status).toBe(200)
    expect(await disabled.json()).toEqual({
      entries: [apiKey],
      enforcing: false,
    })
    expect(values).toEqual([true, false])
  })

  test("PATCH /api-keys/enforce rejects malformed and non-boolean bodies", async () => {
    const app = makeApp()
    for (const init of [
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: "{",
      },
      jsonRequest("PATCH", { enforce: "yes" }),
    ]) {
      await expectJsonError(
        await app.request("/api-keys/enforce", init),
        400,
        "Expected { enforce: boolean }",
        "validation_error",
      )
    }
  })

  test("PATCH /api-keys/:id validates and forwards id plus update", async () => {
    let received: unknown
    const app = makeApp(
      makeDeps({
        updateApiKey: (id, update) => {
          received = { id, update }
          return { ...apiKey, id, ...update }
        },
      }),
    )
    const response = await app.request(
      "/api-keys/selected-key",
      jsonRequest("PATCH", { label: "Renamed", enabled: false }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      ...apiKey,
      id: "selected-key",
      label: "Renamed",
      enabled: false,
    })
    expect(received).toEqual({
      id: "selected-key",
      update: { label: "Renamed", enabled: false },
    })
  })

  test("PATCH /api-keys/:id rejects malformed and invalid updates", async () => {
    const app = makeApp()
    const malformed = await app.request("/api-keys/key-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: "{",
    })
    await expectJsonError(malformed, 400, "Invalid payload", "validation_error")

    const invalid = await app.request(
      "/api-keys/key-1",
      jsonRequest("PATCH", { enabled: "yes" }),
    )
    await expectJsonError(invalid, 400, "Invalid payload", "validation_error")
  })

  test("DELETE /api-keys/:id forwards the id and returns an empty 204", async () => {
    const ids: Array<string> = []
    const app = makeApp(makeDeps({ removeApiKey: (id) => ids.push(id) }))
    const response = await app.request("/api-keys/selected-key", {
      method: "DELETE",
    })

    expect(response.status).toBe(204)
    expect(await response.text()).toBe("")
    expect(ids).toEqual(["selected-key"])
  })
})

describe("control settings endpoints — operation errors", () => {
  test("maps every settings error kind to its status and exact body", async () => {
    const cases = [
      ["conflict", 409],
      ["not_found", 404],
      ["validation_error", 400],
    ] as const

    for (const [kind, status] of cases) {
      const app = makeApp(
        makeDeps({
          createApiKey: () => {
            throw new SettingsOperationError(`failure: ${kind}`, kind)
          },
        }),
      )
      const response = await app.request(
        "/api-keys",
        jsonRequest("POST", { label: "Primary" }),
      )
      await expectJsonError(response, status, `failure: ${kind}`, kind)
    }
  })

  test("forwards non-settings errors through the standard error mapper", async () => {
    const app = makeApp(
      makeDeps({
        createApiKey: () => {
          throw new Error("unexpected operation failure")
        },
      }),
    )
    const response = await app.request(
      "/api-keys",
      jsonRequest("POST", { label: "Primary" }),
    )

    await expectJsonError(
      response,
      500,
      "unexpected operation failure",
      "error",
    )
  })

  test("PATCH and DELETE route operation failures use the shared mapper", async () => {
    const updateApp = makeApp(
      makeDeps({
        updateApiKey: () => {
          throw new SettingsOperationError("missing update", "not_found")
        },
      }),
    )
    await expectJsonError(
      await updateApp.request(
        "/api-keys/key-1",
        jsonRequest("PATCH", { enabled: true }),
      ),
      404,
      "missing update",
      "not_found",
    )

    const removeApp = makeApp(
      makeDeps({
        removeApiKey: () => {
          throw new SettingsOperationError("missing delete", "not_found")
        },
      }),
    )
    await expectJsonError(
      await removeApp.request("/api-keys/key-1", { method: "DELETE" }),
      404,
      "missing delete",
      "not_found",
    )
  })
})

describe("control settings endpoints — gh", () => {
  test("GET /gh/status returns detector output", async () => {
    let detections = 0
    const app = makeApp(
      makeDeps({
        loadGhCli: () =>
          Promise.resolve({
            detectGhCli: () => {
              detections += 1
              return Promise.resolve(ghStatus)
            },
            getGhAccountToken: () => Promise.resolve(null),
          }),
      }),
    )
    const response = await app.request("/gh/status")

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(ghStatus)
    expect(detections).toBe(1)
  })

  test("GET /gh/status loads the real detector by default", async () => {
    const app = new Hono()
    registerSettingsEndpoints(app)

    const response = await app.request("/gh/status")
    expect(response.status).toBe(200)
    const body = (await response.json()) as GhCliStatus
    expect(typeof body.installed).toBe("boolean")
    expect(Array.isArray(body.accounts)).toBe(true)
  })

  test("GET /gh/status forwards loader and detector failures", async () => {
    for (const loadGhCli of [
      () => Promise.reject(new Error("load failed")),
      () =>
        Promise.resolve({
          detectGhCli: () => Promise.reject(new Error("detect failed")),
          getGhAccountToken: () => Promise.resolve(null),
        }),
    ]) {
      const response = await makeApp(makeDeps({ loadGhCli })).request(
        "/gh/status",
      )
      expect(response.status).toBe(500)
      const body = (await response.json()) as { error: { message: string } }
      expect(body.error.message).toMatch(/^(load|detect) failed$/)
    }
  })
})

describe("control settings endpoints — gh account import", () => {
  test("POST /gh/use rejects malformed and incomplete bodies", async () => {
    const app = makeApp()
    const malformed = await app.request("/gh/use", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    })
    await expectJsonError(malformed, 400, "Expected { login, host } strings.")

    for (const body of [
      { login: "", host: "github.com" },
      { login: "octocat", host: "" },
      { login: "octocat" },
    ]) {
      await expectJsonError(
        await app.request("/gh/use", jsonRequest("POST", body)),
        400,
        "Expected { login, host } strings.",
      )
    }
  })

  test("POST /gh/use requires one account matching both login and host", async () => {
    const accounts: GhCliStatus["accounts"] = [
      {
        login: "octocat",
        host: "enterprise.example",
        active: true,
        scopes: [],
      },
      {
        login: "other",
        host: "github.com",
        active: false,
        scopes: [],
      },
    ]
    const app = makeApp(
      makeDeps({
        loadGhCli: () =>
          Promise.resolve({
            detectGhCli: () => Promise.resolve({ ...ghStatus, accounts }),
            getGhAccountToken: () => Promise.resolve("must-not-run"),
          }),
      }),
    )
    const response = await app.request(
      "/gh/use",
      jsonRequest("POST", { login: "octocat", host: "github.com" }),
    )

    await expectJsonError(
      response,
      404,
      "gh has no account octocat on github.com.",
    )
  })

  test("POST /gh/use reports an unreadable token", async () => {
    const app = makeApp(
      makeDeps({
        loadGhCli: () =>
          Promise.resolve({
            detectGhCli: () => Promise.resolve(ghStatus),
            getGhAccountToken: () => Promise.resolve(null),
          }),
      }),
    )
    const response = await app.request(
      "/gh/use",
      jsonRequest("POST", { login: "octocat", host: "github.com" }),
    )

    await expectJsonError(
      response,
      502,
      "Could not read the gh token for octocat.",
    )
  })

  test("POST /gh/use returns a preflight rejection without persisting", async () => {
    let persisted = false
    const app = makeApp(
      makeDeps({
        preflightCopilotError: (token, login) => {
          expect(token).toBe("gho_test_token")
          expect(login).toBe("octocat")
          return Promise.resolve("Copilot access denied")
        },
        addAccountToDefaultRegistry: () => {
          persisted = true
          return Promise.resolve()
        },
      }),
    )
    const response = await app.request(
      "/gh/use",
      jsonRequest("POST", { login: "octocat", host: "github.com" }),
    )

    await expectJsonError(response, 422, "Copilot access denied")
    expect(persisted).toBe(false)
  })

  test("POST /gh/use wires token lookup, preflight, record, and persistence", async () => {
    const calls: Array<unknown> = []
    const record = accountRecord({
      login: "octocat",
      host: "github.com",
      token: "gho_test_token",
      addedVia: "gh-cli",
    })
    const app = makeApp(
      makeDeps({
        loadGhCli: () =>
          Promise.resolve({
            detectGhCli: () =>
              Promise.resolve({
                ...ghStatus,
                accounts: [
                  ...ghStatus.accounts,
                  {
                    login: "other",
                    host: "github.com",
                    active: false,
                    scopes: [],
                  },
                ],
              }),
            getGhAccountToken: (login, host) => {
              calls.push(["token", login, host])
              return Promise.resolve("gho_test_token")
            },
          }),
        preflightCopilotError: (token, login) => {
          calls.push(["preflight", token, login])
          return Promise.resolve(null)
        },
        makeAccountRecord: (input) => {
          calls.push(["record", input])
          return record
        },
        addAccountToDefaultRegistry: (input) => {
          calls.push(["persist", input])
          return Promise.resolve()
        },
      }),
    )
    const response = await app.request(
      "/gh/use",
      jsonRequest("POST", { login: "octocat", host: "github.com" }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      ok: true,
      login: "octocat",
      host: "github.com",
    })
    expect(calls).toEqual([
      ["token", "octocat", "github.com"],
      ["preflight", "gho_test_token", "octocat"],
      [
        "record",
        {
          login: "octocat",
          host: "github.com",
          token: "gho_test_token",
          addedVia: "gh-cli",
        },
      ],
      ["persist", record],
    ])
  })

  test("POST /gh/use forwards unexpected dependency errors", async () => {
    const app = makeApp(
      makeDeps({
        loadGhCli: () => Promise.reject(new Error("gh unavailable")),
      }),
    )
    await expectJsonError(
      await app.request(
        "/gh/use",
        jsonRequest("POST", { login: "octocat", host: "github.com" }),
      ),
      500,
      "gh unavailable",
      "error",
    )
  })
})

describe("control settings endpoints — app toggles and diagnostics", () => {
  test("each app route validates its body", async () => {
    const app = makeApp()
    for (const path of [
      "/apps/claude-code/toggle",
      "/apps/claude-desktop/toggle",
    ]) {
      for (const init of [
        jsonRequest("POST", { enabled: "yes" }),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{",
        },
      ]) {
        await expectJsonError(
          await app.request(path, init),
          400,
          "Expected { enabled: boolean }",
        )
      }
    }
  })

  test("each app route forwards the selected id, boolean, and response", async () => {
    const calls: Array<unknown> = []
    const app = makeApp(
      makeDeps({
        setAppEnabled: (id, enabled) => {
          calls.push([id, enabled])
          return Promise.resolve(appEntry(id, enabled))
        },
      }),
    )

    for (const [path, id, enabled] of [
      ["/apps/claude-code/toggle", "claude-code", true],
      ["/apps/claude-desktop/toggle", "claude-desktop", false],
    ] as const) {
      const response = await app.request(path, jsonRequest("POST", { enabled }))
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual(appEntry(id, enabled))
    }
    expect(calls).toEqual([
      ["claude-code", true],
      ["claude-desktop", false],
    ])
  })

  test("each app route maps settings and unexpected failures", async () => {
    for (const [path, error, status, type] of [
      [
        "/apps/claude-code/toggle",
        new SettingsOperationError("not installed", "conflict"),
        409,
        "conflict",
      ],
      [
        "/apps/claude-desktop/toggle",
        new Error("desktop failed"),
        500,
        "error",
      ],
    ] as const) {
      const app = makeApp(
        makeDeps({
          setAppEnabled: () => Promise.reject(error),
        }),
      )
      await expectJsonError(
        await app.request(path, jsonRequest("POST", { enabled: true })),
        status,
        error.message,
        type,
      )
    }
  })

  test("GET /diagnostics returns the builder response", async () => {
    let builds = 0
    const app = makeApp(
      makeDeps({
        buildDiagnostics: () => {
          builds += 1
          return diagnostics
        },
      }),
    )
    const response = await app.request("/diagnostics")

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(diagnostics)
    expect(builds).toBe(1)
  })
})
