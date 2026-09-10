import { Context } from "@deepseek-ai/cordis"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import {
  LocalModelRegistry,
  type LocalModelManifest,
  type LocalModelSource,
} from "../src/index.ts"

const bytes = Buffer.from("GGUF-local-model-fixture")

function noop(): void {}

function manifest(
  content: Uint8Array = bytes,
  update: Partial<LocalModelManifest> = {},
): LocalModelManifest {
  return {
    capabilities: { input: ["text"], output: ["text", "tool-calls"] },
    context: { contextWindow: 4096, maxOutputTokens: 1024 },
    displayName: "Fixture Model",
    expectedBytes: content.byteLength,
    fileName: "fixture.gguf",
    fileSignature: { hex: Buffer.from(content.subarray(0, 4)).toString("hex") },
    format: "gguf",
    key: "fixture-model",
    modelId: "fixture/model",
    publication: "provider",
    sha256: createHash("sha256").update(content).digest("hex"),
    ...update,
  }
}

function source(
  content: Uint8Array,
  onOpen: () => void = () => undefined,
): LocalModelSource {
  return {
    async *open(signal) {
      await Promise.resolve()
      onOpen()
      signal.throwIfAborted()
      const midpoint = Math.ceil(content.byteLength / 2)
      yield content.subarray(0, midpoint)
      signal.throwIfAborted()
      yield content.subarray(midpoint)
    },
  }
}

function blockingSource(content: Uint8Array): {
  readonly aborted: boolean
  readonly opens: number
  readonly release: () => void
  readonly source: LocalModelSource
  readonly started: Promise<void>
} {
  let aborted = false
  let opens = 0
  let release = noop
  let startedResolve: (() => void) | undefined
  const started = new Promise<void>((resolve) => {
    startedResolve = resolve
  })
  const value: LocalModelSource = {
    async *open(signal) {
      opens += 1
      const midpoint = Math.ceil(content.byteLength / 2)
      yield content.subarray(0, midpoint)
      startedResolve?.()
      await new Promise<void>((resolve, reject) => {
        const onAbort = (): void => {
          aborted = true
          reject(
            signal.reason instanceof Error ?
              signal.reason
            : new DOMException("Provisioning was aborted.", "AbortError"),
          )
        }
        release = () => {
          signal.removeEventListener("abort", onAbort)
          resolve()
        }
        signal.addEventListener("abort", onAbort, { once: true })
        if (signal.aborted) onAbort()
      })
      signal.throwIfAborted()
      yield content.subarray(midpoint)
    },
  }
  return {
    get aborted() {
      return aborted
    },
    get opens() {
      return opens
    },
    get release() {
      return release
    },
    source: value,
    started,
  }
}

function trackedSignal(controller: AbortController): {
  readonly added: number
  readonly removed: number
  readonly signal: AbortSignal
} {
  let added = 0
  let removed = 0
  const target = controller.signal
  const signal = {
    get aborted() {
      return target.aborted
    },
    get reason(): unknown {
      return target.reason as unknown
    },
    addEventListener(
      type: string,
      listener: EventListener | EventListenerObject,
      options?: AddEventListenerOptions | boolean,
    ): void {
      if (type === "abort") added += 1
      target.addEventListener(type, listener, options)
    },
    removeEventListener(
      type: string,
      listener: EventListener | EventListenerObject,
      options?: EventListenerOptions | boolean,
    ): void {
      if (type === "abort") removed += 1
      target.removeEventListener(type, listener, options)
    },
    throwIfAborted(): void {
      target.throwIfAborted()
    },
  } as unknown as AbortSignal
  return {
    get added() {
      return added
    },
    get removed() {
      return removed
    },
    signal,
  }
}

async function registryFixture(): Promise<{
  readonly directory: string
  readonly registry: LocalModelRegistry
}> {
  const directory = await mkdtemp(join(tmpdir(), "local-model-registry-"))
  return {
    directory,
    registry: new LocalModelRegistry(new Context(), directory),
  }
}

async function artifactPath(
  registry: LocalModelRegistry,
  value: LocalModelManifest,
): Promise<string> {
  const path = join(registry.modelDirectory, value.key, value.fileName)
  await readFile(path)
  return path
}

void test("registration publishes immutable synchronous snapshots and disposes idempotently", async () => {
  const fixture = await registryFixture()
  try {
    const snapshots = [fixture.registry.list()]
    const unsubscribe = fixture.registry.subscribe((snapshot) =>
      snapshots.push(snapshot),
    )
    const dispose = fixture.registry.registerModel(manifest(), source(bytes))

    assert.deepEqual(
      snapshots.map(({ revision }) => revision),
      [0, 0, 1],
    )
    assert.equal(snapshots[2]?.models[0]?.state, "registered")
    assert.throws(
      () => (snapshots[2]?.models as Array<unknown>).push({}),
      TypeError,
    )
    assert.throws(
      () =>
        (snapshots[2]?.models[0]?.capabilities.input as Array<string>).push(
          "image",
        ),
      TypeError,
    )

    dispose()
    dispose()
    assert.equal(fixture.registry.list().models.length, 0)
    unsubscribe()
    unsubscribe()
  } finally {
    await fixture.registry.dispose()
    await rm(fixture.directory, { recursive: true, force: true })
  }
})

