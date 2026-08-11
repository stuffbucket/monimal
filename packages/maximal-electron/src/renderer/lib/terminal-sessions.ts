import type { TerminalSession } from './terminal-transport.js';

/**
 * Which running sessions have no view.
 *
 * Only the renderer knows which sessions it is showing, so the host lists every
 * live one and this narrows it. That difference is the whole of the detach
 * bookkeeping: nothing signals a detach, and there is no attached flag in the
 * main process to fall out of step with the views.
 *
 * The order the host reported is kept, so a caller that sorts does it once.
 */
export function detachedSessions(
  sessions: readonly TerminalSession[],
  attachedIds: Iterable<string>,
): TerminalSession[] {
  const attached = new Set(attachedIds);
  return sessions.filter((session) => !attached.has(session.id));
}
