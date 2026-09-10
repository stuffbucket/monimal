#!/usr/bin/env bun

import { createBuiltinConfiguratorRuntime } from "@stuffbucket/maximal-configurators"
import { runCli } from "@stuffbucket/maximal-core/provider-host"

import { createDshProviderGateway } from "./provider-gateway"

export async function main(): Promise<void> {
  await runCli({
    createConfiguratorRuntime: createBuiltinConfiguratorRuntime,
    createProviderGateway: createDshProviderGateway,
  })
}

if (import.meta.main) await main()
