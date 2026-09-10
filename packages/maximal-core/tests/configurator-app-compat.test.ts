import { describe, expect, it } from "bun:test"

import type { ApiKeyEntry } from "~/lib/config/config"
import type {
  ConfiguratorConnection,
  ConfiguratorPlugin,
  ConfiguratorRegistry,
} from "~/lib/configurator-host"

import {
  buildConfiguratorAppsList,
  configuratorConnectionToConnectionEntry,
} from "~/lib/configurator-app-compat"

function plugin(
  id: string,
  connection: ConfiguratorConnection,
  availability?: "available" | "coming-soon",
): ConfiguratorPlugin {
  return {
    metadata: {
      id,
      name: id,
      targetId: `${id}-settings`,
      credentialBinding: { kind: "none" },
      availability,
    },
    connection: () => Promise.resolve(connection),
    connect: () => Promise.resolve(connection),
    reconnect: () => Promise.resolve(connection),
    disconnect: () => Promise.resolve(connection),
  }
}

function registry(plugins: Array<ConfiguratorPlugin>): ConfiguratorRegistry {
  return {
    all: () => plugins,
    get: (id) => plugins.find((candidate) => candidate.metadata.id === id),
    dispose: () => Promise.resolve(),
  }
}

describe("connection projections", () => {
  it("exposes ownership and recovery metadata without credential secrets", () => {
    const credential: ApiKeyEntry = {
      id: "managed:claude-code",
      label: "Claude Code",
      key: "never-on-the-wire",
      enabled: true,
      created_at: "2026-09-08T12:00:00.000Z",
      kind: "managed",
      configurator_id: "claude-code",
    }
    const connection: ConfiguratorConnection = {
      status: "changed-externally",
      allowedActions: ["disconnect", "reconnect"],
      detail: "A managed field changed outside Maximal.",
      ownership: {
        configuratorId: "claude-code",
        targetPath: "/home/maximal/.claude/settings.json",
        runtime: {
          nonce: "secret-runtime-nonce",
          pid: 42,
          proxyPort: 41_501,
          controlPort: 42_501,
          startedAt: "2026-09-08T12:00:00.000Z",
        },
      },
      recovery: {
        preservedPaths: [["env", "ANTHROPIC_AUTH_TOKEN"]],
      },
    }
    const entry = configuratorConnectionToConnectionEntry(
      plugin("claude-code", connection),
      connection,
      credential,
    )

    expect(entry).toEqual({
      id: "claude-code",
      name: "claude-code",
      status: "changed-externally",
      allowed_actions: ["disconnect", "reconnect"],
      detail: "A managed field changed outside Maximal.",
      credential: {
        id: "managed:claude-code",
        label: "Claude Code",
        kind: "managed",
        enabled: true,
      },
      ownership: {
        configurator_id: "claude-code",
        target_path: "/home/maximal/.claude/settings.json",
        pid: 42,
        started_at: "2026-09-08T12:00:00.000Z",
      },
      recovery: {
        preserved_paths: [["env", "ANTHROPIC_AUTH_TOKEN"]],
      },
    })
    expect(JSON.stringify(entry)).not.toContain(credential.key)
    expect(JSON.stringify(entry)).not.toContain("secret-runtime-nonce")
    expect(JSON.stringify(entry)).not.toContain("41501")
    expect(JSON.stringify(entry)).not.toContain("42501")
  })
})

describe("legacy app compatibility for configurators", () => {
  it("projects connection state without exposing secret material", async () => {
    const result = await buildConfiguratorAppsList(
      registry([
        plugin("claude-code", {
          status: "connected",
          allowedActions: ["disconnect"],
        }),
        plugin(
          "copilot-cli",
          { status: "coming-soon", allowedActions: [] },
          "coming-soon",
        ),
      ]),
    )

    expect(result).toEqual({
      apps: [
        {
          id: "claude-code",
          name: "claude-code",
          kind: "config",
          enabled: true,
          status: "ready",
          installs: [],
          install: null,
          conflict: null,
        },
        {
          id: "copilot-cli",
          name: "copilot-cli",
          kind: "coming-soon",
          enabled: false,
          status: "coming-soon",
          installs: [],
          install: null,
          conflict: null,
        },
      ],
    })
  })

  it("omits unknown configurator ids from the legacy closed union", async () => {
    const result = await buildConfiguratorAppsList(
      registry([
        plugin("future-client", {
          status: "available",
          allowedActions: ["connect"],
        }),
      ]),
    )

    expect(result).toEqual({ apps: [] })
  })
})
