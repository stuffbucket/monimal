import type {
  ConfiguratorConnection,
  ConfiguratorHost,
  ConfiguratorMetadata,
  ConfiguratorPatchFactory,
  ConfiguratorPlugin,
  ConfiguratorTargetPatch,
  ConnectTargetResult,
  DisconnectTargetResult,
} from "@stuffbucket/maximal-core/configurator-host"

import assert from "node:assert/strict"
import test from "node:test"

import {
  claudeCodeFields,
  claudeDesktopGatewayFields,
  createBuiltinConfigurators,
  createConfiguratorRegistry,
} from "../src/index.ts"

class FakeHost implements ConfiguratorHost {
  installed = true
  inspected: ConfiguratorConnection = {
    status: "available",
    allowedActions: ["connect"],
  }
  material = {
    baseUrl: "http://127.0.0.1:41501",
    credential: "mxl_managed-test-token",
    workspaceDirectory: "/home/test/Claude",
  }
  connects: Array<{
    configuratorId: string
    patch: ConfiguratorTargetPatch
  }> = []
  reconnects: Array<{
    configuratorId: string
    patch: ConfiguratorTargetPatch
  }> = []
  disconnects: Array<{ configuratorId: string; targetId: string }> = []
  targetChecks: Array<string> = []
  materialRequests: Array<ConfiguratorMetadata> = []
  connectResult: ConnectTargetResult = { status: "connected" }
  disconnectResult: DisconnectTargetResult = {
    status: "disconnected",
    preservedPaths: [],
  }

  targetInstalled(targetId: string): Promise<boolean> {
    this.targetChecks.push(targetId)
    return Promise.resolve(this.installed)
  }

  inspectTarget(): Promise<ConfiguratorConnection> {
    return Promise.resolve(this.inspected)
  }

  connectTarget(
    metadata: ConfiguratorMetadata,
    factory: ConfiguratorPatchFactory,
  ): Promise<ConnectTargetResult> {
    const patch = this.resolvePatch(metadata, factory)
    if (patch) this.connects.push({ configuratorId: metadata.id, patch })
    return Promise.resolve(this.connectResult)
  }

  reconnectTarget(
    metadata: ConfiguratorMetadata,
    factory: ConfiguratorPatchFactory,
  ): Promise<ConnectTargetResult> {
    const patch = this.resolvePatch(metadata, factory)
    if (patch) this.reconnects.push({ configuratorId: metadata.id, patch })
    return Promise.resolve(this.connectResult)
  }

  private resolvePatch(
    metadata: ConfiguratorMetadata,
    factory: ConfiguratorPatchFactory,
  ): ConfiguratorTargetPatch | undefined {
    if (
      this.connectResult.status !== "connected"
      && this.connectResult.status !== "already-connected"
    ) {
      return undefined
    }
    this.materialRequests.push(metadata)
    return factory(this.material)
  }

  disconnectTarget(
    configuratorId: string,
    targetId: string,
  ): Promise<DisconnectTargetResult> {
    this.disconnects.push({ configuratorId, targetId })
    return Promise.resolve(this.disconnectResult)
  }
}

void test("registers the static first-party configurator set", () => {
  const plugins = createBuiltinConfigurators(new FakeHost())

  assert.deepEqual(
    plugins.map((plugin) => plugin.metadata.id),
    ["claude-code", "claude-desktop", "copilot-cli"],
  )
  assert.equal(Object.isFrozen(plugins), true)
})

void test("each configurator asks Core to find its associated application", async () => {
  const host = new FakeHost()
  const configurators = createBuiltinConfigurators(host)

  await Promise.all(
    configurators.map((configurator) => configurator.connection()),
  )

  assert.deepEqual(host.targetChecks, [
    "claude-code-settings",
    "claude-desktop-config-library",
    "copilot-cli-settings",
  ])
})

