import { describe, expect, it, vi } from 'vitest';
import { tmuxNamed, tmuxNames } from '../support/tmux-names.js';
import {
  DockerConnector,
  KubernetesConnector,
  LimaConnector,
  MultipassConnector,
  PodmanConnector,
  SshConnector,
  SshTmuxConnector,
  TmuxConnector,
  VagrantConnector,
  WslConnector,
  type CommandRunner,
} from '../../src/launch/command-connectors.js';
import { TerminalLauncher } from '../../src/launch/launcher.js';

describe('tmux connectors', () => {
  it('discovers bounded local tmux sessions plus a generated New target with exact argv', async () => {
    const sessions = [
      'unsafe; touch nope',
      ...Array.from(
        { length: 129 },
        (_value, index) => `maximal-${index.toString(16).padStart(32, '0')}`,
      ),
    ].join('\n');
    const run = vi.fn<CommandRunner>().mockImplementation(async (_command, args) => ({
      stdout: args[0] === '-V' ? 'tmux 3.7b\n' : sessions,
    }));
    const connector = new TmuxConnector(run, tmuxNames('0123456789abcdef0123456789abcdef'));
    const targets = await connector.discover();
    expect(run).toHaveBeenNthCalledWith(1, 'tmux', ['-V'], { timeout: 2_000, maxBuffer: 64 * 1024 });
    expect(run).toHaveBeenNthCalledWith(2, 'tmux', ['list-sessions', '-F', '#{session_name}'], { timeout: 2_000, maxBuffer: 64 * 1024 });
    expect(targets).toHaveLength(129);
    expect(targets[0]).toEqual({
      key: 'resume\u0000maximal-00000000000000000000000000000000',
      label: 'Terminal 1',
      purpose: 'running',
    });
    expect(targets.at(-1)).toEqual({
      key: 'new\u0000maximal-0123456789abcdef0123456789abcdef',
      label: 'Local',
      purpose: 'new',
    });
    expect(connector.launch(targets[0]!)).toEqual({
      command: 'tmux',
      args: [
        '-T', 'hyperlinks', 'new-session', '-A', '-s',
        'maximal-00000000000000000000000000000000',
      ],
      tmuxProjection: {
        ownership: 'created',
        geometry: {
          transport: 'local',
          sessionName: 'maximal-00000000000000000000000000000000',
        },
        terminate: {
          command: 'tmux',
          args: ['kill-session', '-t', 'maximal-00000000000000000000000000000000'],
        },
      },
    });
    expect(connector.launch(targets.at(-1)!)).toEqual({
      command: 'tmux',
      args: ['-T', 'hyperlinks', 'new-session', '-A', '-s', 'maximal-0123456789abcdef0123456789abcdef'],
      tmuxProjection: {
        ownership: 'created',
        geometry: {
          transport: 'local',
          sessionName: 'maximal-0123456789abcdef0123456789abcdef',
        },
        terminate: {
          command: 'tmux',
          args: ['kill-session', '-t', 'maximal-0123456789abcdef0123456789abcdef'],
        },
      },
    });
    expect(() => connector.launch({ key: 'existing\u0000name; injected', label: 'bad' })).toThrow();
    await expect(new TmuxConnector(run, tmuxNames('not-generated')).discover()).rejects.toThrow();
  });

  it('omits hyperlink advertisement for tmux versions that cannot implement OSC 8', async () => {
    const session = 'maximal-11111111111111111111111111111111';
    const run = vi.fn<CommandRunner>().mockResolvedValueOnce({ stdout: 'tmux 3.3a\n' }).mockResolvedValueOnce({ stdout: `${session}\n` });
    const connector = new TmuxConnector(run, tmuxNames('0123456789abcdef0123456789abcdef'));
    const [target] = await connector.discover();
    expect(connector.launch(target!)).toEqual({
      command: 'tmux',
      args: ['new-session', '-A', '-s', session],
      tmuxProjection: {
        ownership: 'created',
        geometry: { transport: 'local', sessionName: session },
        terminate: { command: 'tmux', args: ['kill-session', '-t', session] },
      },
    });
  });

  it.each([
    ['tmux 2.4\n', false],
    [' tmux 3.4 \n', true],
    ['tmux 4.0\n', true],
    ['tmux 13.4\n', true],
    ['tmux 3.14\n', true],
    ['prefix tmux 3.4\n', false],
    ['not tmux\n', false],
  ])('derives hyperlink advertisement from tmux version %j', async (version, supportsHyperlinks) => {
    const session = 'maximal-11111111111111111111111111111111';
    const run = vi.fn<CommandRunner>().mockResolvedValueOnce({ stdout: version }).mockResolvedValueOnce({ stdout: `${session}\n` });
    const connector = new TmuxConnector(run, tmuxNames('0123456789abcdef0123456789abcdef'));
    const [target] = await connector.discover();

    expect(connector.launch(target!).args).toEqual([
      ...(supportsHyperlinks ? ['-T', 'hyperlinks'] : []),
      'new-session', '-A', '-s', session,
    ]);
  });

  it('defaults to hyperlink advertisement before discovery', () => {
    const connector = new TmuxConnector(async () => ({ stdout: '' }), tmuxNames());

    expect(connector.launch({ key: 'existing\u0000work', label: 'Tmux session 1' }).args)
      .toEqual(['-T', 'hyperlinks', 'new-session', '-A', '-s', 'work']);
  });

  it('keeps the generated tmux target key and label distinct', async () => {
    const generated = 'maximal-0123456789abcdef0123456789abcdef';
    const connector = new TmuxConnector(async () => ({ stdout: '' }), tmuxNamed(generated));
    await expect(connector.discover()).resolves.toEqual([{ key: `new\u0000${generated}`, label: 'Local', purpose: 'new' }]);
  });

  it('keeps tmux New available without a server, but marks a missing tmux binary unavailable', async () => {
    const noServer = Object.assign(new Error('no server'), { code: 1 });
    const connector = new TmuxConnector(async (_command, args) => {
      if (args[0] === '-V') return { stdout: 'tmux 3.7b\n' };
      throw noServer;
    }, tmuxNames('0123456789abcdef0123456789abcdef'));
    await expect(connector.discover()).resolves.toEqual([{ key: 'new\u0000maximal-0123456789abcdef0123456789abcdef', label: 'Local', purpose: 'new' }]);
    const missing = Object.assign(new Error('missing'), { code: 'ENOENT' });
    const launcher = new TerminalLauncher<object>({ connectors: [new TmuxConnector(async () => { throw missing; }, tmuxNames())], platform: 'linux' });
    await expect(launcher.discover({})).resolves.toEqual({ generation: 1, targets: [
      { id: 'local', profileId: 'local', label: 'This computer', state: 'available' },
      { id: 'tmux-unavailable', profileId: 'tmux', label: 'Local', state: 'unavailable' },
    ] });
  });

  it('uses capped conservative SSH aliases for remote tmux and isolates failed hosts', async () => {
    const name = 'maximal-0123456789abcdef0123456789abcdef';
    const existing = 'maximal-11111111111111111111111111111111';
    const reader = vi.fn().mockReturnValue(['Host work', 'Host broken', 'Host unsafe;alias', ...Array.from({ length: 20 }, (_value, index) => `Host host-${index}`)].join('\n'));
    const noServer = Object.assign(new Error('no server'), { code: 1 });
    const run = vi.fn<CommandRunner>().mockImplementation(async (_command, args) => {
      if (args[3] === 'tmux -V') return { stdout: args[2] === 'host-1' ? 'tmux 3.3a\n' : 'tmux 3.7b\n' };
      if (args[2] === 'broken') throw new Error('unreachable');
      if (args[2] === 'host-0') throw noServer;
      return { stdout: `${existing}\nremote-work\ninvalid name\n` };
    });
    const connector = new SshTmuxConnector('/home/ada', tmuxNamed(name), reader, run);
    const targets = await connector.discover();
    expect(run).toHaveBeenCalledTimes(32);
    expect(run).toHaveBeenNthCalledWith(1, 'ssh', ['-o', 'BatchMode=yes', 'work', 'tmux -V'], { timeout: 2_000, maxBuffer: 64 * 1024 });
    expect(run).toHaveBeenNthCalledWith(2, 'ssh', ['-o', 'BatchMode=yes', 'work', "tmux list-sessions -F '#{session_name}'"], { timeout: 2_000, maxBuffer: 64 * 1024 });
    expect(targets).toContainEqual(expect.objectContaining({ label: 'work', purpose: 'new' }));
    expect(targets.some((target) => target.key === `work\u0000resume\u0000${existing}`)).toBe(true);
    expect(targets.some((target) => target.key === `host-0\u0000new\u0000${name}`)).toBe(true);
    expect(targets.some((target) => target.key.startsWith('broken\u0000'))).toBe(false);
    expect(connector.launch({ key: `work\u0000existing\u0000remote-work`, label: 'Tmux session 1' })).toEqual({
      command: 'ssh',
      args: ['-tt', 'work', 'tmux', '-T', 'hyperlinks', 'new-session', '-A', '-s', 'remote-work'],
      tmuxProjection: {
        ownership: 'existing',
        geometry: { transport: 'ssh', alias: 'work', sessionName: 'remote-work' },
      },
    });
    expect(connector.launch({ key: `work\u0000new\u0000${name}`, label: 'New tmux session' })).toEqual({
      command: 'ssh',
      args: ['-tt', 'work', 'tmux', '-T', 'hyperlinks', 'new-session', '-A', '-s', name],
      tmuxProjection: {
        ownership: 'created',
        geometry: { transport: 'ssh', alias: 'work', sessionName: name },
        terminate: { command: 'ssh', args: ['work', 'tmux', 'kill-session', '-t', name] },
      },
    });
    expect(connector.launch({ key: `host-1\u0000existing\u0000remote-work`, label: 'Tmux session 1' }).args).toEqual([
      '-tt', 'host-1', 'tmux', 'new-session', '-A', '-s', 'remote-work',
    ]);
    expect(() => connector.launch({ key: `work;bad\u0000new\u0000${name}`, label: 'bad' })).toThrow();
  });

  it('removes a remote alias from the legacy set after tmux is upgraded', async () => {
    const name = 'maximal-0123456789abcdef0123456789abcdef';
    const existing = 'maximal-11111111111111111111111111111111';
    let version = 'tmux 3.3a\n';
    const run = vi.fn<CommandRunner>().mockImplementation(async (_command, args) => (
      args[3] === 'tmux -V' ? { stdout: version } : { stdout: `${existing}\n` }
    ));
    const connector = new SshTmuxConnector('/home/ada', tmuxNamed(name), () => 'Host work', run);

    let target = (await connector.discover()).find((candidate) => candidate.key.includes('\u0000resume\u0000'))!;
    expect(connector.launch(target).args).toEqual(['-tt', 'work', 'tmux', 'new-session', '-A', '-s', existing]);

    version = 'tmux 3.4\n';
    target = (await connector.discover()).find((candidate) => candidate.key.includes('\u0000resume\u0000'))!;
    expect(connector.launch(target).args).toEqual([
      '-tt', 'work', 'tmux', '-T', 'hyperlinks', 'new-session', '-A', '-s', existing,
    ]);
  });

  it('keeps tmux target IDs opaque and owner- and generation-scoped', async () => {
    const existing = 'maximal-11111111111111111111111111111111';
    const connector = new TmuxConnector(async () => ({ stdout: `${existing}\n` }), tmuxNames('0123456789abcdef0123456789abcdef'));
    const launcher = new TerminalLauncher<object>({ connectors: [connector], createId: () => crypto.randomUUID(), platform: 'linux' });
    const owner = {};
    const target = (await launcher.discover(owner)).targets.find((candidate) => candidate.profileId === 'tmux' && candidate.label === 'Terminal 1')!;
    expect(target.id).not.toContain(existing);
    expect(() => launcher.launch({}, { profileId: 'tmux', targetId: target.id, cols: 80, rows: 24 })).toThrow();
    await launcher.discover(owner);
    expect(() => launcher.launch(owner, { profileId: 'tmux', targetId: target.id, cols: 80, rows: 24 })).toThrow();
    expect(() => launcher.launch(owner, { profileId: 'tmux', targetId: 'random', cols: 80, rows: 24 })).toThrow();
  });

  it('uses exact SSH and tmux discovery recipes and rejects malformed generated targets', async () => {
    const sshRun = vi.fn<CommandRunner>().mockResolvedValue({ stdout: '' });
    const ssh = new SshConnector('/home/ada', () => 'Host work\nHost dev.example\n', sshRun);
    await expect(ssh.discover()).resolves.toEqual([{ key: 'work', label: 'work' }, { key: 'dev.example', label: 'dev.example' }]);
    expect(sshRun).toHaveBeenCalledWith('ssh', ['-V'], { timeout: 2_000, maxBuffer: 64 * 1024 });
    for (const key of ['', '-work', 'work;', `w${'o'.repeat(127)}`]) expect(() => ssh.launch({ key, label: 'untrusted' })).toThrow('Invalid SSH target.');

    const generated = 'maximal-0123456789abcdef0123456789abcdef';
    const existing = 'maximal-11111111111111111111111111111111';
    const tmux = new TmuxConnector(async () => ({ stdout: `one\n${existing}\ntwo\n` }), tmuxNamed(generated));
    await expect(tmux.discover()).resolves.toEqual([
      { key: `resume\u0000${existing}`, label: 'Terminal 1', purpose: 'running' },
      { key: `new\u0000${generated}`, label: 'Local', purpose: 'new' },
    ]);
    for (const key of [`new\u0000x${generated}`, `new\u0000${generated}x`, 'other\u0000one', `other\u0000${generated}`, 'existing\u0000one;']) {
      expect(() => tmux.launch({ key, label: 'untrusted' })).toThrow('Invalid tmux target.');
    }
  });

  it('creates remote tmux targets only for reachable SSH aliases and preserves their exact argv', async () => {
    const generated = 'maximal-0123456789abcdef0123456789abcdef';
    const existing = 'maximal-11111111111111111111111111111111';
    const noServer = Object.assign(new Error('no server'), { code: 1 });
    const run = vi.fn<CommandRunner>().mockImplementation(async (_command, args) => {
      if (args[3] === 'tmux -V') return { stdout: 'tmux 3.7b\n' };
      if (args[2] === 'empty') throw noServer;
      if (args[2] === 'broken') throw new Error('unavailable');
      return { stdout: `${existing}\nteam\ninvalid;\n` };
    });
    const connector = new SshTmuxConnector('/home/ada', tmuxNamed(generated), () => 'Host work\nHost empty\nHost broken\n', run);
    await expect(connector.discover()).resolves.toEqual([
      { key: `work\u0000resume\u0000${existing}`, label: 'work — Terminal 1', purpose: 'running' },
      { key: `work\u0000new\u0000${generated}`, label: 'work', purpose: 'new' },
      { key: `empty\u0000new\u0000${generated}`, label: 'empty', purpose: 'new' },
    ]);
    expect(run).toHaveBeenNthCalledWith(1, 'ssh', ['-o', 'BatchMode=yes', 'work', 'tmux -V'], { timeout: 2_000, maxBuffer: 64 * 1024 });
    expect(run).toHaveBeenNthCalledWith(2, 'ssh', ['-o', 'BatchMode=yes', 'work', "tmux list-sessions -F '#{session_name}'"], { timeout: 2_000, maxBuffer: 64 * 1024 });
    for (const key of [`work\u0000new\u0000${generated}x`, `work;\u0000existing\u0000team`, 'work\u0000other\u0000team', `work\u0000other\u0000${generated}`]) {
      expect(() => connector.launch({ key, label: 'untrusted' })).toThrow('Invalid SSH tmux target.');
    }
  });

  it.each([
    ['Docker', new DockerConnector(vi.fn<CommandRunner>()
      .mockResolvedValueOnce({ stdout: 'null\n{}\n{"Name":"desktop"}\n' })
      .mockResolvedValueOnce({ stdout: 'null\n{}\n{"ID":"0123456789abcdef"}\n' })), [{ key: 'desktop\u00000123456789abcdef', label: 'desktop: Container' }]],
    ['Podman connection', new PodmanConnector(async () => ({ stdout: '{}' })), 'Invalid Podman connection output.'],
    ['Podman container', new PodmanConnector(vi.fn<CommandRunner>()
      .mockResolvedValueOnce({ stdout: JSON.stringify([{ Name: 'remote', Default: false }]) })
      .mockResolvedValueOnce({ stdout: '{}' })), 'Invalid Podman container output.'],
    ['Multipass', new MultipassConnector(async () => ({ stdout: 'null' })), 'Invalid Multipass list output.'],
    ['Kubernetes', new KubernetesConnector(async (_command, args) => args[0] === 'config' ? { stdout: 'context\n' } : { stdout: 'null' }), 'Invalid Kubernetes pod output.'],
  ] as const)('rejects malformed %s structured output', async (_provider, connector, expected) => {
    if (Array.isArray(expected)) await expect(connector.discover()).resolves.toEqual(expected);
    else await expect(connector.discover()).rejects.toThrow(expected);
  });

  it('fails closed for missing, unreadable, and oversized remote SSH configuration', async () => {
    const missing = Object.assign(new Error('missing'), { code: 'ENOENT' });
    await expect(new SshTmuxConnector('/home/ada', tmuxNames(), () => { throw missing; }).discover()).resolves.toEqual([]);
    const denied = Object.assign(new Error('denied'), { code: 'EACCES' });
    await expect(new SshTmuxConnector('/home/ada', tmuxNames(), () => { throw denied; }).discover()).rejects.toThrow('denied');
    await expect(new SshTmuxConnector('/home/ada', tmuxNames(), () => 'Host work'.repeat(64 * 1024)).discover()).rejects.toThrow('SSH config exceeds the discovery limit.');
  });

  it.each([
    [new DockerConnector(async () => ({ stdout: '' })), 'bad', 'Invalid Docker target.'],
    [new PodmanConnector(async () => ({ stdout: '' })), 'bad', 'Invalid Podman target.'],
    [new LimaConnector(async () => ({ stdout: '' })), 'bad;', 'Invalid Lima target.'],
    [new MultipassConnector(async () => ({ stdout: '' })), 'bad;', 'Invalid Multipass target.'],
    [new WslConnector(async () => ({ stdout: '' })), 'bad;', 'Invalid WSL target.'],
    [new VagrantConnector(async () => ({ stdout: '' })), 'bad', 'Invalid Vagrant target.'],
    [new KubernetesConnector(async () => ({ stdout: '' })), 'bad', 'Invalid Kubernetes target.'],
    [new SshConnector('/home/ada', () => ''), 'bad;', 'Invalid SSH target.'],
    [new TmuxConnector(async () => ({ stdout: '' }), tmuxNames()), 'bad', 'Invalid tmux target.'],
    [new SshTmuxConnector('/home/ada', tmuxNames(), () => ''), 'bad', 'Invalid SSH tmux target.'],
  ] as const)('reports the exact fail-closed launch error for each connector', (connector, key, message) => {
    expect(() => connector.launch({ key, label: 'untrusted' })).toThrow(message);
  });
});
