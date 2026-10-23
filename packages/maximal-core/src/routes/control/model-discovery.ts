import type { ModelDiscoveryService } from "@maximal/maximal-model-contract"

import {
  ModelDiscoveryActionSchema,
  ModelDiscoverySnapshotSchema,
  type ModelDiscoverySnapshot,
} from "@maximal/maximal-core-contract/control"

/** Validates both sides of the optional host-owned discovery boundary. */
export class ModelDiscoveryControl {
  readonly #service: ModelDiscoveryService | undefined

  constructor(service: ModelDiscoveryService | undefined) {
    this.#service = service
  }

  async act(input: unknown): Promise<ModelDiscoverySnapshot> {
    const request = ModelDiscoveryActionSchema.parse(input)
    if (!this.#service) {
      return ModelDiscoverySnapshotSchema.parse({
        schemaVersion: 1,
        id: null,
        revision: 0,
        state: "unsupported",
        includeLocalNetwork: false,
        networkScopes: [],
        endpoints: [],
        completedProbes: 0,
        totalProbes: 0,
        truncated: false,
        message:
          "This sidecar has no supported model-discovery host. Update the desktop client; existing providers are unchanged.",
      })
    }
    return ModelDiscoverySnapshotSchema.parse(await this.#service.act(request))
  }
}
