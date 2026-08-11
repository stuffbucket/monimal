/**
 * The parts of session management that are decidable without a real pty.
 *
 * `pty.ts` owns `node-pty` and `electron`, so Stryker cannot mutate it:
 * that code needs an Electron runtime rather than Node. What it does contain is
 * the two rules a terminal gets wrong, and both are pure. They live here so
 * they are mutation tested.
 */

/** Why a working directory was refused. */
export type CwdRejection = 'relative' | 'missing' | 'not-a-directory';

export type CwdResult =
  | { ok: true; cwd: string }
  | { ok: false; reason: CwdRejection };

/**
 * Is this a directory a shell can start in?
 *
 * A terminal already runs arbitrary commands, so this is not a privilege
 * boundary and pretending otherwise would be theatre. It is a correctness one:
 * `spawn` throws on a directory that does not exist, and a relative path
 * resolves against whatever the main process happens to have, which is not
 * anything the caller meant.
 *
 * `stat` is injected so the rule is testable without a filesystem.
 */
export function resolveCwd(
  cwd: string | undefined,
  fallback: string,
  stat: (path: string) => { isDirectory: boolean } | undefined,
): CwdResult {
  if (cwd === undefined || cwd === '') return { ok: true, cwd: fallback };

  // Not `path.isAbsolute`: that reads the host platform, and a Windows path
  // checked on POSIX would pass. The caller states an absolute path or does
  // not, and both separators are absolute somewhere.
  const absolute = cwd.startsWith('/') || /^[a-z]:[\\/]/i.test(cwd);
  if (!absolute) return { ok: false, reason: 'relative' };

  const entry = stat(cwd);
  if (entry === undefined) return { ok: false, reason: 'missing' };
  if (!entry.isDirectory) return { ok: false, reason: 'not-a-directory' };

  return { ok: true, cwd };
}

/** A short sentence naming what to fix. */
export function cwdMessage(reason: CwdRejection, cwd: string): string {
  if (reason === 'relative') return `${cwd} is not an absolute path`;
  if (reason === 'missing') return `${cwd} does not exist`;
  return `${cwd} is not a directory`;
}

/**
 * Which session a callback belongs to.
 *
 * A pty's `onExit` can arrive after the session was killed and a new one
 * created under the same id — closing a terminal and immediately reopening it
 * is enough. The old callback then deletes the live session, and the user's
 * new shell stops receiving output while its process keeps running.
 *
 * So a session is identified by id **and** generation. A callback carries the
 * generation it was created with, and acts only if the registry still holds
 * that one.
 */
export class Generations {
  /**
   * Never decreases, and is never deleted.
   *
   * Two maps rather than one, because releasing has to forget that an id is
   * live without forgetting how many sessions it has had. Deleting a single
   * entry restarts the count at 1, and a stale callback still holding 1 then
   * matches the next session exactly — the bug this class exists to prevent,
   * reintroduced by the cleanup. A test caught it.
   */
  private readonly issued = new Map<string, number>();
  /** The generation an id currently holds, while it holds one. */
  private readonly live = new Map<string, number>();

  /** Claim the next generation for an id. */
  next(id: string): number {
    const generation = (this.issued.get(id) ?? 0) + 1;
    this.issued.set(id, generation);
    this.live.set(id, generation);
    return generation;
  }

  /** Is this the generation the registry currently holds? */
  isCurrent(id: string, generation: number): boolean {
    return this.live.get(id) === generation;
  }

  /**
   * Forget an id, if the caller holds the current generation.
   *
   * Returns whether it acted, so a caller can tell a stale callback from a
   * real one without asking twice.
   */
  release(id: string, generation: number): boolean {
    if (!this.isCurrent(id, generation)) return false;
    this.live.delete(id);
    return true;
  }
}

/**
 * Managers, one per owner.
 *
 * A flat registry of sessions cannot answer "which window asked for this", so
 * one window closing while another stays open leaves its shells running. The
 * requirement is owner-scoped cleanup, from `#37`.
 *
 * Keying by owner makes reaping one owner a lookup rather than a search, and
 * leaves a session id from one owner unable to name another owner's session.
 */
