import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { closeSync, openSync, readSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

export interface CommandResult {
  stdout: string;
}

export type CommandRunner = (
  command: string,
  args: readonly string[],
  options: { timeout: number; maxBuffer: number },
) => Promise<CommandResult>;

const execFileAsync = promisify(execFile);

export const execFileRunner: CommandRunner = async (command, args, options) => {
  const result = await execFileAsync(command, [...args], {
    timeout: options.timeout,
    maxBuffer: options.maxBuffer,
    encoding: 'utf8',
    shell: false,
  });
  return { stdout: result.stdout };
};

export interface DiscoveredTarget {
  key: string;
  label: string;
}

export interface TmuxProjectionLaunch {
  terminate: { command: string; args: string[] };
}

export interface CommandLaunch {
  command: string;
  args: string[];
  tmuxProjection?: TmuxProjectionLaunch;
}

export interface CommandConnector {
  readonly id: 'docker' | 'podman' | 'lima' | 'multipass' | 'kubernetes' | 'wsl' | 'vagrant' | 'ssh' | 'tmux' | 'ssh-tmux';
  readonly label: string;
  discover(): Promise<DiscoveredTarget[]>;
  launch(target: DiscoveredTarget): CommandLaunch;
}

const MAX_CONTEXTS = 32;
const MAX_CONTAINERS = 128;
const MAX_NAMESPACES = 32;
const MAX_PODS = 128;
const MAX_LABEL_LENGTH = 160;
const MAX_WSL_DISTROS = 64;
const MAX_VAGRANT_MACHINES = 128;
const DISCOVERY_TIMEOUT_MS = 2_000;
const DISCOVERY_MAX_BYTES = 64 * 1024;
const MAX_SSH_CONFIG_BYTES = 64 * 1024;
const MAX_SSH_CONFIG_LINES = 1_024;
const MAX_SSH_ALIASES = 128;
const MAX_TMUX_SESSIONS = 128;
const MAX_REMOTE_TMUX_HOSTS = 16;
const SAFE_SSH_ALIAS = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,126}$/;
const SAFE_TMUX_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const GENERATED_TMUX_NAME = /^stuffbucket-[a-f0-9]{32}$/;
const SAFE_CONTEXT = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const SAFE_CONTAINER = /^[a-f0-9]{12,64}$/;
const SAFE_WSL_DISTRO = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const SAFE_VAGRANT_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const SAFE_VAGRANT_NAME = /^[A-Za-z0-9][A-Za-z0-9_., -]{0,127}$/;
const SAFE_VAGRANT_PROVIDER = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const SAFE_POSIX_VAGRANT_DIRECTORY = /^(?:\/[A-Za-z0-9._, -]+)+(?:\/)?$/;
const SAFE_VAGRANT_DIRECTORY_SEGMENT = /^[A-Za-z0-9._, -]+$/;
const NEW_TMUX_TARGET_LABEL = ['New', 'tmux', 'session'].join(' ');
const TMUX_CLIENT_FEATURES = 'hyperlinks';
const TMUX_HYPERLINK_VERSION = /^tmux (\d+)\.(\d+)/;

interface DockerContainer {
  ID?: unknown;
  Names?: unknown;
}

interface PodmanConnection {
  Name?: unknown;
  Default?: unknown;
}

interface PodmanContainer {
  Id?: unknown;
  Names?: unknown;
}

interface LimaInstance {
  name?: unknown;
  status?: unknown;
}

interface MultipassInstance {
  name?: unknown;
  state?: unknown;
}

interface KubernetesPodList {
  items?: unknown;
}

interface KubernetesPod {
  metadata?: { name?: unknown; namespace?: unknown; uid?: unknown };
  spec?: { containers?: unknown };
  status?: { phase?: unknown };
}

const SAFE_INSTANCE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const SAFE_KUBERNETES_NAME = /^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/;
const SAFE_KUBERNETES_CONTAINER = /^[a-z0-9](?:[a-z0-9.-]{0,61}[a-z0-9])?$/;
const SAFE_KUBERNETES_UID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

