import {
  BUILTIN_CONFIGURATOR_TARGETS,
  type ConfiguratorHost,
  type ConfiguratorMetadata,
  type ConfiguratorPlugin,
} from "@stuffbucket/maximal-core/configurator-host"

import { defineConfigurator } from "../configurator.ts"

export const copilotCliMetadata = Object.freeze({
  id: "copilot-cli",
  name: "Copilot CLI",
  targetId: BUILTIN_CONFIGURATOR_TARGETS.copilotCli,
  credentialBinding: { kind: "none" },
  availability: "coming-soon",
} satisfies ConfiguratorMetadata)

export function createCopilotCliConfigurator(
  host: ConfiguratorHost,
): ConfiguratorPlugin {
  return defineConfigurator(copilotCliMetadata, () => [], host)
}