export class Owners<Owner, Manager> {
  private readonly managers = new Map<Owner, Manager>();

  constructor(
    private readonly create: (owner: Owner) => Manager,
    private readonly dispose: (manager: Manager) => void,
  ) {}

  /** This owner's manager, creating one on first use. */
  for(owner: Owner): Manager {
    const existing = this.managers.get(owner);
    if (existing !== undefined) return existing;

    const manager = this.create(owner);
    this.managers.set(owner, manager);
    return manager;
  }

  /** This owner's manager, if it has ever asked for one. */
  get(owner: Owner): Manager | undefined {
    return this.managers.get(owner);
  }

  /** Dispose one owner's manager. Every other owner keeps its own. */
  release(owner: Owner): void {
    const manager = this.managers.get(owner);
    if (manager === undefined) return;
    this.managers.delete(owner);
    this.dispose(manager);
  }

  /** Dispose every manager. Call on quit. */
  releaseAll(): void {
    for (const owner of [...this.managers.keys()]) this.release(owner);
  }
}

/**
 * How much output to hold before dropping.
 *
 * Output is batched and flushed on a timer. A process that writes faster than
 * the renderer drains — `yes`, a build log, a runaway loop — grows the buffer
 * without bound, and the memory is charged to the main process where it can
 * take the whole application down rather than one tab.
 *
 * `#37` asks for this before many concurrent sessions are exposed to a
 * consumer, which is what exporting the terminal does.
 */
export const MAX_PENDING_BYTES = 1_000_000;

export interface Buffered {
  text: string;
  /** How many characters were dropped since the last flush. */
  dropped: number;
}

export function emptyBuffer(): Buffered {
  return { text: '', dropped: 0 };
}

/**
 * Append, dropping from the front when the buffer is over its limit.
 *
 * One string rather than a list of chunks, so dropping is a slice and there is
 * no optional index to fall back on. It also drops exactly the overflow rather
 * than whole chunks, so the limit means what it says.
 *
 * The front goes first because the newest output is what a user is looking at.
 * Scrollback lives in the emulator, and dropping the tail would lose the prompt
 * about to be shown.
 */
export function append(buffer: Buffered, chunk: string, limit = MAX_PENDING_BYTES): void {
  buffer.text += chunk;

  // Unconditional. At or under the limit `excess` is zero, and both lines are
  // then no-ops, so a guard around them is a branch no test can tell apart
  // from its absence.
  const excess = Math.max(0, buffer.text.length - limit);
  buffer.dropped += excess;
  buffer.text = buffer.text.slice(excess);
}

/** Take everything buffered, and say what was lost. */
export function drain(buffer: Buffered): { text: string; dropped: number } {
  const { text, dropped } = buffer;
  buffer.text = '';
  buffer.dropped = 0;
  return { text, dropped };
}

/**
 * How much of a session's output to keep for a view that attaches later.
 *
 * Charged for the whole life of a session rather than only while a flush is
 * outstanding, which is why it is a fifth of `MAX_PENDING_BYTES`.
 */
export const MAX_RETAINED_BYTES = 200_000;

const TRUNCATION_NOTICE = '\r\n\x1b[2m[earlier output dropped]\x1b[0m\r\n';

/**
 * The tail of what a session has printed.
 *
 * `Buffered` is emptied on every flush, so it records nothing. A view that
 * attaches to a session already running has missed everything printed before
 * it existed, and a live shell under a blank screen reads as a broken one.
 */
export interface Retained {
  text: string;
  truncated: boolean;
}

export function emptyRetained(): Retained {
  return { text: '', truncated: false };
}

/**
 * Keep the newest output, dropping from the front at the limit.
 *
 * The front goes first for the reason `append` gives: the newest output is
 * what a user is looking at.
 */
export function retain(
  retained: Retained,
  chunk: string,
  limit = MAX_RETAINED_BYTES,
): void {
  const combined = retained.text + chunk;
  const excess = Math.max(0, combined.length - limit);
  retained.text = combined.slice(excess);
  retained.truncated ||= excess > 0;
}

/** What an attaching view writes before anything else. */
export function replay(retained: Retained): string {
  return (retained.truncated ? TRUNCATION_NOTICE : '') + retained.text;
}
