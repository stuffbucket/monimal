/**
 * The single source of truth for every IPC channel and event.
 *
 * The main process (`src/main/ipc.ts`) and the preload bridge
 * (`src/preload/index.ts`) both derive their types from here. A channel added
 * without a handler is a compile error. A handler for an undeclared channel is
 * a compile error too.
 *
 * Read `AGENTS.md` and `.claude/skills/add-ipc-channel/SKILL.md` before you
 * change this file.
 */

import type {
  PtyProjectionAttachRequest,
  PtyProjectionRequest,
  PtyProjectionResizeRequest,
  PtyProjectionWriteRequest,
  PtyResizeRequest,
  PtySession,
  PtySpawnRequest,
  PtyStatus,
  PtyWriteRequest,
  TerminalDiscovery,
  TerminalLaunchRequest,
  TerminalLaunchResult,
  TerminalProfileSummary,
} from '../host/electron-terminal-contract.js';

export type {
  PtyProjectionAttachRequest,
  PtyProjectionRequest,
  PtyProjectionResizeRequest,
  PtyProjectionWriteRequest,
  PtyResizeRequest,
  PtySession,
  PtySpawnRequest,
  PtyStatus,
  PtyWriteRequest,
  TerminalDiscovery,
  TerminalLaunchRequest,
  TerminalLaunchResult,
  TerminalProfileSummary,
  TerminalTargetSummary,
} from '../host/electron-terminal-contract.js';

/* ------------------------------------------------------------------ types */

/** Runtime and platform versions reported by the main process. */
export interface AppVersions {
  app: string;
  electron: string;
  chrome: string;
  node: string;
  v8: string;
  platform: NodeJS.Platform;
  arch: string;
  packaged: boolean;
}

/** User preferences that the main process owns and persists. */
export interface Preferences {
  /** Show a menu bar (macOS) or tray (Windows and Linux) icon. */
  menuBarIcon: boolean;
  /** Quit instead of asking when the last window closes without a menu bar icon. */
  quitOnLastWindowClosed: boolean;
  /** Reflect unread count on the macOS dock badge. */
  dockBadge: boolean;
  /** Show the splash window at launch. */
  splash: boolean;
  /** Theme preference. `system` follows the OS. */
  theme: 'system' | 'light' | 'dark';
  /**
   * Closing a terminal tab leaves its shell running.
   *
   * Off by default: a shell that outlives its tab is a process the user can no
   * longer see, so keeping one is a choice rather than a surprise. The status
   * bar lists what is still running, and reopening a tab attaches to it.
   */
  terminalDetach: boolean;
}

export interface NotifyRequest {
  title: string;
  body: string;
  /** Bounce the dock (macOS) or flash the taskbar (Windows). */
  urgent?: boolean;
}

/** Result of an update check. This build has no update channel; see docs. */
export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'unsupported'; reason: string }
  | { state: 'available'; version: string; url: string }
  | { state: 'up-to-date'; version: string }
  | { state: 'error'; message: string };

/** Top-level views the left navigation can select. */
export type ViewId = 'library' | 'recents' | 'drafts' | 'shared' | 'trash';

