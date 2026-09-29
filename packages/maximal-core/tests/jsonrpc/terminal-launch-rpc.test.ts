import { expect, test } from "bun:test"

import type {
  ConfiguratorRegistry,
  TerminalProfileConfigurator,
} from "~/lib/configurator-host"

import { resolveTerminalScope } from "~/lib/auth/terminal-scope"
import { createControlRoutes } from "~/routes/control/route"

test("revokes the terminal credential when launch configuration fails", async () => {
  let issuedCredential = ""
  const terminalProfile: TerminalProfileConfigurator = {
    metadata: {
      id: "failing-terminal",
      name: "Failing terminal",
      profileId: "failing",
      application: null,
    },
    environment: ({ credential }) => {
      issuedCredential = credential
      throw new Error("launch environment failed")
    },
  }
  const configurators: ConfiguratorRegistry = {
    all: () => [],
    get: () => undefined,
    terminalProfile: () => terminalProfile,
    dispose: () => Promise.resolve(),
  }
  const app = createControlRoutes({
    getRequestIp: () => "127.0.0.1",
    configurators,
  })
  const response = await app.request("/rpc", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "terminalScopes/issue",
      params: {
        sessionId: "terminal-failing",
        profileId: "failing",
        application: "caller-label",
      },
    }),
  })
  const body = (await response.json()) as {
    error?: { message: string }
  }

  expect(body.error?.message).toContain("launch environment failed")
  expect(issuedCredential).toMatch(/^mxt_/u)
  expect(resolveTerminalScope(issuedCredential)).toBeNull()
})
