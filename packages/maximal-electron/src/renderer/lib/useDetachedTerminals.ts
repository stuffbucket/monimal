import { useCallback, useEffect, useState } from 'react';

import { detachedSessions } from './terminal-sessions.js';
import type {
  DetachableTerminalTransport,
  TerminalSession,
} from './terminal-transport.js';

/**
 * The shells running with no tab showing them.
 *
 * Nothing announces a detach, because a detach is the absence of a terminate.
 * So the set is derived: ask the host what is live, and subtract the tabs this
 * shell holds. `refresh` is returned for the two moments that change the answer
 * without changing the tabs, which is a detached shell exiting on its own.
 */
export function useDetachedTerminals(
  transport: DetachableTerminalTransport,
  attachedIds: readonly string[],
): { detached: TerminalSession[]; refresh: () => void } {
  const [detached, setDetached] = useState<TerminalSession[]>([]);

  const refresh = useCallback(() => {
    void transport.list().then((sessions) => {
      setDetached(detachedSessions(sessions, attachedIds));
    });
  }, [transport, attachedIds]);

  useEffect(refresh, [refresh]);

  return { detached, refresh };
}
