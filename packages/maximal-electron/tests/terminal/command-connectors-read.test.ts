import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockedFs = vi.hoisted(() => ({
  closeSync: vi.fn(),
  openSync: vi.fn(),
  readSync: vi.fn(),
}));

vi.mock('node:fs', async (importOriginal) => ({
  ...await importOriginal(),
  ...mockedFs,
}));

import {
  DockerConnector,
  KubernetesConnector,
  LimaConnector,
  MultipassConnector,
  PodmanConnector,
  parseVagrantRecord,
  SshTmuxConnector,
  TmuxConnector,
  VagrantConnector,
  readSshConfig,
} from '../../src/main/native/command-connectors.js';

const containerId = 'a'.repeat(64);
const podUid = '12345678-1234-1234-1234-123456789abc';

function runnerFor(outputs: Record<string, string>) {
  return vi.fn(async (command: string, args: readonly string[]) => ({ stdout: outputs[`${command} ${args.join(' ')}`] ?? '' }));
}

describe('readSshConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedFs.openSync.mockReturnValue(42);
  });

  it('closes its descriptor after returning bounded content', () => {
    mockedFs.readSync.mockImplementation((_descriptor, bytes: Buffer) => {
      bytes.write('Host work');
      return 9;
    });
    expect(readSshConfig('/home/ada/.ssh/config', 16)).toBe('Host work');
    expect(mockedFs.closeSync).toHaveBeenCalledOnce();
    expect(mockedFs.closeSync).toHaveBeenCalledWith(42);
  });

  it('closes its descriptor when reading fails', () => {
    const error = new Error('read failed');
    mockedFs.readSync.mockImplementation(() => { throw error; });
    expect(() => readSshConfig('/home/ada/.ssh/config', 16)).toThrow(error);
    expect(mockedFs.closeSync).toHaveBeenCalledWith(42);
  });
});

