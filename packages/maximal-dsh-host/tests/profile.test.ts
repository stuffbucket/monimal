import assert from "node:assert/strict"
import { chmod, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { join } from "node:path"
import test from "node:test"

import { createCordisRuntime } from "../src/cordis-runtime.ts"
import { createDshHost, startDshHost } from "../src/index.ts"
import {
  PROFILE_VALIDATION_FAILURE_REASONS,
  ProfileValidationError,
  profileValidationFailure,
  resolveExternalProfile,
  type ProfileValidationFailureReason,
} from "../src/profile.ts"
import { createFixtureProfile, fixtureState, mutatePlugin } from "./fixture.ts"

async function updatePluginManifest(
  path: string,
  update: Record<string, unknown>,
): Promise<void> {
  const manifest = JSON.parse(await readFile(path, "utf8")) as Record<
    string,
    unknown
  >
  await writeFile(path, JSON.stringify({ ...manifest, ...update }))
}

function assertPublicDiagnostic(
  diagnostic: { readonly code: string; readonly message: string } | undefined,
  code: string,
  message: string,
): void {
  assert.deepEqual(diagnostic, { code, message })
  assert.ok(message.length <= 128)
  assert.doesNotMatch(
    message,
    /cannot be resolved|did not expose|does not expose|secret|[/\\]/iu,
  )
}

async function isReadable(path: string): Promise<boolean> {
  try {
    await readFile(path)
    return true
  } catch {
    return false
  }
}

void test("profile accepts only declared bare exact dependencies", async () => {
  const fixture = await createFixtureProfile()
  await fixture.writeProviders({
    schemaVersion: 1,
    runtime: { cordis: "../cordis", llm: "@deepseek-ai/dsh-llm" },
    services: [],
    plugins: [],
  })
  await assert.rejects(
    resolveExternalProfile(fixture.directory),
    /bare package name/,
  )

  await fixture.writeProviders({
    schemaVersion: 1,
    runtime: { cordis: "@deepseek-ai/cordis", llm: "@deepseek-ai/dsh-llm" },
    services: [],
    plugins: [{ id: "missing", package: "not-declared" }],
  })
  await assert.rejects(
    resolveExternalProfile(fixture.directory),
    /not a direct profile dependency/,
  )

  const manifestPath = join(fixture.directory, "package.json")
  await writeFile(
    manifestPath,
    JSON.stringify({
      name: "fixture-profile",
      version: "1.0.0",
      dependencies: {
        "@deepseek-ai/cordis": "^4.0.1",
        "@deepseek-ai/dsh-llm": "0.1.0-rc.6",
      },
    }),
  )
  await assert.rejects(
    resolveExternalProfile(fixture.directory),
    /exact semantic version/,
  )
})

void test("missing package entries publish redacted load failures and preserve the LKG", async () => {
  const fixture = await createFixtureProfile()
  const host = await startDshHost({
    profileDirectory: fixture.directory,
    activation: { fixture: { enabled: true, config: { text: "old" } } },
    reconcileDebounceMs: 0,
  })
  await updatePluginManifest(fixture.pluginPackageJson, {
    exports: {
      ".": { import: "./missing-cannot be resolved-secret.js" },
      "./package.json": "./package.json",
    },
  })
  const result = await host.reconcile()
  assert.equal(result.committed, false)
  assertPublicDiagnostic(
    result.diagnostics[0],
    "provider-load-failed",
    "An external provider package entry could not be loaded.",
  )
  assert.equal(host.getStatus("fixture")?.state, "available")
  assert.equal((await fixtureState(fixture.pluginEntry)).active, 1)
  await host.dispose()
})

void test("CommonJS package entries publish redacted load failures", async () => {
  const fixture = await createFixtureProfile()
  await updatePluginManifest(fixture.pluginPackageJson, { type: "commonjs" })
  const host = createDshHost({
    profileDirectory: fixture.directory,
    activation: { fixture: { enabled: true } },
    reconcileDebounceMs: 0,
  })
  const result = await host.reconcile()
  assert.equal(result.committed, false)
  assertPublicDiagnostic(
    result.diagnostics[0],
    "provider-load-failed",
    "An external provider package entry could not be loaded.",
  )
  await host.dispose()
})

void test("unreadable profile documents remain typed profile failures", async (context) => {
  const fixture = await createFixtureProfile()
  const providersPath = join(fixture.directory, "providers.json")
  await chmod(providersPath, 0o000)
  try {
    if (await isReadable(providersPath)) {
      context.skip("The current user can read mode-000 files.")
      return
    }
    const host = createDshHost({
      profileDirectory: fixture.directory,
      activation: { fixture: { enabled: true } },
      reconcileDebounceMs: 0,
    })
    const result = await host.reconcile()
    assert.equal(result.committed, false)
    assertPublicDiagnostic(
      result.diagnostics[0],
      "provider-invalid",
      "The external provider profile is invalid.",
    )
    await host.dispose()
  } finally {
    await chmod(providersPath, 0o600)
  }
})

void test("unreadable package files remain typed load failures", async (context) => {
  const fixture = await createFixtureProfile()
  await chmod(fixture.pluginImplementation, 0o000)
  try {
    if (await isReadable(fixture.pluginImplementation)) {
      context.skip("The current user can read mode-000 files.")
      return
    }
    const host = createDshHost({
      profileDirectory: fixture.directory,
      activation: { fixture: { enabled: true } },
      reconcileDebounceMs: 0,
    })
    const result = await host.reconcile()
    assert.equal(result.committed, false)
    assertPublicDiagnostic(
      result.diagnostics[0],
      "provider-load-failed",
      "An external provider package entry could not be loaded.",
    )
    await host.dispose()
  } finally {
    await chmod(fixture.pluginImplementation, 0o600)
  }
})

void test("dynamic import failures publish redacted load failures and preserve the LKG", async () => {
  const failures = [
    {
      name: "syntax error",
      source: "export const broken =",
    },
    {
      name: "top-level throw",
      source: 'throw new Error("top-level /private/secret")',
    },
    {
      name: "missing transitive import",
      source: 'import "./missing-private-secret.mjs"',
    },
  ]

  for (const failure of failures) {
    const fixture = await createFixtureProfile()
    const host = await startDshHost({
      profileDirectory: fixture.directory,
      activation: { fixture: { enabled: false } },
      reconcileDebounceMs: 0,
    })
    try {
      await writeFile(fixture.pluginEntry, failure.source)
      const result = await host.reconcile({
        activation: { fixture: { enabled: true } },
      })
      assert.equal(result.committed, false, failure.name)
      assertPublicDiagnostic(
        result.diagnostics[0],
        "provider-load-failed",
        "An external provider module could not be loaded.",
      )
      assert.equal(host.getStatus("fixture")?.state, "disabled", failure.name)
    } finally {
      await host.dispose()
    }
  }
})

void test("provider status diagnostics redact declared and runtime identifiers", async () => {
  const fixture = await createFixtureProfile()
  const declaredProvider = `declared.${"long.".repeat(80)}id`
  const runtimeProvider = `/private/${"runtime/".repeat(80)}id`
  await fixture.writeProviders({
    schemaVersion: 1,
    runtime: { cordis: "@deepseek-ai/cordis", llm: "@deepseek-ai/dsh-llm" },
    services: [],
    plugins: [
      {
        id: "fixture",
        package: "fixture-provider",
        providers: [declaredProvider],
      },
    ],
  })
  const host = await startDshHost({
    profileDirectory: fixture.directory,
    activation: { fixture: { enabled: false } },
    reconcileDebounceMs: 0,
  })
  assert.deepEqual(host.getStatus(declaredProvider)?.diagnostics, [
    {
      code: "provider-disabled",
      provider: declaredProvider,
      message: "A declared provider is disabled.",
    },
  ])

  const enabled = await host.reconcile({
    activation: {
      fixture: { enabled: true, config: { provider: runtimeProvider } },
    },
  })
  assert.equal(enabled.committed, true)
  assert.equal(host.getStatus(runtimeProvider)?.state, "available")
  assert.deepEqual(host.getStatus(declaredProvider)?.diagnostics, [
    {
      code: "provider-unavailable",
      provider: declaredProvider,
      message: "A declared provider did not register an adapter.",
    },
  ])
  await fixture.writeProviders({
    schemaVersion: 1,
    runtime: { cordis: "@deepseek-ai/cordis", llm: "@deepseek-ai/dsh-llm" },
    services: [],
    plugins: [],
  })
  const removed = await host.reconcile()
  assert.equal(removed.committed, true)
  assert.deepEqual(host.getStatus(runtimeProvider)?.diagnostics, [
    {
      code: "provider-unavailable",
      provider: runtimeProvider,
      message: "A provider is no longer declared by the external profile.",
    },
  ])
  await host.dispose()
})

void test("external ProfileValidationError callers retain constructor compatibility without message classification", async () => {
  const fixture = await createFixtureProfile()
  const cause = new Error("cause secret")
  const injected = new ProfileValidationError(
    "cannot be resolved; does not expose; did not expose /private/secret",
    { cause },
  )
  assert.equal(injected.cause, cause)
  const host = createDshHost({
    profileDirectory: fixture.directory,
    activation: {
      snapshot: () => {
        throw injected
      },
    },
    reconcileDebounceMs: 0,
  })
  const result = await host.reconcile()
  assert.equal(result.committed, false)
  assertPublicDiagnostic(
    result.diagnostics[0],
    "provider-invalid",
    "The external provider profile is invalid.",
  )
  await host.dispose()
})

void test("typed profile failure reasons map exhaustively to stable public diagnostics", async () => {
  const expected = {
    "profile-invalid": {
      code: "provider-invalid",
      message: "The external provider profile is invalid.",
    },
    "dependency-unavailable": {
      code: "provider-load-failed",
      message: "An external provider dependency could not be loaded.",
    },
    "package-entry-unavailable": {
      code: "provider-load-failed",
      message: "An external provider package entry could not be loaded.",
    },
    "module-namespace-unavailable": {
      code: "provider-load-failed",
      message: "An external provider module could not be loaded.",
    },
  } as const satisfies Record<
    ProfileValidationFailureReason,
    { readonly code: string; readonly message: string }
  >
  const fixture = await createFixtureProfile()
  const host = await startDshHost({
    profileDirectory: fixture.directory,
    activation: { fixture: { enabled: true } },
    reconcileDebounceMs: 0,
  })
  for (const reason of PROFILE_VALIDATION_FAILURE_REASONS) {
    const result = await host.reconcile({
      activation: {
        snapshot: () => {
          throw profileValidationFailure(
            reason,
            `cannot be resolved /private/${reason}/secret`,
          )
        },
      },
    })
    assert.equal(result.committed, false)
    assertPublicDiagnostic(
      result.diagnostics[0],
      expected[reason].code,
      expected[reason].message,
    )
    assert.equal(host.getStatus("fixture")?.state, "available")
  }
  assert.equal((await fixtureState(fixture.pluginEntry)).active, 1)
  await host.dispose()
})

void test("profile metadata cannot escape through a symlink", async () => {
  const fixture = await createFixtureProfile()
  const providers = join(fixture.directory, "providers.json")
  const outside = join(fixture.directory, "..", `outside-${Date.now()}.json`)
  await writeFile(outside, JSON.stringify({ schemaVersion: 1 }))
  await rm(providers)
  await symlink(outside, providers)
  await assert.rejects(
    resolveExternalProfile(fixture.directory),
    /escapes its containing directory/,
  )
  await rm(outside)
})

void test("module shape accepts a callable Standard Schema Config", async () => {
  const fixture = await createFixtureProfile()
  await writeFile(
    fixture.pluginEntry,
    `
import Schema from "@deepseek-ai/schemastery"
export const name = "callable-config"
export const inject = ["llm"]
export const Config = Schema.object({})
export function apply() {}
`,
  )
  const runtime = await createCordisRuntime(
    await resolveExternalProfile(fixture.directory),
    { fixture: { enabled: true, config: {} } },
  )
  await runtime.dispose()
})

void test("module shape rejects invalid Standard Schema Configs", async () => {
  for (const configDeclaration of [
    "",
    "export const Config = null",
    "export const Config = 1",
    "export const Config = { '~standard': {} }",
  ]) {
    const fixture = await createFixtureProfile()
    await writeFile(
      fixture.pluginEntry,
      `
export const name = "invalid-config"
export const inject = ["llm"]
${configDeclaration}
export function apply() {}
`,
    )
    const host = createDshHost({
      profileDirectory: fixture.directory,
      activation: { fixture: { enabled: true, config: {} } },
      reconcileDebounceMs: 0,
    })
    const result = await host.reconcile()
    assert.equal(result.committed, false)
    assertPublicDiagnostic(
      result.diagnostics[0],
      "provider-invalid",
      "The external provider profile is invalid.",
    )
    await host.dispose()
  }
})

void test("failed activation still records modules that entered the ESM cache", async () => {
  const fixture = await createFixtureProfile()
  const host = await startDshHost({
    profileDirectory: fixture.directory,
    activation: { fixture: { enabled: false } },
    reconcileDebounceMs: 0,
  })
  const failed = await host.reconcile({
    activation: { fixture: { enabled: true, config: { reject: true } } },
  })
  assert.equal(failed.committed, false)
  await mutatePlugin(fixture.pluginEntry)
  const changed = await host.reconcile({
    activation: { fixture: { enabled: true, config: {} } },
  })
  assert.equal(changed.committed, false)
  assert.equal(changed.restartRequired, true)
  await host.dispose()
})

void test("changed package implementation code requires restart", async () => {
  const fixture = await createFixtureProfile()
  const host = await startDshHost({
    profileDirectory: fixture.directory,
    activation: { fixture: { enabled: true, config: {} } },
  })
  await mutatePlugin(fixture.pluginImplementation)
  const result = await host.reconcile()
  assert.equal(result.committed, false)
  assert.equal(result.restartRequired, true)
  assert.equal(host.getStatus("fixture")?.state, "available")
  await host.dispose()
})

void test("changed transitive dependency code requires restart", async () => {
  const fixture = await createFixtureProfile()
  const host = await startDshHost({
    profileDirectory: fixture.directory,
    activation: { fixture: { enabled: true, config: {} } },
  })
  await mutatePlugin(fixture.dependencyEntry)
  const result = await host.reconcile()
  assert.equal(result.committed, false)
  assert.equal(result.restartRequired, true)
  assert.equal(host.getStatus("fixture")?.state, "available")
  await host.dispose()
})

void test("changed package code is restart-required and leaves the active generation", async () => {
  const fixture = await createFixtureProfile()
  const host = await startDshHost({
    profileDirectory: fixture.directory,
    activation: { fixture: { enabled: true, config: { text: "old" } } },
  })
  await mutatePlugin(fixture.pluginEntry)
  const result = await host.reconcile()
  assert.equal(result.committed, false)
  assert.equal(result.restartRequired, true)
  assert.match(result.diagnostics[0]?.message ?? "", /restart is required/)
  assert.equal(host.getStatus("fixture")?.state, "available")
  await host.dispose()
})
