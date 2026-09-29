import { describe, expect, it, vi } from 'vitest';
import { tmuxNames } from '../support/tmux-names.js';
import {
  mkdtempSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DockerConnector,
  execFileRunner,
  KubernetesConnector,
  LimaConnector,
  MultipassConnector,
  PodmanConnector,
  SshConnector,
  SshTmuxConnector,
  TmuxConnector,
  readSshConfig,
  VagrantConnector,
  WslConnector,
  type CommandConnector,
  type CommandRunner,
} from '../../src/launch/command-connectors.js';
import {
  TerminalLauncher,
  coerceTerminalProfiles,
  loadTerminalProfiles,
  terminalProfiles,
} from '../../src/launch/launcher.js';

describe('terminal profiles', () => {
  it('coerces corrupt and future files to the current safe version', () => {
    expect(coerceTerminalProfiles('{')).toEqual({ version: 7 });
    expect(coerceTerminalProfiles({ version: 8, profiles: [] })).toEqual({ version: 7 });
    expect(coerceTerminalProfiles({ version: 1, profiles: ['malformed'] })).toEqual({ version: 7 });
    expect(coerceTerminalProfiles({ version: 2, profiles: [{}] })).toEqual({ version: 7, profiles: [{}] });
    expect(coerceTerminalProfiles({ version: 6, profiles: [{ recent: 'docker' }] })).toEqual({ version: 7, profiles: [{ recent: 'docker' }] });
    expect(terminalProfiles('darwin')).toEqual([
      {
        id: 'local',
        label: 'Local',
        description: 'Open a terminal on your local file system',
        kind: 'local',
      },
      { id: 'docker', label: 'Docker', kind: 'docker' },
      { id: 'podman', label: 'Podman', kind: 'podman' },
      { id: 'lima', label: 'Lima', kind: 'lima' },
      { id: 'multipass', label: 'Multipass', kind: 'multipass' },
      { id: 'kubernetes', label: 'Kubernetes', kind: 'kubernetes' },
      { id: 'vagrant', label: 'Vagrant', kind: 'vagrant' },
      { id: 'ssh', label: 'SSH', kind: 'ssh' },
      {
        id: 'tmux',
        label: 'Local',
        description: 'Open a terminal on your local file system',
        kind: 'tmux',
      },
      { id: 'ssh-tmux', label: 'SSH', kind: 'ssh-tmux' },
    ]);
    expect(terminalProfiles('win32').map((profile) => profile.id)).toEqual(['local', 'docker', 'podman', 'multipass', 'kubernetes', 'wsl', 'vagrant', 'ssh', 'ssh-tmux']);
    expect(terminalProfiles('win32').find((profile) => profile.id === 'wsl')).toEqual({ id: 'wsl', label: 'WSL', kind: 'wsl' });
    expect(terminalProfiles('linux').map((profile) => [profile.id, profile.label])).toContainEqual(['ssh', 'SSH']);
    expect(terminalProfiles('linux').map((profile) => [profile.id, profile.label])).toContainEqual(['ssh-tmux', 'SSH']);
    expect(terminalProfiles('win32').map((profile) => profile.id)).toContain('ssh');
    expect(terminalProfiles('freebsd').map((profile) => profile.id)).toEqual(['local', 'docker']);
  });

  it.each([
    ['darwin', ['lima', 'tmux'], ['tmux-control', 'wsl']],
    ['linux', ['lima', 'tmux'], ['tmux-control', 'wsl']],
    ['win32', ['wsl'], ['tmux-control', 'lima', 'tmux']],
    ['freebsd', [], ['tmux-control', 'podman', 'lima', 'multipass', 'kubernetes', 'wsl', 'vagrant', 'ssh', 'tmux', 'ssh-tmux']],
  ] as const)('gates profiles for %s', (platform, present, absent) => {
    const ids = terminalProfiles(platform).map((profile) => profile.id);
    for (const id of present) expect(ids).toContain(id);
    for (const id of absent) expect(ids).not.toContain(id);
  });

  it('repairs a corrupt terminal-profiles.json with the versioned default', () => {
    const directory = mkdtempSync(join(tmpdir(), 'terminal-profiles-'));
    writeFileSync(join(directory, 'terminal-profiles.json'), '{', 'utf8');
    expect(loadTerminalProfiles(directory)).toEqual({ version: 7 });
    expect(JSON.parse(readFileSync(join(directory, 'terminal-profiles.json'), 'utf8'))).toEqual({ version: 7 });
  });

  it.each([
    [undefined, { version: 7 }],
    [null, { version: 7 }],
    [{ version: 0, profiles: [] }, { version: 7 }],
    [{ version: '1', profiles: [] }, { version: 7 }],
    [{ version: 1, profiles: [] }, { version: 7, profiles: [] }],
    [{ version: 7, profiles: [] }, { version: 7, profiles: [] }],
    [{ version: 7, profiles: [null] }, { version: 7 }],
    [{ version: 7, profiles: [{}] }, { version: 7, profiles: [{}] }],
    [{ version: 7, profiles: [], extra: true }, { version: 7, profiles: [] }],
  ])('migrates terminal profile records safely', (input, expected) => {
    expect(coerceTerminalProfiles(input)).toEqual(expected);
  });

  it('creates a missing profile directory and persists the safe default', () => {
    const directory = join(mkdtempSync(join(tmpdir(), 'terminal-profiles-parent-')), 'nested');
    expect(loadTerminalProfiles(directory)).toEqual({ version: 7 });
    expect(readFileSync(join(directory, 'terminal-profiles.json'), 'utf8')).toBe(
      '{\n  "version": 7\n}\n',
    );
  });
});

