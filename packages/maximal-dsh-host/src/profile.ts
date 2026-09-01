import { createHash } from "node:crypto"
import { readFile, readdir, realpath, stat } from "node:fs/promises"
import { createRequire } from "node:module"
import {
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path"
import { pathToFileURL } from "node:url"

export interface ActivationEntry {
  readonly enabled: boolean
  readonly config?: unknown
}

export type ActivationSnapshot = Readonly<Record<string, ActivationEntry>>

export interface ActivationSource {
  snapshot(): ActivationSnapshot | Promise<ActivationSnapshot>
  subscribe?(listener: (snapshot?: ActivationSnapshot) => void): () => void
}

export interface ProfileService {
  readonly id: string
  readonly package: string
  readonly config?: unknown
}

export interface ProfilePlugin {
  readonly id: string
  readonly package: string
  readonly providers?: ReadonlyArray<string>
}

export interface ExternalProfileDocument {
  readonly schemaVersion: 1
  readonly runtime: {
    readonly cordis: string
    readonly llm: string
  }
  readonly services: ReadonlyArray<ProfileService>
  readonly plugins: ReadonlyArray<ProfilePlugin>
}

export const PROFILE_VALIDATION_FAILURE_REASONS = Object.freeze([
  "profile-invalid",
  "dependency-unavailable",
  "package-entry-unavailable",
  "module-namespace-unavailable",
] as const)

export type ProfileValidationFailureReason =
  (typeof PROFILE_VALIDATION_FAILURE_REASONS)[number]

const profileValidationFailureReasons = new WeakMap<
  ProfileValidationError,
  ProfileValidationFailureReason
>()

export class ProfileValidationError extends Error {
  readonly code = "PROFILE_INVALID"

  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = "ProfileValidationError"
    profileValidationFailureReasons.set(this, "profile-invalid")
  }
}

export function profileValidationFailure(
  reason: ProfileValidationFailureReason,
  message: string,
  options?: ErrorOptions,
): ProfileValidationError {
  const error = new ProfileValidationError(message, options)
  profileValidationFailureReasons.set(error, reason)
  return error
}

export function profileValidationFailureReason(
  error: ProfileValidationError,
): ProfileValidationFailureReason {
  return profileValidationFailureReasons.get(error) ?? "profile-invalid"
}

export class RestartRequiredError extends Error {
  readonly code = "RESTART_REQUIRED"

  constructor(message: string) {
    super(message)
    this.name = "RestartRequiredError"
  }
}

export interface ResolvedPackage {
  readonly name: string
  readonly version: string
  readonly rootPath: string
  readonly packageJsonPath: string
  readonly entryPath: string
  readonly entryUrl: string
  readonly fingerprint: string
}

export interface ResolvedService extends ProfileService {
  readonly module: ResolvedPackage
}

export interface ResolvedPlugin extends ProfilePlugin {
  readonly module: ResolvedPackage
}

export interface ResolvedProfile {
  readonly directory: string
  readonly packageJsonPath: string
  readonly document: ExternalProfileDocument
  readonly cordis: ResolvedPackage
  readonly llm: ResolvedPackage
  readonly services: ReadonlyArray<ResolvedService>
  readonly plugins: ReadonlyArray<ResolvedPlugin>
}

const BARE_PACKAGE = /^(?:@[a-z0-9][\w.~-]*\/)?[a-z0-9][\w.~-]*$/i
const EXACT_VERSION =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Z-]+(?:\.[0-9A-Z-]+)*)?(?:\+[0-9A-Z-]+(?:\.[0-9A-Z-]+)*)?$/i

function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw profileValidationFailure(
      "profile-invalid",
      `${label} must be an object.`,
    )
  }
  return value as Record<string, unknown>
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw profileValidationFailure(
      "profile-invalid",
      `${label} must be a non-empty string.`,
    )
  }
  return value
}

function identifier(value: unknown, label: string): string {
  const result = nonEmptyString(value, label)
  if (!/^[a-z0-9][\w.-]*$/i.test(result)) {
    throw profileValidationFailure(
      "profile-invalid",
      `${label} is not a valid identifier.`,
    )
  }
  return result
}

