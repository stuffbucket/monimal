import {
  BrowserWindow,
  app,
  ipcMain,
  shell,
  type IpcMainInvokeEvent,
} from 'electron';

import {
  registerTerminalChannels,
  type TerminalChannelHost,
  type TerminalRequestChannels,
} from '../host/terminal-host.js';
import {
  IPC_CHANNELS,
  isPtyAcknowledgement,
  isPtyIdRequest,
  isPtyProjectionAttachRequest,
  isPtyProjectionRequest,
  isPtyProjectionResizeRequest,
  isPtyProjectionWriteRequest,
  isPtyResizeRequest,
  isPtySpawnRequest,
  isPtyWriteRequest,
  isTerminalLaunchRequest,
  type AppVersions,
  type IpcChannel,
  type IpcEvent,
  type IpcEventPayload,
  type IpcRequest,
  type IpcResponse,
} from '../shared/ipc.js';

import { setBadgeCount, showNotification } from './native/notifications.js';
import {
  abortAgent,
  discoverProvider,
  isAgentBusy,
  resolveApproval,
  runAgent,
} from './native/agent.js';
import { ensureModel } from './native/llama.js';
import { getPreferences, setPreferences } from './native/preferences.js';
import {
  acknowledgePty,
  attachPtyProjection,
  defaultShell,
  detachPtyProjection,
    focusPtyProjection,
    resizePtyProjection,
  discoverTerminalTargets,
  killPty,
  launchTerminal,
  listTerminalProfiles,
  listPtys,
  resizePty,
  spawnReservedPty,
  writePty,
  writePtyProjection,
} from './native/pty.js';
import { checkForUpdates } from './native/updates.js';
import { hideOverlay, toggleOverlay } from './windows/overlay.js';
import { isSafeExternalUrl } from '../shared/urls.js';

/** A handler for one channel. Types come from the contract, so it cannot drift. */
type IpcHandler<C extends IpcChannel> = (
  request: IpcRequest<C>,
  window: BrowserWindow | undefined,
) => IpcResponse<C> | Promise<IpcResponse<C>>;

/**
 * The channels `registerTerminalChannels` answers, in this shell's own names.
 *
 * The renderer half names the same five in
 * `src/renderer/lib/bridge-terminal.ts`, and neither imports the other:
 * `./host/terminal` is a consumer's export and knows nothing of this contract.
 * `tests/terminal/terminal-channels.test.ts` is the check that duplication owes.
 */
export const TERMINAL_CHANNELS = {
  spawn: 'pty:spawn',
  write: 'pty:write',
  resize: 'pty:resize',
  ack: 'pty:ack',
  terminate: 'pty:kill',
  list: 'pty:list',
} as const satisfies TerminalRequestChannels<IpcChannel>;

type TerminalChannel = (typeof TERMINAL_CHANNELS)[keyof typeof TERMINAL_CHANNELS];

const terminalChannels: ReadonlySet<string> = new Set(Object.values(TERMINAL_CHANNELS));

function isTerminalChannel(channel: IpcChannel): channel is TerminalChannel {
  return terminalChannels.has(channel);
}

/**
 * Every remaining channel needs an entry. `Record` over `IpcChannel` makes a
 * missing handler a compile error, which is the guarantee this module exists
 * to give; excluding the terminal channels rather than dropping them keeps it,
 * because a name that leaves `TERMINAL_CHANNELS` has to reappear here.
 */
type IpcHandlers = { [C in Exclude<IpcChannel, TerminalChannel>]: IpcHandler<C> };

export function collectVersions(): AppVersions {
  return {
    app: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    v8: process.versions.v8,
    platform: process.platform,
    arch: process.arch,
    packaged: app.isPackaged,
  };
}

/**
 * Only a safe scheme may leave the application. The guard lives in
 * `src/shared/urls.ts`, free of Electron imports, so it has direct unit tests.
 */

