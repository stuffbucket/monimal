import type {
  CreateServerAppsOptions,
  ProviderGatewayFactory,
  ProviderHostConfigSnapshot,
  RunServerOptions,
  ServerApps,
} from "@stuffbucket/maximal-core/provider-host"
import {
  createMain,
  createServerApps,
  runCli,
  runServer,
} from "@stuffbucket/maximal-core/provider-host"

import { expectAssignable } from "./assert.js"

type Gateway = NonNullable<CreateServerAppsOptions["providerGateway"]>
declare const gateway: Gateway

const createProviderGateway: ProviderGatewayFactory = ({
  config,
  configSource,
}) => {
  expectAssignable<string>(config.appDataDirectory)
  expectAssignable<string>(config.defaultProfileDirectory)
  expectAssignable<"legacy" | "dsh">(config.providerHost.mode)
  configSource.subscribe((next: ProviderHostConfigSnapshot) => {
    expectAssignable<unknown>(next.providerPlugins?.hosted?.config)
    expectAssignable<string | undefined>(next.providers.compatible?.apiKey)
    expectAssignable<string | undefined>(next.providers.compatible?.type)
    if (next.configStatus.state === "error") {
      expectAssignable<"parse" | "read" | "unknown" | "validation">(
        next.configStatus.reason,
      )
    }
  })
  return gateway
}

expectAssignable<Promise<unknown>>(createMain({ createProviderGateway }))
expectAssignable<Promise<void>>(runCli({ createProviderGateway, rawArgs: ["--help"] }))

const apps = createServerApps({ createProviderGateway, providerGateway: gateway })
expectAssignable<Promise<ServerApps>>(apps)
expectAssignable<Promise<void>>(
  runServer({
    accountType: "individual",
    claudeCode: false,
    createProviderGateway,
    manual: true,
    port: 4141,
    proxyEnv: false,
    rateLimitWait: false,
    showToken: false,
    verbose: false,
  } satisfies RunServerOptions),
)