function packageName(value: unknown, label: string): string {
  const result = nonEmptyString(value, label)
  if (!BARE_PACKAGE.test(result)) {
    throw profileValidationFailure(
      "profile-invalid",
      `${label} must be a bare package name.`,
    )
  }
  return result
}

function assertOnlyKeys(
  value: Record<string, unknown>,
  allowed: ReadonlyArray<string>,
  label: string,
): void {
  const allowedSet = new Set(allowed)
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key))
      throw profileValidationFailure(
        "profile-invalid",
        `${label} contains unknown field "${key}".`,
      )
  }
}

function parseService(value: unknown, index: number): ProfileService {
  const entry = object(value, `providers.json services[${index}]`)
  assertOnlyKeys(
    entry,
    ["id", "package", "config"],
    `providers.json services[${index}]`,
  )
  const id = identifier(entry.id, `providers.json services[${index}].id`)
  const pkg = packageName(
    entry.package,
    `providers.json services[${index}].package`,
  )
  return Object.freeze({
    id,
    package: pkg,
    ...(Object.hasOwn(entry, "config") ?
      { config: structuredClone(entry.config) }
    : {}),
  })
}

function parsePlugin(value: unknown, index: number): ProfilePlugin {
  const entry = object(value, `providers.json plugins[${index}]`)
  assertOnlyKeys(
    entry,
    ["id", "package", "providers"],
    `providers.json plugins[${index}]`,
  )
  const id = identifier(entry.id, `providers.json plugins[${index}].id`)
  const pkg = packageName(
    entry.package,
    `providers.json plugins[${index}].package`,
  )
  let providers: Array<string> | undefined
  if (entry.providers !== undefined) {
    if (!Array.isArray(entry.providers) || entry.providers.length === 0) {
      throw profileValidationFailure(
        "profile-invalid",
        `providers.json plugins[${index}].providers must be a non-empty array.`,
      )
    }
    providers = entry.providers.map((provider, providerIndex) =>
      identifier(
        provider,
        `providers.json plugins[${index}].providers[${providerIndex}]`,
      ),
    )
    if (new Set(providers).size !== providers.length) {
      throw profileValidationFailure(
        "profile-invalid",
        `providers.json plugins[${index}].providers contains a duplicate.`,
      )
    }
  }
  return Object.freeze({
    id,
    package: pkg,
    ...(providers === undefined ? {} : { providers: Object.freeze(providers) }),
  })
}

function parseDocument(raw: unknown): ExternalProfileDocument {
  const document = object(raw, "providers.json")
  assertOnlyKeys(
    document,
    ["schemaVersion", "runtime", "services", "plugins"],
    "providers.json",
  )
  if (document.schemaVersion !== 1)
    throw profileValidationFailure(
      "profile-invalid",
      "providers.json schemaVersion must be 1.",
    )
  const runtime = object(document.runtime, "providers.json runtime")
  assertOnlyKeys(runtime, ["cordis", "llm"], "providers.json runtime")
  const cordis = packageName(runtime.cordis, "providers.json runtime.cordis")
  const llm = packageName(runtime.llm, "providers.json runtime.llm")
  if (cordis === llm)
    throw profileValidationFailure(
      "profile-invalid",
      "Cordis and the LLM runtime must be different packages.",
    )
  if (!Array.isArray(document.services))
    throw profileValidationFailure(
      "profile-invalid",
      "providers.json services must be an array.",
    )
  if (!Array.isArray(document.plugins))
    throw profileValidationFailure(
      "profile-invalid",
      "providers.json plugins must be an array.",
    )
  const services = document.services.map((service, index) =>
    parseService(service, index),
  )
  const plugins = document.plugins.map((plugin, index) =>
    parsePlugin(plugin, index),
  )
  const ids = new Set<string>()
  for (const entry of [...services, ...plugins]) {
    if (ids.has(entry.id))
      throw profileValidationFailure(
        "profile-invalid",
        `Duplicate profile entry id "${entry.id}".`,
      )
    ids.add(entry.id)
  }
  const expectedProviders = new Set<string>()
  for (const plugin of plugins) {
    for (const provider of plugin.providers ?? [plugin.id]) {
      if (expectedProviders.has(provider))
        throw profileValidationFailure(
          "profile-invalid",
          `Duplicate declared provider "${provider}".`,
        )
      expectedProviders.add(provider)
    }
  }
  return Object.freeze({
    schemaVersion: 1,
    runtime: Object.freeze({ cordis, llm }),
    services: Object.freeze(services),
    plugins: Object.freeze(plugins),
  })
}

