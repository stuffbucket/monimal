import { contextBridge, ipcRenderer } from 'electron';

import { buildBridge, type Bridge, type BridgeTransport } from './capabilities.js';

export {
  BRIDGE_CAPABILITIES,
  CAPABILITY_ARGUMENT,
  CAPABILITY_CHANNELS,
  ORIGIN_ARGUMENT,
  capabilityArguments,
  declaredCapabilities,
  declaredOrigin,
} from './capabilities.js';
export type {
  Bridge,
  BridgeCapability,
  BridgeDeclaration,
  BridgeFailure,
  BridgeMethods,
  Envelope,
} from './capabilities.js';

/**
 * The preload half of the bridge. `docs/embedding.md` holds the contract.
 *
 * A consumer bundles this into their own preload entry and calls
 * `exposeBridge`. It cannot be `require`d from a sandboxed preload at run
 * time: a sandboxed preload gets a polyfilled `require` that reaches a handful
 * of Electron and Node built-ins and no package, so the bundling is the
 * consumer's, not optional.
 */

export interface CreateBridgeOptions {
  /**
   * Defaults to `process.argv`, which is where `additionalArguments` lands.
   * Supplied only by a test.
   */
  argv?: readonly string[];
}

export interface ExposeBridgeOptions extends CreateBridgeOptions {
  /**
   * The key on `window`. No default: a namespace this package chose would be
   * one every consumer collides on, and #22 asks for it caller-set.
   */
  namespace: string;
  /**
   * Members the host adds to its own bridge, exposed under the same key.
   * `contextBridge` allows one call per key, so a host with private channels
   * of its own has no second call to make. A consumer wanting only the generic
   * surface omits it.
   */
  extend?: object;
}

const transport: BridgeTransport = {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args) as Promise<unknown>,
};

/** The bridge, without exposing it. */
export function createBridge(options: CreateBridgeOptions = {}): Bridge {
  return buildBridge(transport, options.argv ?? process.argv);
}

/** Build the bridge and put it on `window[namespace]`. */
export function exposeBridge(options: ExposeBridgeOptions): Bridge {
  const bridge = createBridge(options);
  contextBridge.exposeInMainWorld(options.namespace, { ...bridge, ...options.extend });
  return bridge;
}
