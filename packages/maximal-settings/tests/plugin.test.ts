import {
  parsePluginSettings,
  pluginSettingsIssues,
  PluginSettingsError,
  type PluginSettingsSchema,
} from "@maximal/maximal-settings"
import assert from "node:assert/strict"
import { test } from "node:test"

const schema: PluginSettingsSchema<{ enabled: boolean }> = {
  "~standard": {
    version: 1,
    vendor: "test",
    validate(value) {
      if (value === undefined) return { value: { enabled: true } }
      if (
        typeof value === "object"
        && value !== null
        && "enabled" in value
        && typeof value.enabled === "boolean"
      ) {
        return { value: { enabled: value.enabled } }
      }
      return { issues: [{ path: ["enabled"], message: "Expected a boolean" }] }
    },
  },
}

void test("plugin settings use the plugin schema, including its default", () => {
  const registration = { id: "search", schema }
  assert.deepEqual(parsePluginSettings(registration, undefined), {
    enabled: true,
  })
  assert.deepEqual(
    parsePluginSettings(registration, { search: { enabled: false } }),
    { enabled: false },
  )
  assert.throws(
    () => parsePluginSettings(registration, { search: { enabled: "no" } }),
    (error: unknown) => {
      assert.ok(error instanceof PluginSettingsError)
      assert.equal(error.pluginId, "search")
      assert.deepEqual(error.issues, [
        { path: ["enabled"], message: "Expected a boolean" },
      ])
      assert.match(error.message, /search\.enabled: Expected a boolean/)
      return true
    },
  )
})

void test("only registered plugins contribute issues under the owner path", () => {
  const issues = pluginSettingsIssues(
    [{ id: "search", schema }],
    { search: { enabled: "no" }, futurePlugin: { enabled: "no" } },
    ["connectors"],
  )
  assert.deepEqual(issues, [
    {
      path: ["connectors", "search", "enabled"],
      message: "Expected a boolean",
    },
  ])
  assert.deepEqual(
    pluginSettingsIssues([{ id: "search", schema }], undefined, ["connectors"]),
    [],
  )
})