function isWithin(parent: string, child: string): boolean {
  const path = relative(parent, child)
  return (
    path === ""
    || (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path))
  )
}

async function stableFile(
  path: string,
  containmentRoot?: string,
  reason: ProfileValidationFailureReason = "profile-invalid",
): Promise<{ path: string; bytes: Buffer }> {
  const resolved = await realpath(path).catch((cause: unknown) => {
    throw profileValidationFailure(
      reason,
      `Required file "${path}" is missing.`,
      { cause },
    )
  })
  if (containmentRoot !== undefined && !isWithin(containmentRoot, resolved)) {
    throw profileValidationFailure(
      reason,
      `Required file "${path}" escapes its containing directory.`,
    )
  }
  try {
    const before = await stat(resolved)
    if (!before.isFile())
      throw profileValidationFailure(
        reason,
        `Required path "${path}" is not a regular file.`,
      )
    const bytes = await readFile(resolved)
    const after = await stat(resolved)
    if (
      before.dev !== after.dev
      || before.ino !== after.ino
      || before.size !== after.size
      || before.mtimeMs !== after.mtimeMs
      || before.ctimeMs !== after.ctimeMs
    ) {
      throw profileValidationFailure(
        reason,
        `Required file "${path}" changed while it was being read.`,
      )
    }
    return { path: resolved, bytes }
  } catch (cause) {
    if (cause instanceof ProfileValidationError) throw cause
    throw profileValidationFailure(
      reason,
      `Required file "${path}" could not be read.`,
      { cause },
    )
  }
}

function parseJson(bytes: Buffer, label: string): unknown {
  try {
    return JSON.parse(bytes.toString("utf8")) as unknown
  } catch (cause) {
    throw profileValidationFailure(
      "profile-invalid",
      `${label} is not valid JSON.`,
      { cause },
    )
  }
}

function entryTarget(exportsValue: unknown): string | undefined {
  if (typeof exportsValue === "string") return exportsValue
  if (Array.isArray(exportsValue)) {
    for (const candidate of exportsValue) {
      const target = entryTarget(candidate)
      if (target !== undefined) return target
    }
    return undefined
  }
  if (exportsValue === null || typeof exportsValue !== "object")
    return undefined
  const entries = Object.entries(exportsValue as Record<string, unknown>)
  const root = entries.find(([key]) => key === ".")
  if (root !== undefined) return entryTarget(root[1])
  for (const [condition, candidate] of entries) {
    if (
      condition === "import"
      || condition === "node"
      || condition === "default"
    ) {
      const target = entryTarget(candidate)
      if (target !== undefined) return target
    }
  }
  return undefined
}

async function packageJsonPathFrom(
  profilePackageJson: string,
  name: string,
): Promise<string> {
  const require = createRequire(profilePackageJson)
  try {
    return require.resolve(`${name}/package.json`)
  } catch (packageJsonCause) {
    let entry: string
    try {
      entry = require.resolve(name)
    } catch (cause) {
      throw profileValidationFailure(
        "dependency-unavailable",
        `Direct dependency "${name}" cannot be resolved from the profile.`,
        { cause },
      )
    }
    let cursor = dirname(entry)
    while (true) {
      const candidate = join(cursor, "package.json")
      try {
        const packageFile = await stableFile(candidate)
        const manifest = object(
          parseJson(packageFile.bytes, `${name} package.json`),
          `${name} package.json`,
        )
        if (manifest.name === name) return packageFile.path
      } catch {
        // Keep walking to the package root. The original resolution error is retained below.
      }
      const parent = dirname(cursor)
      if (parent === cursor) break
      cursor = parent
    }
    throw profileValidationFailure(
      "dependency-unavailable",
      `Dependency "${name}" does not expose a package root.`,
      { cause: packageJsonCause },
    )
  }
}

