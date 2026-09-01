import type { ProviderGateway } from "@stuffbucket/maximal-provider-contract"
import type { Resolvable } from "citty"

import { describe, expect, test } from "bun:test"

import type { ProviderGatewayFactory } from "~/lib/provider-host-types"
import type { RunServerOptions } from "~/lib/start/run-server"

import { createMain } from "~/lib/cli-composition"
import { createStartCommand } from "~/lib/start/cli"

const resolve = async <T>(value: Resolvable<T>): Promise<T> =>
  typeof value === "function" ?
    await (value as () => T | Promise<T>)()
  : await value

const gateway = {} as ProviderGateway
const staticGatewayFactory: ProviderGatewayFactory = () => gateway

describe("public CLI composition", () => {
  test("preserves every existing lazy command without activating the provider host", async () => {
    let factoryCalls = 0
    const createProviderGateway: ProviderGatewayFactory = () => {
      factoryCalls += 1
      return gateway
    }

    const main = await createMain({ createProviderGateway })
    const subCommands = await resolve(main.subCommands ?? {})

    expect(Object.keys(subCommands).sort()).toEqual(
      [
        "api",
        "app",
        "auth",
        "check-usage",
        "debug",
        "setup",
        "start",
        "uninstall",
      ].sort(),
    )
    expect(factoryCalls).toBe(0)
    expect(
      Object.values(subCommands).every(
        (command) => typeof command === "function",
      ),
    ).toBe(true)
  })

  test("threads the lazy factory only into runServer options", async () => {
    const createProviderGateway = staticGatewayFactory
    let received: RunServerOptions | undefined
    const command = createStartCommand({
      createProviderGateway,
      runServer: (options) => {
        received = options
        return Promise.resolve()
      },
    })
    const run = command.run
    expect(run).toBeDefined()

    await run?.({
      args: {
        _: [],
        a: "individual",
        "account-type": "individual",
        c: false,
        "claude-code": false,
        "control-port": "0",
        g: "",
        "github-token": "",
        manual: false,
        p: "4141",
        port: "4141",
        "proxy-env": false,
        r: "",
        "rate-limit": "",
        replace: false,
        "show-token": false,
        v: false,
        verbose: false,
        w: false,
        wait: false,
      },
      cmd: command,
      rawArgs: ["start"],
    })

    expect(received?.createProviderGateway).toBe(createProviderGateway)
    expect(received?.port).toBe(4141)
  })
})
