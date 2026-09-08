import type {
  TrafficFlow,
  TrafficFlowEdge,
  TrafficFlowNode,
  TrafficFlowNodeKind,
  TrafficTokenSeriesPoint,
} from "@stuffbucket/maximal-observability-contract"

export type FlowMeasure = "requests" | "tokens"

export interface DisplayFlowNode extends TrafficFlowNode {
  x: number
  y: number
  width: number
  height: number
}

export interface DisplayFlow {
  nodes: Array<DisplayFlowNode>
  edges: Array<TrafficFlowEdge>
}

const FLOW_KINDS: Array<TrafficFlowNodeKind> = [
  "client",
  "route",
  "provider",
  "model",
  "outcome",
]

function nodeValue(node: TrafficFlowNode, measure: FlowMeasure): number {
  return measure === "requests" ? node.requestCount : node.totalTokens
}

export function deriveDisplayFlow(
  flow: TrafficFlow,
  measure: FlowMeasure,
  maximumPerKind = 6,
): DisplayFlow {
  const idMap = new Map<string, string>()
  const retained: Array<TrafficFlowNode> = []

  for (const kind of FLOW_KINDS) {
    const nodes = flow.nodes
      .filter((node) => node.kind === kind)
      .sort(
        (left, right) =>
          nodeValue(right, measure) - nodeValue(left, measure)
          || left.label.localeCompare(right.label),
      )
    const visible = nodes.slice(0, maximumPerKind)
    retained.push(...visible)
    visible.forEach((node) => idMap.set(node.id, node.id))

    const omitted = nodes.slice(maximumPerKind)
    if (omitted.length > 0) {
      const id = `${kind}:other`
      retained.push({
        id,
        kind,
        label: `Other (${String(omitted.length)})`,
        requestCount: omitted.reduce((sum, node) => sum + node.requestCount, 0),
        totalTokens: omitted.reduce((sum, node) => sum + node.totalTokens, 0),
      })
      omitted.forEach((node) => idMap.set(node.id, id))
    }
  }

  const edgeMap = new Map<string, TrafficFlowEdge>()
  for (const edge of flow.edges) {
    const source = idMap.get(edge.source)
    const target = idMap.get(edge.target)
    if (!source || !target) continue
    const key = `${source}::${target}`
    const current = edgeMap.get(key)
    if (!current) {
      edgeMap.set(key, { ...edge, source, target })
      continue
    }
    const requestCount = current.requestCount + edge.requestCount
    const weightedDuration =
      current.averageDurationMs === null || edge.averageDurationMs === null ?
        null
      : (current.averageDurationMs * current.requestCount
          + edge.averageDurationMs * edge.requestCount)
        / requestCount
    edgeMap.set(key, {
      source,
      target,
      requestCount,
      totalTokens: current.totalTokens + edge.totalTokens,
      averageDurationMs: weightedDuration,
    })
  }

  const width = 112
  const height = 26
  const nodes = retained.map((node) => {
    const column = FLOW_KINDS.indexOf(node.kind)
    const peers = retained.filter((candidate) => candidate.kind === node.kind)
    const row = peers.findIndex((candidate) => candidate.id === node.id)
    return {
      ...node,
      x: column * 170,
      y: 18 + row * 42,
      width,
      height,
    }
  })

  return { nodes, edges: [...edgeMap.values()] }
}

export interface TokenStack {
  start: string
  end: string
  values: [number, number, number, number]
  total: number
}

export function deriveTokenStacks(
  points: Array<TrafficTokenSeriesPoint>,
): Array<TokenStack> {
  return points.map((point) => ({
    start: point.start,
    end: point.end,
    values: [
      point.inputTokens,
      point.cacheReadInputTokens,
      point.cacheCreationInputTokens,
      point.outputTokens,
    ],
    total: point.totalTokens,
  }))
}

export function scaleLinear(
  value: number,
  maximum: number,
  extent: number,
): number {
  if (value <= 0 || maximum <= 0 || extent <= 0) return 0
  return Math.min(extent, (value / maximum) * extent)
}