async function packageFiles(
  rootPath: string,
  directory: string = rootPath,
): Promise<Array<{ bytes: Buffer; path: string }>> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(
    (cause: unknown) => {
      throw profileValidationFailure(
        "package-entry-unavailable",
        "Package contents could not be read.",
        { cause },
      )
    },
  )
  const files: Array<{ bytes: Buffer; path: string }> = []
  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    if (entry.name === "node_modules") continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await packageFiles(rootPath, path)))
      continue
    }
    if (!entry.isFile() && !entry.isSymbolicLink()) continue
    const file = await stableFile(path, rootPath, "package-entry-unavailable")
    files.push({ bytes: file.bytes, path: relative(rootPath, path) })
  }
  return files
}

function runtimeDependencies(
  manifest: Record<string, unknown>,
): Array<{ name: string; optional: boolean }> {
  const required = new Set<string>()
  const optional = new Set<string>()
  for (const name of Object.keys(
    (
      manifest.dependencies !== null
        && typeof manifest.dependencies === "object"
        && !Array.isArray(manifest.dependencies)
    ) ?
      manifest.dependencies
    : {},
  )) {
    required.add(name)
  }
  for (const section of [
    manifest.optionalDependencies,
    manifest.peerDependencies,
  ]) {
    if (
      section === null
      || typeof section !== "object"
      || Array.isArray(section)
    )
      continue
    for (const name of Object.keys(section)) {
      if (!required.has(name)) optional.add(name)
    }
  }
  return [
    ...[...required].sort().map((name) => ({ name, optional: false })),
    ...[...optional].sort().map((name) => ({ name, optional: true })),
  ]
}

async function fingerprintPackageGraph(
  packageJsonPath: string,
  ancestry: ReadonlySet<string>,
): Promise<string> {
  const packageFile = await stableFile(
    packageJsonPath,
    undefined,
    "package-entry-unavailable",
  )
  const rootPath = await realpath(dirname(packageFile.path)).catch(
    (cause: unknown) => {
      throw profileValidationFailure(
        "package-entry-unavailable",
        "Package root could not be read.",
        { cause },
      )
    },
  )
  const manifest = object(
    parseJson(packageFile.bytes, `${packageJsonPath} package.json`),
    `${packageJsonPath} package.json`,
  )
  const identity = `${String(manifest.name)}@${String(manifest.version)}`
  if (ancestry.has(rootPath))
    return createHash("sha256").update(`cycle:${identity}`).digest("hex")
  const nextAncestry = new Set(ancestry)
  nextAncestry.add(rootPath)
  const hash = createHash("sha256")
  for (const file of await packageFiles(rootPath)) {
    hash.update(file.path).update("\0").update(file.bytes).update("\0")
  }
  for (const dependency of runtimeDependencies(manifest)) {
    let dependencyPackageJson: string
    try {
      dependencyPackageJson = await packageJsonPathFrom(
        packageFile.path,
        dependency.name,
      )
    } catch (error) {
      if (dependency.optional) continue
      throw error
    }
    hash
      .update(`dependency:${dependency.name}\0`)
      .update(
        await fingerprintPackageGraph(dependencyPackageJson, nextAncestry),
      )
      .update("\0")
  }
  return hash.digest("hex")
}

export async function currentPackageFingerprint(
  module: Pick<ResolvedPackage, "packageJsonPath">,
): Promise<string> {
  return await fingerprintPackageGraph(module.packageJsonPath, new Set())
}

