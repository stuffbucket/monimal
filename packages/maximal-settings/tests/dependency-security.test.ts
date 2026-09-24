import * as policy from "@stuffbucket/maximal-settings/dependency-policy"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { parse } from "yaml"
import { z } from "zod"
const lock = z
  .object({
    importers: z.record(
      z.string(),
      z.object({
        dependencies: z
          .record(
            z.string(),
            z.object({ specifier: z.string(), version: z.string() }),
          )
          .default({}),
      }),
    ),
    packages: z.record(
      z.string(),
      z
        .object({
          resolution: z.object({ integrity: z.string().optional() }).loose(),
        })
        .loose(),
    ),
    snapshots: z.record(
      z.string(),
      z
        .object({
          dependencies: z.record(z.string(), z.string()).optional(),
          optionalDependencies: z.record(z.string(), z.string()).optional(),
        })
        .loose(),
    ),
  })
  .parse(
    parse(
      readFileSync(new URL("../../../pnpm-lock.yaml", import.meta.url), "utf8"),
    ),
  )

void test("dependency policy rejects changed integrity, versions, and transitive edges", () => {
  policy.verifyLockfile(lock)
  const wrongHash = structuredClone(lock)
  wrongHash.packages["lilconfig@3.1.3"].resolution.integrity = "sha1-unreviewed"
  assert.throws(() => policy.verifyLockfile(wrongHash), /integrity changed/)
  const wrongVersion = structuredClone(lock)
  wrongVersion.importers[
    "packages/maximal-settings"
  ].dependencies.lilconfig.version = "3.1.4"
  assert.throws(() => policy.verifyLockfile(wrongVersion), /resolution changed/)
  const wrongGraph = structuredClone(lock)
  wrongGraph.snapshots["lilconfig@3.1.3"].dependencies = { unexpected: "1.0.0" }
  assert.throws(() => policy.verifyLockfile(wrongGraph), /graph changed/)
  policy.verifyLockfile({
    importers: Object.fromEntries(
      Object.entries(lock.importers).map(([name, importer]) => [
        name,
        {
          specifiers: Object.fromEntries(
            Object.entries(importer.dependencies).map(([dependency, value]) => [
              dependency,
              value.specifier,
            ]),
          ),
          dependencies: Object.fromEntries(
            Object.entries(importer.dependencies).map(([dependency, value]) => [
              dependency,
              value.version,
            ]),
          ),
        },
      ]),
    ),
    packages: Object.fromEntries(
      Object.entries(lock.packages).map(([id, metadata]) => [
        id,
        { ...metadata, ...lock.snapshots[id] },
      ]),
    ),
  })
})

void test("full artifact checks reject lifecycle additions and missing or changed licenses", () => {
  const manifest = { name: "lilconfig", version: "3.1.3", license: "MIT" }
  policy.verifyPackage(manifest)
  assert.throws(
    () =>
      policy.verifyPackage({
        ...manifest,
        scripts: { postinstall: "unexpected" },
      }),
    /lifecycle changed/,
  )
  assert.throws(
    () => policy.verifyPackage({ ...manifest, license: "UNKNOWN" }),
    /license changed/,
  )
  assert.throws(
    () =>
      policy.verifyPackage({ name: manifest.name, version: manifest.version }),
    /license changed/,
  )
  assert.deepEqual(
    policy.readPackage({ name: manifest.name, version: manifest.version }),
    { name: manifest.name, version: manifest.version },
  )
  assert.throws(
    () =>
      policy.readPackage({ ...manifest, scripts: { install: "unexpected" } }),
    /lifecycle changed/,
  )
})
