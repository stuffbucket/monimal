import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import process from "node:process"

// Development-only profile: reuse reviewed, already installed workspace artifacts.
// No registry resolution, package installation, model download, or config mutation.
const require = createRequire(import.meta.url)
const runtimeRequire = createRequire(
  require.resolve("@deepseek-ai/dsh-llm/package.json"),
)
const providers = process.argv.slice(2)
if (
  providers.length === 0
  || providers.some((provider) => !/^[A-Z0-9][\w.-]*$/i.test(provider))
) {
  throw new Error(
    "Usage: node examples/create-workspace-profile.mjs <provider> [provider...]",
  )
}
const directory = await mkdtemp(join(tmpdir(), "maximal-vllm-profile-"))
const dependencies = {}
for (const name of [
  "@deepseek-ai/cordis",
  "@deepseek-ai/dsh-attachment",
  "@deepseek-ai/dsh-brand",
  "@deepseek-ai/dsh-invariants",
  "@deepseek-ai/dsh-llm",
  "@deepseek-ai/dsh-timeout",
  "@deepseek-ai/schemastery",
  "@maximal/maximal-runtime-vllm",
]) {
  const resolver =
    name.startsWith("@deepseek-ai/dsh-") ? runtimeRequire : require
  const manifestPath = resolver.resolve(`${name}/package.json`)
  const manifest = resolver(manifestPath)
  dependencies[name] = manifest.version
  const destination = join(directory, "node_modules", ...name.split("/"))
  await mkdir(dirname(destination), { recursive: true, mode: 0o700 })
  await symlink(dirname(manifestPath), destination, "dir")
}
await writeFile(
  join(directory, "package.json"),
  JSON.stringify({
    private: true,
    type: "module",
    dependencies,
  }),
  { mode: 0o600 },
)
await writeFile(
  join(directory, "providers.json"),
  JSON.stringify({
    schemaVersion: 3,
    pluginApiVersion: 1,
    runtime: { cordis: "@deepseek-ai/cordis", llm: "@deepseek-ai/dsh-llm" },
    services: [],
    plugins: [
      {
        id: "vllm",
        kind: "provider",
        package: "@maximal/maximal-runtime-vllm",
        providers,
      },
    ],
  }),
  { mode: 0o600 },
)
process.stdout.write(`${JSON.stringify({ profileDirectory: directory })}\n`)