async function resolvePackage(
  profilePackageJson: string,
  name: string,
): Promise<ResolvedPackage> {
  const packageJsonCandidate = await packageJsonPathFrom(
    profilePackageJson,
    name,
  )
  const packageFile = await stableFile(
    packageJsonCandidate,
    undefined,
    "dependency-unavailable",
  )
  const rootPath = await realpath(dirname(packageFile.path)).catch(
    (cause: unknown) => {
      throw profileValidationFailure(
        "dependency-unavailable",
        `Package root for "${name}" could not be read.`,
        { cause },
      )
    },
  )
  if (!isWithin(rootPath, packageFile.path))
    throw profileValidationFailure(
      "profile-invalid",
      `Package metadata for "${name}" escapes its package root.`,
    )
  const manifest = object(
    parseJson(packageFile.bytes, `${name} package.json`),
    `${name} package.json`,
  )
  if (manifest.name !== name)
    throw profileValidationFailure(
      "profile-invalid",
      `Resolved dependency "${name}" has a different package identity.`,
    )
  const version = nonEmptyString(
    manifest.version,
    `${name} package.json version`,
  )
  let target = entryTarget(manifest.exports)
  target ??= typeof manifest.module === "string" ? manifest.module : undefined
  target ??= typeof manifest.main === "string" ? manifest.main : "index.js"
  if (!target.startsWith("./") && target !== "index.js") {
    throw profileValidationFailure(
      "profile-invalid",
      `Package "${name}" has a non-relative ESM entry.`,
    )
  }
  const entryCandidate = resolve(rootPath, target)
  const entryFile = await stableFile(
    entryCandidate,
    undefined,
    "package-entry-unavailable",
  )
  if (!isWithin(rootPath, entryFile.path))
    throw profileValidationFailure(
      "profile-invalid",
      `Package "${name}" entry escapes its package root.`,
    )
  const extension = extname(entryFile.path)
  const isEsm =
    extension === ".mjs" || (extension === ".js" && manifest.type === "module")
  if (!isEsm)
    throw profileValidationFailure(
      "package-entry-unavailable",
      `Package "${name}" does not resolve to an ESM entry.`,
    )
  const fingerprint = await currentPackageFingerprint({
    packageJsonPath: packageFile.path,
  })
  return Object.freeze({
    name,
    version,
    rootPath,
    packageJsonPath: packageFile.path,
    entryPath: entryFile.path,
    entryUrl: pathToFileURL(entryFile.path).href,
    fingerprint,
  })
}

async function resolvedDependencyRoot(
  owner: ResolvedPackage,
  dependency: string,
): Promise<string | undefined> {
  try {
    const path = await packageJsonPathFrom(owner.packageJsonPath, dependency)
    return await realpath(dirname(path))
  } catch (error) {
    if (!(error instanceof ProfileValidationError))
      throw profileValidationFailure(
        "package-entry-unavailable",
        "Dependency package root could not be read.",
        { cause: error },
      )
    if (profileValidationFailureReason(error) === "dependency-unavailable")
      return undefined
    throw error
  }
}

async function assertSharedRuntimeIdentity(
  owner: ResolvedPackage,
  cordis: ResolvedPackage,
  llm: ResolvedPackage,
): Promise<void> {
  const ownerCordis = await resolvedDependencyRoot(owner, cordis.name)
  if (ownerCordis !== undefined && ownerCordis !== cordis.rootPath) {
    throw profileValidationFailure(
      "profile-invalid",
      `Package "${owner.name}" resolves a duplicate Cordis runtime identity.`,
    )
  }
  const ownerLlm = await resolvedDependencyRoot(owner, llm.name)
  if (ownerLlm !== undefined && ownerLlm !== llm.rootPath) {
    throw profileValidationFailure(
      "profile-invalid",
      `Package "${owner.name}" resolves a duplicate LLM runtime identity.`,
    )
  }
}

