#!/usr/bin/env bun

import { runCli } from "@stuffbucket/maximal-core/provider-host"

import { createDshProviderGateway } from "./provider-gateway"

export async function main(): Promise<void> {
  await runCli({ createProviderGateway: createDshProviderGateway })
}

if (import.meta.main) await main()
