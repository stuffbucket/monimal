import { randomBytes } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { homedir } from 'node:os';

import { describe, expect, it } from 'vitest';

import {
  LocalPtyConnector,
  TmuxProjectionBroker,
} from '../../src/host/terminal-host.js';

const ENABLED = process.env['RUN_TMUX_INTEGRATION'] === '1' && process.platform !== 'win32';

async function until(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for tmux output.');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe.skipIf(!ENABLED)('tmux projection integration', () => {
  it('keeps one pane alive across two real client PTYs and one detach', async () => {
    const socket = `stuffbucket-test-${String(process.pid)}-${randomBytes(4).toString('hex')}`;
    const sessionId = 'shared';
    const output = new Map<string, string>();
    const connector = new LocalPtyConnector();

    execFileSync('tmux', ['-L', socket, 'new-session', '-d', '-s', sessionId]);
    try {
      const broker = new TmuxProjectionBroker({
        attach: ({ cols, rows }) => connector.connect({
          command: 'tmux',
          args: ['-L', socket, 'attach-session', '-t', sessionId],
          name: 'xterm-256color',
          cols,
          rows,
          cwd: homedir(),
          env: { ...process.env, TERM: 'xterm-256color' } as Record<string, string>,
        }),
        terminateSession: () => {
          spawnSync('tmux', ['-L', socket, 'kill-session', '-t', sessionId]);
        },
        emit: (_sessionId, projectionId, chunk) => {
          output.set(projectionId, (output.get(projectionId) ?? '') + chunk);
        },
        onExit: () => undefined,
      });

      expect(broker.attach({ sessionId, projectionId: 'left', cols: 80, rows: 24 })).toBe(true);
      const leftEpoch = broker.focus(sessionId, 'left', 80, 24)!;
      expect(broker.write(sessionId, 'left', leftEpoch, "printf 'first-marker\\n'\r")).toBe(true);
      await until(() => output.get('left')?.includes('first-marker') === true);

      expect(broker.attach({ sessionId, projectionId: 'right', cols: 120, rows: 40 })).toBe(true);
      await until(() => output.get('right')?.includes('first-marker') === true);
      const rightEpoch = broker.focus(sessionId, 'right', 100, 30)!;
      expect(broker.detach(sessionId, 'left')).toBe(true);
      expect(broker.write(sessionId, 'right', rightEpoch, "printf 'second-marker\\n'\r")).toBe(true);
      await until(() => output.get('right')?.includes('second-marker') === true);

      expect(broker.geometry(sessionId)).toEqual({ cols: 100, rows: 30 });
      expect(broker.terminate(sessionId)).toBe(true);
    } finally {
      spawnSync('tmux', ['-L', socket, 'kill-server']);
    }
  });
});