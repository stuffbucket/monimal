import assert from "node:assert/strict"
import test from "node:test"

import {
  resolveLocalModelsPath,
  resolveStuffbucketDataRoot,
} from "../src/index.ts"

void test("resolves Linux XDG and fallback data roots", () => {
  assert.equal(
    resolveStuffbucketDataRoot({
      platform: "linux",
      homeDirectory: "/home/tester",
      env: { XDG_DATA_HOME: "/data" },
    }),
    "/data/stuffbucket",
  )
  assert.equal(
    resolveLocalModelsPath({
      platform: "linux",
      homeDirectory: "/home/tester",
      env: {},
    }),
    "/home/tester/.local/share/stuffbucket/models",
  )
  assert.equal(
    resolveStuffbucketDataRoot({
      platform: "linux",
      homeDirectory: "/home/tester",
      env: { XDG_DATA_HOME: "relative" },
    }),
    "/home/tester/.local/share/stuffbucket",
  )
})

void test("resolves macOS outside an application user-data directory", () => {
  assert.equal(
    resolveLocalModelsPath({
      platform: "darwin",
      homeDirectory: "/Users/tester",
      env: { XDG_DATA_HOME: "/ignored" },
    }),
    "/Users/tester/Library/Application Support/stuffbucket/models",
  )
})

void test("resolves Windows local-app-data and fallback roots", () => {
  assert.equal(
    resolveLocalModelsPath({
      platform: "win32",
      homeDirectory: String.raw`C:\Users\tester`,
      env: { LOCALAPPDATA: String.raw`D:\Local` },
    }),
    String.raw`D:\Local\stuffbucket\models`,
  )
  assert.equal(
    resolveStuffbucketDataRoot({
      platform: "win32",
      env: { USERPROFILE: String.raw`C:\Users\tester` },
    }),
    String.raw`C:\Users\tester\AppData\Local\stuffbucket`,
  )
})

void test("suite data overrides are complete roots on every platform", () => {
  assert.equal(
    resolveLocalModelsPath({
      platform: "linux",
      suiteDataRoot: "/tmp/suite",
    }),
    "/tmp/suite/models",
  )
  assert.equal(
    resolveLocalModelsPath({
      platform: "win32",
      suiteDataRoot: String.raw`E:\temporary\suite`,
    }),
    String.raw`E:\temporary\suite\models`,
  )
  assert.throws(
    () => resolveLocalModelsPath({ platform: "linux", suiteDataRoot: "tmp" }),
    /absolute path/,
  )
})
