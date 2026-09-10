#!/usr/bin/env bun

import { runCli } from "@stuffbucket/maximal-core/provider-host"

import {
  createDshProviderGateway,
  type DshProviderGatewayComposition,
} from "./provider-gateway"

export type MaximalCompositionOptions = DshProviderGatewayComposition

export async function main(
  options: MaximalCompositionOptions = {},
): Promise<void> {
  await runCli({
    createProviderGateway: async (context) =>
      await createDshProviderGateway(context, options),
  })
}

if (import.meta.main) await main()
