import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { pathToFileURL } from "node:url"

const require = createRequire(import.meta.url)

export interface FixtureProfile {
  readonly dependencyEntry: string
  readonly directory: string
  readonly pluginEntry: string
  readonly pluginImplementation: string
  readonly pluginPackageJson: string
  writeProviders(value: unknown): Promise<void>
}

function packageRoot(name: string): string {
  return dirname(require.resolve(`${name}/package.json`))
}

async function linkPackage(
  nodeModules: string,
  name: string,
  target: string,
): Promise<void> {
  const destination = join(nodeModules, ...name.split("/"))
  await mkdir(dirname(destination), { recursive: true })
  await symlink(target, destination, "dir")
}

const providerSource = String.raw`
import { LlmAdapter } from "@deepseek-ai/dsh-llm"
import { fixtureDependency } from "fixture-dependency"
import { fixtureImplementation } from "./implementation.js"

void fixtureDependency
void fixtureImplementation

export const name = "fixture-provider"
export const inject = ["llm"]
export const Config = {
  "~standard": {
    version: 1,
    vendor: "maximal-fixture",
    validate(value) {
      if (value?.reject === true) return { issues: [{ message: "fixture rejected" }] }
      return { value: value ?? {} }
    },
  },
}
export const state = { active: 0, calls: 0, aborted: 0, finalized: 0, streamYields: 0 }

class Adapter extends LlmAdapter {
  constructor(config) {
    super()
    this.config = config
  }
  providerInfo(provider) { return { id: provider, name: "Fixture Provider" } }
  async listModels(provider) { return [{ provider, id: "fixture-model", name: "Fixture Model" }] }
  async resolveModel(provider, model) {
    return {
      provider,
      id: model,
      name: model,
      reasoning: {
        efforts: [
          { id: "off", name: "Off" },
          { id: "high", name: "High" },
        ],
      },
    }
  }
  async *stream(options) {
    state.calls += 1
    if (this.config.wait === true) {
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 1000)
        options.signal?.addEventListener("abort", () => {
          clearTimeout(timer)
          state.aborted += 1
          resolve()
        }, { once: true })
      })
      if (options.signal?.aborted) {
        yield { type: "usage", usage: { inputTokens: 0, outputTokens: 0 } }
        yield { type: "finish", reason: { kind: "aborted", failure: { code: "ABORTED", message: "fixture detail" } } }
        return
      }
    }
    if (this.config.mode === "error-finally") {
      try {
        yield { type: "finish", reason: { kind: "error", failure: { code: "AUTH_FAILED", message: "fixture provider secret", status: 401 } } }
      } finally {
        state.finalized += 1
      }
      return
    }
    if (this.config.mode === "aborted-finally") {
      try {
        yield { type: "finish", reason: { kind: "aborted", failure: { code: "ABORTED", message: "fixture provider secret" } } }
      } finally {
        state.finalized += 1
      }
      return
    }
    if (this.config.mode === "protocol-finally") {
      try {
        yield { type: "fixture-extension" }
      } finally {
        state.finalized += 1
      }
      return
    }
    if (this.config.mode === "error-no-usage") {
      yield { type: "finish", reason: { kind: "error", failure: { code: "AUTH_FAILED", message: "fixture provider secret", status: 401 } } }
      return
    }
    if (this.config.mode === "aborted-no-usage") {
      yield { type: "finish", reason: { kind: "aborted", failure: { code: "ABORTED", message: "fixture provider secret" } } }
      return
    }
    if (this.config.mode === "incremental") {
      state.streamYields += 1
      yield { type: "block-start", index: 0, blockType: "text" }
      state.streamYields += 1
      yield { type: "text-delta", index: 0, text: "first" }
      await new Promise((resolve) => {
        options.signal?.addEventListener("abort", () => {
          state.aborted += 1
          resolve()
        }, { once: true })
      })
      if (options.signal?.aborted) return
      state.streamYields += 1
      yield { type: "text-delta", index: 0, text: "second" }
      state.streamYields += 1
      yield { type: "block-end", index: 0, block: { type: "text", text: "firstsecond" } }
      yield { type: "usage", usage: { inputTokens: 11, outputTokens: 4, cacheReadTokens: 3 } }
      yield { type: "finish", reason: { kind: "stop" } }
      return
    }
    if (this.config.mode === "reasoning") {
      yield { type: "block-start", index: 0, blockType: "reasoning" }
      yield { type: "reasoning-delta", index: 0, text: "considering" }
      yield { type: "block-end", index: 0, block: { type: "reasoning", text: "considering" } }
      yield { type: "usage", usage: { inputTokens: 7, outputTokens: 3 } }
      yield {
        type: "finish",
        reason: { kind: "stop" },
        replayState: {
          type: "anthropic-message-v1",
          content: [{ type: "thinking", thinking: "considering", signature: "signed-fixture" }],
        },
      }
      return
    }
    if (this.config.mode === "unknown-chunk") {
      yield { type: "fixture-extension" }
      yield { type: "usage", usage: { inputTokens: 0, outputTokens: 0 } }
      yield { type: "finish", reason: { kind: "stop" } }
      return
    }
    if (this.config.mode === "tool-delayed-name") {
      yield { type: "block-start", index: 0, blockType: "tool-call" }
      yield { type: "tool-call-delta", index: 0, id: "call_fixture", argumentsDelta: "{\"q\":" }
      yield { type: "tool-call-delta", index: 0, id: "call_fixture", name: "lookup", argumentsDelta: "\"ok\"}" }
      yield { type: "block-end", index: 0, block: { type: "tool-call", id: "call_fixture", name: "lookup", arguments: "{\"q\":\"ok\"}" } }
      yield { type: "usage", usage: { inputTokens: 7, outputTokens: 3 } }
      yield { type: "finish", reason: { kind: "tool-calls" } }
      return
    }
    if (this.config.mode === "tool") {
      yield { type: "block-start", index: 0, blockType: "tool-call" }
      yield { type: "tool-call-delta", index: 0, id: "call_fixture", name: "lookup", argumentsDelta: "{\"q\":\"ok\"}" }
      yield { type: "block-end", index: 0, block: { type: "tool-call", id: "call_fixture", name: "lookup", arguments: "{\"q\":\"ok\"}" } }
      yield { type: "usage", usage: { inputTokens: 7, outputTokens: 3, cacheReadTokens: 2, cacheWriteTokens: 4 } }
      yield { type: "finish", reason: { kind: "tool-calls" } }
      return
    }
    const summary = this.config.echo === true
      ? JSON.stringify({
          system: options.system,
          content: options.messages.flatMap(message => message.content.map(block => block.type)),
          replayStates: options.messages.filter(message => message.role === "assistant").map(message => message.source.replayState),
          tools: options.tools,
          reasoningEffort: options.reasoningEffort,
          maxTokens: options.maxTokens,
          stop: options.stop,
        })
      : String(this.config.text ?? "fixture")
    yield { type: "block-start", index: 0, blockType: "text" }
    yield { type: "text-delta", index: 0, text: summary }
    yield { type: "block-end", index: 0, block: { type: "text", text: summary } }
    yield { type: "usage", usage: { inputTokens: 5, outputTokens: 2 } }
    yield { type: "finish", reason: { kind: "stop" } }
  }
}

export async function apply(ctx, config) {
  if (typeof config.activationDelayMs === "number")
    await new Promise((resolve) => setTimeout(resolve, config.activationDelayMs))
  if (config.disposeReject === true)
    ctx.logger.error = () => { throw new Error("fixture logger secret") }
  ctx.effect(() => {
    state.active += 1
    return () => {
      state.active -= 1
      if (config.disposeReject === true)
        throw new Error("fixture disposal secret")
    }
  })
  const adapter = new Adapter(config)
  ctx.llm.registerAdapter([config.provider ?? "fixture"], adapter)
}
`