void test("publication policies remain serializable catalog metadata", async () => {
  const fixture = await registryFixture()
  try {
    for (const publication of ["none", "provider", "aggregate"] as const) {
      const value = manifest(bytes, {
        key: `fixture-${publication}`,
        publication,
      })
      fixture.registry.registerModel(value, source(bytes))
    }
    assert.deepEqual(
      fixture.registry.list().models.map(({ publication }) => publication),
      ["aggregate", "none", "provider"],
    )
    assert.throws(
      () =>
        fixture.registry.registerModel(
          manifest(bytes, {
            key: "fixture-invalid",
            publication: "invalid" as "provider",
          }),
          source(bytes),
        ),
      /publication is invalid/,
    )
  } finally {
    await fixture.registry.dispose()
    await rm(fixture.directory, { recursive: true, force: true })
  }
})

void test("registration validates atomically and rejects duplicate keys", async () => {
  const fixture = await registryFixture()
  try {
    assert.throws(
      () =>
        fixture.registry.registerModel(
          manifest(bytes, { fileName: "../escape.gguf" }),
          source(bytes),
        ),
      /base filename/,
    )
    assert.equal(fixture.registry.list().revision, 0)
    fixture.registry.registerModel(manifest(), source(bytes))
    assert.throws(
      () => fixture.registry.registerModel(manifest(), source(bytes)),
      /already registered/,
    )
    assert.equal(fixture.registry.list().models.length, 1)
  } finally {
    await fixture.registry.dispose()
    await rm(fixture.directory, { recursive: true, force: true })
  }
})

void test("ensure verifies, fsyncs, atomically promotes, and reuses complete files", async () => {
  const fixture = await registryFixture()
  try {
    let opens = 0
    const value = manifest()
    fixture.registry.registerModel(
      value,
      source(bytes, () => (opens += 1)),
    )
    const progress: Array<{
      readonly phase: string
      readonly completedBytes: number
    }> = []
    const ready = await fixture.registry.ensure(
      value.key,
      new AbortController().signal,
      ({ phase, completedBytes }) => progress.push({ phase, completedBytes }),
    )
    assert.equal(ready.state, "ready")
    assert.equal(opens, 1)
    assert.deepEqual(
      await readFile(await artifactPath(fixture.registry, value)),
      bytes,
    )
    assert.deepEqual(
      progress.map(({ phase }) => phase),
      [
        "checking",
        "downloading",
        "downloading",
        "downloading",
        "verifying",
        "committing",
      ],
    )
    const staging = await readdir(
      join(fixture.registry.modelDirectory, ".staging"),
    )
    assert.deepEqual(staging, [])

    await fixture.registry.dispose()
    const second = new LocalModelRegistry(new Context(), fixture.directory)
    second.registerModel(
      value,
      source(bytes, () => (opens += 1)),
    )
    assert.equal(
      (await second.ensure(value.key, new AbortController().signal)).state,
      "ready",
    )
    assert.equal(opens, 1)
    await second.dispose()
  } finally {
    await fixture.registry.dispose()
    await rm(fixture.directory, { recursive: true, force: true })
  }
})

void test("completed artifacts survive registration and registry disposal", async () => {
  const fixture = await registryFixture()
  try {
    const value = manifest()
    const unregister = fixture.registry.registerModel(value, source(bytes))
    await fixture.registry.ensure(value.key, new AbortController().signal)
    const path = await artifactPath(fixture.registry, value)
    unregister()
    assert.deepEqual(await readFile(path), bytes)
    await fixture.registry.dispose()
    assert.deepEqual(await readFile(path), bytes)
  } finally {
    await fixture.registry.dispose()
    await rm(fixture.directory, { recursive: true, force: true })
  }
})