export const MAX_PTY_DIMENSION = 32_767;
export const MAX_PTY_WRITE_BYTES = 1_000_000;
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnly(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function isDimension(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value > 0
    && value <= MAX_PTY_DIMENSION;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isTerminalIdentifier(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

function isTerminalData(value: unknown): value is string {
  return typeof value === 'string'
    && value.length <= MAX_PTY_WRITE_BYTES
    && new TextEncoder().encode(value).byteLength <= MAX_PTY_WRITE_BYTES;
}

/** Runtime validation for this application's untrusted terminal IPC payloads. */
export function isPtySpawnRequest(value: unknown): value is PtySpawnRequest {
  return isRecord(value)
    && hasOnly(value, ['id', 'cols', 'rows'])
    && isTerminalIdentifier(value.id)
    && isDimension(value.cols)
    && isDimension(value.rows);
}

export function isPtyWriteRequest(value: unknown): value is PtyWriteRequest {
  return isRecord(value)
    && hasOnly(value, ['id', 'data'])
    && isTerminalIdentifier(value.id)
    && isTerminalData(value.data);
}

export function isPtyResizeRequest(value: unknown): value is PtyResizeRequest {
  return isRecord(value)
    && hasOnly(value, ['id', 'cols', 'rows'])
    && isTerminalIdentifier(value.id)
    && isDimension(value.cols)
    && isDimension(value.rows);
}

export function isPtyProjectionRequest(value: unknown): value is PtyProjectionRequest {
  return isRecord(value)
    && hasOnly(value, ['id', 'projectionId'])
    && isTerminalIdentifier(value.id)
    && isTerminalIdentifier(value.projectionId);
}

export function isPtyProjectionAttachRequest(value: unknown): value is PtyProjectionAttachRequest {
  return isRecord(value)
    && hasOnly(value, ['id', 'projectionId', 'cols', 'rows'])
    && isTerminalIdentifier(value.id)
    && isTerminalIdentifier(value.projectionId)
    && isDimension(value.cols)
    && isDimension(value.rows);
}

export function isPtyProjectionWriteRequest(value: unknown): value is PtyProjectionWriteRequest {
  return isRecord(value)
    && hasOnly(value, ['id', 'projectionId', 'epoch', 'data'])
    && isTerminalIdentifier(value.id)
    && isTerminalIdentifier(value.projectionId)
    && isPositiveInteger(value.epoch)
    && isTerminalData(value.data);
}

export function isPtyProjectionResizeRequest(value: unknown): value is PtyProjectionResizeRequest {
  return isRecord(value)
    && hasOnly(value, ['id', 'projectionId', 'epoch', 'cols', 'rows'])
    && isTerminalIdentifier(value.id)
    && isTerminalIdentifier(value.projectionId)
    && isPositiveInteger(value.epoch)
    && isDimension(value.cols)
    && isDimension(value.rows);
}

export function isPtyAcknowledgement(value: unknown): value is { id: string; sequence: number } {
  return isRecord(value)
    && hasOnly(value, ['id', 'sequence'])
    && isTerminalIdentifier(value.id)
    && typeof value.sequence === 'number'
    && Number.isSafeInteger(value.sequence)
    && value.sequence > 0;
}

export function isPtyIdRequest(value: unknown): value is { id: string } {
  return isRecord(value) && hasOnly(value, ['id']) && isTerminalIdentifier(value.id);
}

export function isTerminalLaunchRequest(value: unknown): value is TerminalLaunchRequest {
  return isRecord(value)
    && hasOnly(value, ['profileId', 'targetId', 'cols', 'rows'])
    && isTerminalIdentifier(value.profileId)
    && (value.targetId === undefined || isTerminalIdentifier(value.targetId))
    && isDimension(value.cols)
    && isDimension(value.rows);
}

/* --------------------------------------------------------------- requests */

/**
 * Every request channel, with its request and response type.
 *
 * Use `void` for a channel that takes no argument.
 */
export interface IpcContract {
  'app:versions': { request: void; response: AppVersions };
  'prefs:get': { request: void; response: Preferences };
  'prefs:set': { request: Partial<Preferences>; response: Preferences };
  'notify:show': { request: NotifyRequest; response: void };
  'dock:set-badge': { request: { count: number }; response: void };
  'update:check': { request: void; response: UpdateStatus };
  'shell:open-external': { request: { url: string }; response: void };

  // Terminal sessions. The shell runs in the main process; the renderer holds
  // only the xterm view. See src/main/native/pty.ts.
  'pty:spawn': { request: PtySpawnRequest; response: void };
  'pty:write': { request: PtyWriteRequest; response: void };
  'pty:resize': { request: PtyResizeRequest; response: void };
  'pty:ack': { request: { id: string; sequence: number }; response: void };
  'pty:kill': { request: { id: string }; response: void };
  /** Every live session for this window, so a detached one can be found again. */
  'pty:list': { request: void; response: PtySession[] };
  'pty:projection-attach': { request: PtyProjectionAttachRequest; response: boolean };
  'pty:projection-focus': { request: PtyProjectionAttachRequest; response: number | undefined };
  'pty:projection-write': { request: PtyProjectionWriteRequest; response: boolean };
  'pty:projection-resize': { request: PtyProjectionResizeRequest; response: boolean };
  'pty:projection-detach': { request: PtyProjectionRequest; response: boolean };
  'pty:default-shell': { request: void; response: string };

  // App terminal launcher. These requests contain identifiers only; executable
  // configuration stays in the owner-scoped main-process reservation.
  'terminal:profiles': { request: void; response: TerminalProfileSummary[] };
  'terminal:discover': { request: void; response: TerminalDiscovery };
  'terminal:launch': { request: TerminalLaunchRequest; response: TerminalLaunchResult };

}

export type IpcChannel = keyof IpcContract;
export type IpcRequest<C extends IpcChannel> = IpcContract[C]['request'];
export type IpcResponse<C extends IpcChannel> = IpcContract[C]['response'];

/** A channel whose request type is `void` takes no argument at the call site. */
export type IpcArgs<C extends IpcChannel> = IpcRequest<C> extends void
  ? []
  : [request: IpcRequest<C>];

export const IPC_CHANNELS = [
  'app:versions',
  'prefs:get',
  'prefs:set',
  'notify:show',
  'dock:set-badge',
  'update:check',
  'shell:open-external',
  'pty:spawn',
  'pty:write',
  'pty:resize',
  'pty:ack',
  'pty:kill',
  'pty:list',
  'pty:projection-attach',
  'pty:projection-focus',
  'pty:projection-write',
  'pty:projection-resize',
  'pty:projection-detach',
  'pty:default-shell',
  'terminal:profiles',
  'terminal:discover',
  'terminal:launch',
] as const;

/* ----------------------------------------------------------------- events */

/** Messages the main process pushes to the renderer. */
export interface IpcEvents {
  /** The application menu or tray asked the renderer to change view. */
  'menu:navigate': { view: ViewId };
  /** The menu asked the renderer to open a named panel. */
  'menu:toggle-panel': { panel: 'left' | 'right' };
  /** An update check changed state. */
  'update:status': UpdateStatus;
  /** Preferences changed, from any source. */
  'prefs:changed': Preferences;

  /** A batch of terminal output for one opaque terminal session. */
  'pty:data': { id: string; data: string; sequence?: number; projectionId?: string };
  /** That terminal session's shell ended. */
  'pty:exit': { id: string; exitCode: number; projectionId?: string };
  /** A terminal session started or its current process exited. */
  'pty:status': PtyStatus;

}

export type IpcEvent = keyof IpcEvents;
export type IpcEventPayload<E extends IpcEvent> = IpcEvents[E];

export const IPC_EVENTS = [
  'menu:navigate',
  'menu:toggle-panel',
  'update:status',
  'prefs:changed',
  'pty:data',
  'pty:exit',
  'pty:status',
] as const;

/* ------------------------------------------------- exhaustiveness proofs */

/**
 * Compile-time proof that the runtime lists cover the type maps. A channel or
 * event added to a map but omitted from its list makes one of these non-empty,
 * which fails the assignment.
 */
type MissingChannels = Exclude<IpcChannel, (typeof IPC_CHANNELS)[number]>;
type ExtraChannels = Exclude<(typeof IPC_CHANNELS)[number], IpcChannel>;
type MissingEvents = Exclude<IpcEvent, (typeof IPC_EVENTS)[number]>;
type ExtraEvents = Exclude<(typeof IPC_EVENTS)[number], IpcEvent>;

const _exhaustive: [
  MissingChannels,
  ExtraChannels,
  MissingEvents,
  ExtraEvents,
] = [undefined as never, undefined as never, undefined as never, undefined as never];
void _exhaustive;

/* -------------------------------------------------------------- the API */

/** The API that the preload bridge exposes on `window.stuffbucket`. */
export interface RendererApi {
  invoke<C extends IpcChannel>(
    channel: C,
    ...args: IpcArgs<C>
  ): Promise<IpcResponse<C>>;

  /** Subscribe to a main-process event. Returns an unsubscribe function. */
  on<E extends IpcEvent>(
    event: E,
    listener: (payload: IpcEventPayload<E>) => void,
  ): () => void;
}

/** The key that `contextBridge` writes onto `window`. */
export const BRIDGE_KEY = 'stuffbucket' as const;

/** Defaults for a fresh profile. */
export const DEFAULT_PREFERENCES: Preferences = {
  menuBarIcon: false,
  quitOnLastWindowClosed: false,
  dockBadge: true,
  splash: true,
  theme: 'system',
  terminalDetach: false,
};