describe('command discovery boundaries', () => {
  it('runs host-owned commands without a shell and reads only the requested SSH config bytes', async () => {
    const version = await execFileRunner(process.execPath, ['--version'], {
      timeout: 2_000,
      maxBuffer: 64 * 1024,
    });
    expect(version.stdout).toMatch(/^v\d+/);
    await expect(execFileRunner(process.execPath, ['-e', 'process.exit(7)'], { timeout: 2_000, maxBuffer: 64 * 1024 })).rejects.toMatchObject({ code: 7 });
    await expect(execFileRunner(process.execPath, ['-e', 'process.abort()'], { timeout: 2_000, maxBuffer: 64 * 1024 })).rejects.toMatchObject({ signal: 'SIGABRT' });
    await expect(execFileRunner(process.execPath, ['-e', 'setTimeout(() => undefined, 1000)'], { timeout: 10, maxBuffer: 64 * 1024 })).rejects.toMatchObject({ killed: true });
    await expect(execFileRunner(process.execPath, ['-e', "process.stdout.write('x'.repeat(128))"], { timeout: 2_000, maxBuffer: 64 })).rejects.toMatchObject({ code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' });

    const directory = mkdtempSync(join(tmpdir(), 'ssh-config-'));
    const filename = join(directory, 'config');
    writeFileSync(filename, 'Host work\n', 'utf8');
    expect(readSshConfig(filename, 10)).toBe('Host work\n');
    writeFileSync(filename, 'Host work\nextra', 'utf8');
    expect(() => readSshConfig(filename, 10)).toThrow('SSH config exceeds the discovery limit.');
    unlinkSync(filename);
    expect(() => readSshConfig(filename, 10)).toThrow(expect.objectContaining({ code: 'ENOENT' }));
  });

  it('parses one safe SSH alias per CRLF Host line before Match and preserves command failures', async () => {
    const readConfig = vi.fn(() => '  Host\twork # primary host\r\nHOST  duplicate\r\nHost work\r\nHost many aliases\r\nHost invalid;alias\r\nMatch all\r\nHost ignored\r\n');
    const run = vi.fn<CommandRunner>().mockResolvedValue({ stdout: '' });
    const connector = new SshConnector('/home/ada', readConfig, run);
    await expect(connector.discover()).resolves.toEqual([{ key: 'work', label: 'work' }, { key: 'duplicate', label: 'duplicate' }]);
    expect(readConfig).toHaveBeenCalledWith('/home/ada/.ssh/config', 64 * 1024);
    expect(run).toHaveBeenCalledWith('ssh', ['-V'], { timeout: 2_000, maxBuffer: 64 * 1024 });
    await expect(new SshConnector('/home/ada', () => 'Host work\n', async () => { throw new Error('unavailable'); }).discover()).rejects.toThrow('unavailable');
    await expect(new SshConnector('/home/ada', () => `Host ${'a'.repeat(64 * 1024)}\n`).discover()).rejects.toThrow('SSH config exceeds the discovery limit.');
  });

  it.each([
    [DockerConnector, 'context\u00000123456789abcdef', ['context\u00000123456789abcdef-', '-context\u00000123456789abcdef']],
    [PodmanConnector, '\u00000123456789abcdef', ['local\u00000123456789abcdef-', '-local\u00000123456789abcdef']],
    [LimaConnector, 'instance', ['-instance', `i${'n'.repeat(128)}`]],
    [MultipassConnector, 'instance', ['-instance', `i${'n'.repeat(128)}`]],
    [WslConnector, 'Ubuntu-24.04', ['-Ubuntu', `U${'b'.repeat(128)}`]],
    [TmuxConnector, 'existing\u0000session', ['existing\u0000-session', 'existing\u0000session;']],
    [KubernetesConnector, 'context\u0000namespace\u0000pod\u000011111111-1111-1111-1111-111111111111\u0000container', ['-context\u0000namespace\u0000pod\u000011111111-1111-1111-1111-111111111111\u0000container', 'context\u0000namespace\u0000pod\u000011111111-1111-1111-1111-111111111111\u0000container-']],
    [VagrantConnector, '11111111-1111-1111-1111-111111111111\u0000machine\u0000provider\u0000/projects/machine', ['x11111111-1111-1111-1111-111111111111\u0000machine\u0000provider\u0000/projects/machine', '11111111-1111-1111-1111-111111111111\u0000machine\u0000provider\u0000relative']],
  ] as const)('accepts a complete key and rejects anchored boundary violations', (Connector, validKey, invalidKeys) => {
    const connector = Connector === TmuxConnector
      ? new TmuxConnector(async () => ({ stdout: '' }), tmuxNames('0123456789abcdef0123456789abcdef'))
      : new (Connector as Exclude<typeof Connector, typeof TmuxConnector>)(async () => ({ stdout: "" }));
    expect(() => connector.launch({ key: validKey, label: 'trusted' })).not.toThrow();
    for (const key of invalidKeys) expect(() => connector.launch({ key, label: 'untrusted' }), key).toThrow();
  });

  it.each([
    [new DockerConnector(async () => ({ stdout: '' })), 'context\u00000123456789abcdef', { command: 'docker', args: ['--context', 'context', 'exec', '-it', '0123456789abcdef', '/bin/sh'] }],
    [new PodmanConnector(async () => ({ stdout: '' })), '\u00000123456789abcdef', { command: 'podman', args: ['exec', '-it', '0123456789abcdef', '/bin/sh'] }],
    [new LimaConnector(async () => ({ stdout: '' })), 'instance', { command: 'limactl', args: ['shell', 'instance'] }],
    [new MultipassConnector(async () => ({ stdout: '' })), 'instance', { command: 'multipass', args: ['shell', 'instance'] }],
    [new WslConnector(async () => ({ stdout: '' })), 'Ubuntu-24.04', { command: 'wsl.exe', args: ['--distribution', 'Ubuntu-24.04'] }],
    [new VagrantConnector(async () => ({ stdout: '' })), '11111111-1111-1111-1111-111111111111\u0000machine\u0000provider\u0000/projects/machine', { command: 'vagrant', args: ['ssh', '11111111-1111-1111-1111-111111111111'] }],
    [new KubernetesConnector(async () => ({ stdout: '' })), 'context\u0000namespace\u0000pod\u000011111111-1111-1111-1111-111111111111\u0000container', { command: 'kubectl', args: ['--context', 'context', '--namespace', 'namespace', 'exec', '-it', 'pod', '-c', 'container', '--', '/bin/sh'] }],
    [new SshConnector('/home/ada', () => ''), 'work', { command: 'ssh', args: ['-tt', 'work'] }],
    [new TmuxConnector(async () => ({ stdout: '' }), tmuxNames('0123456789abcdef0123456789abcdef')), 'existing\u0000session', {
      command: 'tmux',
      args: ['-T', 'hyperlinks', 'new-session', '-A', '-s', 'session'],
      tmuxProjection: {
        ownership: 'existing',
        geometry: { transport: 'local', sessionName: 'session' },
      },
    }],
    [new SshTmuxConnector('/home/ada', tmuxNames('0123456789abcdef0123456789abcdef'), () => '', async () => ({ stdout: '' })), 'work\u0000existing\u0000session', {
      command: 'ssh',
      args: ['-tt', 'work', 'tmux', '-T', 'hyperlinks', 'new-session', '-A', '-s', 'session'],
      tmuxProjection: {
        ownership: 'existing',
        geometry: { transport: 'ssh', alias: 'work', sessionName: 'session' },
      },
    }],
  ] as const)('builds exact argv for %p', (connector, key, expected) => {
    expect(connector.launch({ key, label: 'trusted' })).toEqual(expected);
  });

  it.each([
    [new DockerConnector(async () => ({ stdout: '' })), ['context\u00000123456789a', 'context\u00000123456789abcdefsuffix']],
    [new PodmanConnector(async () => ({ stdout: '' })), ['\u00000123456789a', 'remote\u00000123456789abcdefsuffix']],
    [new LimaConnector(async () => ({ stdout: '' })), ['instance;', '.instance']],
    [new MultipassConnector(async () => ({ stdout: '' })), ['instance;', '.instance']],
    [new WslConnector(async () => ({ stdout: '' })), ['Ubuntu;', '.Ubuntu']],
    [new SshConnector('/home/ada', () => ''), ['work;', '.work']],
    [new TmuxConnector(async () => ({ stdout: '' }), tmuxNames('0123456789abcdef0123456789abcdef')), ['existing\u0000session;', 'new\u0000maximal-0123456789abcdef0123456789abcdefx']],
    [new SshTmuxConnector('/home/ada', tmuxNames('0123456789abcdef0123456789abcdef'), () => '', async () => ({ stdout: '' })), ['work\u0000existing\u0000session;', 'work\u0000new\u0000maximal-0123456789abcdef0123456789abcdefx']],
    [new VagrantConnector(async () => ({ stdout: '' })), ['11111111-1111-1111-1111-111111111111\u0000machine;\u0000provider\u0000/projects/machine', '11111111-1111-1111-1111-111111111111\u0000machine\u0000provider\u0000/projects/machine;']],
    [new KubernetesConnector(async () => ({ stdout: '' })), ['context\u0000namespace\u0000pod\u000011111111-1111-1111-1111-111111111111\u0000container;', 'context\u0000namespace\u0000pod\u000011111111-1111-1111-1111-111111111111x\u0000container']],
  ] as const)('rejects prefix and suffix target-field mutations for %p', (connector, keys) => {
    for (const key of keys) expect(() => connector.launch({ key, label: 'untrusted' }), key).toThrow();
  });

  it('accepts maximum-length names and rejects names one character beyond their limit', () => {
    const context = `a${'b'.repeat(127)}`;
    const instance = `a${'b'.repeat(127)}`;
    const alias = `a${'b'.repeat(126)}`;
    expect(() => new DockerConnector(async () => ({ stdout: '' })).launch({ key: `${context}\u00000123456789abcdef`, label: 'trusted' })).not.toThrow();
    expect(() => new DockerConnector(async () => ({ stdout: '' })).launch({ key: `a${'b'.repeat(128)}\u00000123456789abcdef`, label: 'untrusted' })).toThrow();
    expect(() => new LimaConnector(async () => ({ stdout: '' })).launch({ key: instance, label: 'trusted' })).not.toThrow();
    expect(() => new LimaConnector(async () => ({ stdout: '' })).launch({ key: `a${'b'.repeat(128)}`, label: 'untrusted' })).toThrow();
    expect(() => new SshConnector('/home/ada', () => '').launch({ key: alias, label: 'trusted' })).not.toThrow();
    expect(() => new SshConnector('/home/ada', () => '').launch({ key: `a${'b'.repeat(127)}`, label: 'untrusted' })).toThrow();
  });

  it('ignores non-string Docker discovery fields and accepts a Windows Vagrant directory', async () => {
    const docker = new DockerConnector(vi.fn<CommandRunner>()
      .mockResolvedValueOnce({ stdout: '{"Name":123}\n{"Name":"work"}\n' })
      .mockResolvedValueOnce({ stdout: '{"ID":123}\n{"ID":"0123456789abcdef"}\n' }));
    await expect(docker.discover()).resolves.toEqual([{ key: 'work\u00000123456789abcdef', label: 'work: Container' }]);

    const id = '11111111-1111-1111-1111-111111111111';
    const vagrant = new VagrantConnector(async () => ({ stdout: [
      `1234567890,${id},name,machine`,
      `1234567890,${id},provider,virtualbox`,
      `1234567890,${id},state,running`,
      `1234567890,${id},directory,C:/projects/machine`,
    ].join('\n') }));
    await expect(vagrant.discover()).resolves.toEqual([{ key: `${id}\u0000machine\u0000virtualbox\u0000C:/projects/machine`, label: 'machine (virtualbox)' }]);
  });

  it('ignores SSH hosts after the configured line limit', async () => {
    const config = `Host early\n${'# comment\n'.repeat(1_023)}Host too-late\n`;
    await expect(new SshConnector('/home/ada', () => config).discover()).resolves.toEqual([{ key: 'early', label: 'early' }]);
  });

  it('parses CRLF-delimited tmux sessions without retaining carriage returns', async () => {
    const first = 'maximal-11111111111111111111111111111111';
    const second = 'maximal-22222222222222222222222222222222';
    const connector = new TmuxConnector(async () => ({ stdout: `${first}\r\n${second}\r\n` }), tmuxNames('0123456789abcdef0123456789abcdef'));
    await expect(connector.discover()).resolves.toEqual([
      { key: `resume\u0000${first}`, label: 'Terminal 1', purpose: 'running' },
      { key: `resume\u0000${second}`, label: 'Terminal 2', purpose: 'running' },
      { key: 'new\u0000maximal-0123456789abcdef0123456789abcdef', label: 'Local', purpose: 'new' },
    ]);
  });

  it('accepts output exactly at the discovery byte limit and rejects one byte more', async () => {
    await expect(new WslConnector(async () => ({ stdout: 'x'.repeat(64 * 1024) })).discover()).resolves.toEqual([]);
    await expect(new WslConnector(async () => ({ stdout: 'x'.repeat(64 * 1024 + 1) })).discover()).rejects.toThrow('Command output exceeds the discovery limit.');
    const dockerOutput = '{"Name":"context"}'.padEnd(64 * 1024, ' ');
    await expect(new DockerConnector(async () => ({ stdout: dockerOutput })).discover()).resolves.toEqual([]);
    await expect(new DockerConnector(async () => ({ stdout: `${dockerOutput} ` })).discover()).rejects.toThrow('Command output exceeds the discovery limit.');
    const podmanOutput = '[]'.padEnd(64 * 1024, ' ');
    await expect(new PodmanConnector(async () => ({ stdout: podmanOutput })).discover()).resolves.toEqual([]);
    await expect(new PodmanConnector(async () => ({ stdout: `${podmanOutput} ` })).discover()).rejects.toThrow('Command output exceeds the discovery limit.');
  });

  it.each([
    [LimaConnector, '{"name":"valid","status":"Stopped"}\n{"name":null,"status":"Running"}\n'],
    [MultipassConnector, '{"list":[{"name":"valid","state":"STOPPED"},{"name":null,"state":"RUNNING"}]}'],
    [KubernetesConnector, '{"items":[null,{"metadata":{"namespace":"apps","name":"web","uid":"bad"},"status":{"phase":"Running"},"spec":{"containers":[null,{"name":"Bad_Name"}]}}]}'],
  ] as const)('rejects non-runnable or malformed %p records', async (Connector, stdout) => {
    const connector = new Connector(async (_command, args) => args[0] === 'config' ? { stdout: 'context\n' } : { stdout });
    await expect(connector.discover()).resolves.toEqual([]);
  });

  it('rejects non-record Docker and Podman entries while preserving exact valid targets', async () => {
    const docker = new DockerConnector(vi.fn<CommandRunner>()
      .mockResolvedValueOnce({ stdout: '{"Name":"context"}\nnull\n[]\n' })
      .mockResolvedValueOnce({ stdout: '{"ID":"0123456789abcdef","Names":"web"}\nnull\n' }));
    const podman = new PodmanConnector(vi.fn<CommandRunner>()
      .mockResolvedValueOnce({ stdout: '[null,[],{"Name":"local","Default":true}]' })
      .mockResolvedValueOnce({ stdout: '[null,[],{"Id":"0123456789abcdef","Names":"web"}]' }));
    await expect(docker.discover()).resolves.toEqual([{ key: 'context\u00000123456789abcdef', label: 'context: web' }]);
    await expect(podman.discover()).resolves.toEqual([{ key: '\u00000123456789abcdef', label: 'local: web' }]);
    expect(docker.launch({ key: 'context\u00000123456789abcdef', label: 'ignored' })).toEqual({ command: 'docker', args: ['--context', 'context', 'exec', '-it', '0123456789abcdef', '/bin/sh'] });
    expect(podman.launch({ key: '\u00000123456789abcdef', label: 'ignored' })).toEqual({ command: 'podman', args: ['exec', '-it', '0123456789abcdef', '/bin/sh'] });
  });
});

describe('TerminalLauncher', () => {
  it('consumes a trusted reservation once and only for its owner', () => {
    const owner = {};
    const launch = { command: '/bin/example', args: ['--safe'], cwd: '/work', env: { SAFE: 'yes' } };
    const launcher = new TerminalLauncher<object>({ createId: () => 'session', localLaunch: launch });
    const result = launcher.launch(owner, { profileId: 'local', targetId: 'local', cols: 80, rows: 24 });

    expect(result).toEqual({ sessionId: 'session', label: 'Local', canRunInBackground: false });
    expect(launcher.take({}, 'session')).toBeUndefined();
    expect(launcher.take(owner, 'session')).toEqual(launch);
    expect(launcher.take(owner, 'session')).toBeUndefined();
  });

  it('launches Local without a target ID but rejects a non-local local target', () => {
    const owner = {};
    const launch = { command: '/bin/example', args: [] };
    const launcher = new TerminalLauncher<object>({ createId: () => 'session', localLaunch: launch });

    expect(launcher.launch(owner, { profileId: 'local', cols: 80, rows: 24 })).toEqual({ sessionId: 'session', label: 'Local', canRunInBackground: false });
    expect(launcher.take(owner, 'session')).toEqual(launch);
    expect(() => launcher.launch(owner, { profileId: 'local', targetId: 'not-local', cols: 80, rows: 24 })).toThrow('Unknown terminal profile or target.');
  });

  it('uses the selected platform and shell fallback for an unconfigured Local launch', () => {
    const owner = {};
    vi.stubEnv('SHELL', '/bin/test-shell');
    const posix = new TerminalLauncher<object>({ createId: () => 'posix', platform: 'linux' });
    expect(posix.take(owner, posix.launch(owner, { profileId: 'local', cols: 80, rows: 24 }).sessionId)).toEqual({ command: '/bin/test-shell', args: [] });
    vi.unstubAllEnvs();
    const shell = process.env['SHELL'];
    delete process.env['SHELL'];
    const fallback = new TerminalLauncher<object>({ createId: () => 'fallback', platform: 'linux' });
    expect(fallback.take(owner, fallback.launch(owner, { profileId: 'local', cols: 80, rows: 24 }).sessionId)).toEqual({ command: '/bin/zsh', args: [] });
    if (shell === undefined) delete process.env['SHELL'];
    else process.env['SHELL'] = shell;
    const windows = new TerminalLauncher<object>({ createId: () => 'windows', platform: 'win32' });
    expect(windows.take(owner, windows.launch(owner, { profileId: 'local', cols: 80, rows: 24 }).sessionId)).toEqual({ command: 'powershell.exe', args: [] });
  });

  it('prepends and launches app-owned direct command profiles', () => {
    const owner = {};
    const launch = { command: 'agent', args: ['--interactive'] };
    const launcher = new TerminalLauncher<object>({
      createId: () => 'session',
      directProfiles: [{
        profile: {
          id: 'agent',
          label: 'Agent',
          description: 'Open the app agent',
          kind: 'command',
        },
        launch,
      }],
    });
    expect(launcher.profiles()[0]).toEqual({
      id: 'agent',
      label: 'Agent',
      description: 'Open the app agent',
      kind: 'command',
    });
    expect(launcher.launch(owner, { profileId: 'agent', cols: 80, rows: 24 })).toEqual({
      sessionId: 'session',
      label: 'Agent',
      canRunInBackground: false,
    });
    expect(launcher.take(owner, 'session')).toEqual(launch);
  });

  it('rejects a target for an app-owned direct command profile', () => {
    const owner = {};
    const launcher = new TerminalLauncher<object>({
      directProfiles: [{
        profile: { id: 'agent', label: 'Agent', kind: 'command' },
        launch: { command: 'agent', args: [] },
      }],
    });
    expect(() => launcher.launch(owner, {
      profileId: 'agent',
      targetId: 'unexpected',
      cols: 80,
      rows: 24,
    })).toThrow('Unknown terminal profile or target.');
  });

  it('expires and releases an owner reservation', () => {
    let now = 0;
    const owner = {};
    const otherOwner = {};
    const ids = ['expired', 'owner', 'other'];
    const launcher = new TerminalLauncher<object>({
      createId: () => ids.shift()!,
      now: () => now,
      reservationMs: 10,
    });
    launcher.launch(owner, { profileId: 'local', cols: 80, rows: 24 });
    now = 10;
    expect(launcher.take(owner, 'expired')).toBeUndefined();
    launcher.launch(owner, { profileId: 'local', cols: 80, rows: 24 });
    launcher.launch(otherOwner, { profileId: 'local', cols: 80, rows: 24 });
    launcher.release(owner);
    expect(launcher.take(owner, 'owner')).toBeUndefined();
    expect(launcher.take(otherOwner, 'other')).toBeDefined();
  });

  it('discovers only Local by default', async () => {
    await expect(new TerminalLauncher<object>().discover({})).resolves.toEqual({
      generation: 1,
      targets: [{ id: 'local', profileId: 'local', label: 'This computer', state: 'available' }],
    });
  });

  it('discovers independent connectors concurrently and keeps profile order', async () => {
    let releaseSlow!: (targets: { key: string; label: string }[]) => void;
    const slowResult = new Promise<{ key: string; label: string }[]>((resolve) => {
      releaseSlow = resolve;
    });
    let fastStarted = false;
    const slow: CommandConnector = {
      id: 'docker',
      label: 'Docker',
      discover: () => slowResult,
      launch: () => ({ command: 'docker', args: [] }),
    };
    const fast: CommandConnector = {
      id: 'podman',
      label: 'Podman',
      discover: async () => {
        fastStarted = true;
        return [{ key: 'fast', label: 'Fast' }];
      },
      launch: () => ({ command: 'podman', args: [] }),
    };
    const ids = ['slow-id', 'fast-id'];
    const launcher = new TerminalLauncher<object>({
      connectors: [slow, fast],
      createId: () => ids.shift()!,
      platform: 'linux',
    });

    const discovery = launcher.discover({});
    await vi.waitFor(() => { expect(fastStarted).toBe(true); });
    releaseSlow([{ key: 'slow', label: 'Slow' }]);

    await expect(discovery).resolves.toEqual({
      generation: 1,
      targets: [
        { id: 'local', profileId: 'local', label: 'This computer', state: 'available' },
        { id: 'slow-id', profileId: 'docker', label: 'Slow', state: 'available' },
        { id: 'fast-id', profileId: 'podman', label: 'Fast', state: 'available' },
      ],
    });
  });

  it('rejects a non-local profile without a minted target ID', () => {
    const launcher = new TerminalLauncher<object>({ platform: 'linux' });
    expect(() => launcher.launch({}, { profileId: 'docker', cols: 80, rows: 24 })).toThrow('Unknown terminal profile or target.');
    expect(() => launcher.launch({}, { profileId: 'tmux-control', cols: 80, rows: 24 })).toThrow('Unknown terminal profile or target.');
  });

  it('does not expose the experimental tmux control launch', () => {
    const owner = {};
    const launcher = new TerminalLauncher<object>({ createId: () => 'tmux-session', platform: 'linux' });
    expect(() => launcher.launch(owner, { profileId: 'tmux-control', targetId: 'local', cols: 80, rows: 24 }))
      .toThrow('Unknown terminal profile or target.');
    expect(() => launcher.launch(owner, { profileId: 'tmux-control', targetId: 'not-local', cols: 80, rows: 24 })).toThrow('Unknown terminal profile or target.');
  });

  it('launches tmux control on the local target once a launcher offers its profile', () => {
    class ControlLauncher extends TerminalLauncher<object> {
      override profiles() {
        return [...super.profiles(), { id: 'tmux-control', label: 'Tmux Control (Experimental)', kind: 'tmux-control' as const }];
      }
    }
    const owner = {};
    let id = 0;
    const launcher = new ControlLauncher({ createId: () => `control-${++id}`, platform: 'linux' });
    const control = { command: 'tmux', args: [], tmuxControl: true };

    expect(launcher.launch(owner, { profileId: 'tmux-control', cols: 80, rows: 24 }))
      .toEqual({ sessionId: 'control-1', label: 'Tmux Control (Experimental)', canRunInBackground: false });
    expect(launcher.take(owner, 'control-1')).toEqual(control);
    expect(launcher.launch(owner, { profileId: 'tmux-control', targetId: 'local', cols: 80, rows: 24 }))
      .toEqual({ sessionId: 'control-2', label: 'Tmux Control (Experimental)', canRunInBackground: false });
    expect(launcher.take(owner, 'control-2')).toEqual(control);
    expect(() => launcher.launch(owner, { profileId: 'tmux-control', targetId: 'not-local', cols: 80, rows: 24 }))
      .toThrow('Unknown terminal profile or target.');
    expect(() => launcher.launch(owner, { profileId: 'docker', cols: 80, rows: 24 }))
      .toThrow('Unknown terminal profile or target.');
  });

  it('requires both the tmux control profile id and kind before launching control mode', () => {
    class WrongIdLauncher extends TerminalLauncher<object> {
      override profiles() {
        return [...super.profiles(), { id: 'other-control', label: 'Other Control', kind: 'tmux-control' as const }];
      }
    }
    class WrongKindLauncher extends TerminalLauncher<object> {
      override profiles() {
        return [...super.profiles(), { id: 'tmux-control', label: 'Tmux Control (Experimental)', kind: 'local' as const }];
      }
    }
    const owner = {};

    expect(() => new WrongIdLauncher({ platform: 'linux' }).launch(owner, {
      profileId: 'tmux-control',
      targetId: 'local',
      cols: 80,
      rows: 24,
    })).toThrow('Unknown terminal profile or target.');
    expect(() => new WrongKindLauncher({ platform: 'linux' }).launch(owner, {
      profileId: 'tmux-control',
      targetId: 'local',
      cols: 80,
      rows: 24,
    })).toThrow('Unknown terminal profile or target.');
  });

  it('keeps a discovered target purpose and lets a tmux projection run in the background', async () => {
    const connector = new TmuxConnector(async (_command, args) => ({ stdout: args[0] === '-V' ? 'tmux 3.4\n' : '' }), tmuxNames('0123456789abcdef0123456789abcdef'));
    const launcher = new TerminalLauncher<object>({ connectors: [connector], createId: () => 'opaque', platform: 'linux' });
    const owner = {};
    const { targets } = await launcher.discover(owner);

    expect(targets).toContainEqual({ id: 'opaque', profileId: 'tmux', label: 'Local', state: 'available', purpose: 'new' });
    expect(launcher.launch(owner, { profileId: 'tmux', targetId: 'opaque', cols: 80, rows: 24 }))
      .toEqual({ sessionId: 'opaque', label: 'Local', canRunInBackground: true });
  });

  it('clears only the releasing owner targets and advances each discovery generation', async () => {
    const connector = new LimaConnector(async () => ({ stdout: '{"name":"running","status":"Running"}\n' }));
    const launcher = new TerminalLauncher<object>({ connectors: [connector], createId: () => crypto.randomUUID(), platform: 'linux' });
    const owner = {};
    const otherOwner = {};
    const first = await launcher.discover(owner);
    const other = await launcher.discover(otherOwner);
    expect(other.generation).toBe(first.generation + 1);
    const ownerTarget = first.targets.find((target) => target.profileId === 'lima')!;
    const otherTarget = other.targets.find((target) => target.profileId === 'lima')!;
    launcher.release(owner);
    expect(() => launcher.launch(owner, { profileId: 'lima', targetId: ownerTarget.id, cols: 80, rows: 24 })).toThrow();
    expect(launcher.launch(otherOwner, { profileId: 'lima', targetId: otherTarget.id, cols: 80, rows: 24 }).label).toBe('Lima');
  });

  it('uses the supplied ID factory for opaque targets and releases only the current owner targets', async () => {
    const connector = new DockerConnector(vi.fn<CommandRunner>()
      .mockResolvedValueOnce({ stdout: '{"Name":"desktop"}\n' })
      .mockResolvedValueOnce({ stdout: '{"ID":"0123456789abcdef","Names":"web"}\n' }));
    const ids = ['opaque-target', 'opaque-session'];
    const launcher = new TerminalLauncher<object>({ connectors: [connector], createId: () => ids.shift()!, platform: 'linux' });
    const owner = {};
    const otherOwner = {};
    const target = (await launcher.discover(owner)).targets.find((candidate) => candidate.profileId === 'docker')!;
    expect(target.id).toBe('opaque-target');
    launcher.release(otherOwner);
    expect(launcher.launch(owner, { profileId: 'docker', targetId: target.id, cols: 80, rows: 24 }).label).toBe('Docker');
    launcher.release(owner);
    expect(() => launcher.launch(owner, { profileId: 'docker', targetId: target.id, cols: 80, rows: 24 })).toThrow('Unknown terminal profile or target.');
  });

  it('rejects a minted target when the requested connector does not own its profile', async () => {
    const docker = new DockerConnector(vi.fn<CommandRunner>()
      .mockResolvedValueOnce({ stdout: '{"Name":"desktop"}\n' })
      .mockResolvedValueOnce({ stdout: '{"ID":"0123456789abcdef","Names":"web"}\n' }));
    const podmanLaunch = vi.fn(() => ({ command: 'podman', args: [] }));
    const podman = { id: 'podman' as const, label: 'Podman', discover: async () => [], launch: podmanLaunch };
    const launcher = new TerminalLauncher<object>({ connectors: [docker, podman], createId: () => 'opaque', platform: 'linux' });
    const owner = {};
    const target = (await launcher.discover(owner)).targets.find((candidate) => candidate.profileId === 'docker')!;

    expect(() => launcher.launch(owner, { profileId: 'podman', targetId: target.id, cols: 80, rows: 24 })).toThrow('Unknown terminal profile or target.');
    expect(podmanLaunch).not.toHaveBeenCalled();
  });

  it('selects the connector that matches a minted target profile', async () => {
    const docker = new DockerConnector(vi.fn<CommandRunner>()
      .mockResolvedValueOnce({ stdout: '{"Name":"desktop"}\n' })
      .mockResolvedValueOnce({ stdout: '{"ID":"0123456789abcdef","Names":"web"}\n' }));
    const podmanLaunch = vi.fn(() => ({ command: 'podman', args: [] }));
    const podman = { id: 'podman' as const, label: 'Podman', discover: async () => [], launch: podmanLaunch };
    const launcher = new TerminalLauncher<object>({ connectors: [podman, docker], createId: () => 'opaque', platform: 'linux' });
    const owner = {};
    const target = (await launcher.discover(owner)).targets.find((candidate) => candidate.profileId === 'docker')!;

    expect(launcher.launch(owner, { profileId: 'docker', targetId: target.id, cols: 80, rows: 24 })).toEqual({
      sessionId: 'opaque',
      label: 'Docker',
      canRunInBackground: false,
    });
    expect(podmanLaunch).not.toHaveBeenCalled();
  });

});