export async function createFixtureProfile(): Promise<FixtureProfile> {
  const directory = await mkdtemp(join(tmpdir(), "maximal-dsh-profile-"))
  const nodeModules = join(directory, "node_modules")
  await mkdir(nodeModules, { recursive: true })
  const cordisRoot = packageRoot("@deepseek-ai/cordis")
  const llmRoot = packageRoot("@deepseek-ai/dsh-llm")
  await linkPackage(nodeModules, "@deepseek-ai/cordis", cordisRoot)
  await linkPackage(nodeModules, "@deepseek-ai/dsh-llm", llmRoot)
  for (const peer of [
    "@deepseek-ai/dsh-attachment",
    "@deepseek-ai/dsh-brand",
    "@deepseek-ai/dsh-invariants",
    "@deepseek-ai/dsh-timeout",
    "@deepseek-ai/schemastery",
  ]) {
    await linkPackage(nodeModules, peer, packageRoot(peer))
  }
  const dependencyRoot = join(nodeModules, "fixture-dependency")
  await mkdir(dependencyRoot, { recursive: true })
  const dependencyEntry = join(dependencyRoot, "index.js")
  await writeFile(
    join(dependencyRoot, "package.json"),
    JSON.stringify({
      name: "fixture-dependency",
      version: "1.0.0",
      type: "module",
      exports: {
        ".": { import: "./index.js" },
        "./package.json": "./package.json",
      },
    }),
  )
  await writeFile(dependencyEntry, "export const fixtureDependency = true\n")
  const pluginRoot = join(nodeModules, "fixture-provider")
  await mkdir(pluginRoot, { recursive: true })
  const pluginPackageJson = join(pluginRoot, "package.json")
  const pluginEntry = join(pluginRoot, "index.js")
  const pluginImplementation = join(pluginRoot, "implementation.js")
  await writeFile(
    pluginImplementation,
    "export const fixtureImplementation = true\n",
  )
  await writeFile(
    pluginPackageJson,
    JSON.stringify({
      name: "fixture-provider",
      version: "1.0.0",
      type: "module",
      exports: {
        ".": { import: "./index.js" },
        "./package.json": "./package.json",
      },
      dependencies: {
        "@deepseek-ai/cordis": "4.0.1",
        "@deepseek-ai/dsh-llm": "0.1.0-rc.6",
        "@deepseek-ai/schemastery": "3.18.1",
        "fixture-dependency": "1.0.0",
      },
    }),
  )
  await writeFile(pluginEntry, providerSource)
  await writeFile(
    join(directory, "package.json"),
    JSON.stringify({
      name: "fixture-profile",
      version: "1.0.0",
      private: true,
      type: "module",
      dependencies: {
        "@deepseek-ai/cordis": "4.0.1",
        "@deepseek-ai/dsh-llm": "0.1.0-rc.6",
        "fixture-provider": "1.0.0",
      },
    }),
  )
  const writeProviders = async (value: unknown): Promise<void> => {
    await writeFile(join(directory, "providers.json"), JSON.stringify(value))
  }
  await writeProviders({
    schemaVersion: 1,
    runtime: { cordis: "@deepseek-ai/cordis", llm: "@deepseek-ai/dsh-llm" },
    services: [],
    plugins: [
      { id: "fixture", package: "fixture-provider", providers: ["fixture"] },
    ],
  })
  return {
    dependencyEntry,
    directory,
    pluginEntry,
    pluginImplementation,
    pluginPackageJson,
    writeProviders,
  }
}

interface FixtureState {
  readonly aborted: number
  readonly active: number
  readonly calls: number
  readonly finalized: number
  readonly streamYields: number
}

export async function fixtureState(entry: string): Promise<FixtureState> {
  const namespace: unknown = await import(pathToFileURL(entry).href)
  if (
    namespace === null
    || typeof namespace !== "object"
    || !("state" in namespace)
  ) {
    throw new TypeError("Fixture provider did not export state.")
  }
  return namespace.state as FixtureState
}

export async function mutatePlugin(entry: string): Promise<void> {
  const source = await readFile(entry, "utf8")
  await writeFile(entry, `${source}\n// changed\n`)
}
