import {
  loadSettings,
  resolveSettingsEnvironment,
  type SettingsOptions,
  type SettingsSnapshot,
} from "@stuffbucket/maximal-settings"
import assert from "node:assert/strict"
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { z } from "zod"

const schema = z.object({
  terminalDiagnostics: z.boolean().default(false),
  ui: z
    .object({
      theme: z.enum(["system", "light", "dark"]).optional(),
      menuBarOnly: z.boolean().optional(),
    })
    .optional(),
  count: z.number().int().nonnegative().optional(),
  tools: z.array(z.string()).optional(),
})

function write(filename: string, value: unknown) {
  mkdirSync(dirname(filename), { recursive: true })
  writeFileSync(filename, JSON.stringify(value))
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "maximal-settings-contract-"))
  const homeDirectory = join(root, "home")
  const cwd = join(root, "project")
  const xdg = join(root, "xdg")
  const userFile = join(xdg, "sample-app", "settings.json")
  const projectFile = join(cwd, ".sample-app", "settings.json")
  const options: SettingsOptions<z.output<typeof schema>> = {
    applicationName: "sample-app",
    environmentPrefix: "EXAMPLE",
    schema,
    homeDirectory,
    cwd,
    environment: { XDG_CONFIG_HOME: xdg },
  }
  return {
    root,
    homeDirectory,
    cwd,
    userFile,
    projectFile,
    write,
    options,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  }
}

void test("the built public export resolves every layer with provenance and no file writes", () => {
  const context = fixture()
  try {
    const legacy = join(context.root, "preferences.json")
    context.write(legacy, { count: 1, tools: ["legacy"] })
    context.write(context.userFile, {
      count: 2,
      ui: { theme: "dark" },
      tools: ["user"],
    })
    context.write(context.projectFile, {
      count: 3,
      ui: { menuBarOnly: true },
      tools: ["project"],
    })
    const before = readFileSync(context.userFile, "utf8")
    const options = {
      ...context.options,
      defaults: { count: 0 },
      legacyFiles: [legacy],
    }
    const snapshot: SettingsSnapshot<z.output<typeof schema>> = loadSettings({
      ...options,
      environment: { ...options.environment, EXAMPLE_COUNT: "4" },
      argv: [
        "start",
        "--other",
        "value",
        "--setting",
        "count=5",
        "--setting=terminalDiagnostics=true",
      ],
    })
    assert.deepEqual(snapshot.settings, {
      count: 5,
      terminalDiagnostics: true,
      ui: { theme: "dark", menuBarOnly: true },
      tools: ["project"],
    })
    assert.equal(snapshot.origins.count, "cli")
    assert.equal(snapshot.origins["ui.theme"], context.userFile)
    assert.equal(snapshot.origins["ui.menuBarOnly"], context.projectFile)
    assert.deepEqual(snapshot.remainingArgs, ["start", "--other", "value"])
    assert.deepEqual(snapshot.files, [
      legacy,
      context.userFile,
      context.projectFile,
    ])
    assert.equal(
      loadSettings({
        ...options,
        environment: { ...options.environment, EXAMPLE_COUNT: "4" },
      }).settings.count,
      4,
    )
    assert.equal(loadSettings(options).settings.count, 3)
    assert.equal(loadSettings({ ...options, project: false }).settings.count, 2)
    assert.equal(readFileSync(context.userFile, "utf8"), before)
    rmSync(context.userFile)
    assert.equal(loadSettings({ ...options, project: false }).settings.count, 1)
    assert.equal(
      loadSettings({
        ...context.options,
        project: false,
        defaults: { count: 0 },
      }).settings.count,
      0,
    )
    assert.deepEqual(JSON.parse(readFileSync(legacy, "utf8")), {
      count: 1,
      tools: ["legacy"],
    })
    assert.equal(Reflect.set(snapshot.settings.ui, "theme", "light"), false)
  } finally {
    context.cleanup()
  }
})

