export type JsonScalar = null | boolean | number | string
export type JsonValue = JsonScalar | Array<JsonValue> | JsonObject
export interface JsonObject {
  [key: string]: JsonValue
}

export interface RuntimeIdentity {
  nonce: string
  pid: number
  proxyPort: number
  controlPort: number
  startedAt: string
}

export interface ManagedFieldPatch {
  path: Array<string>
  value: JsonValue
}

export interface ConditionalArrayEntry {
  key: string
  keyValue: JsonValue
  priorArrayExists: boolean
}

export interface ConditionalInverse {
  path: Array<string>
  targetPath?: string
  arrayEntry?: ConditionalArrayEntry
  priorExists: boolean
  priorValue?: JsonValue
  writtenValue: JsonValue
}

export interface TargetClaim {
  schema: 1
  revision: number
  configuratorId: string
  runtime: RuntimeIdentity
  targetPath: string
  fields: Array<ConditionalInverse>
  createdTargets?: Array<string>
}

export type ConnectTargetStatus =
  | "connected"
  | "already-connected"
  | "changed-externally"
  | "owned-by-another-configurator"
  | "recovery-required"
  | "stale-recovery-required"

export interface ConnectTargetResult {
  status: ConnectTargetStatus
  claim?: TargetClaim
}

export type DisconnectTargetStatus =
  | "disconnected"
  | "not-connected"
  | "owned-by-another-configurator"
  | "recovery-required"

export interface DisconnectTargetResult {
  status: DisconnectTargetStatus
  preservedPaths: Array<Array<string>>
}

export type InspectTargetStatus =
  | "available"
  | "changed-externally"
  | "connected"
  | "owned-by-another-configurator"
  | "recovery-required"
  | "stale-recovery-required"

export interface InspectTargetResult {
  status: InspectTargetStatus
  claim?: TargetClaim
}

export type RuntimeIdentityProbe = (
  identity: RuntimeIdentity,
) => Promise<boolean>
