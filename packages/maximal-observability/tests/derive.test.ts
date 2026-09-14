import type { TrafficFlowNode } from "@stuffbucket/maximal-observability-contract"

import { describe, expect, it } from "vitest"

import {
  deriveDisplayFlow,
  deriveTokenStacks,
  scaleLinear,
} from "../src/derive.ts"
import { formatBytes, formatCount, formatDuration } from "../src/format.ts"
import { OVERVIEW } from "./fixtures.ts"

describe("observability derivation", () => {
  it("bounds flow categories and combines omitted edges", () => {
    const clients: Array<TrafficFlowNode> = Array.from(
      { length: 8 },
      (_, index) => ({
        id: `client:${String(index)}`,
        kind: "client",
        label: `Client ${String(index)}`,
        requestCount: 8 - index,
        totalTokens: (8 - index) * 10,
      }),
    )
    const route = OVERVIEW.flow.nodes.find(({ kind }) => kind === "route")
    if (!route) throw new Error("Route fixture missing")
    const flow = deriveDisplayFlow(
      {
        nodes: [...clients, route],
        edges: clients.map((client) => ({
          source: client.id,
          target: route.id,
          requestCount: client.requestCount,
          totalTokens: client.totalTokens,
          averageDurationMs: 10,
        })),
      },
      "requests",
      3,
    )

    expect(flow.nodes.filter(({ kind }) => kind === "client")).toHaveLength(4)
    expect(flow.nodes.find(({ id }) => id === "client:other")?.label).toBe(
      "Other (5)",
    )
    expect(
      flow.edges.find(({ source }) => source === "client:other")?.requestCount,
    ).toBe(15)
    expect(
      flow.nodes.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y)),
    ).toBe(true)
  })

  it("stacks uncached and cached input without subtracting cache twice", () => {
    const stacks = deriveTokenStacks(OVERVIEW.tokens.points)
    expect(stacks[0]?.values).toEqual([90, 20, 10, 80])
    expect(stacks[0]?.values.reduce((sum, value) => sum + value, 0)).toBe(200)
    expect(stacks[0]?.total).toBe(200)
  })

  it("scales and formats boundary values", () => {
    expect(scaleLinear(50, 100, 200)).toBe(100)
    expect(scaleLinear(1, 0, 200)).toBe(0)
    expect(formatDuration(null)).toBe("Not available")
    expect(formatDuration(1_500)).toBe("1.5 s")
    expect(formatBytes(2_048)).toBe("2.0 KB")
    expect(formatCount(12_000)).not.toBe("12000")
  })
})