void test("XDG fallback, missing optional files, no global mutation, and fresh reads are deterministic", () => {
  const context = fixture()
  try {
    const userFile = join(
      context.homeDirectory,
      ".config",
      "sample-app",
      "settings.json",
    )
    context.write(userFile, { terminalDiagnostics: true })
    const options = {
      ...context.options,
      environment: { XDG_CONFIG_HOME: "relative-is-ignored" },
    }
    const cwd = process.cwd()
    assert.equal(loadSettings(options).settings.terminalDiagnostics, true)
    context.write(userFile, { terminalDiagnostics: false })
    assert.equal(loadSettings(options).settings.terminalDiagnostics, false)
    assert.equal(process.cwd(), cwd)
    assert.deepEqual(options.environment, {
      XDG_CONFIG_HOME: "relative-is-ignored",
    })
    rmSync(userFile)
    assert.deepEqual(loadSettings(options).settings, {
      terminalDiagnostics: false,
    })
    assert.deepEqual(loadSettings(options).origins, {
      terminalDiagnostics: "defaults",
    })
  } finally {
    context.cleanup()
  }
})

void test("invalid CLI values, duplicate paths, unknown paths, and invalid files fail without echoing values", () => {
  const context = fixture()
  try {
    for (const argv of [
      ["--setting", "count=-1"],
      ["--setting", "count=1", "--setting", "count=2"],
      ["--setting", "unknown=secret"],
      ["--setting"],
      ["--setting", "terminalDiagnostics=secret"],
    ]) {
      assert.throws(
        () => loadSettings({ ...context.options, argv }),
        (error: unknown) =>
          error instanceof Error && !error.message.includes("secret"),
      )
    }
    context.write(context.projectFile, { count: "secret" })
    assert.throws(
      () => loadSettings(context.options),
      (error: unknown) =>
        error instanceof Error
        && error.message.includes("count")
        && !error.message.includes("secret"),
    )
    writeFileSync(context.projectFile, '{"secret":invalid}')
    assert.throws(
      () => loadSettings(context.options),
      (error: unknown) =>
        error instanceof Error && !error.message.includes("secret"),
    )
  } finally {
    context.cleanup()
  }
})

void test("project opt-out and executable, import, and prototype rejection keep loading data-only", () => {
  const context = fixture()
  try {
    const executable = join(context.root, "unsafe.js")
    writeFileSync(executable, 'throw new Error("executed")')
    assert.throws(
      () => loadSettings({ ...context.options, legacyFiles: [executable] }),
      /Settings require JSON/,
    )
    context.write(context.projectFile, { $import: executable })
    assert.throws(() => loadSettings(context.options), /Invalid settings file/)
    assert.deepEqual(
      loadSettings({ ...context.options, project: false }).settings,
      { terminalDiagnostics: false },
    )
    writeFileSync(context.projectFile, '{"__proto__":{"polluted":true}}')
    assert.throws(() => loadSettings(context.options), /Invalid settings file/)
    assert.equal(Reflect.get({}, "polluted"), undefined)
  } finally {
    context.cleanup()
  }
})

void test("optional settings derive overrides without mutating the stored document", () => {
  const schema = z.object({ terminalDiagnostics: z.boolean().optional() })
  const stored = { terminalDiagnostics: false }
  assert.deepEqual(
    resolveSettingsEnvironment(schema, stored, {
      values: { EXAMPLE_TERMINAL_DIAGNOSTICS: "true" },
      prefix: "EXAMPLE",
    }),
    { terminalDiagnostics: true },
  )
  assert.deepEqual(stored, { terminalDiagnostics: false })
  assert.throws(
    () =>
      resolveSettingsEnvironment(
        schema,
        {},
        {
          values: { EXAMPLE_TERMINAL_DIAGNOSTICS: "secret" },
          prefix: "EXAMPLE",
        },
      ),
    /Invalid EXAMPLE_TERMINAL_DIAGNOSTICS override for terminalDiagnostics/,
  )
})