void test("synchronous subscriptions make both activation orders equivalent", async () => {
  for (const order of ["model-first", "runner-first"] as const) {
    const fixture = await registryFixture()
    try {
      const value = manifest()
      let lease: ReturnType<LocalModelRegistry["claim"]> | undefined
      const bindRunner = (): (() => void) =>
        fixture.registry.subscribe((snapshot) => {
          if (
            lease === undefined
            && snapshot.models.some(
              ({ key, state }) => key === value.key && state === "ready",
            )
          ) {
            lease = fixture.registry.claim(value.key, {
              capabilities: {
                input: ["text"],
                output: ["text", "tool-calls"],
              },
              formats: ["gguf"],
              id: `${order}-runner`,
            })
          }
        })

      const unsubscribe = order === "runner-first" ? bindRunner() : undefined
      const unregister = fixture.registry.registerModel(value, source(bytes))
      await fixture.registry.ensure(value.key, new AbortController().signal)
      const lateUnsubscribe = order === "model-first" ? bindRunner() : undefined
      assert.ok(lease)
      assert.equal(lease.runner.id, `${order}-runner`)
      unregister()
      assert.equal(lease.released, true)
      unsubscribe?.()
      lateUnsubscribe?.()
    } finally {
      await fixture.registry.dispose()
      await rm(fixture.directory, { recursive: true, force: true })
    }
  }
})

void test("concurrent ensure calls share one atomic provisioning operation", async () => {
  const fixture = await registryFixture()
  try {
    let opens = 0
    const value = manifest()
    fixture.registry.registerModel(
      value,
      source(bytes, () => (opens += 1)),
    )
    const tracked = trackedSignal(new AbortController())
    const [left, right] = await Promise.all([
      fixture.registry.ensure(value.key, tracked.signal),
      fixture.registry.ensure(value.key, tracked.signal),
    ])
    assert.equal(left.state, "ready")
    assert.equal(right.state, "ready")
    assert.equal(opens, 1)
    assert.equal(tracked.added, 2)
    assert.equal(tracked.removed, 2)
  } finally {
    await fixture.registry.dispose()
    await rm(fixture.directory, { recursive: true, force: true })
  }
})

void test("one ensure caller can cancel without cancelling another", async () => {
  const fixture = await registryFixture()
  try {
    const value = manifest()
    const blocked = blockingSource(bytes)
    fixture.registry.registerModel(value, blocked.source)
    const leftController = new AbortController()
    const rightController = new AbortController()
    const leftSignal = trackedSignal(leftController)
    const rightSignal = trackedSignal(rightController)
    const left = fixture.registry.ensure(value.key, leftSignal.signal)
    const right = fixture.registry.ensure(value.key, rightSignal.signal)

    await blocked.started
    leftController.abort(
      new DOMException("left caller cancelled", "AbortError"),
    )
    await assert.rejects(left, /left caller cancelled/)
    assert.equal(blocked.aborted, false)
    assert.equal(leftSignal.added, 1)
    assert.equal(leftSignal.removed, 1)

    blocked.release()
    assert.equal((await right).state, "ready")
    assert.equal(blocked.opens, 1)
    assert.equal(rightSignal.added, 1)
    assert.equal(rightSignal.removed, 1)
  } finally {
    await fixture.registry.dispose()
    await rm(fixture.directory, { recursive: true, force: true })
  }
})

void test("the last cancelled ensure caller aborts provisioning", async () => {
  const fixture = await registryFixture()
  try {
    const value = manifest()
    const blocked = blockingSource(bytes)
    fixture.registry.registerModel(value, blocked.source)
    const leftController = new AbortController()
    const rightController = new AbortController()
    const leftSignal = trackedSignal(leftController)
    const rightSignal = trackedSignal(rightController)
    const left = fixture.registry.ensure(value.key, leftSignal.signal)
    const right = fixture.registry.ensure(value.key, rightSignal.signal)
    let unsubscribe = (): void => undefined
    const failed = new Promise<void>((resolve) => {
      unsubscribe = fixture.registry.subscribe((snapshot) => {
        if (snapshot.models[0]?.state === "failed") resolve()
      })
    })

    await blocked.started
    leftController.abort(
      new DOMException("left caller cancelled", "AbortError"),
    )
    await assert.rejects(left, /left caller cancelled/)
    assert.equal(blocked.aborted, false)

    rightController.abort(
      new DOMException("last caller cancelled", "AbortError"),
    )
    await assert.rejects(right, /last caller cancelled/)
    await failed
    unsubscribe()
    assert.equal(blocked.aborted, true)
    assert.equal(leftSignal.removed, 1)
    assert.equal(rightSignal.removed, 1)
    assert.deepEqual(
      await readdir(join(fixture.registry.modelDirectory, ".staging")),
      [],
    )
  } finally {
    await fixture.registry.dispose()
    await rm(fixture.directory, { recursive: true, force: true })
  }
})

void test("hash and format failures never promote a model and can be retried", async () => {
  for (const update of [
    { sha256: "0".repeat(64) },
    { fileSignature: { hex: Buffer.from("BAD!").toString("hex") } },
  ]) {
    const fixture = await registryFixture()
    try {
      const value = manifest(bytes, update)
      fixture.registry.registerModel(value, source(bytes))
      await assert.rejects(
        fixture.registry.ensure(value.key, new AbortController().signal),
        /verification|signature/,
      )
      assert.equal(fixture.registry.list().models[0]?.state, "failed")
      await assert.rejects(
        readFile(
          join(fixture.registry.modelDirectory, value.key, value.fileName),
        ),
      )
      assert.deepEqual(
        await readdir(join(fixture.registry.modelDirectory, ".staging")),
        [],
      )
    } finally {
      await fixture.registry.dispose()
      await rm(fixture.directory, { recursive: true, force: true })
    }
  }
})

