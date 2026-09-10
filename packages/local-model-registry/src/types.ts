import type {
  LocalModelCapabilities,
  LocalModelContextLimits,
  LocalModelPublication,
} from "@stuffbucket/maximal-provider-contract"

export interface LocalModelFileSignature {
  readonly hex: string
  readonly offset?: number
}

export interface LocalModelManifest {
  readonly capabilities: LocalModelCapabilities
  readonly context: LocalModelContextLimits
  readonly displayName: string
  readonly expectedBytes: number
  readonly fileName: string
  readonly fileSignature: LocalModelFileSignature
  readonly format: string
  readonly key: string
  readonly modelId: string
  readonly publication: LocalModelPublication
  readonly sha256: string
}

export interface LocalModelSource {
  open(
    signal: AbortSignal,
  ): AsyncIterable<Uint8Array> | Promise<AsyncIterable<Uint8Array>>
}

export interface LocalModelRunnerDescriptor {
  readonly capabilities: LocalModelCapabilities
  readonly formats: ReadonlyArray<string>
  readonly id: string
}

export interface LocalModelLease extends Disposable {
  readonly filePath: string
  readonly manifest: LocalModelManifest
  readonly runner: LocalModelRunnerDescriptor
  readonly released: boolean
  dispose(): void
}

export type LocalModelRegistrationDispose = () => void
