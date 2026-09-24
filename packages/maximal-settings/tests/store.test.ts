import {
  getSettingsStore,
  type SettingsStoreOptions,
} from "@stuffbucket/maximal-settings"
import assert from "node:assert/strict"
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  existsSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { z } from "zod"

void test("typed singleton CRUD saves only configured layers, never environment or CLI overlays", async () => {
  const root = mkdtempSync(join(tmpdir(), "settings-store-"))
  const schema = z.object({
    count: z.number().int().default(0),
    enabled: z.boolean().default(false),
    label: z.string().default("default"),
  })
  const options: SettingsStoreOptions<z.infer<typeof schema>> = {
    applicationName: "other-app",
    environmentPrefix: "OTHER",
    instanceId: root,
    schema,
    cwd: root,
    homeDirectory: root,
    environment: { OTHER_COUNT: "99" },
    argv: ["--setting=label=cli"],
    persistence: { count: "user", enabled: "memory", label: "project" },
    onListenerError: () => {},
  }
  try {
    const instances = await Promise.all(
      Array.from({ length: 20 }, () =>
        Promise.resolve().then(() => getSettingsStore(options)),
      ),
    )
    const store = instances[0]
    assert.ok(instances.every((candidate) => candidate === store))
    assert.throws(
      () => getSettingsStore({ ...options, environmentPrefix: "DIFFERENT" }),
      /Conflicting/,
    )
    assert.throws(
      () => getSettingsStore({ ...options, instanceId: "fork" }),
      /Conflicting/,
    )
    assert.deepEqual(store.getSnapshot().settings, {
      count: 99,
      enabled: false,
      label: "cli",
    })
    let notifications = 0
    const unsubscribe = store.subscribe(() => {
      notifications++
    })
    await assert.rejects(store.update("count", 1), /does not exist/)
    await store.create("count", 1)
    await store.update("count", 2)
    await store.create("enabled", true)
    const userFile = join(root, ".config", "other-app", "settings.json")
    const projectFile = join(root, ".other-app", "settings.json")
    assert.equal(existsSync(projectFile), false)
    await store.create("label", "saved")
    assert.deepEqual(JSON.parse(readFileSync(userFile, "utf8")), { count: 2 })
    assert.deepEqual(JSON.parse(readFileSync(projectFile, "utf8")), {
      label: "saved",
    })
    assert.deepEqual(store.getSnapshot().settings, {
      count: 99,
      enabled: true,
      label: "cli",
    })
    assert.equal(store.getSnapshot().origins.enabled, "transient")
    assert.equal(store.getSnapshot().origins.count, "OTHER_COUNT")
    const before = store.getSnapshot()
    await assert.rejects(store.update("count", "private-value"), {
      message: "Invalid setting: count",
    })
    assert.equal(store.getSnapshot(), before)
    await store.delete("count")
    await store.delete("enabled")
    await store.delete("label")
    assert.deepEqual(JSON.parse(readFileSync(userFile, "utf8")), {})
    assert.deepEqual(JSON.parse(readFileSync(projectFile, "utf8")), {})
    assert.equal(store.getSnapshot().settings.enabled, false)
    assert.equal(notifications, 7)
    unsubscribe()
    await store.refresh()
    assert.equal(notifications, 7)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

void test("a schema-invalid deletion cannot change the saved document or publish a snapshot", async () => {
  const root = mkdtempSync(join(tmpdir(), "settings-rollback-"))
  const userFile = join(root, "settings.json")
  writeFileSync(userFile, '{"requiredValue":"saved"}')
  try {
    const store = getSettingsStore({
      applicationName: "rollback",
      environmentPrefix: "ROLLBACK",
      instanceId: root,
      schema: z.object({ requiredValue: z.string() }),
      cwd: root,
      homeDirectory: root,
      environment: {},
      project: false,
      userFile,
      persistence: { requiredValue: "user" },
      onListenerError: () => {},
    })
    const before = store.getSnapshot()
    let notifications = 0
    store.subscribe(() => {
      notifications++
    })
    await assert.rejects(
      store.delete("requiredValue"),
      /Invalid resolved settings/,
    )
    assert.equal(store.getSnapshot(), before)
    assert.equal(notifications, 0)
    assert.equal(readFileSync(userFile, "utf8"), '{"requiredValue":"saved"}')
    await store.update("requiredValue", "updated")
    assert.equal(store.getSnapshot().settings.requiredValue, "updated")
    assert.equal(notifications, 1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
