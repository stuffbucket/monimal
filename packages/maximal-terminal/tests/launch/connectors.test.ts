import { describe, expect, it, vi } from 'vitest';
import { tmuxNames } from '../support/tmux-names.js';
import {
  DockerConnector,
  KubernetesConnector,
  LimaConnector,
  MultipassConnector,
  PodmanConnector,
  SshConnector,
  TmuxConnector,
  VagrantConnector,
  WslConnector,
  type CommandRunner,
} from '../../src/launch/command-connectors.js';
import { TerminalLauncher } from '../../src/launch/launcher.js';

describe('command connectors', () => {
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
    await expect(new TmuxConnector(async () => ({ stdout: 'x'.repeat(64 * 1024) }), tmuxNames()).discover()).resolves.toHaveLength(1);
    await expect(new TmuxConnector(async () => ({ stdout: 'x'.repeat(64 * 1024 + 1) }), tmuxNames()).discover()).rejects.toThrow('Command output exceeds the discovery limit.');
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

});