void test("Claude Code writes a literal bearer token without apiKeyHelper", async () => {
  const host = new FakeHost()
  const [claudeCode] = createBuiltinConfigurators(host)
  assert.ok(claudeCode)

  const result = await claudeCode.connect()

  assert.deepEqual(result, {
    status: "connected",
    allowedActions: ["disconnect"],
  })
  assert.equal(host.connects.length, 1)
  assert.deepEqual(host.connects[0], {
    configuratorId: "claude-code",
    patch: {
      targetId: "claude-code-settings",
      fields: [
        {
          path: ["env", "ANTHROPIC_BASE_URL"],
          value: "http://127.0.0.1:41501",
        },
        {
          path: ["env", "ANTHROPIC_AUTH_TOKEN"],
          value: "mxl_managed-test-token",
        },
      ],
    },
  })
  assert.equal(
    host.connects[0]?.patch.fields.some((field) =>
      field.path.includes("apiKeyHelper"),
    ),
    false,
  )
})

void test("Claude Desktop delegates its complete profile patch to Core", async () => {
  const host = new FakeHost()
  const [, claudeDesktop] = createBuiltinConfigurators(host)
  assert.ok(claudeDesktop)

  const result = await claudeDesktop.connect()

  assert.deepEqual(result, {
    status: "connected",
    allowedActions: ["disconnect"],
  })
  assert.deepEqual(host.connects, [
    {
      configuratorId: "claude-desktop",
      patch: {
        targetId: "claude-desktop-config-library",
        fields: claudeDesktopGatewayFields(
          host.material.baseUrl,
          host.material.credential,
          host.material.workspaceDirectory,
        ),
      },
    },
  ])
  assert.deepEqual(host.materialRequests, [claudeDesktop.metadata])
})

void test("a live owner collision stops before materializing a patch", async () => {
  const host = new FakeHost()
  host.connectResult = { status: "owned-by-another-configurator" }
  const [claudeCode] = createBuiltinConfigurators(host)
  assert.ok(claudeCode)

  const result = await claudeCode.connect()

  assert.deepEqual(result, {
    status: "owned-by-another-configurator",
    allowedActions: [],
  })
  assert.equal(host.connects.length, 0)
  assert.equal(host.materialRequests.length, 0)
})

void test("connect and reconnect preserve Core ownership metadata", async () => {
  const host = new FakeHost()
  const claim = {
    schema: 1 as const,
    revision: 1,
    configuratorId: "claude-code",
    runtime: {
      nonce: "boot-one",
      pid: 42,
      proxyPort: 41_501,
      controlPort: 42_501,
      startedAt: "2026-09-08T12:00:00.000Z",
    },
    targetPath: "/home/test/.claude/settings.json",
    fields: [],
  }
  host.connectResult = { status: "connected", claim }
  const [claudeCode] = createBuiltinConfigurators(host)
  assert.ok(claudeCode)

  const result = await claudeCode.connect()

  assert.deepEqual(result, {
    status: "connected",
    allowedActions: ["disconnect"],
    ownership: {
      configuratorId: "claude-code",
      targetPath: "/home/test/.claude/settings.json",
      runtime: claim.runtime,
    },
  })
})

void test("blocked disconnect preserves externally changed field paths", async () => {
  const host = new FakeHost()
  host.disconnectResult = {
    status: "recovery-required",
    preservedPaths: [["env", "ANTHROPIC_AUTH_TOKEN"]],
  }
  const [claudeCode] = createBuiltinConfigurators(host)
  assert.ok(claudeCode)

  const result = await claudeCode.disconnect()

  assert.deepEqual(result, {
    status: "recovery-required",
    allowedActions: [],
    recovery: {
      preservedPaths: [["env", "ANTHROPIC_AUTH_TOKEN"]],
    },
  })
})

void test("reconnect delegates explicit external-change adoption to Core", async () => {
  const host = new FakeHost()
  const [claudeCode] = createBuiltinConfigurators(host)
  assert.ok(claudeCode)

  const result = await claudeCode.reconnect()

  assert.deepEqual(result, {
    status: "connected",
    allowedActions: ["disconnect"],
  })
  assert.equal(host.connects.length, 0)
  assert.deepEqual(host.reconnects, [
    {
      configuratorId: "claude-code",
      patch: {
        targetId: "claude-code-settings",
        fields: [
          {
            path: ["env", "ANTHROPIC_BASE_URL"],
            value: "http://127.0.0.1:41501",
          },
          {
            path: ["env", "ANTHROPIC_AUTH_TOKEN"],
            value: "mxl_managed-test-token",
          },
        ],
      },
    },
  ])
})

