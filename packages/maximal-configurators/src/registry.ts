import type {
  ConfiguratorPlugin,
  ConfiguratorRegistry,
} from "@stuffbucket/maximal-core/configurator-host"

import { Context, type Fiber } from "@deepseek-ai/cordis"

const configuratorIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u

function validatePlugins(
  plugins: ReadonlyArray<ConfiguratorPlugin>,
): ReadonlyArray<ConfiguratorPlugin> {
  const ids = new Set<string>()
  const targets = new Set<string>()
  for (const plugin of plugins) {
    const { id, name, targetId } = plugin.metadata
    if (!configuratorIdPattern.test(id)) {
      throw new Error(`Invalid configurator id: ${id}`)
    }
    if (name.trim().length === 0) {
      throw new Error(`Configurator ${id} has no display name`)
    }
    if (targetId.trim().length === 0) {
      throw new Error(`Configurator ${id} has no target`)
    }
    if (ids.has(id)) throw new Error(`Duplicate configurator id: ${id}`)
    if (targets.has(targetId)) {
      throw new Error(`Duplicate configurator target: ${targetId}`)
    }
    ids.add(id)
    targets.add(targetId)
  }
  return plugins
}

class CordisConfiguratorRegistry implements ConfiguratorRegistry {
  readonly #context: Context
  readonly #plugins: ReadonlyArray<ConfiguratorPlugin>
  readonly #fibers: Array<Fiber>
  #disposePromise: Promise<void> | undefined

  constructor(
    context: Context,
    plugins: ReadonlyArray<ConfiguratorPlugin>,
    fibers: Array<Fiber>,
  ) {
    this.#context = context
    this.#plugins = Object.freeze([...plugins])
    this.#fibers = fibers
  }

  all(): ReadonlyArray<ConfiguratorPlugin> {
    return this.#plugins
  }

  get(id: string): ConfiguratorPlugin | undefined {
    return this.#plugins.find((plugin) => plugin.metadata.id === id)
  }

  dispose(): Promise<void> {
    this.#disposePromise ??= this.#dispose()
    return this.#disposePromise
  }

  async #dispose(): Promise<void> {
    let firstFailure: unknown
    for (const fiber of this.#fibers.reverse()) {
      try {
        await fiber.dispose()
      } catch (error) {
        firstFailure ??= error
      }
    }
    try {
      await this.#context.fiber.dispose()
    } catch (error) {
      firstFailure ??= error
    }
    if (firstFailure !== undefined) {
      throw firstFailure instanceof Error ? firstFailure : (
          new Error("Configurator disposal failed")
        )
    }
  }
}

async function disposeActivation(
  context: Context,
  fibers: Array<Fiber>,
): Promise<void> {
  for (const fiber of fibers.reverse()) {
    try {
      await fiber.dispose()
    } catch {
      // Preserve the activation failure that caused cleanup.
    }
  }
  try {
    await context.fiber.dispose()
  } catch {
    // Preserve the activation failure that caused cleanup.
  }
}

function disposePlugin(plugin: ConfiguratorPlugin): void | Promise<void> {
  return plugin.dispose?.()
}

function activatePlugin(
  plugin: ConfiguratorPlugin,
): () => void | Promise<void> {
  return disposePlugin.bind(undefined, plugin)
}

function createActivation(
  plugin: ConfiguratorPlugin,
): () => () => void | Promise<void> {
  const activation = activatePlugin.bind(undefined, plugin)
  Object.defineProperty(activation, "name", {
    value: `configurator:${plugin.metadata.id}`,
  })
  return activation
}

/** Activate a static, validated configurator set under Cordis lifecycle scopes. */
export async function createConfiguratorRegistry(
  plugins: ReadonlyArray<ConfiguratorPlugin>,
): Promise<ConfiguratorRegistry> {
  const validated = validatePlugins(plugins)
  const context = new Context()
  const fibers: Array<Fiber> = []

  try {
    for (const plugin of validated) {
      const fiber = context.plugin(createActivation(plugin))
      await fiber.await()
      fibers.push(fiber)
    }
    return new CordisConfiguratorRegistry(context, validated, fibers)
  } catch (error) {
    await disposeActivation(context, fibers)
    throw error
  }
}