void test("cancellation and registration disposal clean staging without readiness", async () => {
  for (const disposeRegistration of [false, true]) {
    const fixture = await registryFixture()
    try {
      const value = manifest()
      let startedResolve: (() => void) | undefined
      const started = new Promise<void>((resolve) => {
        startedResolve = resolve
      })
      const blocked: LocalModelSource = {
        async *open(signal) {
          yield bytes.subarray(0, 4)
          startedResolve?.()
          await new Promise<void>((resolve) => {
            signal.addEventListener("abort", () => resolve(), { once: true })
          })
          signal.throwIfAborted()
        },
      }
      const dispose = fixture.registry.registerModel(value, blocked)
      const controller = new AbortController()
      const pending = fixture.registry.ensure(value.key, controller.signal)
      await started
      if (disposeRegistration) dispose()
      else controller.abort(new DOMException("cancelled", "AbortError"))
      await assert.rejects(pending, /cancelled|disposed/)
      assert.notEqual(fixture.registry.list().models[0]?.state, "ready")
      await assert.rejects(
        readFile(
          join(fixture.registry.modelDirectory, value.key, value.fileName),
        ),
      )
      assert.deepEqual(
        await readdir(join(fixture.registry.modelDirectory, ".staging")),
        [],
      )
    } finally {
      await fixture.registry.dispose()
      await rm(fixture.directory, { recursive: true, force: true })
    }
  }
})

void test("claims enforce readiness, format, capabilities, exclusivity, and disposal", async () => {
  const fixture = await registryFixture()
  try {
    const value = manifest()
    const unregister = fixture.registry.registerModel(value, source(bytes))
    const runner = {
      capabilities: { input: ["text"], output: ["text", "tool-calls"] },
      formats: ["gguf"],
      id: "llama-runner",
    }
    assert.throws(() => fixture.registry.claim(value.key, runner), /not ready/)
    await fixture.registry.ensure(value.key, new AbortController().signal)
    assert.throws(
      () => fixture.registry.claim(value.key, { ...runner, formats: ["mlx"] }),
      /does not support gguf/,
    )
    assert.throws(
      () =>
        fixture.registry.claim(value.key, {
          ...runner,
          capabilities: { input: ["text"], output: ["text"] },
        }),
      /output capabilities/,
    )

    const lease = fixture.registry.claim(value.key, runner)
    assert.equal(await readFile(lease.filePath, "utf8"), bytes.toString())
    assert.throws(
      () => fixture.registry.claim(value.key, runner),
      /live runner claim/,
    )
    lease.dispose()
    lease.dispose()
    assert.equal(lease.released, true)
    const next = fixture.registry.claim(value.key, runner)
    unregister()
    assert.equal(next.released, true)
  } finally {
    await fixture.registry.dispose()
    await rm(fixture.directory, { recursive: true, force: true })
  }
})

void test("observer failures do not veto registration or provisioning", async () => {
  const fixture = await registryFixture()
  try {
    fixture.registry.subscribe(() => {
      throw new Error("observer")
    })
    const value = manifest()
    fixture.registry.registerModel(value, source(bytes))
    await fixture.registry.ensure(
      value.key,
      new AbortController().signal,
      () => {
        throw new Error("progress observer")
      },
    )
    assert.equal(fixture.registry.list().models[0]?.state, "ready")
  } finally {
    await fixture.registry.dispose()
    await rm(fixture.directory, { recursive: true, force: true })
  }
})

void test("invalid existing files are preserved for explicit user cleanup", async () => {
  const fixture = await registryFixture()
  try {
    const value = manifest()
    const targetDirectory = join(fixture.registry.modelDirectory, value.key)
    const target = join(targetDirectory, value.fileName)
    const invalid = Buffer.alloc(bytes.length)
    let opens = 0
    await mkdir(targetDirectory, { recursive: true })
    await writeFile(target, invalid)
    fixture.registry.registerModel(
      value,
      source(bytes, () => (opens += 1)),
    )

    await assert.rejects(
      fixture.registry.ensure(value.key, new AbortController().signal),
      /left unchanged.*Remove it manually/,
    )
    assert.equal(fixture.registry.list().models[0]?.state, "failed")
    assert.equal(opens, 0)
    assert.deepEqual(await readFile(target), invalid)
  } finally {
    await fixture.registry.dispose()
    await rm(fixture.directory, { recursive: true, force: true })
  }
})