const handlers: IpcHandlers = {
  'app:versions': () => collectVersions(),

  'prefs:get': () => getPreferences(),
  'prefs:set': (patch) => setPreferences(patch),

  'notify:show': (request) => showNotification(request),

  'dock:set-badge': (request) => setBadgeCount(request.count),

  'update:check': () => checkForUpdates(),

  'shell:open-external': (request) => {
    if (!isSafeExternalUrl(request.url)) {
      throw new Error(`Refused to open unsafe URL: ${request.url}`);
    }
    void shell.openExternal(request.url);
  },

  'pty:default-shell': () => defaultShell(),

  'pty:projection-attach': (request, window) => {
    if (!isPtyProjectionAttachRequest(request)) throw new Error('Invalid terminal projection attach request.');
    return attachPtyProjection(window, request);
  },
  'pty:projection-focus': (request, window) => {
    if (!isPtyProjectionAttachRequest(request)) throw new Error('Invalid terminal projection focus request.');
    return focusPtyProjection(window, request);
  },
  'pty:projection-write': (request, window) => {
    if (!isPtyProjectionWriteRequest(request)) throw new Error('Invalid terminal projection write request.');
    return writePtyProjection(window, request);
  },
  'pty:projection-resize': (request, window) => {
    if (!isPtyProjectionResizeRequest(request)) throw new Error('Invalid terminal projection resize request.');
    return resizePtyProjection(window, request);
  },
  'pty:projection-detach': (request, window) => {
    if (!isPtyProjectionRequest(request)) throw new Error('Invalid terminal projection detach request.');
    return detachPtyProjection(window, request.id, request.projectionId);
  },

  'terminal:profiles': (_request, window) => listTerminalProfiles(window),
  'terminal:discover': (_request, window) => discoverTerminalTargets(window),
  'terminal:launch': (request, window) => {
    if (!isTerminalLaunchRequest(request)) throw new Error('Invalid terminal launch request.');
    return launchTerminal(window, request);
  },

  'overlay:toggle': () => toggleOverlay(),

  'overlay:hide': () => hideOverlay(),

  'overlay:provider': () => discoverProvider(),

  'overlay:abort': () => abortAgent(),

  'overlay:approve': (request) => resolveApproval(request),

  'overlay:ask': (request, window) => {
    if (isAgentBusy()) {
      return { started: false, reason: 'Already working on the previous request.' };
    }

    // Deliberately not awaited. The reply says only that the run started; the
    // answer streams back as `agent:*` events, so the renderer is not blocked
    // for the length of a model call.
    void runAgent(request.prompt, {
      onDelta: (text) => sendEvent(window, 'agent:delta', { text }),
      onTool: (name, phase, isError) =>
        sendEvent(window, 'agent:tool', { name, phase, isError }),
      onApproval: (approval) => sendEvent(window, 'agent:approval', approval),
      onEnd: (result) => sendEvent(window, 'agent:end', result),
    });

    return { started: true };
  },

  'model:ensure': (_request, window) =>
    ensureModel((progress) => sendEvent(window, 'model:progress', progress)),
};

/**
 * The manager for the window a request arrived from.
 *
 * A session belongs to a window, so `native/pty.ts` keys one `TerminalHost`
 * per `BrowserWindow` and this hands the registration the one that request
 * belongs to. A request with no window reaches a manager that opens nothing.
 */
function terminalHostFor(event: IpcMainInvokeEvent): TerminalChannelHost {
  const window = BrowserWindow.fromWebContents(event.sender) ?? undefined;
  return {
    spawn: (request) => {
      if (!isPtySpawnRequest(request)) throw new Error('Invalid terminal spawn request.');
      spawnReservedPty(window, request);
    },
    write: (id, data) => {
      if (!isPtyWriteRequest({ id, data })) throw new Error('Invalid terminal write request.');
      writePty(window, id, data);
    },
    resize: (id, cols, rows) => {
      if (!isPtyResizeRequest({ id, cols, rows })) throw new Error('Invalid terminal resize request.');
      resizePty(window, id, cols, rows);
    },
    acknowledge: (id, sequence) => {
      if (!isPtyAcknowledgement({ id, sequence })) throw new Error('Invalid terminal acknowledgement.');
      acknowledgePty(window, id, sequence);
    },
    terminate: (id) => {
      if (!isPtyIdRequest({ id })) throw new Error('Invalid terminal termination request.');
      killPty(window, id);
    },
    list: () => listPtys(window),
  };
}

/** Register every contract channel. Call once, before the first window loads. */
export function registerIpcHandlers(): void {
  for (const channel of IPC_CHANNELS) {
    if (isTerminalChannel(channel)) continue;
    const handler = handlers[channel] as IpcHandler<IpcChannel>;
    ipcMain.handle(channel, async (event, request: IpcRequest<IpcChannel>) => {
      const window = BrowserWindow.fromWebContents(event.sender) ?? undefined;
      return handler(request, window);
    });
  }

  registerTerminalChannels(ipcMain, terminalHostFor, { channels: TERMINAL_CHANNELS });
}

/**
 * Send a typed event to a window. Using this rather than raw `webContents.send`
 * keeps main-to-renderer messages inside the contract.
 */
export function sendEvent<E extends IpcEvent>(
  window: BrowserWindow | undefined,
  event: E,
  payload: IpcEventPayload<E>,
): void {
  if (!window || window.isDestroyed()) return;
  window.webContents.send(event, payload);
}
