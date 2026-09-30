import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import {
  loadRuntimeSettings,
  setRuntimeHomeCliOverride,
} from "~/lib/config/runtime-settings"

const directories: Array<string> = []

function fixture(): string {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "maximal-runtime-settings-"),
  )
  directories.push(directory)
  return directory
}

beforeEach(() => setRuntimeHomeCliOverride(undefined))
afterEach(() => {
  setRuntimeHomeCliOverride(undefined)
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

describe("runtime settings", () => {
  it("loads home, home policy, and API database path from settings.json", () => {
    const directory = fixture()
    const configDirectory = path.join(directory, "config")
    const settingsDirectory = path.join(configDirectory, "maximal")
    fs.mkdirSync(settingsDirectory, { recursive: true })
    fs.writeFileSync(
      path.join(settingsDirectory, "settings.json"),
      JSON.stringify({
        home: "/settings/home",
        homePolicy: "require",
        apiSqliteDbPath: "/settings/maximal.sqlite",
        unrelatedDesktopSetting: true,
      }),
    )

    expect(
      loadRuntimeSettings({
        homeDirectory: directory,
        cwd: directory,
        environment: { XDG_CONFIG_HOME: configDirectory },
      }),
    ).toMatchObject({
      home: "/settings/home",
      homePolicy: "require",
      apiSqliteDbPath: "/settings/maximal.sqlite",
    })
  })

  it("gives MAXIMAL environment values precedence over settings.json", () => {
    const directory = fixture()
    const configDirectory = path.join(directory, "config")
    const settingsDirectory = path.join(configDirectory, "maximal")
    fs.mkdirSync(settingsDirectory, { recursive: true })
    fs.writeFileSync(
      path.join(settingsDirectory, "settings.json"),
      JSON.stringify({
        home: "/settings/home",
        homePolicy: "create",
        apiSqliteDbPath: "/settings/maximal.sqlite",
      }),
    )

    expect(
      loadRuntimeSettings({
        homeDirectory: directory,
        cwd: directory,
        environment: {
          XDG_CONFIG_HOME: configDirectory,
          MAXIMAL_HOME: "/environment/home",
          MAXIMAL_HOME_POLICY: " REQUIRE ",
          MAXIMAL_API_SQLITE_DB_PATH: ":memory:",
        },
      }),
    ).toMatchObject({
      home: "/environment/home",
      homePolicy: "require",
      apiSqliteDbPath: ":memory:",
    })
  })

  it("treats blank environment values as unset settings overrides", () => {
    const directory = fixture()
    const configDirectory = path.join(directory, "config")
    const settingsDirectory = path.join(configDirectory, "maximal")
    fs.mkdirSync(settingsDirectory, { recursive: true })
    fs.writeFileSync(
      path.join(settingsDirectory, "settings.json"),
      JSON.stringify({
        home: "/settings/home",
        homePolicy: "require",
        apiSqliteDbPath: "/settings/maximal.sqlite",
      }),
    )

    expect(
      loadRuntimeSettings({
        homeDirectory: directory,
        cwd: directory,
        environment: {
          XDG_CONFIG_HOME: configDirectory,
          MAXIMAL_HOME: "",
          MAXIMAL_HOME_POLICY: " ",
          MAXIMAL_API_SQLITE_DB_PATH: "",
        },
      }),
    ).toMatchObject({
      home: "/settings/home",
      homePolicy: "require",
      apiSqliteDbPath: "/settings/maximal.sqlite",
    })
  })

  it("gives the CLI home override precedence over the environment", () => {
    const directory = fixture()
    setRuntimeHomeCliOverride("/cli/home")

    expect(
      loadRuntimeSettings({
        homeDirectory: directory,
        cwd: directory,
        environment: { MAXIMAL_HOME: "/environment/home" },
      }).home,
    ).toBe("/cli/home")
  })
})
