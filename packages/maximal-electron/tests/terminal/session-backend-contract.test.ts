import { describe, expect, it } from 'vitest';

import {
  TmuxProjectionBroker,
  type TmuxProjectionProcess,
} from '../../src/host/terminal-host.js';
import type { TerminalSessionBackend } from '../../src/host/terminal-session-backend.js';

function processWire(): TmuxProjectionProcess {
  return {
    onData: () => undefined,
    onExit: () => undefined,
    write: () => undefined,
    resize: () => undefined,
    kill: () => undefined,
  };
}

describe('terminal session backend contract', () => {
  it('allows the tmux broker to be consumed as a shared-session backend', () => {
    const backend: TerminalSessionBackend = new TmuxProjectionBroker({
      attach: () => processWire(),
      terminateSession: () => undefined,
      emit: () => undefined,
      onExit: () => undefined,
    });

    expect(backend.attach({ sessionId: 'shared', projectionId: 'view-1', cols: 80, rows: 24 })).toBe(true);
    expect(backend.focus('shared', 'view-1', 100, 30)).toBe(1);
    expect(backend.geometry('shared')).toEqual({ cols: 100, rows: 30 });
    expect(backend.detach('shared', 'view-1')).toBe(true);
  });
});
