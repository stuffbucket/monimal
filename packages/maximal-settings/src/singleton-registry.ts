export function singletonRegistry<Registration>(
  name: string,
): Map<string, Registration> {
  const key = Symbol.for(name)
  const existing: unknown = Reflect.get(globalThis, key)
  if (existing instanceof Map) return existing as Map<string, Registration>
  if (existing !== undefined) throw new Error("Conflicting singleton registry")
  const registry = new Map<string, Registration>()
  Object.defineProperty(globalThis, key, { value: registry })
  return registry
}
