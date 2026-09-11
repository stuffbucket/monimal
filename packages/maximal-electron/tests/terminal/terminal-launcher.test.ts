import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
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
  type CommandRunner,
} from '../../src/main/native/command-connectors.js';
import {
  TerminalLauncher,
  coerceTerminalProfiles,
  loadTerminalProfiles,
  terminalProfiles,
} from '../../src/main/native/terminal-launcher.js';

describe('terminal profiles', () => {
  it('coerces corrupt and future files to the current safe version', () => {
    expect(coerceTerminalProfiles('{')).toEqual({ version: 7 });
    expect(coerceTerminalProfiles({ version: 8, profiles: [] })).toEqual({ version: 7 });
    expect(coerceTerminalProfiles({ version: 1, profiles: ['malformed'] })).toEqual({ version: 7 });
    expect(coerceTerminalProfiles({ version: 2, profiles: [{}] })).toEqual({ version: 7, profiles: [{}] });
    expect(coerceTerminalProfiles({ version: 6, profiles: [{ recent: 'docker' }] })).toEqual({ version: 7, profiles: [{ recent: 'docker' }] });
    expect(terminalProfiles('darwin')).toEqual([
      { id: 'local', label: 'Local', kind: 'local' },
      { id: 'tmux-control', label: 'Tmux Control (Experimental)', kind: 'tmux-control' },
      { id: 'docker', label: 'Docker', kind: 'docker' },
      { id: 'podman', label: 'Podman', kind: 'podman' },
      { id: 'lima', label: 'Lima', kind: 'lima' },
      { id: 'multipass', label: 'Multipass', kind: 'multipass' },
      { id: 'kubernetes', label: 'Kubernetes', kind: 'kubernetes' },
      { id: 'vagrant', label: 'Vagrant', kind: 'vagrant' },
      { id: 'ssh', label: 'SSH', kind: 'ssh' },
      { id: 'tmux', label: 'Tmux', kind: 'tmux' },
      { id: 'ssh-tmux', label: 'SSH + Tmux', kind: 'ssh-tmux' },
    ]);
    expect(terminalProfiles('win32').map((profile) => profile.id)).toEqual(['local', 'docker', 'podman', 'multipass', 'kubernetes', 'wsl', 'vagrant', 'ssh', 'ssh-tmux']);
    expect(terminalProfiles('win32').find((profile) => profile.id === 'wsl')).toEqual({ id: 'wsl', label: 'WSL', kind: 'wsl' });
    expect(terminalProfiles('linux').map((profile) => [profile.id, profile.label])).toContainEqual(['ssh', 'SSH']);
    expect(terminalProfiles('linux').map((profile) => [profile.id, profile.label])).toContainEqual(['ssh-tmux', 'SSH + Tmux']);
    expect(terminalProfiles('win32').map((profile) => profile.id)).toContain('ssh');
    expect(terminalProfiles('freebsd').map((profile) => profile.id)).toEqual(['local', 'docker']);
  });

  it.each([
    ['darwin', ['tmux-control', 'lima', 'tmux'], ['wsl']],
    ['linux', ['tmux-control', 'lima', 'tmux'], ['wsl']],
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
      ? new TmuxConnector(async () => ({ stdout: '' }), () => 'stuffbucket-0123456789abcdef0123456789abcdef')
      : new Connector(async () => ({ stdout: '' }));
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
    [new TmuxConnector(async () => ({ stdout: '' }), () => 'stuffbucket-0123456789abcdef0123456789abcdef'), 'existing\u0000session', {
      command: 'tmux',
      args: ['-T', 'hyperlinks', 'new-session', '-A', '-s', 'session'],
      tmuxProjection: { terminate: { command: 'tmux', args: ['kill-session', '-t', 'session'] } },
    }],
    [new SshTmuxConnector('/home/ada', () => '', async () => ({ stdout: '' }), () => 'stuffbucket-0123456789abcdef0123456789abcdef'), 'work\u0000existing\u0000session', {
      command: 'ssh',
      args: ['-tt', 'work', 'tmux', '-T', 'hyperlinks', 'new-session', '-A', '-s', 'session'],
      tmuxProjection: { terminate: { command: 'ssh', args: ['work', 'tmux', 'kill-session', '-t', 'session'] } },
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
    [new TmuxConnector(async () => ({ stdout: '' }), () => 'stuffbucket-0123456789abcdef0123456789abcdef'), ['existing\u0000session;', 'new\u0000stuffbucket-0123456789abcdef0123456789abcdefx']],
    [new SshTmuxConnector('/home/ada', () => '', async () => ({ stdout: '' }), () => 'stuffbucket-0123456789abcdef0123456789abcdef'), ['work\u0000existing\u0000session;', 'work\u0000new\u0000stuffbucket-0123456789abcdef0123456789abcdefx']],
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
    const connector = new TmuxConnector(async () => ({ stdout: 'first\r\nsecond\r\n' }), () => 'stuffbucket-0123456789abcdef0123456789abcdef');
    await expect(connector.discover()).resolves.toEqual([
      { key: 'existing\u0000first', label: 'Tmux session 1' },
      { key: 'existing\u0000second', label: 'Tmux session 2' },
      { key: 'new\u0000stuffbucket-0123456789abcdef0123456789abcdef', label: 'New tmux session' },
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

    expect(result).toEqual({ sessionId: 'session', label: 'Local' });
    expect(launcher.take({}, 'session')).toBeUndefined();
    expect(launcher.take(owner, 'session')).toEqual(launch);
    expect(launcher.take(owner, 'session')).toBeUndefined();
  });

  it('launches Local without a target ID but rejects a non-local local target', () => {
    const owner = {};
    const launch = { command: '/bin/example', args: [] };
    const launcher = new TerminalLauncher<object>({ createId: () => 'session', localLaunch: launch });

    expect(launcher.launch(owner, { profileId: 'local', cols: 80, rows: 24 })).toEqual({ sessionId: 'session', label: 'Local' });
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

  it('rejects a non-local profile without a minted target ID', () => {
    const launcher = new TerminalLauncher<object>({ platform: 'linux' });
    expect(() => launcher.launch({}, { profileId: 'docker', cols: 80, rows: 24 })).toThrow('Unknown terminal profile or target.');
    expect(() => launcher.launch({}, { profileId: 'tmux-control', cols: 80, rows: 24 })).not.toThrow();
  });

  it('reserves tmux control only on supported platforms and consumes its trusted launch once', () => {
    const owner = {};
    const launcher = new TerminalLauncher<object>({ createId: () => 'tmux-session', platform: 'linux' });
    const result = launcher.launch(owner, { profileId: 'tmux-control', targetId: 'local', cols: 80, rows: 24 });
    expect(result).toEqual({ sessionId: 'tmux-session', label: 'Tmux Control (Experimental)' });
    expect(launcher.take(owner, result.sessionId)).toEqual({ command: 'tmux', args: [], tmuxControl: true });
    expect(launcher.take(owner, result.sessionId)).toBeUndefined();
    expect(() => launcher.launch(owner, { profileId: 'tmux-control', targetId: 'not-local', cols: 80, rows: 24 })).toThrow('Unknown terminal profile or target.');
    const unsupported = new TerminalLauncher<object>({ platform: 'win32' });
    expect(() => unsupported.launch(owner, { profileId: 'tmux-control', targetId: 'local', cols: 80, rows: 24 })).toThrow('Unknown terminal profile or target.');
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

    expect(launcher.launch(owner, { profileId: 'docker', targetId: target.id, cols: 80, rows: 24 })).toEqual({ sessionId: 'opaque', label: 'Docker' });
    expect(podmanLaunch).not.toHaveBeenCalled();
  });

  it('uses bounded Docker argv and mints owner-scoped opaque targets', async () => {
    const run = vi.fn<CommandRunner>()
      .mockResolvedValueOnce({ stdout: '{"Name":"desktop-linux"}\n' })
      .mockResolvedValueOnce({ stdout: '{"ID":"0123456789abcdef","Names":"web"}\n' });
    const connector = new DockerConnector(run);
    const launcher = new TerminalLauncher<object>({ connectors: [connector], createId: () => crypto.randomUUID() });
    const owner = {};
    const discovery = await launcher.discover(owner);
    const target = discovery.targets.find((candidate) => candidate.profileId === 'docker')!;
    expect(run).toHaveBeenNthCalledWith(1, 'docker', ['context', 'ls', '--format', '{{json .}}'], { timeout: 2_000, maxBuffer: 64 * 1024 });
    expect(run).toHaveBeenNthCalledWith(2, 'docker', ['--context', 'desktop-linux', 'ps', '--format', '{{json .}}'], { timeout: 2_000, maxBuffer: 64 * 1024 });
    expect(target.id).not.toContain('0123456789abcdef');
    expect(launcher.launch(owner, { profileId: 'docker', targetId: target.id, cols: 80, rows: 24 }).label).toBe('Docker');
    await launcher.discover(owner);
    expect(() => launcher.launch(owner, { profileId: 'docker', targetId: target.id, cols: 80, rows: 24 })).toThrow();
  });

  it('keeps Local available when Docker is unavailable and rejects foreign IDs', async () => {
    const launcher = new TerminalLauncher<object>({ connectors: [new DockerConnector(async () => { throw new Error('unavailable'); })] });
    const owner = {};
    await expect(launcher.discover(owner)).resolves.toEqual({
      generation: 1,
      targets: [
        { id: 'local', profileId: 'local', label: 'This computer', state: 'available' },
        { id: 'docker-unavailable', profileId: 'docker', label: 'Docker', state: 'unavailable' },
      ],
    });
    expect(launcher.launch(owner, { profileId: 'local', targetId: 'local', cols: 80, rows: 24 }).label).toBe('Local');
    expect(() => launcher.launch({}, { profileId: 'docker', targetId: 'random', cols: 80, rows: 24 })).toThrow();
  });

  it('discovers only conservative primary SSH aliases and launches exact system OpenSSH argv', async () => {
    const reader = vi.fn().mockReturnValue([
      '  # personal hosts',
      'Host work',
      'Host staging.example',
      'Host work',
      'Host *',
      'Host !excluded',
      'Host one two',
      'Include extra.conf',
      'Match user deploy',
      'Host conditional',
    ].join('\n'));
    const connector = new SshConnector('/home/ada', reader);
    const targets = await connector.discover();
    expect(reader).toHaveBeenCalledWith('/home/ada/.ssh/config', 64 * 1024);
    expect(targets).toEqual([{ key: 'work', label: 'work' }, { key: 'staging.example', label: 'staging.example' }]);
    expect(connector.launch(targets[0]!)).toEqual({ command: 'ssh', args: ['-tt', 'work'] });
    expect(() => connector.launch({ key: '-option', label: 'bad' })).toThrow();
    expect(() => connector.launch({ key: 'line\nfeed', label: 'bad' })).toThrow();
  });

  it.each([
    [DockerConnector, 'docker\u00000123456789abcdef\u0000extra'],
    [PodmanConnector, '\u00000123456789abcdef\u0000extra'],
    [LimaConnector, 'instance\u0000extra'],
    [MultipassConnector, 'instance\u0000extra'],
    [WslConnector, 'Ubuntu\u0000extra'],
    [KubernetesConnector, 'context\u0000namespace\u0000pod\u000011111111-1111-1111-1111-111111111111\u0000container\u0000extra'],
    [VagrantConnector, '11111111-1111-1111-1111-111111111111\u0000name\u0000provider\u0000/projects/name\u0000extra'],
  ] as const)('rejects connector launch keys with trailing fields', (Connector, key) => {
    const connector = new Connector(async () => ({ stdout: '' }));
    expect(() => connector.launch({ key, label: 'untrusted' })).toThrow();
  });

  it.each([
    [new DockerConnector(async () => ({ stdout: '' })), 'context\u0000x0123456789abcdef'],
    [new VagrantConnector(async () => ({ stdout: '' })), '11111111-1111-1111-1111-111111111111x\u0000machine\u0000provider\u0000/projects/machine'],
    [new VagrantConnector(async () => ({ stdout: '' })), '11111111-1111-1111-1111-111111111111\u0000;machine\u0000provider\u0000/projects/machine'],
    [new VagrantConnector(async () => ({ stdout: '' })), '11111111-1111-1111-1111-111111111111\u0000machine\u0000;provider\u0000/projects/machine'],
    [new VagrantConnector(async () => ({ stdout: '' })), '11111111-1111-1111-1111-111111111111\u0000machine\u0000provider\u0000x/projects/machine'],
    [new VagrantConnector(async () => ({ stdout: '' })), '11111111-1111-1111-1111-111111111111\u0000machine\u0000provider\u0000xC:/projects/machine'],
    [new VagrantConnector(async () => ({ stdout: '' })), '11111111-1111-1111-1111-111111111111\u0000machine\u0000provider\u0000/projects/machine;'],
    [new VagrantConnector(async () => ({ stdout: '' })), '11111111-1111-1111-1111-111111111111\u0000machine\u0000provider\u00001:/projects/machine'],
    [new VagrantConnector(async () => ({ stdout: '' })), '11111111-1111-1111-1111-111111111111\u0000machine\u0000provider\u0000C:projects/machine'],
    [new VagrantConnector(async () => ({ stdout: '' })), '11111111-1111-1111-1111-111111111111\u0000machine\u0000provider\u0000C:/;'],
    [new VagrantConnector(async () => ({ stdout: '' })), '11111111-1111-1111-1111-111111111111\u0000machine\u0000\u0000C:/projects/machine'],
    [new VagrantConnector(async () => ({ stdout: '' })), '11111111-1111-1111-1111-111111111111\u0000machine\u0000provider\u0000C:/projects//machine'],
    [new VagrantConnector(async () => ({ stdout: '' })), '11111111-1111-1111-1111-111111111111\u0000machine\u0000provider\u0000C:\\projects\\machine\nsuffix'],
    [new KubernetesConnector(async () => ({ stdout: '' })), 'context\u0000namespace\u0000pod;\u000011111111-1111-1111-1111-111111111111\u0000container'],
    [new KubernetesConnector(async () => ({ stdout: '' })), 'context\u0000namespace\u0000pod\u0000x11111111-1111-1111-1111-111111111111\u0000container'],
    [new KubernetesConnector(async () => ({ stdout: '' })), 'context\u0000namespace\u0000pod\u000011111111-1111-1111-1111-111111111111\u0000container;'],
  ])('rejects mutations in every command target field', (connector, key) => {
    expect(() => connector.launch({ key, label: 'untrusted' })).toThrow();
  });

  it('rejects non-string Docker fields before their textual validators can coerce them', async () => {
    const context = new DockerConnector(async (_command, args) => args[0] === 'context'
      ? { stdout: '{"Name":123}\n' }
      : { stdout: '{"ID":"0123456789abcdef","Names":"coerced"}\n' });
    const container = new DockerConnector(vi.fn<CommandRunner>()
      .mockResolvedValueOnce({ stdout: '{"Name":"context"}\n' })
      .mockResolvedValueOnce({ stdout: '{"ID":123456789012,"Names":"coerced"}\n' }));
    await expect(context.discover()).resolves.toEqual([]);
    await expect(container.discover()).resolves.toEqual([]);
  });

  it.each([
    'C:/one/two',
    'C:/project',
    'C:/project/',
    'C:\\one\\two',
    'C:\\project\\',
  ])('accepts compatible absolute Windows Vagrant directories', (directory) => {
    const key = `11111111-1111-1111-1111-111111111111\u0000machine\u0000provider\u0000${directory}`;
    expect(new VagrantConnector(async () => ({ stdout: '' })).launch({ key, label: 'trusted' })).toEqual({ command: 'vagrant', args: ['ssh', '11111111-1111-1111-1111-111111111111'] });
  });

  it('uses the container fallback label when discovery supplies an empty name', async () => {
    const connector = new DockerConnector(async (_command, args) => args[0] === 'context'
      ? { stdout: '{"Name":"work"}\n' }
      : { stdout: '{"ID":"0123456789abcdef","Names":""}\n' });
    await expect(connector.discover()).resolves.toEqual([{ key: 'work\u00000123456789abcdef', label: 'work: Container' }]);
  });

  it('ignores null Docker context records without attempting property access', async () => {
    const connector = new DockerConnector(async () => ({ stdout: 'null\n' }));
    await expect(connector.discover()).resolves.toEqual([]);
  });

  it('accepts one-character Kubernetes names and containers', () => {
    const key = 'context\u0000a\u0000a\u000011111111-1111-1111-1111-111111111111\u0000a';
    expect(new KubernetesConnector(async () => ({ stdout: '' })).launch({ key, label: 'trusted' })).toEqual({ command: 'kubectl', args: ['--context', 'context', '--namespace', 'a', 'exec', '-it', 'a', '-c', 'a', '--', '/bin/sh'] });
  });

  it('keeps SSH parsing and bounded discovery exact at their limits', async () => {
    const reader = vi.fn(() => 'Host work\r\nHost ignored\r\nMatch all\r\n');
    await expect(new SshConnector('/home/ada', reader).discover()).resolves.toEqual([{ key: 'work', label: 'work' }, { key: 'ignored', label: 'ignored' }]);
    await expect(new SshConnector('/home/ada', () => '#'.repeat(64 * 1024)).discover()).resolves.toEqual([]);
    await expect(new SshConnector('/home/ada', () => '#'.repeat(64 * 1024 + 1)).discover()).rejects.toThrow('SSH config exceeds the discovery limit.');
    await expect(new TmuxConnector(async () => ({ stdout: 'x'.repeat(64 * 1024) })).discover()).resolves.toHaveLength(1);
    await expect(new TmuxConnector(async () => ({ stdout: 'x'.repeat(64 * 1024 + 1) })).discover()).rejects.toThrow('Command output exceeds the discovery limit.');
  });

  it('bounds SSH discovery and isolates missing, unreadable, and timed-out SSH profiles from Local', async () => {
    const missing = Object.assign(new Error('missing'), { code: 'ENOENT' });
    await expect(new SshConnector('/home/ada', () => { throw missing; }).discover()).resolves.toEqual([]);
    await expect(new SshConnector('/home/ada', () => { throw Object.assign(new Error('denied'), { code: 'EACCES' }); }).discover()).rejects.toThrow('denied');
    await expect(new SshConnector('/home/ada', () => 'Host valid\n'.repeat(1_025)).discover()).resolves.toHaveLength(1);
    await expect(new SshConnector('/home/ada', () => Array.from({ length: 129 }, (_value, index) => `Host host-${index}`).join('\n')).discover()).resolves.toHaveLength(128);
    await expect(new SshConnector('/home/ada', () => 'Host x'.repeat(64 * 1024)).discover()).rejects.toThrow();
    const timeout = Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' });
    const launcher = new TerminalLauncher<object>({ connectors: [new SshConnector('/home/ada', () => { throw timeout; })], platform: 'linux' });
    await expect(launcher.discover({})).resolves.toEqual({ generation: 1, targets: [
      { id: 'local', profileId: 'local', label: 'This computer', state: 'available' },
      { id: 'ssh-timed-out', profileId: 'ssh', label: 'SSH', state: 'timed-out' },
    ] });
    const unavailable = new TerminalLauncher<object>({
      connectors: [new SshConnector('/home/ada', () => 'Host work', async () => { throw new Error('missing'); })],
      platform: 'linux',
    });
    await expect(unavailable.discover({})).resolves.toEqual({ generation: 1, targets: [
      { id: 'local', profileId: 'local', label: 'This computer', state: 'available' },
      { id: 'ssh-unavailable', profileId: 'ssh', label: 'SSH', state: 'unavailable' },
    ] });
  });

  it('mints SSH targets per owner and discovery generation before launching them', async () => {
    const connector = new SshConnector('/home/ada', () => 'Host work');
    const launcher = new TerminalLauncher<object>({ connectors: [connector], createId: () => crypto.randomUUID(), platform: 'linux' });
    const owner = {};
    const target = (await launcher.discover(owner)).targets.find((candidate) => candidate.profileId === 'ssh')!;
    expect(target.id).not.toContain('work');
    expect(launcher.launch(owner, { profileId: 'ssh', targetId: target.id, cols: 80, rows: 24 }).label).toBe('SSH');
    expect(() => launcher.launch({}, { profileId: 'ssh', targetId: target.id, cols: 80, rows: 24 })).toThrow();
    await launcher.discover(owner);
    expect(() => launcher.launch(owner, { profileId: 'ssh', targetId: target.id, cols: 80, rows: 24 })).toThrow();
    expect(() => launcher.launch(owner, { profileId: 'ssh', targetId: 'random', cols: 80, rows: 24 })).toThrow();
  });

  it('discovers bounded local tmux sessions plus a generated New target with exact argv', async () => {
    const sessions = [
      'work',
      'unsafe; touch nope',
      'work',
      ...Array.from({ length: 129 }, (_value, index) => `session-${index}`),
    ].join('\n');
    const run = vi.fn<CommandRunner>().mockImplementation(async (_command, args) => ({
      stdout: args[0] === '-V' ? 'tmux 3.7b\n' : sessions,
    }));
    const connector = new TmuxConnector(run, () => 'stuffbucket-0123456789abcdef0123456789abcdef');
    const targets = await connector.discover();
    expect(run).toHaveBeenNthCalledWith(1, 'tmux', ['-V'], { timeout: 2_000, maxBuffer: 64 * 1024 });
    expect(run).toHaveBeenNthCalledWith(2, 'tmux', ['list-sessions', '-F', '#{session_name}'], { timeout: 2_000, maxBuffer: 64 * 1024 });
    expect(targets).toHaveLength(129);
    expect(targets[0]).toEqual({ key: 'existing\u0000work', label: 'Tmux session 1' });
    expect(targets.at(-1)).toEqual({ key: 'new\u0000stuffbucket-0123456789abcdef0123456789abcdef', label: 'New tmux session' });
    expect(connector.launch(targets[0]!)).toEqual({
      command: 'tmux',
      args: ['-T', 'hyperlinks', 'new-session', '-A', '-s', 'work'],
      tmuxProjection: { terminate: { command: 'tmux', args: ['kill-session', '-t', 'work'] } },
    });
    expect(connector.launch(targets.at(-1)!)).toEqual({
      command: 'tmux',
      args: ['-T', 'hyperlinks', 'new-session', '-A', '-s', 'stuffbucket-0123456789abcdef0123456789abcdef'],
      tmuxProjection: {
        terminate: {
          command: 'tmux',
          args: ['kill-session', '-t', 'stuffbucket-0123456789abcdef0123456789abcdef'],
        },
      },
    });
    expect(() => connector.launch({ key: 'existing\u0000name; injected', label: 'bad' })).toThrow();
    await expect(new TmuxConnector(run, () => 'not-generated').discover()).rejects.toThrow();
  });

  it('omits hyperlink advertisement for tmux versions that cannot implement OSC 8', async () => {
    const run = vi.fn<CommandRunner>().mockResolvedValueOnce({ stdout: 'tmux 3.3a\n' }).mockResolvedValueOnce({ stdout: 'work\n' });
    const connector = new TmuxConnector(run);
    const [target] = await connector.discover();
    expect(connector.launch(target!)).toEqual({
      command: 'tmux',
      args: ['new-session', '-A', '-s', 'work'],
      tmuxProjection: { terminate: { command: 'tmux', args: ['kill-session', '-t', 'work'] } },
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
    const run = vi.fn<CommandRunner>().mockResolvedValueOnce({ stdout: version }).mockResolvedValueOnce({ stdout: 'work\n' });
    const connector = new TmuxConnector(run);
    const [target] = await connector.discover();

    expect(connector.launch(target!).args).toEqual([
      ...(supportsHyperlinks ? ['-T', 'hyperlinks'] : []),
      'new-session', '-A', '-s', 'work',
    ]);
  });

  it('defaults to hyperlink advertisement before discovery', () => {
    const connector = new TmuxConnector(async () => ({ stdout: '' }));

    expect(connector.launch({ key: 'existing\u0000work', label: 'Tmux session 1' }).args)
      .toEqual(['-T', 'hyperlinks', 'new-session', '-A', '-s', 'work']);
  });

  it('keeps the generated tmux target key and label distinct', async () => {
    const generated = 'stuffbucket-0123456789abcdef0123456789abcdef';
    const connector = new TmuxConnector(async () => ({ stdout: '' }), () => generated);
    await expect(connector.discover()).resolves.toEqual([{ key: `new\u0000${generated}`, label: 'New tmux session' }]);
  });

  it('keeps tmux New available without a server, but marks a missing tmux binary unavailable', async () => {
    const noServer = Object.assign(new Error('no server'), { code: 1 });
    const connector = new TmuxConnector(async (_command, args) => {
      if (args[0] === '-V') return { stdout: 'tmux 3.7b\n' };
      throw noServer;
    }, () => 'stuffbucket-0123456789abcdef0123456789abcdef');
    await expect(connector.discover()).resolves.toEqual([{ key: 'new\u0000stuffbucket-0123456789abcdef0123456789abcdef', label: 'New tmux session' }]);
    const missing = Object.assign(new Error('missing'), { code: 'ENOENT' });
    const launcher = new TerminalLauncher<object>({ connectors: [new TmuxConnector(async () => { throw missing; })], platform: 'linux' });
    await expect(launcher.discover({})).resolves.toEqual({ generation: 1, targets: [
      { id: 'local', profileId: 'local', label: 'This computer', state: 'available' },
      { id: 'tmux-unavailable', profileId: 'tmux', label: 'Tmux', state: 'unavailable' },
    ] });
  });

  it('uses capped conservative SSH aliases for remote tmux and isolates failed hosts', async () => {
    const name = 'stuffbucket-0123456789abcdef0123456789abcdef';
    const reader = vi.fn().mockReturnValue(['Host work', 'Host broken', 'Host unsafe;alias', ...Array.from({ length: 20 }, (_value, index) => `Host host-${index}`)].join('\n'));
    const noServer = Object.assign(new Error('no server'), { code: 1 });
    const run = vi.fn<CommandRunner>().mockImplementation(async (_command, args) => {
      if (args[3] === 'tmux -V') return { stdout: args[2] === 'host-1' ? 'tmux 3.3a\n' : 'tmux 3.7b\n' };
      if (args[2] === 'broken') throw new Error('unreachable');
      if (args[2] === 'host-0') throw noServer;
      return { stdout: 'remote-work\ninvalid name\n' };
    });
    const connector = new SshTmuxConnector('/home/ada', reader, run, () => name);
    const targets = await connector.discover();
    expect(run).toHaveBeenCalledTimes(32);
    expect(run).toHaveBeenNthCalledWith(1, 'ssh', ['-o', 'BatchMode=yes', 'work', 'tmux -V'], { timeout: 2_000, maxBuffer: 64 * 1024 });
    expect(run).toHaveBeenNthCalledWith(2, 'ssh', ['-o', 'BatchMode=yes', 'work', "tmux list-sessions -F '#{session_name}'"], { timeout: 2_000, maxBuffer: 64 * 1024 });
    expect(targets).not.toContainEqual(expect.objectContaining({ label: 'work' }));
    expect(targets.some((target) => target.key === `work\u0000existing\u0000remote-work`)).toBe(true);
    expect(targets.some((target) => target.key === `host-0\u0000new\u0000${name}`)).toBe(true);
    expect(targets.some((target) => target.key.startsWith('broken\u0000'))).toBe(false);
    expect(connector.launch({ key: `work\u0000existing\u0000remote-work`, label: 'Tmux session 1' })).toEqual({
      command: 'ssh',
      args: ['-tt', 'work', 'tmux', '-T', 'hyperlinks', 'new-session', '-A', '-s', 'remote-work'],
      tmuxProjection: {
        terminate: { command: 'ssh', args: ['work', 'tmux', 'kill-session', '-t', 'remote-work'] },
      },
    });
    expect(connector.launch({ key: `work\u0000new\u0000${name}`, label: 'New tmux session' })).toEqual({
      command: 'ssh',
      args: ['-tt', 'work', 'tmux', '-T', 'hyperlinks', 'new-session', '-A', '-s', name],
      tmuxProjection: {
        terminate: { command: 'ssh', args: ['work', 'tmux', 'kill-session', '-t', name] },
      },
    });
    expect(connector.launch({ key: `host-1\u0000existing\u0000remote-work`, label: 'Tmux session 1' }).args).toEqual([
      '-tt', 'host-1', 'tmux', 'new-session', '-A', '-s', 'remote-work',
    ]);
    expect(() => connector.launch({ key: `work;bad\u0000new\u0000${name}`, label: 'bad' })).toThrow();
  });

  it('removes a remote alias from the legacy set after tmux is upgraded', async () => {
    const name = 'stuffbucket-0123456789abcdef0123456789abcdef';
    let version = 'tmux 3.3a\n';
    const run = vi.fn<CommandRunner>().mockImplementation(async (_command, args) => (
      args[3] === 'tmux -V' ? { stdout: version } : { stdout: 'work\n' }
    ));
    const connector = new SshTmuxConnector('/home/ada', () => 'Host work', run, () => name);

    let target = (await connector.discover()).find((candidate) => candidate.key.includes('\u0000existing\u0000'))!;
    expect(connector.launch(target).args).toEqual(['-tt', 'work', 'tmux', 'new-session', '-A', '-s', 'work']);

    version = 'tmux 3.4\n';
    target = (await connector.discover()).find((candidate) => candidate.key.includes('\u0000existing\u0000'))!;
    expect(connector.launch(target).args).toEqual([
      '-tt', 'work', 'tmux', '-T', 'hyperlinks', 'new-session', '-A', '-s', 'work',
    ]);
  });

  it('keeps tmux target IDs opaque and owner- and generation-scoped', async () => {
    const connector = new TmuxConnector(async () => ({ stdout: 'private-session\n' }), () => 'stuffbucket-0123456789abcdef0123456789abcdef');
    const launcher = new TerminalLauncher<object>({ connectors: [connector], createId: () => crypto.randomUUID(), platform: 'linux' });
    const owner = {};
    const target = (await launcher.discover(owner)).targets.find((candidate) => candidate.profileId === 'tmux' && candidate.label === 'Tmux session 1')!;
    expect(target.id).not.toContain('private-session');
    expect(() => launcher.launch({}, { profileId: 'tmux', targetId: target.id, cols: 80, rows: 24 })).toThrow();
    await launcher.discover(owner);
    expect(() => launcher.launch(owner, { profileId: 'tmux', targetId: target.id, cols: 80, rows: 24 })).toThrow();
    expect(() => launcher.launch(owner, { profileId: 'tmux', targetId: 'random', cols: 80, rows: 24 })).toThrow();
  });

  it('rejects malformed oversized Docker output and isolates a timeout', async () => {
    await expect(new DockerConnector(async () => ({ stdout: `${'{'.repeat(64 * 1024)}\n` })).discover()).rejects.toThrow();
    const timeout = Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' });
    const launcher = new TerminalLauncher<object>({ connectors: [new DockerConnector(async () => { throw timeout; })] });
    await expect(launcher.discover({})).resolves.toEqual({
      generation: 1,
      targets: [
        { id: 'local', profileId: 'local', label: 'This computer', state: 'available' },
        { id: 'docker-timed-out', profileId: 'docker', label: 'Docker', state: 'timed-out' },
      ],
    });
  });

  it('parses capped Podman connections and launches named or local targets with exact argv', async () => {
    const run = vi.fn<CommandRunner>()
      .mockResolvedValueOnce({ stdout: JSON.stringify([{ Name: 'local', Default: true }, { Name: 'remote' }]) })
      .mockResolvedValueOnce({ stdout: JSON.stringify([{ Id: '0123456789abcdef', Names: 'local-web' }]) })
      .mockResolvedValueOnce({ stdout: JSON.stringify([{ Id: 'fedcba9876543210', Names: 'remote-web' }]) });
    const connector = new PodmanConnector(run);
    const targets = await connector.discover();
    expect(run).toHaveBeenNthCalledWith(1, 'podman', ['system', 'connection', 'list', '--format', 'json'], { timeout: 2_000, maxBuffer: 64 * 1024 });
    expect(run).toHaveBeenNthCalledWith(2, 'podman', ['--connection', 'local', 'ps', '--format', 'json'], { timeout: 2_000, maxBuffer: 64 * 1024 });
    expect(connector.launch(targets[0]!)).toEqual({ command: 'podman', args: ['exec', '-it', '0123456789abcdef', '/bin/sh'] });
    expect(connector.launch(targets[1]!)).toEqual({ command: 'podman', args: ['--connection', 'remote', 'exec', '-it', 'fedcba9876543210', '/bin/sh'] });
    await expect(new PodmanConnector(async () => ({ stdout: '['.repeat(64 * 1024) })).discover()).rejects.toThrow();
  });

  it('parses only running Lima and Multipass instances with exact argv', async () => {
    const limaRun = vi.fn<CommandRunner>().mockResolvedValue({ stdout: '{"name":"running","status":"Running"}\n{"name":"stopped","status":"Stopped"}\n' });
    const multipassRun = vi.fn<CommandRunner>().mockResolvedValue({ stdout: JSON.stringify({ list: [{ name: 'running', state: 'RUNNING' }, { name: 'stopped', state: 'STOPPED' }] }) });
    const lima = new LimaConnector(limaRun);
    const multipass = new MultipassConnector(multipassRun);
    expect(lima.launch((await lima.discover())[0]!)).toEqual({ command: 'limactl', args: ['shell', 'running'] });
    expect(multipass.launch((await multipass.discover())[0]!)).toEqual({ command: 'multipass', args: ['shell', 'running'] });
    expect(limaRun).toHaveBeenCalledWith('limactl', ['list', '--format', 'json'], { timeout: 2_000, maxBuffer: 64 * 1024 });
    expect(multipassRun).toHaveBeenCalledWith('multipass', ['list', '--format', 'json'], { timeout: 2_000, maxBuffer: 64 * 1024 });
    await expect(new LimaConnector(async () => ({ stdout: '{bad}\n' })).discover()).rejects.toThrow();
    await expect(new MultipassConnector(async () => ({ stdout: '{"list":{}}' })).discover()).rejects.toThrow();
  });

  it('discovers Windows WSL distributions defensively and launches exact argv', async () => {
    const run = vi.fn<CommandRunner>().mockResolvedValue({ stdout: '\uFEFFUbuntu-24.04\r\nDebian\u0000\r\ninvalid name\r\nU\u0000buntu\r\n' });
    const connector = new WslConnector(run);
    const targets = await connector.discover();
    expect(run).toHaveBeenCalledWith('wsl.exe', ['--list', '--quiet'], { timeout: 2_000, maxBuffer: 64 * 1024 });
    expect(targets).toEqual([{ key: 'Ubuntu-24.04', label: 'Ubuntu-24.04' }, { key: 'Debian', label: 'Debian' }]);
    expect(connector.launch(targets[0]!)).toEqual({ command: 'wsl.exe', args: ['--distribution', 'Ubuntu-24.04'] });
    await expect(new WslConnector(async () => ({ stdout: Array.from({ length: 65 }, (_value, index) => `Distro-${index}`).join('\n') })).discover()).resolves.toHaveLength(64);
    await expect(new WslConnector(async () => ({ stdout: 'x'.repeat(64 * 1024 + 1) })).discover()).rejects.toThrow();
    const launcher = new TerminalLauncher<object>({ connectors: [connector], createId: () => crypto.randomUUID(), platform: 'win32' });
    const target = (await launcher.discover({})).targets.find((candidate) => candidate.profileId === 'wsl')!;
    expect(target.id).not.toContain('Ubuntu');
    expect(() => connector.launch({ key: 'invalid name', label: 'invalid' })).toThrow();
  });

  it('parses escaped Vagrant records, exposes only running machines, and launches stable IDs', async () => {
    const id = '11111111-1111-1111-1111-111111111111';
    const stopped = '22222222-2222-2222-2222-222222222222';
    const output = [
      `1700000000,${id},name,web\\, dev`,
      `1700000000,${id},provider,virtualbox`,
      `1700000000,${id},state,running`,
      `1700000000,${id},directory,/projects/web\\, dev`,
      `1700000000,${stopped},name,off`,
      `1700000000,${stopped},provider,virtualbox`,
      `1700000000,${stopped},state,poweroff`,
      `1700000000,${stopped},directory,/projects/off`,
      '1700000000,not-an-id,name,ignored',
      `1700000000,${id},directory,relative`,
      `1700000000,${id},state,running,extra`,
      'bad,record',
    ].join('\n');
    const run = vi.fn<CommandRunner>().mockResolvedValue({ stdout: output });
    const connector = new VagrantConnector(run);
    const targets = await connector.discover();
    expect(run).toHaveBeenCalledWith('vagrant', ['global-status', '--prune', '--machine-readable'], { timeout: 2_000, maxBuffer: 64 * 1024 });
    expect(targets).toHaveLength(1);
    expect(targets[0]!.label).toBe('web, dev (virtualbox)');
    expect(targets[0]!.key).not.toBe(id);
    expect(connector.launch(targets[0]!)).toEqual({ command: 'vagrant', args: ['ssh', id] });
    expect(connector.launch(targets[0]!)).not.toHaveProperty('cwd');
    expect(() => connector.launch({ key: `${id}\u0000web\u0000virtualbox\u0000relative`, label: 'bad' })).toThrow();
    const machines = Array.from({ length: 129 }, (_value, index) => {
      const machineId = `${String(index).padStart(8, '0')}-1111-1111-1111-111111111111`;
      return [`1700000000,${machineId},name,machine-${index}`, `1700000000,${machineId},provider,virtualbox`, `1700000000,${machineId},state,running`, `1700000000,${machineId},directory,/projects/machine-${index}`].join('\n');
    }).join('\n');
    await expect(new VagrantConnector(async () => ({ stdout: machines })).discover()).resolves.toHaveLength(128);
    await expect(new VagrantConnector(async () => ({ stdout: 'x'.repeat(64 * 1024 + 1) })).discover()).rejects.toThrow();
  });

  it('requires a current Vagrant record type, timestamp, and running state', async () => {
    const id = '11111111-1111-1111-1111-111111111111';
    const stateFromName = '22222222-2222-2222-2222-222222222222';
    const directoryFromProvider = '33333333-3333-3333-3333-333333333333';
    const connector = new VagrantConnector(async () => ({ stdout: [
      `1700000000,${id},name,web`,
      `1700000000,${id},provider,virtualbox`,
      `1700000000,${id},state,running`,
      `1700000000,${id},directory,/projects/web`,
      `170000000,${id},name,too-short`,
      `17000000000000000,${id},provider,too-long`,
      `1700000000,${id},unknown,ignored`,
      `1700000000,${id},state,stopped`,
      `1700000000,${stateFromName},name,running`,
      `1700000000,${stateFromName},provider,virtualbox`,
      `1700000000,${stateFromName},directory,/projects/state-from-name`,
      `1700000000,${directoryFromProvider},name,directory-from-provider`,
      `1700000000,${directoryFromProvider},provider,virtualbox`,
      `1700000000,${directoryFromProvider},state,running`,
      `1700000000,${directoryFromProvider},provider,/projects/overwritten`,
      `1700000000,44444444-4444-4444-4444-444444444444,provider,virtualbox`,
      `1700000000,44444444-4444-4444-4444-444444444444,state,running`,
      `1700000000,44444444-4444-4444-4444-444444444444,directory,/projects/missing-name`,
    ].join('\n') }));

    const targets = await connector.discover();
    expect(targets).toEqual([{ key: `${id}\u0000web\u0000virtualbox\u0000/projects/web`, label: 'web (virtualbox)' }]);
    expect(connector.launch(targets[0]!)).toEqual({ command: 'vagrant', args: ['ssh', id] });
  });

  it('keeps discovery caps and structured record boundaries exact', async () => {
    const wsl = new WslConnector(async () => ({ stdout: `\uFEFF\u0000\u0000Ubuntu-24.04\u0000\u0000\r\n${'\u0000'.repeat(64 * 1024 - 19)}` }));
    expect(wsl.label).toBe('WSL');
    await expect(wsl.discover()).resolves.toEqual([{ key: 'Ubuntu-24.04', label: 'Ubuntu-24.04' }]);

    const contexts = Array.from({ length: 33 }, (_value, index) => JSON.stringify({ Name: `context-${index}` })).join('\n');
    const dockerRun = vi.fn<CommandRunner>().mockImplementation(async (_command, args) => args[0] === 'context'
      ? { stdout: `${contexts}\nnull\n` }
      : { stdout: `${Array.from({ length: 129 }, (_value, index) => ({ ID: `${String(index).padStart(12, '0')}abcd`, ...(index === 0 ? {} : { Names: `web-${index}` }) })).map((container) => JSON.stringify(container)).join('\n')}\n` });
    const docker = new DockerConnector(dockerRun);
    expect(docker.label).toBe('Docker');
    const dockerTargets = await docker.discover();
    expect(dockerTargets).toHaveLength(32 * 128);
    expect(dockerTargets[0]).toEqual({ key: 'context-0\u0000000000000000abcd', label: 'context-0: Container' });
    expect(dockerRun).toHaveBeenCalledTimes(33);
    expect(docker.launch(dockerTargets[0]!)).toEqual({ command: 'docker', args: ['--context', 'context-0', 'exec', '-it', '000000000000abcd', '/bin/sh'] });

    const connections = Array.from({ length: 33 }, (_value, index) => ({ Name: `remote-${index}`, Default: index === 0 }));
    const podmanRun = vi.fn<CommandRunner>().mockImplementation(async (_command, args) => args[0] === 'system'
      ? { stdout: JSON.stringify([{ Name: 'local', Default: false }, ...connections, []]) }
      : { stdout: JSON.stringify([...Array.from({ length: 129 }, (_value, index) => ({ Id: `${String(index).padStart(12, '0')}abcd`, ...(index === 0 ? {} : { Names: `web-${index}` }) })), []]) });
    const podmanTargets = await new PodmanConnector(podmanRun).discover();
    expect(podmanTargets).toHaveLength(32 * 128);
    expect(podmanTargets[0]).toEqual({ key: 'local\u0000000000000000abcd', label: 'local: Container' });
    expect(podmanTargets[128]).toEqual({ key: 'remote-0\u0000000000000000abcd', label: 'remote-0: Container' });
    expect(podmanRun).toHaveBeenCalledTimes(33);

    const lima = new LimaConnector(async () => ({ stdout: `${JSON.stringify({ name: 'running', status: 'Running' })}\nnull\n` }));
    expect(lima.label).toBe('Lima');
    await expect(lima.discover()).resolves.toEqual([{ key: 'running', label: 'running' }]);
    await expect(new MultipassConnector(async () => ({ stdout: JSON.stringify({ list: [{ name: 'running', state: 'RUNNING' }, []] }) })).discover()).resolves.toEqual([{ key: 'running', label: 'running' }]);
  });

  it('keeps connector parser boundaries fail-closed', async () => {
    const id = '11111111-1111-1111-1111-111111111111';
    const vagrantRecords = [
      `1700000000,${id},name,web`,
      `1700000000,${id},provider,virtualbox`,
      `1700000000,${id},state,running`,
      `1700000000,${id},directory,/projects/web`,
    ].join('\r\n');
    const exactLimit = `${vagrantRecords}\n${'x'.repeat(64 * 1024 - vagrantRecords.length - 1)}`;
    await expect(new VagrantConnector(async () => ({ stdout: exactLimit })).discover()).resolves.toHaveLength(1);
    await expect(new VagrantConnector(async () => ({ stdout: [`1700000000,${id},name,unfinished\\`, `1700000000,${id},provider,virtualbox`, `1700000000,${id},state,running`, `1700000000,${id},directory,/projects/web`].join('\n') })).discover()).resolves.toEqual([]);
    await expect(new VagrantConnector(async () => ({ stdout: [`1700000000,${id},name,extra,field`, `1700000000,${id},provider,virtualbox`, `1700000000,${id},state,running`, `1700000000,${id},directory,/projects/web`].join('\n') })).discover()).resolves.toEqual([]);
    await expect(new VagrantConnector(async () => ({ stdout: `${Array.from({ length: 640 }, () => 'invalid').join('\n')}\n${vagrantRecords}` })).discover()).resolves.toEqual([]);
    await expect(new VagrantConnector(async () => ({ stdout: 'x'.repeat(64 * 1024 + 1) })).discover()).rejects.toThrow('Command output exceeds the discovery limit.');

    await expect(new WslConnector(async () => ({ stdout: 'Ubuntu\uFEFF-24.04\nUbuntu\r-24.04' })).discover()).resolves.toEqual([]);
    await expect(new DockerConnector(async () => ({ stdout: 'null' })).discover()).resolves.toEqual([]);

    const podman = new PodmanConnector(async (_command, args) => args[0] === 'system'
      ? { stdout: JSON.stringify([{ Name: 'local', Default: false }]) }
      : { stdout: JSON.stringify([{ Id: '0123456789abcdef', Names: 'web' }]) });
    expect(podman.label).toBe('Podman');
    await expect(podman.discover()).resolves.toEqual([{ key: 'local\u00000123456789abcdef', label: 'local: web' }]);

    const multipass = new MultipassConnector(async () => ({ stdout: JSON.stringify({ list: Array.from({ length: 129 }, () => ({ name: 'running', state: 'RUNNING' })) }) }));
    expect(multipass.label).toBe('Multipass');
    await expect(multipass.discover()).resolves.toHaveLength(128);
    await expect(new MultipassConnector(async () => ({ stdout: JSON.stringify({ list: [null] }) })).discover()).resolves.toEqual([]);
    await expect(new MultipassConnector(async () => ({ stdout: JSON.stringify({ list: {} }) })).discover()).rejects.toThrow('Invalid Multipass list output.');

    const kubernetes = new KubernetesConnector(async () => ({ stdout: 'invalid context' }));
    await expect(kubernetes.discover()).rejects.toThrow('Invalid Kubernetes context.');
  });

  it('discovers current-context running Kubernetes containers with bounded JSON argv', async () => {
    const run = vi.fn<CommandRunner>()
      .mockResolvedValueOnce({ stdout: 'development\n' })
      .mockResolvedValueOnce({ stdout: JSON.stringify({ items: [
        { metadata: { namespace: 'apps', name: 'web', uid: '11111111-1111-1111-1111-111111111111' }, status: { phase: 'Running' }, spec: { containers: [{ name: 'web' }, { name: 'sidecar' }], initContainers: [{ name: 'ignored' }] } },
        { metadata: { namespace: 'apps', name: 'stopped', uid: '22222222-2222-2222-2222-222222222222' }, status: { phase: 'Pending' }, spec: { containers: [{ name: 'web' }] } },
      ] }) });
    const connector = new KubernetesConnector(run);
    const targets = await connector.discover();
    expect(run).toHaveBeenNthCalledWith(1, 'kubectl', ['config', 'current-context'], { timeout: 2_000, maxBuffer: 64 * 1024 });
    expect(run).toHaveBeenNthCalledWith(2, 'kubectl', ['--context', 'development', 'get', 'pods', '--all-namespaces', '-o', 'json'], { timeout: 2_000, maxBuffer: 64 * 1024 });
    expect(targets).toHaveLength(2);
    expect(connector.launch(targets[0]!)).toEqual({ command: 'kubectl', args: ['--context', 'development', '--namespace', 'apps', 'exec', '-it', 'web', '-c', 'web', '--', '/bin/sh'] });
  });

  it('rejects non-string Kubernetes UIDs before their textual validator can coerce them', async () => {
    const run = vi.fn<CommandRunner>()
      .mockResolvedValueOnce({ stdout: 'development\n' })
      .mockResolvedValueOnce({ stdout: JSON.stringify({ items: [{
        metadata: {
          namespace: 'apps',
          name: 'web',
          uid: ['11111111-1111-1111-1111-111111111111'],
        },
        status: { phase: 'Running' },
        spec: { containers: [{ name: 'web' }] },
      }] }) });

    await expect(new KubernetesConnector(run).discover()).resolves.toEqual([]);
  });

  it('caps and rejects malformed Kubernetes discovery while keeping targets opaque and owner-scoped', async () => {
    const pod = (index: number) => ({ metadata: { namespace: `ns-${index % 32}`, name: `pod-${index}`, uid: `${String(index).padStart(8, '0')}-1111-1111-1111-111111111111` }, status: { phase: 'Running' }, spec: { containers: [{ name: 'web' }] } });
    const connector = new KubernetesConnector(async (_command, args) => args[0] === 'config'
      ? { stdout: 'development\n' }
      : { stdout: JSON.stringify({ items: Array.from({ length: 129 }, (_value, index) => pod(index)) }) });
    await expect(connector.discover()).resolves.toHaveLength(128);
    await expect(new KubernetesConnector(async () => ({ stdout: '{'.repeat(64 * 1024) })).discover()).rejects.toThrow();
    const launcher = new TerminalLauncher<object>({ connectors: [connector], createId: () => crypto.randomUUID(), platform: 'linux' });
    const owner = {};
    const target = (await launcher.discover(owner)).targets.find((candidate) => candidate.profileId === 'kubernetes')!;
    expect(target.id).not.toContain('development');
    expect(() => launcher.launch({}, { profileId: 'kubernetes', targetId: target.id, cols: 80, rows: 24 })).toThrow();
    expect(() => launcher.launch(owner, { profileId: 'kubernetes', targetId: 'random', cols: 80, rows: 24 })).toThrow();
    await launcher.discover(owner);
    expect(() => launcher.launch(owner, { profileId: 'kubernetes', targetId: target.id, cols: 80, rows: 24 })).toThrow();
  });

  it('isolates an unavailable Kubernetes CLI from Local', async () => {
    const unavailable = new TerminalLauncher<object>({ connectors: [new KubernetesConnector(async () => { throw new Error('missing'); })], platform: 'linux' });
    await expect(unavailable.discover({})).resolves.toEqual({
      generation: 1,
      targets: [
        { id: 'local', profileId: 'local', label: 'This computer', state: 'available' },
        { id: 'kubernetes-unavailable', profileId: 'kubernetes', label: 'Kubernetes', state: 'unavailable' },
      ],
    });
    const timeout = Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' });
    const launcher = new TerminalLauncher<object>({ connectors: [new KubernetesConnector(async () => { throw timeout; })], platform: 'linux' });
    await expect(launcher.discover({})).resolves.toEqual({
      generation: 1,
      targets: [
        { id: 'local', profileId: 'local', label: 'This computer', state: 'available' },
        { id: 'kubernetes-timed-out', profileId: 'kubernetes', label: 'Kubernetes', state: 'timed-out' },
      ],
    });
  });

  it('caps connector records and keeps independent connector failures isolated', async () => {
    const output = Array.from({ length: 129 }, () => JSON.stringify({ name: 'running', status: 'Running' })).join('\n');
    await expect(new LimaConnector(async () => ({ stdout: output })).discover()).resolves.toHaveLength(128);
    const launcher = new TerminalLauncher<object>({
      connectors: [new PodmanConnector(async () => { throw new Error('missing'); }), new LimaConnector(async () => ({ stdout: '{"name":"running","status":"Running"}\n' }))],
      createId: () => crypto.randomUUID(),
      platform: 'linux',
    });
    const discovered = await launcher.discover({});
    expect(discovered.targets.map((target) => target.profileId)).toEqual(['local', 'podman', 'lima']);
    expect(discovered.targets[1]!.state).toBe('unavailable');
    expect(discovered.targets[2]!.state).toBe('available');
  });

  it('does not discover or launch unavailable platform profiles or cross-owner targets', async () => {
    const connector = new MultipassConnector(async () => ({ stdout: '{"list":[{"name":"running","state":"RUNNING"}]}' }));
    const launcher = new TerminalLauncher<object>({ connectors: [connector], createId: () => crypto.randomUUID(), platform: 'freebsd' });
    const owner = {};
    await expect(launcher.discover(owner)).resolves.toEqual({ generation: 1, targets: [{ id: 'local', profileId: 'local', label: 'This computer', state: 'available' }] });
    expect(() => launcher.launch(owner, { profileId: 'multipass', targetId: 'unknown', cols: 80, rows: 24 })).toThrow();

    const available = new TerminalLauncher<object>({ connectors: [connector], createId: () => crypto.randomUUID(), platform: 'linux' });
    const target = (await available.discover(owner)).targets.find((candidate) => candidate.profileId === 'multipass')!;
    expect(target.id).not.toContain('running');
    expect(() => available.launch({}, { profileId: 'multipass', targetId: target.id, cols: 80, rows: 24 })).toThrow();
  });

  it('isolates unavailable Vagrant and rejects stale, foreign, and random opaque targets', async () => {
    const id = '11111111-1111-1111-1111-111111111111';
    const connector = new VagrantConnector(async () => ({ stdout: [`1700000000,${id},name,web`, `1700000000,${id},provider,virtualbox`, `1700000000,${id},state,running`, `1700000000,${id},directory,/projects/web`].join('\n') }));
    const launcher = new TerminalLauncher<object>({ connectors: [connector], createId: () => crypto.randomUUID(), platform: 'linux' });
    const owner = {};
    const target = (await launcher.discover(owner)).targets.find((candidate) => candidate.profileId === 'vagrant')!;
    expect(target.id).not.toContain('/projects');
    expect(() => launcher.launch({}, { profileId: 'vagrant', targetId: target.id, cols: 80, rows: 24 })).toThrow();
    await launcher.discover(owner);
    expect(() => launcher.launch(owner, { profileId: 'vagrant', targetId: target.id, cols: 80, rows: 24 })).toThrow();
    expect(() => launcher.launch(owner, { profileId: 'vagrant', targetId: 'random', cols: 80, rows: 24 })).toThrow();
    const unavailable = new TerminalLauncher<object>({ connectors: [new VagrantConnector(async () => { throw new Error('missing'); })], platform: 'linux' });
    await expect(unavailable.discover({})).resolves.toEqual({ generation: 1, targets: [
      { id: 'local', profileId: 'local', label: 'This computer', state: 'available' },
      { id: 'vagrant-unavailable', profileId: 'vagrant', label: 'Vagrant', state: 'unavailable' },
    ] });
  });

  it.each([
    ['Docker', new DockerConnector(vi.fn<CommandRunner>()
      .mockResolvedValueOnce({ stdout: '{"Name":"desktop"}\n{"Name":"unsafe;context"}\n' })
      .mockResolvedValueOnce({ stdout: '{"ID":"0123456789abcdef","Names":"web"}\n{"ID":"short","Names":"ignored"}\n' })), [{ key: 'desktop\u00000123456789abcdef', label: 'desktop: web' }]],
    ['Podman', new PodmanConnector(vi.fn<CommandRunner>()
      .mockResolvedValueOnce({ stdout: JSON.stringify([{ Name: 'local', Default: true }, { Name: 123 }, { Name: 'remote', Default: 'yes' }, null]) })
      .mockResolvedValueOnce({ stdout: JSON.stringify([{ Id: '0123456789abcdef', Names: 'web' }, { Id: 'unsafe;', Names: 'ignored' }]) })), [{ key: '\u00000123456789abcdef', label: 'local: web' }]],
    ['Lima', new LimaConnector(async () => ({ stdout: '{"name":"running","status":"Running"}\n{"name":"unsafe;","status":"Running"}\n{"name":"stopped","status":"Stopped"}\n' })), [{ key: 'running', label: 'running' }]],
    ['Multipass', new MultipassConnector(async () => ({ stdout: JSON.stringify({ list: [{ name: 'running', state: 'RUNNING' }, { name: 'unsafe;', state: 'RUNNING' }, { name: 'stopped', state: 'STOPPED' }] }) })), [{ key: 'running', label: 'running' }]],
    ['WSL', new WslConnector(async () => ({ stdout: 'Ubuntu\nunsafe;\n\n' })), [{ key: 'Ubuntu', label: 'Ubuntu' }]],
  ] as const)('accepts only safe runnable %s provider records', async (_provider, connector, expected) => {
    await expect(connector.discover()).resolves.toEqual(expected);
  });

  it('accepts complete Vagrant and Kubernetes records while rejecting every incomplete field', async () => {
    const machineId = '11111111-1111-1111-1111-111111111111';
    const vagrant = new VagrantConnector(async () => ({ stdout: [
      `1700000000,${machineId},name,web`,
      `1700000000,${machineId},provider,virtualbox`,
      `1700000000,${machineId},state,running`,
      `1700000000,${machineId},directory,/projects/web`,
      `1700000000,${machineId},name,unsafe;`,
      `1700000000,${machineId},provider,unsafe;`,
      `1700000000,${machineId},directory,relative`,
    ].join('\n') }));
    await expect(vagrant.discover()).resolves.toEqual([{ key: `${machineId}\u0000web\u0000virtualbox\u0000/projects/web`, label: 'web (virtualbox)' }]);
    for (const key of [
      `x${machineId}\u0000web\u0000virtualbox\u0000/projects/web`,
      `${machineId}\u0000web;\u0000virtualbox\u0000/projects/web`,
      `${machineId}\u0000web\u0000virtualbox;\u0000/projects/web`,
      `${machineId}\u0000web\u0000virtualbox\u0000projects/web`,
    ]) expect(() => vagrant.launch({ key, label: 'untrusted' })).toThrow('Invalid Vagrant target.');

    const kubernetes = new KubernetesConnector(async (_command, args) => args[0] === 'config'
      ? { stdout: 'development\n' }
      : { stdout: JSON.stringify({ items: [
        { metadata: { namespace: 'apps', name: 'web', uid: '11111111-1111-1111-1111-111111111111' }, status: { phase: 'Running' }, spec: { containers: [{ name: 'web' }] } },
        { metadata: { namespace: 'Apps', name: 'web', uid: '11111111-1111-1111-1111-111111111111' }, status: { phase: 'Running' }, spec: { containers: [{ name: 'web' }] } },
        { metadata: { namespace: 'apps', name: 'web', uid: 'bad' }, status: { phase: 'Running' }, spec: { containers: [{ name: 'web' }] } },
        { metadata: { namespace: 'apps', name: 'web', uid: '11111111-1111-1111-1111-111111111111' }, status: { phase: 'Running' }, spec: { containers: [null, { name: 'bad_name' }] } },
      ] }) });
    await expect(kubernetes.discover()).resolves.toEqual([{ key: 'development\u0000apps\u0000web\u000011111111-1111-1111-1111-111111111111\u0000web', label: 'development: apps/web (web)' }]);
    for (const key of [
      'development\u0000apps\u0000web\u000011111111-1111-1111-1111-111111111111\u0000web;',
      'development\u0000Apps\u0000web\u000011111111-1111-1111-1111-111111111111\u0000web',
      'development\u0000apps\u0000web\u000011111111-1111-1111-1111-111111111111\u0000bad_name',
    ]) expect(() => kubernetes.launch({ key, label: 'untrusted' })).toThrow('Invalid Kubernetes target.');
  });

  it('uses exact SSH and tmux discovery recipes and rejects malformed generated targets', async () => {
    const sshRun = vi.fn<CommandRunner>().mockResolvedValue({ stdout: '' });
    const ssh = new SshConnector('/home/ada', () => 'Host work\nHost dev.example\n', sshRun);
    await expect(ssh.discover()).resolves.toEqual([{ key: 'work', label: 'work' }, { key: 'dev.example', label: 'dev.example' }]);
    expect(sshRun).toHaveBeenCalledWith('ssh', ['-V'], { timeout: 2_000, maxBuffer: 64 * 1024 });
    for (const key of ['', '-work', 'work;', `w${'o'.repeat(127)}`]) expect(() => ssh.launch({ key, label: 'untrusted' })).toThrow('Invalid SSH target.');

    const generated = 'stuffbucket-0123456789abcdef0123456789abcdef';
    const tmux = new TmuxConnector(async () => ({ stdout: 'one\ntwo\n' }), () => generated);
    await expect(tmux.discover()).resolves.toEqual([
      { key: 'existing\u0000one', label: 'Tmux session 1' },
      { key: 'existing\u0000two', label: 'Tmux session 2' },
      { key: `new\u0000${generated}`, label: 'New tmux session' },
    ]);
    for (const key of [`new\u0000x${generated}`, `new\u0000${generated}x`, 'other\u0000one', 'existing\u0000one;']) {
      expect(() => tmux.launch({ key, label: 'untrusted' })).toThrow('Invalid tmux target.');
    }
  });

  it('creates remote tmux targets only for reachable SSH aliases and preserves their exact argv', async () => {
    const generated = 'stuffbucket-0123456789abcdef0123456789abcdef';
    const noServer = Object.assign(new Error('no server'), { code: 1 });
    const run = vi.fn<CommandRunner>().mockImplementation(async (_command, args) => {
      if (args[3] === 'tmux -V') return { stdout: 'tmux 3.7b\n' };
      if (args[2] === 'empty') throw noServer;
      if (args[2] === 'broken') throw new Error('unavailable');
      return { stdout: 'team\ninvalid;\n' };
    });
    const connector = new SshTmuxConnector('/home/ada', () => 'Host work\nHost empty\nHost broken\n', run, () => generated);
    await expect(connector.discover()).resolves.toEqual([
      { key: 'work\u0000existing\u0000team', label: 'Tmux session 1' },
      { key: `work\u0000new\u0000${generated}`, label: 'New tmux session' },
      { key: `empty\u0000new\u0000${generated}`, label: 'New tmux session' },
    ]);
    expect(run).toHaveBeenNthCalledWith(1, 'ssh', ['-o', 'BatchMode=yes', 'work', 'tmux -V'], { timeout: 2_000, maxBuffer: 64 * 1024 });
    expect(run).toHaveBeenNthCalledWith(2, 'ssh', ['-o', 'BatchMode=yes', 'work', "tmux list-sessions -F '#{session_name}'"], { timeout: 2_000, maxBuffer: 64 * 1024 });
    for (const key of [`work\u0000new\u0000${generated}x`, `work;\u0000existing\u0000team`, 'work\u0000other\u0000team']) {
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
    await expect(new SshTmuxConnector('/home/ada', () => { throw missing; }).discover()).resolves.toEqual([]);
    const denied = Object.assign(new Error('denied'), { code: 'EACCES' });
    await expect(new SshTmuxConnector('/home/ada', () => { throw denied; }).discover()).rejects.toThrow('denied');
    await expect(new SshTmuxConnector('/home/ada', () => 'Host work'.repeat(64 * 1024)).discover()).rejects.toThrow('SSH config exceeds the discovery limit.');
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
    [new TmuxConnector(async () => ({ stdout: '' })), 'bad', 'Invalid tmux target.'],
    [new SshTmuxConnector('/home/ada', () => ''), 'bad', 'Invalid SSH tmux target.'],
  ] as const)('reports the exact fail-closed launch error for each connector', (connector, key, message) => {
    expect(() => connector.launch({ key, label: 'untrusted' })).toThrow(message);
  });
});