function discoveryOptions(): { timeout: number; maxBuffer: number } {
  return { timeout: DISCOVERY_TIMEOUT_MS, maxBuffer: DISCOVERY_MAX_BYTES };
}

function parseJsonLines(output: string): unknown[] {
  if (output.length > DISCOVERY_MAX_BYTES) throw new Error('Command output exceeds the discovery limit.');
  const values: unknown[] = [];
  for (const line of output.split('\n').filter(Boolean)) {
    const value: unknown = JSON.parse(line);
    values.push(value);
  }
  return values;
}

function parseJson(output: string): unknown {
  if (output.length > DISCOVERY_MAX_BYTES) throw new Error('Command output exceeds the discovery limit.');
  const value: unknown = JSON.parse(output);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function validContext(value: unknown): value is string {
  return typeof value === 'string' && SAFE_CONTEXT.test(value);
}

function validContainer(value: unknown): value is string {
  return typeof value === 'string' && SAFE_CONTAINER.test(value);
}

function validWslDistro(value: unknown): value is string {
  return SAFE_WSL_DISTRO.test(value as string);
}

function validVagrantId(value: string): boolean {
  return SAFE_VAGRANT_ID.test(value);
}

function validVagrantName(value: string): boolean {
  return SAFE_VAGRANT_NAME.test(value);
}

function validVagrantProvider(value: string): boolean {
  return SAFE_VAGRANT_PROVIDER.test(value);
}

function validVagrantDirectory(value: string): boolean {
  if (SAFE_POSIX_VAGRANT_DIRECTORY.test(value)) return true;
  if (value.length < 3) return false;
  const drive = value[0]!;
  if (drive.toUpperCase() === drive.toLowerCase()) return false;
  if (value[1] !== ':') return false;
  if (value[2] !== '\\' && value[2] !== '/') return false;
  const segments = value.slice(3).split(/[\\/]/);
  return segments.every((segment, index) =>
    segment === '' ? index === segments.length - 1 : SAFE_VAGRANT_DIRECTORY_SEGMENT.test(segment),
  );
}

function validInstance(value: unknown): value is string {
  return typeof value === 'string' && SAFE_INSTANCE.test(value);
}

function validSshAlias(value: unknown): value is string {
  return SAFE_SSH_ALIAS.test(value as string);
}

function validTmuxName(value: unknown): value is string {
  return SAFE_TMUX_NAME.test(value as string);
}

type TargetFieldValidator = (value: unknown) => boolean;

const TARGET_FIELDS = {
  docker: [validContext, validContainer],
  podman: [(value: unknown) => value === '' || validContext(value), validContainer],
  tmux: [(value: unknown) => value === 'existing' || value === 'new', validTmuxName],
  sshTmux: [validSshAlias, (value: unknown) => value === 'existing' || value === 'new', validTmuxName],
  vagrant: [(value) => validVagrantId(value as string), (value) => validVagrantName(value as string), (value) => validVagrantProvider(value as string), (value) => validVagrantDirectory(value as string)],
  kubernetes: [validContext, validKubernetesName, validKubernetesName, validKubernetesUid, validKubernetesContainer],
} satisfies Record<string, readonly TargetFieldValidator[]>;

function targetFields(key: string, validators: readonly TargetFieldValidator[]): string[] | undefined {
  const fields = key.split('\u0000');
  if (fields.length !== validators.length || fields.some((field, index) => !validators[index]!(field))) return undefined;
  return fields;
}

function generatedTmuxName(): string {
  return `stuffbucket-${randomBytes(16).toString('hex')}`;
}

function validGeneratedTmuxName(value: unknown): value is string {
  return GENERATED_TMUX_NAME.test(value as string);
}

function parseSshAliases(config: string): string[] {
  const aliases: string[] = [];
  for (const rawLine of config.split('\n').slice(0, MAX_SSH_CONFIG_LINES)) {
    const line = rawLine.replace(/#.*/, '').trim();
    const patterns = line.split(/\s+/);
    const keyword = patterns.shift()!;
    const normalizedKeyword = keyword.toLowerCase();
    if (normalizedKeyword === 'match') break;
    const alias = patterns[0];
    if (normalizedKeyword !== 'host' || patterns.length !== 1 || !validSshAlias(alias) || aliases.includes(alias)) continue;
    aliases.push(alias);
    if (aliases.length === MAX_SSH_ALIASES) break;
  }
  return aliases;
}

function readSshAliases(filename: string, readConfig: SshConfigReader): string[] {
  let config: string;
  try {
    config = readConfig(filename, MAX_SSH_CONFIG_BYTES);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  if (Buffer.byteLength(config) > MAX_SSH_CONFIG_BYTES) throw new Error('SSH config exceeds the discovery limit.');
  return parseSshAliases(config);
}

function parseTmuxSessions(output: string): string[] {
  if (Buffer.byteLength(output) > DISCOVERY_MAX_BYTES) throw new Error('Command output exceeds the discovery limit.');
  const sessions: string[] = [];
  for (const session of output.split(/\r?\n/)) {
    if (!validTmuxName(session) || sessions.includes(session)) continue;
    sessions.push(session);
    if (sessions.length === MAX_TMUX_SESSIONS) break;
  }
  return sessions;
}

function isNoTmuxServer(error: unknown): boolean {
  return (error as { code?: unknown }).code === 1;
}

function tmuxSupportsHyperlinks(version: string): boolean {
  const match = TMUX_HYPERLINK_VERSION.exec(version.trim());
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major > 3 || (major === 3 && minor >= 4);
}

function tmuxClientFeatureArgs(supportsHyperlinks: boolean): string[] {
  return supportsHyperlinks ? ['-T', TMUX_CLIENT_FEATURES] : [];
}

/** Read the fixed user SSH config through a bounded, host-owned dependency. */
export type SshConfigReader = (filename: string, maxBytes: number) => string;

export function readSshConfig(filename: string, maxBytes: number): string {
  const descriptor = openSync(filename, 'r');
  try {
    const bytes = Buffer.alloc(maxBytes + 1);
    const count = readSync(descriptor, bytes, 0, bytes.length, 0);
    if (count > maxBytes) throw new Error('SSH config exceeds the discovery limit.');
    return bytes.subarray(0, count).toString('utf8');
  } finally {
    closeSync(descriptor);
  }
}

/**
 * Main-process-only system OpenSSH connector.
 *
 * It intentionally reads only the primary user config. Include, Match, globs,
 * negated patterns, and multi-pattern Host entries need OpenSSH semantics and
 * are ignored rather than approximated. OpenSSH owns every option and all
 * authentication; aliases are only passed back to its executable at launch.
 */
export class SshConnector implements CommandConnector {
  readonly id = 'ssh' as const;
  readonly label = 'SSH';

  constructor(
    homeDirectory: string,
    private readonly readConfig: SshConfigReader = readSshConfig,
    private readonly run?: CommandRunner,
  ) {
    this.filename = join(homeDirectory, '.ssh', 'config');
  }

  private readonly filename: string;

  async discover(): Promise<DiscoveredTarget[]> {
    if (this.run) await this.run('ssh', ['-V'], discoveryOptions());
    return readSshAliases(this.filename, this.readConfig).map((alias) => ({ key: alias, label: alias }));
  }

  launch(target: DiscoveredTarget): { command: string; args: string[] } {
    if (!validSshAlias(target.key)) throw new Error('Invalid SSH target.');
    return { command: 'ssh', args: ['-tt', target.key] };
  }
}

/** Main-process-only local tmux connector. Session names never cross IPC. */
export class TmuxConnector implements CommandConnector {
  readonly id = 'tmux' as const;
  readonly label = 'Tmux';
  private supportsHyperlinks = true;

  constructor(private readonly run: CommandRunner, private readonly createName: () => string = generatedTmuxName) {}

  async discover(): Promise<DiscoveredTarget[]> {
    this.supportsHyperlinks = tmuxSupportsHyperlinks((await this.run('tmux', ['-V'], discoveryOptions())).stdout);
    let sessions: string[] = [];
    try {
      sessions = parseTmuxSessions((await this.run('tmux', ['list-sessions', '-F', '#{session_name}'], discoveryOptions())).stdout);
    } catch (error) {
      if (!isNoTmuxServer(error)) throw error;
    }
    const targets = sessions.map((_session, index) => ({ key: `existing\u0000${_session}`, label: `Tmux session ${String(index + 1)}` }));
    const name = this.createName();
    if (!validGeneratedTmuxName(name)) throw new Error('Invalid generated tmux session name.');
    targets.push({ key: `new\u0000${name}`, label: NEW_TMUX_TARGET_LABEL });
    return targets;
  }

  launch(target: DiscoveredTarget): CommandLaunch {
    const fields = targetFields(target.key, TARGET_FIELDS.tmux);
    if (!fields || (fields[0] === 'new' && !validGeneratedTmuxName(fields[1]))) {
      throw new Error('Invalid tmux target.');
    }
    const sessionName = fields[1]!;
    return {
      command: 'tmux',
      args: [...tmuxClientFeatureArgs(this.supportsHyperlinks), 'new-session', '-A', '-s', sessionName],
      tmuxProjection: {
        terminate: { command: 'tmux', args: ['kill-session', '-t', sessionName] },
      },
    };
  }
}

/** Main-process-only SSH tmux connector. Remote command text is fixed. */
export class SshTmuxConnector implements CommandConnector {
  readonly id = 'ssh-tmux' as const;
  readonly label = 'SSH + Tmux';
  private readonly filename: string;
  private readonly legacyAliases = new Set<string>();

  constructor(
    homeDirectory: string,
    private readonly readConfig: SshConfigReader = readSshConfig,
    private readonly run: CommandRunner = execFileRunner,
    private readonly createName: () => string = generatedTmuxName,
  ) {
    this.filename = join(homeDirectory, '.ssh', 'config');
  }

  async discover(): Promise<DiscoveredTarget[]> {
    const aliases = readSshAliases(this.filename, this.readConfig).slice(0, MAX_REMOTE_TMUX_HOSTS);
    const targets: DiscoveredTarget[] = [];
    for (const alias of aliases) {
      let sessions: string[] = [];
      try {
        const version = (await this.run('ssh', ['-o', 'BatchMode=yes', alias, 'tmux -V'], discoveryOptions())).stdout;
        if (tmuxSupportsHyperlinks(version)) this.legacyAliases.delete(alias);
        else this.legacyAliases.add(alias);
        sessions = parseTmuxSessions((await this.run('ssh', ['-o', 'BatchMode=yes', alias, "tmux list-sessions -F '#{session_name}'"], discoveryOptions())).stdout);
      } catch (error) {
        if (!isNoTmuxServer(error)) continue;
      }
      for (const [index, session] of sessions.entries()) targets.push({ key: `${alias}\u0000existing\u0000${session}`, label: `Tmux session ${String(index + 1)}` });
      const name = this.createName();
      if (!validGeneratedTmuxName(name)) throw new Error('Invalid generated tmux session name.');
      targets.push({ key: `${alias}\u0000new\u0000${name}`, label: 'New tmux session' });
    }
    return targets;
  }

  launch(target: DiscoveredTarget): CommandLaunch {
    const fields = targetFields(target.key, TARGET_FIELDS.sshTmux);
    if (!fields || (fields[1] === 'new' && !validGeneratedTmuxName(fields[2]))) {
      throw new Error('Invalid SSH tmux target.');
    }
    const alias = fields[0]!;
    const sessionName = fields[2]!;
    return {
      command: 'ssh',
      args: ['-tt', alias, 'tmux', ...tmuxClientFeatureArgs(!this.legacyAliases.has(alias)), 'new-session', '-A', '-s', sessionName],
      tmuxProjection: {
        terminate: { command: 'ssh', args: [alias, 'tmux', 'kill-session', '-t', sessionName] },
      },
    };
  }
}

function validKubernetesName(value: unknown): value is string {
  return typeof value === 'string' && SAFE_KUBERNETES_NAME.test(value);
}

function validKubernetesContainer(value: unknown): value is string {
  return typeof value === 'string' && SAFE_KUBERNETES_CONTAINER.test(value);
}

function validKubernetesUid(value: unknown): value is string {
  return typeof value === 'string' && SAFE_KUBERNETES_UID.test(value);
}

function label(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0
    ? value.slice(0, MAX_LABEL_LENGTH)
    : fallback;
}

function truncateLabel(value: string): string {
  return value.slice(0, MAX_LABEL_LENGTH);
}

export function parseVagrantRecord(line: string): string[] | undefined {
  if (/[^\\](?:\\\\)*\\$/.test(line)) return undefined;
  const fields = Array.from(line.matchAll(/(?:^|,)((?:\\.|[^,])*)/g), (match) => match[1]!.replace(/\\(.)/g, '$1'));
  return fields.length === 4 ? fields : undefined;
}

interface VagrantMachine {
  id?: string;
  name?: string;
  provider?: string;
  state?: string;
  directory?: string;
}

/** Main-process-only WSL connector. WSL emits a CRLF-delimited command result. */
export class WslConnector implements CommandConnector {
  readonly id = 'wsl' as const;
  readonly label = 'WSL';

  constructor(private readonly run: CommandRunner) {}

  async discover(): Promise<DiscoveredTarget[]> {
    const output = (await this.run('wsl.exe', ['--list', '--quiet'], discoveryOptions())).stdout;
    if (output.length > DISCOVERY_MAX_BYTES) throw new Error('Command output exceeds the discovery limit.');
    return output.replace(/^\uFEFF/, '').split('\n').slice(0, MAX_WSL_DISTROS).flatMap((raw) => {
      const distro = raw.replace(/\r$/, '').replace(/^\0+|\0+$/g, '');
      return validWslDistro(distro) ? [{ key: distro, label: distro }] : [];
    });
  }

  launch(target: DiscoveredTarget): { command: string; args: string[] } {
    if (!validWslDistro(target.key)) throw new Error('Invalid WSL target.');
    return { command: 'wsl.exe', args: ['--distribution', target.key] };
  }
}

/** Main-process-only Vagrant connector. Project directories never leave this target. */
export class VagrantConnector implements CommandConnector {
  readonly id = 'vagrant' as const;
  readonly label = 'Vagrant';

  constructor(private readonly run: CommandRunner) {}

  async discover(): Promise<DiscoveredTarget[]> {
    const output = (await this.run('vagrant', ['global-status', '--prune', '--machine-readable'], discoveryOptions())).stdout;
    if (output.length > DISCOVERY_MAX_BYTES) throw new Error('Command output exceeds the discovery limit.');
    const machines = new Map<string, VagrantMachine>();
    for (const line of output.split(/\r?\n/).slice(0, MAX_VAGRANT_MACHINES * 5)) {
      const record = parseVagrantRecord(line);
      if (!record) continue;
      const [timestamp, id, type, value] = record as [string, string, string, string];
      if (!/^\d{10,16}$/.test(timestamp) || !validVagrantId(id) || !['name', 'provider', 'state', 'directory'].includes(type)) continue;
      const machine = machines.get(id) ?? {};
      if (type === 'name' && validVagrantName(value)) machine.name = value;
      if (type === 'provider' && validVagrantProvider(value)) machine.provider = value;
      if (type === 'state' && value === 'running') machine.state = value;
      if (type === 'directory' && validVagrantDirectory(value)) machine.directory = value;
      machines.set(id, machine);
    }
    return [...machines.entries()].slice(0, MAX_VAGRANT_MACHINES).flatMap(([id, machine]) =>
      machine.name && machine.provider && machine.state === 'running' && machine.directory
        ? [{ key: `${id}\u0000${machine.name}\u0000${machine.provider}\u0000${machine.directory}`, label: label(`${machine.name} (${machine.provider})`, machine.name) }]
        : [],
    );
  }

  launch(target: DiscoveredTarget): { command: string; args: string[] } {
    const fields = targetFields(target.key, TARGET_FIELDS.vagrant);
    if (!fields) {
      throw new Error('Invalid Vagrant target.');
    }
    return { command: 'vagrant', args: ['ssh', fields[0]!] };
  }
}

/** Main-process-only Docker CLI connector. Its target keys never cross IPC. */
export class DockerConnector implements CommandConnector {
  readonly id = 'docker' as const;
  readonly label = 'Docker';

  constructor(private readonly run: CommandRunner) {}

  async discover(): Promise<DiscoveredTarget[]> {
    const contexts = parseJsonLines((await this.run('docker', ['context', 'ls', '--format', '{{json .}}'], discoveryOptions())).stdout)
      .map((context) => (isRecord(context) ? context.Name : undefined))
      .filter(validContext)
      .slice(0, MAX_CONTEXTS);
    const targets: DiscoveredTarget[] = [];
    for (const context of contexts) {
      const containers = parseJsonLines((await this.run('docker', ['--context', context, 'ps', '--format', '{{json .}}'], discoveryOptions())).stdout)
        .filter((container): container is DockerContainer => isRecord(container))
        .slice(0, MAX_CONTAINERS);
      for (const container of containers) {
        if (!validContainer(container.ID)) continue;
        targets.push({ key: `${context}\u0000${container.ID}`, label: `${context}: ${label(container.Names, 'Container')}` });
      }
    }
    return targets;
  }

  launch(target: DiscoveredTarget): { command: string; args: string[] } {
    const fields = targetFields(target.key, TARGET_FIELDS.docker);
    if (!fields) throw new Error('Invalid Docker target.');
    return { command: 'docker', args: ['--context', fields[0]!, 'exec', '-it', fields[1]!, '/bin/sh'] };
  }
}

export class PodmanConnector implements CommandConnector {
  readonly id = 'podman' as const;
  readonly label = 'Podman';

  constructor(private readonly run: CommandRunner) {}

  async discover(): Promise<DiscoveredTarget[]> {
    const connections = parseJson((await this.run('podman', ['system', 'connection', 'list', '--format', 'json'], discoveryOptions())).stdout);
    if (!Array.isArray(connections)) throw new Error('Invalid Podman connection output.');
    const targets: DiscoveredTarget[] = [];
    for (const connection of connections.slice(0, MAX_CONTEXTS)) {
      if (!isRecord(connection)) continue;
      const { Name: name, Default: isDefault } = connection as PodmanConnection;
      if (!validContext(name) || (isDefault !== undefined && typeof isDefault !== 'boolean')) continue;
      const containers = parseJson((await this.run('podman', ['--connection', name, 'ps', '--format', 'json'], discoveryOptions())).stdout);
      if (!Array.isArray(containers)) throw new Error('Invalid Podman container output.');
      for (const container of containers.slice(0, MAX_CONTAINERS)) {
        if (!isRecord(container)) continue;
        const { Id: id, Names: names } = container as PodmanContainer;
        if (!validContainer(id)) continue;
        targets.push({ key: `${isDefault === true && name === 'local' ? '' : name}\u0000${id}`, label: `${name}: ${label(names, 'Container')}` });
      }
    }
    return targets;
  }

  launch(target: DiscoveredTarget): { command: string; args: string[] } {
    const fields = targetFields(target.key, TARGET_FIELDS.podman);
    if (!fields) throw new Error('Invalid Podman target.');
    return { command: 'podman', args: [...(fields[0] === '' ? [] : ['--connection', fields[0]!]), 'exec', '-it', fields[1]!, '/bin/sh'] };
  }
}

export class LimaConnector implements CommandConnector {
  readonly id = 'lima' as const;
  readonly label = 'Lima';

  constructor(private readonly run: CommandRunner) {}

  async discover(): Promise<DiscoveredTarget[]> {
    return parseJsonLines((await this.run('limactl', ['list', '--format', 'json'], discoveryOptions())).stdout)
      .slice(0, MAX_CONTAINERS)
      .flatMap((instance) => {
        if (!isRecord(instance)) return [];
        const { name, status } = instance as LimaInstance;
        return validInstance(name) && status === 'Running' ? [{ key: name, label: name }] : [];
      });
  }

  launch(target: DiscoveredTarget): { command: string; args: string[] } {
    if (!validInstance(target.key)) throw new Error('Invalid Lima target.');
    return { command: 'limactl', args: ['shell', target.key] };
  }
}

export class MultipassConnector implements CommandConnector {
  readonly id = 'multipass' as const;
  readonly label = 'Multipass';

  constructor(private readonly run: CommandRunner) {}

  async discover(): Promise<DiscoveredTarget[]> {
    const output = parseJson((await this.run('multipass', ['list', '--format', 'json'], discoveryOptions())).stdout);
    if (!isRecord(output) || !Array.isArray(output.list)) {
      throw new Error('Invalid Multipass list output.');
    }
    const instances = (output as { list: unknown[] }).list;
    return instances.slice(0, MAX_CONTAINERS).flatMap((instance) => {
      if (!isRecord(instance)) return [];
      const { name, state } = instance as MultipassInstance;
      return validInstance(name) && state === 'RUNNING' ? [{ key: name, label: name }] : [];
    });
  }

  launch(target: DiscoveredTarget): { command: string; args: string[] } {
    if (!validInstance(target.key)) throw new Error('Invalid Multipass target.');
    return { command: 'multipass', args: ['shell', target.key] };
  }
}

/** Main-process-only Kubernetes CLI connector. Its target keys never cross IPC. */
export class KubernetesConnector implements CommandConnector {
  readonly id = 'kubernetes' as const;
  readonly label = 'Kubernetes';

  constructor(private readonly run: CommandRunner) {}

  async discover(): Promise<DiscoveredTarget[]> {
    const context = (await this.run('kubectl', ['config', 'current-context'], discoveryOptions())).stdout.trim();
    if (!validContext(context)) throw new Error('Invalid Kubernetes context.');
    const output = parseJson((await this.run('kubectl', ['--context', context, 'get', 'pods', '--all-namespaces', '-o', 'json'], discoveryOptions())).stdout);
    if (output === null || !Array.isArray((output as KubernetesPodList).items)) {
      throw new Error('Invalid Kubernetes pod output.');
    }
    const namespaces = new Set<string>();
    const targets: DiscoveredTarget[] = [];
    for (const item of (output as { items: unknown[] }).items.slice(0, MAX_PODS)) {
      if (!isRecord(item)) continue;
      const pod = item as KubernetesPod;
      const { name, namespace, uid } = pod.metadata ?? {};
      if (pod.status?.phase !== 'Running' || !validKubernetesName(name) || !validKubernetesName(namespace) || !validKubernetesUid(uid)) continue;
      if (!namespaces.has(namespace) && namespaces.size >= MAX_NAMESPACES) continue;
      namespaces.add(namespace);
      if (!Array.isArray(pod.spec?.containers)) continue;
      for (const itemContainer of pod.spec.containers) {
        const container = isRecord(itemContainer) ? itemContainer.name : undefined;
        if (!validKubernetesContainer(container)) continue;
        if (targets.length >= MAX_CONTAINERS) return targets;
        targets.push({
          key: `${context}\u0000${namespace}\u0000${name}\u0000${uid}\u0000${container}`,
          label: truncateLabel(`${context}: ${namespace}/${name} (${container})`),
        });
      }
    }
    return targets;
  }

  launch(target: DiscoveredTarget): { command: string; args: string[] } {
    const fields = targetFields(target.key, TARGET_FIELDS.kubernetes);
    if (!fields) {
      throw new Error('Invalid Kubernetes target.');
    }
    return { command: 'kubectl', args: ['--context', fields[0]!, '--namespace', fields[1]!, 'exec', '-it', fields[2]!, '-c', fields[4]!, '--', '/bin/sh'] };
  }
}