import type { ModelDiscoveryNetworkScope } from "@maximal/maximal-model-contract"

import { access } from "node:fs/promises"
import { networkInterfaces, platform } from "node:os"

function ipv4Number(address: string): number | undefined {
  const text = address.split(".")
  if (text.length !== 4 || text.some((part) => !/^\d{1,3}$/.test(part)))
    return undefined
  const parts = text.map(Number)
  if (
    parts.length !== 4
    || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  )
    return undefined
  return parts.reduce((value, part) => value * 256 + part, 0) >>> 0
}
function ipv4Address(value: number): string {
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join(".")
}
function privateAddress(address: number): boolean {
  const first = address >>> 24
  const second = (address >>> 16) & 255
  return (
    first === 10
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
  )
}

/** Large, public, point-to-point, VPN, and unknown interface scopes fail closed. */
export function boundedNetworkScope(
  interfaceName: string,
  cidr: string,
): ModelDiscoveryNetworkScope | undefined {
  const [address, prefixText] = cidr.split("/")
  const value = ipv4Number(address)
  const prefix = Number(prefixText)
  if (
    value === undefined
    || !privateAddress(value)
    || !Number.isInteger(prefix)
    || prefix < 24
    || prefix > 30
  )
    return undefined
  const size = 2 ** (32 - prefix)
  const network = Math.floor(value / size) * size
  return Object.freeze({
    id: `${interfaceName}/${ipv4Address(network)}/${prefix}`,
    interfaceName,
    cidr: `${ipv4Address(network)}/${prefix}`,
    hostCount: size - 2,
  })
}

export function scopeAddresses(
  scope: ModelDiscoveryNetworkScope,
): ReadonlyArray<string> {
  const [address] = scope.cidr.split("/")
  const start = ipv4Number(address)
  if (start === undefined || scope.hostCount > 256) return []
  return Array.from({ length: scope.hostCount }, (_, index) =>
    ipv4Address(start + index + 1),
  )
}

export async function localNetworkScopes(): Promise<
  ReadonlyArray<ModelDiscoveryNetworkScope>
> {
  const scopes: Array<ModelDiscoveryNetworkScope> = []
  for (const [name, entries] of Object.entries(networkInterfaces())) {
    if (platform() === "linux") {
      if (!/^[\w.:-]+$/.test(name)) continue
      try {
        await access(`/sys/class/net/${name}/device`)
      } catch {
        continue
      }
    } else if (platform() === "darwin") {
      if (!/^en\d+$/.test(name)) continue
    } else {
      // No interface-name guessing on platforms without a reviewed detector.
      continue
    }
    for (const entry of entries ?? []) {
      if (entry.internal || entry.family !== "IPv4" || entry.cidr === null)
        continue
      const scope = boundedNetworkScope(name, entry.cidr)
      if (scope && !scopes.some(({ id }) => id === scope.id)) scopes.push(scope)
    }
  }
  return Object.freeze(scopes.slice(0, 8))
}
