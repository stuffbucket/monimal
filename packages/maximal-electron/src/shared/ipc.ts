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

/**
 * When the overlay agent must ask before it runs a tool.
 *
 * `writes` is the default. Reading is free, and anything that can change the
 * machine asks. `none` restores the unattended behaviour, which is a real
 * choice for a trusted local model but should be a deliberate one.
 */
export type AgentApproval = 'all' | 'writes' | 'none';

/** User preferences that the main process owns and persists. */
export interface Preferences {
  /** Show a menu bar (macOS) or tray (Windows and Linux) icon. */
  menuBarIcon: boolean;
  /** Reflect unread count on the macOS dock badge. */
  dockBadge: boolean;
  /** Show the splash window at launch. */
  splash: boolean;
  /**
   * Accelerator that summons the floating overlay.
   *
   * Wiggle uses a double tap of Ctrl. Electron's `globalShortcut` cannot bind
   * a bare modifier, so this is a normal accelerator. See `docs/roadmap.md`.
   */
  overlayHotkey: string;
  /**
   * Give the overlay agent read, write, edit, and bash tools.
   *
   * This hands a local model the working directory and a shell. That is the
   * point of a coding agent, and it is also why it is a switch.
   */
  agentTools: boolean;
  /** When the agent must ask before it runs a tool. */
  agentApproval: AgentApproval;
  /** Working directory for those tools. Empty means the home directory. */
  agentCwd: string;
  /**
   * Toolsets the overlay agent may use, by id.
   *
   * Resolved when a run starts, so a change takes effect on the next summon
   * rather than needing a restart. See `src/main/native/toolsets.ts`.
   */
  agentToolsets: string[];
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

/** Open a shell for one tab. `id` is the tab's identifier. */
export interface PtySpawnRequest {
  id: string;
  cols: number;
  rows: number;
  /** Defaults to the user's login shell. */
  shell?: string;
  /** Defaults to the home directory. */
  cwd?: string;
}

export interface PtyWriteRequest {
  id: string;
  data: string;
}

export interface PtyResizeRequest {
  id: string;
  cols: number;
  rows: number;
}

/** A live shell, whether or not a terminal view is showing it. */
export interface PtySession {
  id: string;
  cwd: string;
  shell: string;
  /** Milliseconds since the epoch. */
  startedAt: number;
}

/* ------------------------------------------------------- overlay agent */

/**
 * Local model backends. None needs an API key.
 *
 * `embedded` runs in this process through `node-llama-cpp`, so it is the only
 * one that is always available. The other two are preferred when present: a
 * proxy backed by a real subscription beats a small local model.
 */
export type AgentProvider = 'maximal' | 'ollama' | 'embedded';

export type ProviderStatus =
  | { state: 'probing' }
  | { state: 'ready'; provider: AgentProvider; model: string }
  /** No proxy is running and the embedded model has not been fetched yet. */
  | { state: 'needs-model'; model: string; approxMb: number }
  | { state: 'unavailable'; reason: string };

/** Progress of the one-time embedded model download. */
export type ModelProgress =
  | { state: 'absent' }
  | { state: 'downloading'; received: number; total: number }
  | { state: 'ready' }
  | { state: 'error'; reason: string };

export interface AskRequest {
  prompt: string;
}

/** A run either started, or could not. Output arrives as events. */
export type AskAccepted = { started: true } | { started: false; reason: string };

/** Which tool the agent is running, and whether it finished cleanly. */
export interface AgentToolEvent {
  name: string;
  phase: 'start' | 'end';
  isError?: boolean;
}

export type AgentEnd = { ok: true } | { ok: false; error: string };

/**
 * The agent wants to run a tool and is waiting for a decision.
 *
 * The run is blocked until `overlay:approve` arrives with this `id`, or until
 * the gate times out.
 */
export interface AgentApprovalRequest {
  id: string;
  /** Tool name, such as `bash` or `write`. */
  tool: string;
  /** The command or path this call would act on, already truncated. */
  summary: string;
}

export interface ApproveRequest {
  id: string;
  allow: boolean;
  /** Allow every later call to this same tool, for this run only. */
  remember: boolean;
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
  // only the `ghostty-web` view. See src/main/native/pty.ts.
  'pty:spawn': { request: PtySpawnRequest; response: void };
  'pty:write': { request: PtyWriteRequest; response: void };
  'pty:resize': { request: PtyResizeRequest; response: void };
  'pty:kill': { request: { id: string }; response: void };
  /** Every live session for this window, so a detached one can be found again. */
  'pty:list': { request: void; response: PtySession[] };
  'pty:default-shell': { request: void; response: string };

  // The floating overlay. `overlay:hide` is how the card dismisses itself,
  // because the renderer cannot close its own window.
  'overlay:toggle': { request: void; response: void };
  'overlay:hide': { request: void; response: void };
  'overlay:provider': { request: void; response: ProviderStatus };
  // Starts a run. The reply says only whether it started; the answer streams
  // back as `agent:*` events.
  'overlay:ask': { request: AskRequest; response: AskAccepted };
  'overlay:abort': { request: void; response: void };
  /** Answer a pending `agent:approval`. Unknown ids are ignored. */
  'overlay:approve': { request: ApproveRequest; response: void };
  /**
   * Fetch the embedded model if it is missing. Returns the state at the time
   * of the call; progress arrives as `model:progress` events.
   */
  'model:ensure': { request: void; response: ModelProgress };
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
  'pty:kill',
  'pty:list',
  'pty:default-shell',
  'overlay:toggle',
  'overlay:hide',
  'overlay:provider',
  'overlay:ask',
  'overlay:abort',
  'overlay:approve',
  'model:ensure',
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

  /** A batch of terminal output for one tab's shell. */
  'pty:data': { id: string; data: string };
  /** That tab's shell ended. */
  'pty:exit': { id: string; exitCode: number };

  /** A chunk of the agent's answer. Append it; do not replace. */
  'agent:delta': { text: string };
  /** The agent started or finished a tool call. */
  'agent:tool': AgentToolEvent;
  /** The agent is blocked, waiting for permission to run a tool. */
  'agent:approval': AgentApprovalRequest;
  /** The run finished, cleanly or not. */
  'agent:end': AgentEnd;
  /** The embedded model download changed state. */
  'model:progress': ModelProgress;
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
  'agent:delta',
  'agent:tool',
  'agent:approval',
  'agent:end',
  'model:progress',
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
  dockBadge: true,
  splash: true,
  overlayHotkey: 'CommandOrControl+Shift+Space',
  agentTools: true,
  agentApproval: 'writes',
  agentCwd: '',
  agentToolsets: ['app'],
  theme: 'system',
  terminalDetach: false,
};
