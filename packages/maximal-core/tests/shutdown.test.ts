import type { serve } from "srvx"

import { afterEach, beforeEach, expect, mock, test } from "bun:test"

import {
  __resetShutdownStateForTests,
  initiateShutdown,
} from "~/lib/start/shutdown"

function server(close: () => Promise<void>): ReturnType<typeof serve> {
  return { close } as unknown as ReturnType<typeof serve>
}

async function expectRejects(
  operation: () => Promise<unknown>,
  pattern: RegExp,
): Promise<void> {
  let error: unknown
  try {
    await operation()
  } catch (caught) {
    error = caught
  }
  expect(error).toBeInstanceOf(Error)
  expect((error as Error).message).toMatch(pattern)
}

beforeEach(() => {
  __resetShutdownStateForTests()
})

afterEach(() => {
  __resetShutdownStateForTests()
})

test("restores configured clients before closing listeners and providers after", async () => {
  const events: Array<string> = []
  const firstClose = mock(() => {
    events.push("first listener closed")
    return Promise.resolve()
  })
  const secondClose = mock(() => {
    events.push("second listener closed")
    return Promise.resolve()
  })

  await expectRejects(
    () =>
      initiateShutdown(
        [server(firstClose), server(secondClose)],
        "test shutdown",
        {
          beforeClose: () => {
            events.push("configurators disposed")
            return Promise.resolve()
          },
          afterClose: () => {
            events.push("providers disposed")
            return Promise.resolve()
          },
        },
      ),
    /process\.exit\(0\) was called during a test run/,
  )

  expect(firstClose).toHaveBeenCalledWith(true)
  expect(secondClose).toHaveBeenCalledWith(true)
  expect(events).toEqual([
    "configurators disposed",
    "first listener closed",
    "second listener closed",
    "providers disposed",
  ])
})

test("a failed configurator disposal cannot skip listener or provider cleanup", async () => {
  const events: Array<string> = []

  await expectRejects(
    () =>
      initiateShutdown(
        [
          server(() => {
            events.push("listener closed")
            return Promise.resolve()
          }),
        ],
        "test failed pre-close hook",
        {
          beforeClose: () => {
            events.push("configurators failed")
            return Promise.reject(new Error("disconnect failed"))
          },
          afterClose: () => {
            events.push("providers disposed")
            return Promise.resolve()
          },
        },
      ),
    /process\.exit\(0\) was called during a test run/,
  )

  expect(events).toEqual([
    "configurators failed",
    "listener closed",
    "providers disposed",
  ])
})
