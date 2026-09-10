import type {
  ConfiguratorHost,
  ConfiguratorPlugin,
  ConfiguratorRegistry,
} from "@stuffbucket/maximal-core/configurator-host"

import { createClaudeCodeConfigurator } from "./claude-code/index.ts"
import { createClaudeDesktopConfigurator } from "./claude-desktop/index.ts"
import { createCopilotCliConfigurator } from "./copilot-cli/index.ts"
import { createConfiguratorRegistry } from "./registry.ts"

export {
  claudeCodeFields,
  claudeCodeMetadata,
  createClaudeCodeConfigurator,
} from "./claude-code/index.ts"
export {
  claudeDesktopGatewayFields,
  claudeDesktopMetadata,
  createClaudeDesktopConfigurator,
} from "./claude-desktop/index.ts"
export {
  copilotCliMetadata,
  createCopilotCliConfigurator,
} from "./copilot-cli/index.ts"
export { createConfiguratorRegistry } from "./registry.ts"

/** The complete, statically linked first-party configurator set. */
export function createBuiltinConfigurators(
  host: ConfiguratorHost,
): ReadonlyArray<ConfiguratorPlugin> {
  return Object.freeze([
    createClaudeCodeConfigurator(host),
    createClaudeDesktopConfigurator(host),
    createCopilotCliConfigurator(host),
  ])
}

/** Activate the built-in set with Cordis dependency and disposal semantics. */
export function createBuiltinConfiguratorRuntime(
  host: ConfiguratorHost,
): Promise<ConfiguratorRegistry> {
  return createConfiguratorRegistry(createBuiltinConfigurators(host))
}
