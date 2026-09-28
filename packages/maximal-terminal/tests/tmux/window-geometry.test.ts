import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { TmuxWindowGeometry, type TmuxGeometryTarget } from '../../src/tmux/window-geometry.js';

const local: TmuxGeometryTarget = { transport: 'local', sessionName: 'work' };

function deferred<Result>() {
  let resolve!: (value: Result) => void;
  const promise = new Promise<Result>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

describe('TmuxWindowGeometry', () => {
  it('records the original policy, forces a manual size, and restores the policy once', async () => {
    const calls: Array<{ command: string; args: readonly string[] }> = [];
    const settled = vi.fn();
    const geometry = new TmuxWindowGeometry(settled, async (command, args) => {
      calls.push({ command, args });
      if (args.includes('show-options')) return { stdout: 'latest\n' };
      return { stdout: '101x33\n' };
    });

    await expect(geometry.apply('s', local, 101, 33)).resolves.toEqual({ cols: 101, rows: 33 });
    await geometry.restore('s', local);
    await geometry.restore('s', local);

    expect(calls).toEqual([
      { command: 'tmux', args: ['show-options', '-wv', '-t', 'work', 'window-size'] },
      {
        command: 'tmux',
        args: [
          'set-option', '-w', '-t', 'work', 'window-size', 'manual',
          ';',
          'resize-window', '-t', 'work', '-x', '101', '-y', '33',
          ';',
          'display-message', '-p', '-t', 'work', '#{window_width}x#{window_height}',
        ],
      },
      { command: 'tmux', args: ['set-option', '-w', '-t', 'work', 'window-size', 'latest'] },
    ]);
    expect(settled.mock.calls).toEqual([['s', true], ['s', true], ['s', true]]);
  });

  it('forgets a recorded policy without restoring it', async () => {
    const command = vi.fn(async (_command: string, args: readonly string[]) => (
      args.includes('show-options') ? { stdout: 'latest\n' } : { stdout: '80x24\n' }
    ));
    const geometry = new TmuxWindowGeometry(vi.fn(), command);

    await geometry.apply('s', local, 80, 24);
    geometry.forget('s');
    await geometry.restore('s', local);

    expect(command).toHaveBeenCalledTimes(2);
  });

  it('resolves and restores an inherited global window-size policy', async () => {
    const command = vi.fn(async (_command: string, args: readonly string[]) => {
      if (args.includes('-wv')) return { stdout: '' };
      if (args.includes('-wgv')) return { stdout: 'latest\n' };
      return { stdout: '80x24\n' };
    });
    const geometry = new TmuxWindowGeometry(vi.fn(), command);

    await geometry.apply('s', local, 80, 24);
    await geometry.restore('s', local);

    expect(command.mock.calls.map(([, args]) => args)).toEqual([
      ['show-options', '-wv', '-t', 'work', 'window-size'],
      ['show-options', '-wgv', 'window-size'],
      [
        'set-option', '-w', '-t', 'work', 'window-size', 'manual',
        ';',
        'resize-window', '-t', 'work', '-x', '80', '-y', '24',
        ';',
        'display-message', '-p', '-t', 'work', '#{window_width}x#{window_height}',
      ],
      ['set-option', '-wu', '-t', 'work', 'window-size'],
    ]);
  });

  it('builds a fixed escaped remote tmux geometry command', async () => {
    const command = vi.fn(async (_executable: string, args: readonly string[]) => (
      args[1]?.includes('show-options') ? { stdout: 'smallest\n' } : { stdout: '90x28\n' }
    ));
    const geometry = new TmuxWindowGeometry(vi.fn(), command);

    await geometry.apply('s', { transport: 'ssh', alias: 'host-1', sessionName: 'work' }, 90, 28);

    expect(command).toHaveBeenNthCalledWith(1, 'ssh', ['host-1', 'tmux show-options -wv -t work window-size']);
    expect(command).toHaveBeenLastCalledWith('ssh', [
      'host-1',
      "tmux set-option -w -t work window-size manual \\; resize-window -t work -x 90 -y 28 \\; display-message -p -t work '#{window_width}x#{window_height}'",
    ]);
  });

  it('rejects unsafe trusted geometry targets before running a command', async () => {
    const command = vi.fn(async () => ({ stdout: 'latest\n' }));
    const settled = vi.fn();
    const geometry = new TmuxWindowGeometry(settled, command);

    await expect(geometry.apply('a', { transport: 'local', sessionName: 'bad;name' }, 80, 24))
      .rejects.toThrow('Invalid trusted tmux session name.');
    await expect(geometry.apply('b', { transport: 'ssh', alias: 'bad;alias', sessionName: 'work' }, 80, 24))
      .rejects.toThrow('Invalid trusted SSH alias.');

    expect(command).not.toHaveBeenCalled();
    expect(settled.mock.calls).toEqual([['a', false], ['b', false]]);
  });

  it('rejects invalid tmux policies and geometry output', async () => {
    const geometry = new TmuxWindowGeometry(vi.fn(), vi.fn()
      .mockResolvedValueOnce({ stdout: 'aggressive\n' })
      .mockResolvedValueOnce({ stdout: 'latest\n' })
      .mockResolvedValueOnce({ stdout: 'noise\nnot-a-size\n' })
      .mockResolvedValueOnce({ stdout: 'noise\nprefix91x31\n' })
      .mockResolvedValueOnce({ stdout: 'noise\n91x31suffix\n' })
      .mockResolvedValueOnce({ stdout: '91x3\n' }));

    await expect(geometry.apply('s', local, 80, 24))
      .rejects.toThrow('Tmux reported an invalid window-size policy.');
    await expect(geometry.apply('s', local, 90, 30))
      .rejects.toThrow('Tmux did not report its actual window geometry.');
    await expect(geometry.apply('s', local, 91, 31))
      .rejects.toThrow('Tmux did not report its actual window geometry.');
    await expect(geometry.apply('s', local, 91, 31))
      .rejects.toThrow('Tmux did not report its actual window geometry.');
    await expect(geometry.apply('s', local, 91, 3))
      .resolves.toEqual({ cols: 91, rows: 3 });
  });

  it('parses the final geometry line and continues queued commands after a failed resize', async () => {
    const calls: Array<readonly string[]> = [];
    const geometry = new TmuxWindowGeometry(vi.fn(), async (_executable, args) => {
      calls.push(args);
      if (args.includes('show-options')) return { stdout: 'manual\n' };
      if (args[args.indexOf('-x') + 1] === '90') throw new Error('first resize failed');
      return { stdout: 'ignored\n90x20\n 91x31 \n' };
    });

    const first = geometry.apply('s', local, 90, 30);
    const second = geometry.apply('s', local, 91, 31);

    await expect(first).rejects.toThrow('first resize failed');
    await expect(second).resolves.toEqual({ cols: 91, rows: 31 });
    expect(calls.filter((args) => args.includes('show-options'))).toHaveLength(1);
    expect(calls.filter((args) => args.includes('resize-window'))).toHaveLength(2);
  });

  it('reads the original window-size once and serializes queued commands per session', async () => {
    const firstResize = deferred<{ stdout: string }>();
    const calls: Array<readonly string[]> = [];
    const geometry = new TmuxWindowGeometry(vi.fn(), (_executable, args) => {
      calls.push(args);
      if (args.includes('show-options')) return Promise.resolve({ stdout: 'latest\n' });
      return calls.filter((call) => call.includes('resize-window')).length === 1
        ? firstResize.promise
        : Promise.resolve({ stdout: '120x40\n' });
    });

    const first = geometry.apply('s', local, 100, 30);
    const second = geometry.apply('s', local, 120, 40);
    const restore = geometry.restore('s', local);
    await vi.waitFor(() => expect(calls.filter((args) => args.includes('resize-window'))).toHaveLength(1));
    expect(geometry.queueCount).toBe(1);

    firstResize.resolve({ stdout: '100x30\n' });
    await expect(first).resolves.toEqual({ cols: 100, rows: 30 });
    await expect(second).resolves.toEqual({ cols: 120, rows: 40 });
    await restore;
    expect(calls.filter((args) => args.includes('show-options'))).toHaveLength(1);
    expect(calls.at(-1)).toEqual(['set-option', '-w', '-t', 'work', 'window-size', 'latest']);
    await vi.waitFor(() => expect(geometry.queueCount).toBe(0));
  });

  it('uses the default tmux command runner to resize and report real server geometry', async () => {
    const sessionName = `maximal-test-${String(process.pid)}-${randomBytes(4).toString('hex')}`;
    execFileSync('tmux', ['new-session', '-d', '-s', sessionName, '/bin/sh']);
    execFileSync('tmux', ['set-option', '-w', '-t', sessionName, 'window-size', 'latest']);
    const geometry = new TmuxWindowGeometry(vi.fn());
    const target: TmuxGeometryTarget = { transport: 'local', sessionName };

    try {
      await expect(geometry.apply('real', target, 87, 23)).resolves.toEqual({ cols: 87, rows: 23 });
      await geometry.restore('real', target);
      expect(execFileSync('tmux', ['show-options', '-wv', '-t', sessionName, 'window-size'], { encoding: 'utf8' }).trim())
        .toBe('latest');
    } finally {
      spawnSync('tmux', ['kill-session', '-t', sessionName]);
    }
  });

  it('keeps the default command runner bounded to a small stdout buffer', async () => {
    const binDir = mkdtempSync(join(tmpdir(), 'tmux-fake-'));
    const fakeTmux = join(binDir, 'tmux');
    writeFileSync(fakeTmux, [
      '#!/bin/sh',
      'if [ "$1" = "show-options" ]; then',
      "  printf 'latest\\n'",
      'else',
      '  yes x | head -c 70000',
      "  printf '\\n80x24\\n'",
      'fi',
      '',
    ].join('\n'));
    chmodSync(fakeTmux, 0o755);
    const originalPath = process.env['PATH'];
    process.env['PATH'] = `${binDir}:${originalPath ?? ''}`;
    try {
      await expect(new TmuxWindowGeometry(vi.fn()).apply('s', local, 80, 24))
        .rejects.toThrow('stdout maxBuffer length exceeded');
    } finally {
      process.env['PATH'] = originalPath;
      rmSync(binDir, { recursive: true, force: true });
    }
  });
});