void test("not-installed and coming-soon clients perform no writes", async () => {
  const host = new FakeHost()
  host.installed = false
  const [claudeCode, , copilotCli] = createBuiltinConfigurators(host)
  assert.ok(claudeCode)
  assert.ok(copilotCli)

  assert.deepEqual(await claudeCode.connect(), {
    status: "not-installed",
    allowedActions: [],
  })
  host.installed = true
  assert.deepEqual(await copilotCli.connect(), {
    status: "coming-soon",
    allowedActions: [],
  })
  assert.equal(host.connects.length, 0)
  assert.equal(host.materialRequests.length, 0)
})

void test("disposing built-ins disconnects active targets in reverse order", async () => {
  const host = new FakeHost()
  const registry = await createConfiguratorRegistry(
    createBuiltinConfigurators(host),
  )

  await registry.dispose()

  assert.deepEqual(host.disconnects, [
    {
      configuratorId: "claude-desktop",
      targetId: "claude-desktop-config-library",
    },
    { configuratorId: "claude-code", targetId: "claude-code-settings" },
  ])
})

void test("Cordis disposes configurators in reverse activation order", async () => {
  const disposed: Array<string> = []
  const makePlugin = (id: string, targetId: string): ConfiguratorPlugin => ({
    metadata: {
      id,
      name: id,
      targetId,
      credentialBinding: { kind: "none" },
    },
    connection: () =>
      Promise.resolve({ status: "available", allowedActions: ["connect"] }),
    connect: () =>
      Promise.resolve({ status: "connected", allowedActions: ["disconnect"] }),
    reconnect: () =>
      Promise.resolve({ status: "connected", allowedActions: ["disconnect"] }),
    disconnect: () =>
      Promise.resolve({ status: "available", allowedActions: ["connect"] }),
    dispose() {
      disposed.push(id)
    },
  })
  const first = makePlugin("first", "first-settings")
  const second = makePlugin("second", "second-settings")
  const registry = await createConfiguratorRegistry([first, second])

  assert.deepEqual(registry.all(), [first, second])
  assert.equal(registry.get("second"), second)
  await registry.dispose()
  await registry.dispose()
  assert.deepEqual(disposed, ["second", "first"])
})

void test("Cordis registration rejects duplicate static dependencies", async () => {
  const host = new FakeHost()
  const [first] = createBuiltinConfigurators(host)
  assert.ok(first)
  await assert.rejects(
    createConfiguratorRegistry([first, first]),
    /Duplicate configurator id: claude-code/u,
  )
})

void test("field builders are pure client-specific transforms", () => {
  assert.deepEqual(claudeCodeFields("http://proxy", "token"), [
    { path: ["env", "ANTHROPIC_BASE_URL"], value: "http://proxy" },
    { path: ["env", "ANTHROPIC_AUTH_TOKEN"], value: "token" },
  ])
  assert.deepEqual(
    claudeDesktopGatewayFields("http://proxy", "token", "/home/test/Claude"),
    [
      { path: ["inferenceProvider"], value: "gateway" },
      { path: ["inferenceGatewayBaseUrl"], value: "http://proxy" },
      { path: ["inferenceGatewayApiKey"], value: "token" },
      { path: ["inferenceGatewayAuthScheme"], value: "bearer" },
      { path: ["disableDeploymentModeChooser"], value: true },
      { path: ["coworkEgressAllowedHosts"], value: ["*"] },
      {
        path: ["allowedWorkspaceFolders"],
        value: ["/home/test/Claude"],
      },
      { path: ["disableEssentialTelemetry"], value: true },
      { path: ["disableNonessentialTelemetry"], value: true },
      { path: ["disableNonessentialServices"], value: false },
      { path: ["disableAutoUpdates"], value: false },
      { path: ["isLocalDevMcpEnabled"], value: true },
      { path: ["isDesktopExtensionEnabled"], value: true },
      { path: ["isDesktopExtensionDirectoryEnabled"], value: true },
      { path: ["isDesktopExtensionSignatureRequired"], value: false },
      { path: ["isClaudeCodeForDesktopEnabled"], value: true },
    ],
  )
})