describe('command connectors', () => {
  it('discovers Docker labels, ignores malformed records, caps containers, and supplies bounded callbacks', async () => {
    const containers = Array.from({ length: 129 }, (_, index) => JSON.stringify({ ID: index === 0 ? containerId : `${index}`.padStart(12, 'a'), Names: index === 0 ? '' : index === 1 ? 'n'.repeat(161) : `container-${index}` }));
    const run = runnerFor({
      'docker context ls --format {{json .}}': JSON.stringify({ Name: 'work' }),
      'docker --context work ps --format {{json .}}': containers.join('\n'),
    });

    await expect(new DockerConnector(run).discover()).resolves.toEqual([
      { key: `work\u0000${containerId}`, label: 'work: Container' },
      ...Array.from({ length: 127 }, (_, index) => ({ key: `work\u0000${`${index + 1}`.padStart(12, 'a')}`, label: `work: ${index === 0 ? 'n'.repeat(160) : `container-${index + 1}`}` })),
    ]);
    expect(run).toHaveBeenNthCalledWith(1, 'docker', ['context', 'ls', '--format', '{{json .}}'], { timeout: 2_000, maxBuffer: 64 * 1024 });
    expect(run).toHaveBeenNthCalledWith(2, 'docker', ['--context', 'work', 'ps', '--format', '{{json .}}'], { timeout: 2_000, maxBuffer: 64 * 1024 });
  });

  it('rejects malformed Docker JSON lines', async () => {
    const run = runnerFor({ 'docker context ls --format {{json .}}': 'not-json' });
    await expect(new DockerConnector(run).discover()).rejects.toThrow(SyntaxError);
  });

  it('rejects invalid generated local and remote tmux names with exact errors', async () => {
    const noServer = Object.assign(new Error('no server'), { code: 1 });
    await expect(new TmuxConnector(runnerFor({ 'tmux list-sessions -F #{session_name}': '' }), () => 'invalid').discover())
      .rejects.toThrow('Invalid generated tmux session name.');

    await expect(new SshTmuxConnector('/home/ada', () => 'Host work', runnerFor({ "ssh -o BatchMode=yes work tmux list-sessions -F '#{session_name}'": '' }), () => 'invalid').discover())
      .rejects.toThrow('Invalid generated tmux session name.');

    const remote = new SshTmuxConnector('/home/ada', () => 'Host work', async () => { throw noServer; }, () => 'invalid');
    await expect(remote.discover()).rejects.toThrow('Invalid generated tmux session name.');
  });

  it('uses Podman fallback labels, caps connections and containers, and rejects malformed output', async () => {
    const connections = Array.from({ length: 33 }, (_, index) => ({ Name: `connection-${index}`, Default: false }));
    const containers = Array.from({ length: 129 }, (_, index) => ({ Id: index === 0 ? containerId : `${index}`.padStart(12, 'a'), Names: index === 0 ? '' : `container-${index}` }));
    const run = runnerFor({
      'podman system connection list --format json': JSON.stringify(connections),
      'podman --connection connection-0 ps --format json': JSON.stringify(containers),
    });
    run.mockImplementation(async (command, args) => ({
      stdout: command === 'podman' && args[0] === '--connection' && args[1] !== 'connection-0'
        ? '[]'
        : command === 'podman' && args[0] === '--connection'
          ? JSON.stringify(containers)
          : JSON.stringify(connections),
    }));

    const connector = new PodmanConnector(run);
    const targets = await connector.discover();
    expect(targets).toHaveLength(128);
    expect(targets[0]).toEqual({ key: `connection-0\u0000${containerId}`, label: 'connection-0: Container' });
    expect(run).toHaveBeenCalledWith('podman', ['--connection', 'connection-31', 'ps', '--format', 'json'], { timeout: 2_000, maxBuffer: 64 * 1024 });

    const malformed = runnerFor({ 'podman system connection list --format json': '{}' });
    await expect(new PodmanConnector(malformed).discover()).rejects.toThrow('Invalid Podman connection output.');
  });

  it('discovers only running Lima and Multipass instances up to their caps', async () => {
    const lima = Array.from({ length: 129 }, (_, index) => JSON.stringify({ name: `lima-${index}`, status: 'Running' })).join('\n');
    const multipass = { list: Array.from({ length: 129 }, (_, index) => ({ name: `multi-${index}`, state: 'RUNNING' })) };
    const run = runnerFor({
      'limactl list --format json': lima,
      'multipass list --format json': JSON.stringify(multipass),
    });

    await expect(new LimaConnector(run).discover()).resolves.toEqual(Array.from({ length: 128 }, (_, index) => ({ key: `lima-${index}`, label: `lima-${index}` })));
    await expect(new MultipassConnector(run).discover()).resolves.toEqual(Array.from({ length: 128 }, (_, index) => ({ key: `multi-${index}`, label: `multi-${index}` })));
    await expect(new LimaConnector(runnerFor({ 'limactl list --format json': 'not-json' })).discover()).rejects.toThrow(SyntaxError);
    await expect(new MultipassConnector(runnerFor({ 'multipass list --format json': '{}' })).discover()).rejects.toThrow('Invalid Multipass list output.');
  });

  it('uses Vagrant records with a Windows drive root and rejects non-rooted Windows paths', async () => {
    const id = '12345678-1234-1234-1234-123456789abc';
    const run = runnerFor({
      'vagrant global-status --prune --machine-readable': [
        `1700000000,${id},name,dev\\,one`,
        `1700000000,${id},provider,virtualbox`,
        `1700000000,${id},state,running`,
        `1700000000,${id},directory,C:\\\\`,
        `1700000000,${id.slice(0, -1)}d,name,invalid`,
        `1700000000,${id.slice(0, -1)}d,provider,virtualbox`,
        `1700000000,${id.slice(0, -1)}d,state,running`,
        `1700000000,${id.slice(0, -1)}d,directory,C:relative`,
      ].join('\n'),
    });

    await expect(new VagrantConnector(run).discover()).resolves.toEqual([{ key: `${id}\u0000dev,one\u0000virtualbox\u0000C:\\`, label: 'dev,one (virtualbox)' }]);

    const connector = new VagrantConnector(run);
    expect(connector.launch({ key: `${id}\u0000dev\u0000virtualbox\u0000C:/`, label: 'ignored' }))
      .toEqual({ command: 'vagrant', args: ['ssh', id] });
    for (const directory of ['', 'C:', '1:\\', 'C-\\', 'C:relative']) {
      expect(() => connector.launch({ key: `${id}\u0000dev\u0000virtualbox\u0000${directory}`, label: 'ignored' }))
        .toThrow('Invalid Vagrant target.');
    }
  });

  it('parses escaped Vagrant fields and rejects a dangling escape', () => {
    expect(parseVagrantRecord('time,id,name,dev\\,one')).toEqual(['time', 'id', 'name', 'dev,one']);
    expect(parseVagrantRecord('time,id,directory,C:\\\\')).toEqual(['time', 'id', 'directory', 'C:\\']);
    expect(parseVagrantRecord('time,id,name,dev\\')).toBeUndefined();
  });

  it('owns the SSH tmux identity and reads only the primary user config path', async () => {
    const reads: Array<[string, number]> = [];
    const connector = new SshTmuxConnector('/home/ada', (filename, maxBytes) => {
      reads.push([filename, maxBytes]);
      return '';
    }, runnerFor({}));

    expect({ id: connector.id, label: connector.label }).toEqual({ id: 'ssh-tmux', label: 'SSH + Tmux' });
    await expect(connector.discover()).resolves.toEqual([]);
    expect(reads).toEqual([['/home/ada/.ssh/config', 64 * 1024]]);
  });

  it('requires Kubernetes items and running status, preserving the exact target key', async () => {
    const run = runnerFor({
      'kubectl config current-context': 'work\n',
      'kubectl --context work get pods --all-namespaces -o json': JSON.stringify({
        items: [
          { metadata: { name: 1, namespace: 'team', uid: podUid }, status: { phase: 'Running' }, spec: { containers: [{ name: 'numeric-name' }] } },
          { metadata: { name: 'missing-status', namespace: 'team', uid: podUid }, spec: { containers: [{ name: 'app' }] } },
          { metadata: { name: 'missing-containers', namespace: 'team', uid: podUid }, status: { phase: 'Running' } },
          { metadata: { name: 'api', namespace: 'team', uid: podUid }, status: { phase: 'Running' }, spec: { containers: [{ name: 'app' }] } },
        ],
      }),
    });
    const connector = new KubernetesConnector(run);
    await expect(connector.discover()).resolves.toEqual([{ key: `work\u0000team\u0000api\u0000${podUid}\u0000app`, label: 'work: team/api (app)' }]);
    expect(connector.launch({ key: `work\u0000team\u0000api\u0000${podUid}\u0000app`, label: 'ignored' })).toEqual({ command: 'kubectl', args: ['--context', 'work', '--namespace', 'team', 'exec', '-it', 'api', '-c', 'app', '--', '/bin/sh'] });
    await expect(new KubernetesConnector(runnerFor({ 'kubectl config current-context': 'work', 'kubectl --context work get pods --all-namespaces -o json': '{}' })).discover()).rejects.toThrow('Invalid Kubernetes pod output.');
  });

  it('caps Kubernetes pods, namespaces, and containers at their exact limits', async () => {
    const pod = (index: number, namespace = 'team', containers = [{ name: `app-${index}` }]) => ({ metadata: { name: `pod-${index}`, namespace, uid: podUid }, status: { phase: 'Running' }, spec: { containers } });
    const discover = (items: unknown[]) => new KubernetesConnector(runnerFor({
      'kubectl config current-context': 'work',
      'kubectl --context work get pods --all-namespaces -o json': JSON.stringify({ items }),
    })).discover();

    await expect(discover(Array.from({ length: 129 }, (_, index) => pod(index)))).resolves.toHaveLength(128);
    await expect(discover([...Array.from({ length: 128 }, (_, index) => pod(index, 'team', [])), pod(128)])).resolves.toEqual([]);
    await expect(discover(Array.from({ length: 33 }, (_, index) => pod(index, `team-${index}`)))).resolves.toHaveLength(32);
    await expect(discover([pod(0, 'team', Array.from({ length: 129 }, (_, index) => ({ name: `app-${index}` })))]))
      .resolves.toEqual(Array.from({ length: 128 }, (_, index) => ({ key: `work\u0000team\u0000pod-0\u0000${podUid}\u0000app-${index}`, label: `work: team/pod-0 (app-${index})` })));

    const longContext = 'w'.repeat(128);
    const longNamespace = `n${'a'.repeat(251)}n`;
    const longPod = `p${'a'.repeat(251)}p`;
    const longContainer = `c${'a'.repeat(59)}c`;
    const longTarget = pod(0, longNamespace, [{ name: longContainer }]);
    longTarget.metadata.name = longPod;
    const longRun = runnerFor({
      'kubectl config current-context': longContext,
      [`kubectl --context ${longContext} get pods --all-namespaces -o json`]: JSON.stringify({ items: [longTarget] }),
    });
    await expect(new KubernetesConnector(longRun).discover()).resolves.toEqual([{ key: `${longContext}\u0000${longNamespace}\u0000${longPod}\u0000${podUid}\u0000${longContainer}`, label: `${longContext}: ${longNamespace}/${longPod} (${longContainer})`.slice(0, 160) }]);
  });
});