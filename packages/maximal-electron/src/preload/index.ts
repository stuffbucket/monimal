import { ipcRenderer, type IpcRendererEvent } from 'electron';

import {
  BRIDGE_KEY,
  IPC_CHANNELS,
  IPC_EVENTS,
  type IpcArgs,
  type IpcChannel,
  type IpcEvent,
  type IpcEventPayload,
  type IpcResponse,
  type RendererApi,
} from '../shared/ipc.js';

import { exposeBridge } from './bridge.js';

/**
 * The renderer never touches `ipcRenderer`. It gets this object and nothing
 * else.
 *
 * Both `invoke` and `on` reject any name outside the contract, so a compromised
 * renderer cannot reach an arbitrary main-process handler or subscribe to an
 * internal Electron event.
 */

const channels: ReadonlySet<string> = new Set(IPC_CHANNELS);
const events: ReadonlySet<string> = new Set(IPC_EVENTS);

const api: RendererApi = {
  invoke<C extends IpcChannel>(
    channel: C,
    ...args: IpcArgs<C>
  ): Promise<IpcResponse<C>> {
    if (!channels.has(channel)) {
      return Promise.reject(new Error(`Unknown IPC channel: ${channel}`));
    }
    return ipcRenderer.invoke(channel, ...args) as Promise<IpcResponse<C>>;
  },

  on<E extends IpcEvent>(
    event: E,
    listener: (payload: IpcEventPayload<E>) => void,
  ): () => void {
    if (!events.has(event)) {
      throw new Error(`Unknown IPC event: ${event}`);
    }
    // Drop the Electron event object. Handing it to the renderer would leak
    // `sender`, which is a path back into the main process.
    const wrapped = (_event: IpcRendererEvent, payload: IpcEventPayload<E>) =>
      listener(payload);

    ipcRenderer.on(event, wrapped);
    return () => {
      ipcRenderer.removeListener(event, wrapped);
    };
  },
};

// The exported bridge, driven by the application that exports it. `extend`
// carries this shell's own twenty channels, which are no consumer's business.
exposeBridge({ namespace: BRIDGE_KEY, extend: api });
