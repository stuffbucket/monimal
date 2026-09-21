import { Cache } from "~/lib/runtime-state/cache"

export interface ContextManagementScope {
  account: string
  host: string
  model: string
  strategy: string
}

export interface ObservedContextManagementRejection extends ContextManagementScope {
  rejectedAt: string
}

export const MAX_CONTEXT_MANAGEMENT_REJECTIONS = 1024

const rejections = new Cache<string, ObservedContextManagementRejection>({
  name: "context_management_rejections",
  max: MAX_CONTEXT_MANAGEMENT_REJECTIONS,
})

function cacheKey(scope: ContextManagementScope): string {
  return [scope.account, scope.host, scope.model, scope.strategy].join("\u0000")
}

function normalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => normalizeValue(item))
  if (typeof value !== "object" || value === null) return value

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, normalizeValue(item)]),
  )
}

export function contextManagementStrategy(
  contextManagement: unknown,
): string | null {
  if (
    typeof contextManagement !== "object"
    || contextManagement === null
    || Array.isArray(contextManagement)
  ) {
    return null
  }
  return JSON.stringify(normalizeValue(contextManagement))
}

export function hasContextManagementRejection(
  scope: ContextManagementScope,
): boolean {
  return rejections.get(cacheKey(scope)) !== undefined
}

export function recordContextManagementRejection(
  scope: ContextManagementScope,
  now: number = Date.now(),
): void {
  rejections.set(cacheKey(scope), {
    ...scope,
    rejectedAt: new Date(now).toISOString(),
  })
}

export function listContextManagementRejections(): Array<ObservedContextManagementRejection> {
  return rejections.values()
}

export function clearContextManagementRejections(): void {
  rejections.clear()
}
