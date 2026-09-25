import { getJsonDocumentStore } from "@stuffbucket/maximal-settings"
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import {
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
  symlinkSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

void test("document CRUD is singleton, serialized, atomic, private, and recovers after rejection", async () => {
  const root = mkdtempSync(join(tmpdir(), "settings-document-"))
  try {
    const options = {
      namespace: "sample-app",
      filePath: join(root, "settings.json"),
    }
    const store = getJsonDocumentStore(options)
    assert.equal(store, getJsonDocumentStore({ ...options }))
    assert.throws(
      () => getJsonDocumentStore({ ...options, namespace: "other-app" }),
      /Conflicting/,
    )
    assert.equal(store.read(), undefined)
    await assert.rejects(
      store.update(() => ({})),
      /does not exist/,
    )
    await store.create({ count: 0 })
    await assert.rejects(store.create({ count: 100 }), /already exists/)
    await Promise.all(
      Array.from({ length: 20 }, () =>
        store.update((document) => ({ count: Number(document.count) + 1 })),
      ),
    )
    assert.deepEqual(store.read(), { count: 20 })
    const loaded = store.read()
    assert.ok(loaded)
    loaded.count = 999
    assert.deepEqual(store.read(), { count: 20 })
    await assert.rejects(
      store.update(() => {
        throw new Error("rejected mutation")
      }),
      /rejected mutation/,
    )
    assert.deepEqual(store.read(), { count: 20 })
    if (process.platform !== "win32")
      assert.equal(statSync(store.filePath).mode & 0o777, 0o600)
    await store.delete()
    assert.equal(store.read(), undefined)
    await store.transact(() => ({ recovered: true }))
    assert.deepEqual(store.read(), { recovered: true })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

void test("document loading rejects symlinks, oversized data, and unsafe keys without leaking values", async () => {
  const root = mkdtempSync(join(tmpdir(), "settings-document-security-"))
  try {
    const filePath = join(root, "settings.json")
    const store = getJsonDocumentStore({ namespace: "sample-app", filePath })
    writeFileSync(filePath, '{"__proto__":{"secret":"private-value"}}')
    assert.throws(() => store.read(), {
      message: `Invalid settings file: ${store.filePath}`,
    })
    writeFileSync(filePath, " ".repeat(1024 * 1024 + 1))
    assert.throws(() => store.read(), /Invalid settings file/)
    rmSync(filePath)
    if (process.platform !== "win32") {
      const target = join(root, "target.json")
      writeFileSync(target, "{}")
      symlinkSync(target, filePath)
      assert.throws(() => store.read(), /Invalid settings file/)
      await assert.rejects(
        store.transact(() => ({})),
        /Invalid settings file/,
      )
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

void test("separate processes do not lose concurrent document updates", async () => {
  const root = mkdtempSync(join(tmpdir(), "settings-processes-"))
  try {
    const store = getJsonDocumentStore({
      namespace: "workers",
      filePath: join(root, "settings.json"),
    })
    await store.create({ count: 0 })
    const script = `
      import { getJsonDocumentStore } from "@stuffbucket/maximal-settings";
      const store = getJsonDocumentStore({ namespace: "workers", filePath: process.argv[1] });
      for (let round = 0; round < 10; round++) {
        await store.update(document => ({ count: document.count + 1 }));
      }
    `
    await Promise.all(
      Array.from(
        { length: 4 },
        () =>
          new Promise<void>((resolve, reject) => {
            const child = spawn(
              process.execPath,
              ["--input-type=module", "--eval", script, store.filePath],
              {
                cwd: new URL("..", import.meta.url),
                stdio: ["ignore", "ignore", "pipe"],
                timeout: 15_000,
              },
            )
            let errors = ""
            child.stderr.on("data", (chunk) => {
              errors += String(chunk)
            })
            child.once("error", reject)
            child.once("exit", (code) =>
              code === 0 ? resolve() : (
                reject(new Error(`Writer failed: ${errors}`))
              ),
            )
          }),
      ),
    )
    assert.deepEqual(store.read(), { count: 40 })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