// Profile resolution is kept as one ordered validation transaction.
// eslint-disable-next-line max-lines-per-function
export async function resolveExternalProfile(
  profileDirectory: string,
): Promise<ResolvedProfile> {
  if (!isAbsolute(profileDirectory))
    throw profileValidationFailure(
      "profile-invalid",
      "Profile directory must be an absolute path.",
    )
  const directory = await realpath(profileDirectory).catch((cause: unknown) => {
    throw profileValidationFailure(
      "profile-invalid",
      "Profile directory does not exist.",
      {
        cause,
      },
    )
  })
  const packageFile = await stableFile(
    join(directory, "package.json"),
    directory,
  )
  const packageManifest = object(
    parseJson(packageFile.bytes, "Profile package.json"),
    "Profile package.json",
  )
  const dependencies = object(
    packageManifest.dependencies,
    "Profile package.json dependencies",
  )
  for (const [name, version] of Object.entries(dependencies)) {
    packageName(name, `Profile dependency "${name}"`)
    if (typeof version !== "string" || !EXACT_VERSION.test(version)) {
      throw profileValidationFailure(
        "profile-invalid",
        `Profile dependency "${name}" must use an exact semantic version.`,
      )
    }
  }
  const providersFile = await stableFile(
    join(directory, "providers.json"),
    directory,
  )
  const document = parseDocument(
    parseJson(providersFile.bytes, "providers.json"),
  )
  const referenced = new Set([
    document.runtime.cordis,
    document.runtime.llm,
    ...document.services.map((service) => service.package),
    ...document.plugins.map((plugin) => plugin.package),
  ])
  for (const name of referenced) {
    if (!Object.hasOwn(dependencies, name)) {
      throw profileValidationFailure(
        "profile-invalid",
        `Package "${name}" is not a direct profile dependency.`,
      )
    }
  }
  const resolved = new Map<string, ResolvedPackage>()
  await Promise.all(
    [...referenced].map(async (name) => {
      const dependency = await resolvePackage(packageFile.path, name)
      if (dependencies[name] !== dependency.version) {
        throw profileValidationFailure(
          "profile-invalid",
          `Direct dependency "${name}" does not match its declared exact version.`,
        )
      }
      resolved.set(name, dependency)
    }),
  )
  const cordis = resolved.get(document.runtime.cordis)
  const llm = resolved.get(document.runtime.llm)
  if (cordis === undefined || llm === undefined)
    throw profileValidationFailure(
      "profile-invalid",
      "Runtime packages did not resolve.",
    )
  if (cordis.rootPath === llm.rootPath || cordis.entryPath === llm.entryPath) {
    throw profileValidationFailure(
      "profile-invalid",
      "Cordis and the LLM runtime resolve to a duplicate runtime identity.",
    )
  }
  const llmCordis = await resolvedDependencyRoot(llm, cordis.name)
  if (llmCordis === undefined || llmCordis !== cordis.rootPath) {
    throw profileValidationFailure(
      "profile-invalid",
      "The LLM package does not resolve the profile Cordis runtime identity.",
    )
  }
  const resolvedModule = (name: string): ResolvedPackage => {
    const module = resolved.get(name)
    if (module === undefined)
      throw profileValidationFailure(
        "profile-invalid",
        `Package "${name}" did not resolve.`,
      )
    return module
  }
  const services = document.services.map((service) =>
    Object.freeze({ ...service, module: resolvedModule(service.package) }),
  )
  const plugins = document.plugins.map((plugin) =>
    Object.freeze({ ...plugin, module: resolvedModule(plugin.package) }),
  )
  for (const entry of [...services, ...plugins])
    await assertSharedRuntimeIdentity(entry.module, cordis, llm)
  return Object.freeze({
    directory,
    packageJsonPath: packageFile.path,
    document,
    cordis,
    llm,
    services: Object.freeze(services),
    plugins: Object.freeze(plugins),
  })
}

export function cloneActivation(
  snapshot: ActivationSnapshot,
): ActivationSnapshot {
  const input = object(snapshot, "Activation snapshot")
  const result: Record<string, ActivationEntry> = {}
  for (const [id, value] of Object.entries(input)) {
    identifier(id, `Activation key "${id}"`)
    const entry = object(value, `Activation entry "${id}"`)
    assertOnlyKeys(entry, ["enabled", "config"], `Activation entry "${id}"`)
    if (typeof entry.enabled !== "boolean")
      throw profileValidationFailure(
        "profile-invalid",
        `Activation entry "${id}" enabled must be boolean.`,
      )
    result[id] = Object.freeze({
      enabled: entry.enabled,
      ...(Object.hasOwn(entry, "config") ?
        { config: structuredClone(entry.config) }
      : {}),
    })
  }
  return Object.freeze(result)
}
